import { api, apiCreateSubmitted, getDoc, listAll } from "@/api/client";
import { cancel } from "@/api/crud";
import { getState } from "@/store";
import { todayIso } from "@/lib/format";
import {
	AUTO_LEAVE_RULES, LEAVE_TYPE, REG_PREFIX, appliesTo, application, approverFor, isAuto, monthSpan, monthsToCheck, plan,
} from "@/lib/absencerule";

/* ---------------------------------------------------------------------------
   The office absence rule, applied by the dashboard — by itself.

   **Nobody presses anything.** It runs when somebody who can create an
   Employee (HR User, HR Manager, System Manager) has the dashboard open: once
   when they sign in, then every half hour — after Sunday leave, see
   api/leaverules.js — and around any correction saved or approved for an
   office employee. That is the stand-in for `manna_hr.absencerule_site.run`,
   the hourly job that does the same on the site once `manna_hr` is installed
   (CLAUDE.md §7).

   **It writes leave, never `Attendance`.** Giving is one submitted Casual
   Leave Application, and hrms turns the day's Absent row into On Leave
   itself; giving back is cancelling it, and hrms withdraws the On Leave row.
   Only applications carrying `AUTO_MARK` are ever cancelled.

   **A refusal is somebody's, not the run's.** A month already submitted, a
   cancel refused — the day stays as it is and the rest of the office still
   gets its run. **The balance is asked before writing**, so somebody with no
   Casual Leave yet costs one read a run rather than a refused write; and
   nothing is remembered between runs, so leave given in the meantime — Give
   monthly leave, a Sunday — reaches their absence on the next one. A day hrms
   refuses for a reason of its own (a holiday added afterwards, a block date)
   passes the leave to the next absence instead of holding the month.
   --------------------------------------------------------------------------- */

let queue = Promise.resolve();

/** How many Absent days in a month one run will try. absencerule_site.TRIES. */
const TRIES = 5;

/** hrms's refusals that are about the balance, not the day: no other day that
    month is paid from a different one, so trying the next is pointless.
    Matched on hrms's own words, never to decide anything else. */
const BALANCE = /insufficient leave balance|leave allocation/i;

/** Office employees from the loaded list, as {name: employee}. */
function office(only) {
	const out = {};
	for (const e of getState().employees || []) {
		if (only && e.name !== only) continue;
		if (e.status && e.status !== "Active") continue;
		if (appliesTo(e.designation)) out[e.name] = e;
	}
	return out;
}

const push = (m, k, v) => { (m[k] = m[k] || []).push(v); };

/** The approver the site insists on — see approverFor. Read only when a leave
    is about to be given, which is a handful of times a month. */
async function approverOf(emp) {
	const own = (await getDoc("Employee", emp.name))?.leave_approver;
	const mgr = !own && emp.reports_to ? (await getDoc("Employee", emp.reports_to))?.user_id : "";
	return approverFor(own, mgr, getState().user);
}

/** What hrms will let `emp` take on `day`, asked the way its own validation
    asks: the whole allocation period, for consumption. Null when the site will
    not say — then the write is tried and the site decides. */
async function balanceOn(emp, day) {
	try {
		const r = await api("/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on", {
			employee: emp, leave_type: LEAVE_TYPE, date: day, to_date: day,
			consider_all_leaves_in_the_allocation_period: 1, for_consumption: 1,
		});
		const m = r?.message;
		const n = Number(m && typeof m === "object" ? m.leave_balance_for_consumption : m);
		return Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

/** Every day from `a` to `b`, clipped to [start, end]. */
function days(a, b, start, end) {
	const out = [];
	const d = new Date(String(a < start ? start : a).slice(0, 10) + "T00:00:00");
	const last = String(b > end ? end : b).slice(0, 10);
	for (;;) {
		const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		if (iso > last) return out;
		out.push(iso);
		d.setDate(d.getDate() + 1);
	}
}

async function month(staff, [start, end], today, also, out) {
	const ids = Object.keys(staff);
	if (!ids.length) return;
	const [att, leave, punches] = await Promise.all([
		listAll("Attendance", ["employee", "attendance_date"], [
			["employee", "in", ids], ["status", "=", "Absent"], ["docstatus", "=", 1],
			["attendance_date", ">=", start], ["attendance_date", "<=", end],
		], 500),
		listAll("Leave Application", ["name", "employee", "from_date", "to_date", "description", "docstatus"], [
			["employee", "in", ids], ["docstatus", "<", 2], ["status", "not in", ["Rejected", "Cancelled"]],
			["from_date", "<=", end], ["to_date", ">=", start],
		], 500),
		/* Any correction punch, set aside or not: hrms sets aside a punch it
		   could not build a day from — which a correction landing on a day the
		   leave already made On Leave is — and the day was still corrected. */
		listAll("Employee Checkin", ["employee", "time"], [
			["employee", "in", ids], ["device_id", "like", REG_PREFIX + "%"],
			["time", ">=", start + " 00:00:00"], ["time", "<=", end + " 23:59:59"],
		], 500),
	]);

	const absent = {}, auto = {}, covered = {}, regularized = {};
	for (const r of att) push(absent, r.employee, String(r.attendance_date).slice(0, 10));
	for (const r of leave) {
		if (isAuto(r.description) && Number(r.docstatus) === 1) push(auto, r.employee, { name: r.name, day: r.from_date });
		else days(r.from_date, r.to_date, start, end).forEach((d) => push(covered, r.employee, d));
	}
	for (const r of punches) push(regularized, r.employee, String(r.time).slice(0, 10));
	for (const [emp, d] of also) if (staff[emp] && d >= start && d <= end) push(regularized, emp, d);

	for (const emp of new Set([...Object.keys(absent), ...Object.keys(auto)])) {
		// The read asked for these people only; a row for anybody else is not
		// this rule's to act on, whatever brought it back.
		if (!staff[emp]) continue;
		const args = [absent[emp] || [], auto[emp] || [], regularized[emp] || [], covered[emp] || []];
		const { cancel: undo, give } = plan(...args);
		const who = staff[emp].employee_name || emp;
		let undone = true;
		for (const name of undo) {
			const day = String((auto[emp].find((a) => a.name === name) || {}).day || "").slice(0, 10);
			const r = await cancel("Leave Application", name);
			if (r.ok) {
				out.returned.push({ employee: emp, who, day, name });
			} else {
				undone = false;
				out.refused.push({ employee: emp, who, day, error: r.error });
			}
		}
		/* All or nothing, as on the site: a leave that could not be given back
		   still stands, and giving the next absence one as well would be two in
		   a month. The next run tries the cancel again. */
		if (undone) await giveFirstTaken(staff[emp], args, give, today, who, out);
	}
}

async function giveFirstTaken(emp, args, give, today, who, out) {
	const excluded = [];
	for (let i = 0; give && i < TRIES; i++) {
		const have = await balanceOn(emp.name, give);
		if (have !== null && have < 1) {
			out.waiting.push({ employee: emp.name, who, day: give, error: `no ${LEAVE_TYPE} to give on that day` });
			return;
		}
		try {
			const made = await apiCreateSubmitted("Leave Application",
				application(emp.name, give, emp.company, today, await approverOf(emp)));
			out.given.push({ employee: emp.name, who, day: give, name: made?.name || "" });
			return;
		} catch (e) {
			const error = String(e?.message || e);
			out.refused.push({ employee: emp.name, who, day: give, error });
			if (BALANCE.test(error)) return;
			excluded.push(give);
			give = plan(...args, excluded).give;
		}
	}
}

/**
 * One run of the rule. Runs one at a time: a correction saved while the half-
 * hourly run is mid-month waits for it, rather than both reading the same
 * month and both giving it a leave.
 *
 * @param {{only?: string, day?: string, ym?: string}} [opts] one employee and
 *   the month of `day` (which is also treated as regularized), or of `ym`
 *   (`YYYY-MM`, nothing treated as regularized); else everybody this month and last
 * @returns {Promise<{given: object[], returned: object[], refused: object[], waiting: object[]}>}
 */
export function runAbsenceRule(opts = {}) {
	const next = queue.then(() => run(opts));
	queue = next.catch(() => {});
	return next;
}

async function run({ only, day, ym } = {}) {
	const out = { given: [], returned: [], refused: [], waiting: [] };
	const staff = office(only);
	if (!Object.keys(staff).length) return out;
	const today = todayIso();
	const at = day || (ym ? ym + "-01" : "");
	const spans = at ? [monthSpan(at, today)].filter(Boolean) : monthsToCheck(today);
	const also = only && day ? [[only, String(day).slice(0, 10)]] : [];
	for (const span of spans) await month(staff, span, today, also, out);
	return out;
}

/** Give back the leave the absence rule took for `day`, **before** that day's
    correction punches are written — as `regularization.apply` does on the
    site. While the leave stands, hrms builds the corrected day as On Leave
    whatever the punches say and sets the punches aside, so a correction whose
    leave cannot be given back must not be written yet.
    @returns {Promise<{ok: boolean, returned: object[], error?: string}>} */
export async function giveBack(employee, day) {
	if (!Object.keys(office(employee)).length) return { ok: true, returned: [] };
	const d = String(day).slice(0, 10);
	let mine;
	try {
		mine = (await listAll("Leave Application", ["name", "description"], [
			["employee", "=", employee], ["docstatus", "=", 1], ["from_date", "=", d], ["to_date", "=", d],
		])).filter((r) => isAuto(r.description));
	} catch (e) {
		return { ok: false, returned: [], error: `the day's leave could not be read (${e?.message || e})` };
	}
	const returned = [];
	for (const r of mine) {
		const c = await cancel("Leave Application", r.name);
		if (!c.ok) {
			return { ok: false, returned, error: `${r.name}, the Casual Leave the absence rule took for the day, `
				+ `could not be given back (${c.error})` };
		}
		returned.push({ employee, day: d, name: r.name });
	}
	return { ok: true, returned };
}

/** After a correction is written for `employee` on `day`: let the month's
    next absence have the leave the day gave back. Never throws — the
    correction is what was asked for, and the next half-hourly run tries again.
    Resolves to null for anybody the rule does not cover. */
export async function afterCorrection(employee, day) {
	/* Switched off: handing the leave on would be the rule writing new leave. */
	if (!AUTO_LEAVE_RULES || !Object.keys(office(employee)).length) return null;
	try {
		return await runAbsenceRule({ only: employee, day });
	} catch (e) {
		return { given: [], returned: [], waiting: [], refused: [{ employee, day, error: String(e?.message || e) }] };
	}
}
