import { apiCreateSubmitted, getDoc, listAll } from "@/api/client";
import { cancel } from "@/api/crud";
import { getState } from "@/store";
import { todayIso } from "@/lib/format";
import {
	LEAVE_TYPE, adjustment, appliesTo, counts, credit, earned, isAuto, isOff, listOn, plan, reason, stillOpenSince, sundays,
	window,
} from "@/lib/sundayleave";

/* ---------------------------------------------------------------------------
   Sunday leave, applied by the dashboard — by itself.

   The stand-in for `manna_hr.sundayleave_site.run` until `manna_hr` is
   installed, started with the absence rule by api/leaverules.js: on an HR
   sign-in and every half hour while the page is open.

   **It writes one Leave Adjustment per Casual Leave allocation**, carrying
   every Sunday that allocation's holder has worked. When the total changes it
   cancels its own adjustment and submits an amended one. Those are two
   requests, so a refusal between them leaves the person without their
   Sunday days until the next run puts them back — which it does, because
   with no live adjustment the plan is simply to create one. Only adjustments
   carrying `AUTO_MARK` are ever cancelled.
   --------------------------------------------------------------------------- */

/** Office employees from the loaded list, as {name: employee}. */
function office() {
	const out = {};
	for (const e of getState().employees || []) {
		if (e.status && e.status !== "Active") continue;
		if (appliesTo(e.designation)) out[e.name] = e;
	}
	return out;
}

/** Which Sundays are a person's weekly off, the way hrms decides it: the
    Holiday List Assignment in force on each Sunday — never `Employee.holiday_list`
    or `Company.default_holiday_list`, which hrms 16 does not read. Assignments
    are read once per run and each list once. */
function calendar(assignments) {
	const lists = {};
	return async (emp, d) => {
		const name = listOn(assignments, emp.name, emp.company, d);
		if (name && !(name in lists)) {
			lists[name] = getDoc("Holiday List", name).then((doc) => (doc ? {
				from: doc.from_date, to: doc.to_date,
				dates: new Set((doc.holidays || []).map((h) => String(h.holiday_date).slice(0, 10))),
			} : null));
		}
		const got = name ? await lists[name] : null;
		return isOff(d, name, got ? { [name]: got } : {});
	};
}

async function oneAllocation(a, emp, today, off, out) {
	const span = window(a.from_date, a.to_date, today, a.first);
	const days = [];
	for (const d of span ? sundays(span[0], span[1]) : []) if (await off(emp, d)) days.push(d);

	const status = {};
	const punches = {};
	if (days.length) {
		const [att, logs] = await Promise.all([
			listAll("Attendance", ["attendance_date", "status"],
				[["employee", "=", a.employee], ["docstatus", "=", 1], ["attendance_date", "in", days]]),
			listAll("Employee Checkin", ["time"],
				[["employee", "=", a.employee], ["skip_auto_attendance", "=", 0]], 500,
				days.map((d) => ["time", "between", [d + " 00:00:00", d + " 23:59:59"]])),
		]);
		for (const r of att) status[String(r.attendance_date).slice(0, 10)] = r.status;
		for (const r of logs) {
			const d = String(r.time).slice(0, 10);
			(punches[d] = punches[d] || new Set()).add(String(r.time).slice(0, 19));
		}
	}

	const credits = Object.fromEntries(days.map((d) => [d, credit(status[d], punches[d]?.size || 0)]));
	const { total, worked } = earned(credits);
	const halves = worked.filter((d) => credits[d] === 0.5);
	const live = (await listAll("Leave Adjustment", ["name", "leaves_to_adjust", "reason_for_adjustment"],
		[["leave_allocation", "=", a.name], ["docstatus", "=", 1]]))
		.map((r) => ({ name: r.name, leaves: r.leaves_to_adjust, reason: r.reason_for_adjustment }));

	const p = plan(total, live, worked.length ? reason(worked, halves) : null);
	const who = emp.employee_name || a.employee;
	if (p.blocked) return void out.refused.push({ employee: a.employee, who, error: p.blocked });

	for (const name of p.cancel) {
		if (!isAuto((live.find((l) => l.name === name) || {}).reason)) return;
		const r = await cancel("Leave Adjustment", name);
		if (!r.ok) return void out.refused.push({ employee: a.employee, who, error: r.error });
	}
	if (p.create) {
		const was = p.cancel[p.cancel.length - 1];
		try {
			await apiCreateSubmitted("Leave Adjustment", adjustment(a.employee, a.name, p.create, worked, today, was, halves));
			out.given.push({ employee: a.employee, who, days: p.create, sundays: worked });
		} catch (e) {
			out.refused.push({ employee: a.employee, who, error: String(e?.message || e) });
		}
	} else if (p.cancel.length) {
		out.given.push({ employee: a.employee, who, days: 0, sundays: [] });
	}
}

/** One run over every office employee's Casual Leave allocations.
    @returns {Promise<{given: object[], refused: object[]}>} */
export async function runSundayLeave() {
	const out = { given: [], refused: [] };
	const staff = office();
	const ids = Object.keys(staff);
	if (!ids.length) return out;
	const today = todayIso();
	/* Every allocation, ended ones too, only to know each person's first —
	   the one that also takes the Sundays before it. */
	const allocations = (await listAll("Leave Allocation",
		["name", "employee", "from_date", "to_date", "leave_policy_assignment"], [
			["employee", "in", ids], ["leave_type", "=", LEAVE_TYPE], ["docstatus", "=", 1],
		])).filter(counts).sort((x, y) => String(x.from_date).localeCompare(String(y.from_date)));
	const first = {};
	for (const a of allocations) first[a.employee] ??= a.name;
	const since = stillOpenSince(today);
	const companies = [...new Set(ids.map((id) => staff[id].company).filter(Boolean))];
	const off = calendar(await listAll("Holiday List Assignment", ["assigned_to", "from_date", "holiday_list"],
		[["assigned_to", "in", [...ids, ...companies]], ["docstatus", "=", 1]], 500));
	for (const a of allocations) {
		// Asked for these people only; anybody else is not this rule's.
		if (!staff[a.employee]) continue;
		if (String(a.to_date).slice(0, 10) < since || String(a.from_date).slice(0, 10) > today) continue;
		a.first = first[a.employee] === a.name;
		try {
			await oneAllocation(a, staff[a.employee], today, off, out);
		} catch (e) {
			out.refused.push({ employee: a.employee, who: staff[a.employee].employee_name, error: String(e?.message || e) });
		}
	}
	return out;
}
