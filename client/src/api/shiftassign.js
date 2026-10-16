import { apiCreateSubmitted, apiWrite, listAll } from "@/api/client";
import { load, loadShiftAssignments } from "@/api/load";
import { set } from "@/store";
import { ASG_FIELDS, loadRegMonth } from "@/api/attendance";
import { dmy, todayIso } from "@/lib/format";
import { dayBefore } from "@/lib/roster";
import { spliceShift, spliceText } from "@/lib/shiftsplice";

/* ---------------------------------------------------------------------------
   Giving one person a shift, from their month on Attendance Regularization
   (16 September 2026). Two ways, because they mean different things:

     · **Working time** — `Employee.default_shift`. Every day from now on,
       wherever nothing more specific says otherwise.
     · **Shift for dates** — a submitted `Shift Assignment` from one date to
       another (or open-ended). It beats the working time on those days, which
       is how a week of night shift is given without changing anybody's
       normal hours.

   **A shift for dates replaces whatever dated shift is already there on those
   dates** (1 October 2026) — see lib/shiftsplice.js for how, and why HR
   Settings' "multiple assignments" stays off. Before this, a second shift was
   refused while the first was active, and changing one meant the desk.

   The site checks everything: roles, and hrms refuses an assignment that still
   overlaps an active one. Its words are shown as they came.
   --------------------------------------------------------------------------- */

export async function setWorkingTime(emp, shift, ym) {
	const r = await apiWrite("Employee", emp.name, { default_shift: shift || null });
	if (!r.ok) return { ok: false, msg: `The site refused the working time: ${r.error}` };
	await load();
	if (ym) await loadRegMonth(emp.name, ym, true);
	return { ok: true, msg: `${emp.employee_name}'s working time is now ${shift || "none"}.` };
}

/**
 * The same shift for several people (16 October 2026, Manage Shift → Assign
 * shift). Each person goes through exactly what one person's month does —
 * `addShiftForDates`, which makes room in their roster and puts it back if the
 * site refuses, or their working time — one at a time, and one refused does
 * not stop the next. The employee list and the roster are read again once, at
 * the end, rather than after every person.
 *
 * @returns {Promise<{ok: number, results: {emp: object, ok: boolean, msg: string}[]}>}
 */
export async function assignShiftMany(emps, { shift, mode, from, to }, onStep = () => {}) {
	const results = [];
	for (let i = 0; i < emps.length; i++) {
		const emp = emps[i];
		onStep(i + 1);
		if (mode === "working") {
			const r = await apiWrite("Employee", emp.name, { default_shift: shift || null });
			results.push({ emp, ok: r.ok, msg: r.ok ? `working time is now ${shift}.` : `the site refused: ${r.error}` });
		} else {
			const r = await addShiftForDates(emp, { shift, from, to }).catch((e) => ({ ok: false, msg: e.message || String(e) }));
			results.push({ emp, ok: r.ok, msg: r.msg });
		}
	}
	await load().catch(() => null);
	if (mode !== "working") {
		set({ shAssignState: "" });
		await loadShiftAssignments().catch(() => null);
	}
	return { ok: results.filter((r) => r.ok).length, results };
}

/** Take a dated shift away: set Inactive, which hrms reads as not there and
    which writing Active undoes — not cancelled, so the record of who was
    rostered when stays. Its days go back to the working time. */
export async function removeShiftForDates(emp, a, ym) {
	const r = await apiWrite("Shift Assignment", a.name, { status: "Inactive" });
	if (!r.ok) return { ok: false, msg: `The site refused to remove ${a.name}: ${r.error}` };
	if (ym) await loadRegMonth(emp.name, ym, true);
	return { ok: true, msg: `${a.shift_type} from ${dmy(a.start_date)} (${a.name}) removed. Those days are on the working time again; days already marked keep the shift they were marked on.` };
}

/** Write the old values back, last change first. Returns what could not be. */
async function undo(done) {
	const stuck = [];
	for (const [name, patch] of done.reverse()) {
		const r = await apiWrite("Shift Assignment", name, patch);
		if (!r.ok) stuck.push(name);
	}
	return stuck;
}

export async function addShiftForDates(emp, { shift, from, to }, ym) {
	if (!shift) return { ok: false, msg: "Choose the shift." };
	if (!from) return { ok: false, msg: "Choose the date it starts." };
	if (to && to < from) return { ok: false, msg: "The end date is before the start date." };

	/* Read fresh, not from the month on screen: an assignment that starts after
	   the month shown, or one made on the desk a minute ago, is just as much in
	   the way. */
	let current;
	try {
		current = await listAll("Shift Assignment", ASG_FIELDS,
			[["employee", "=", emp.name], ["docstatus", "=", 1], ["status", "=", "Active"]]);
	} catch (e) {
		return { ok: false, msg: `The site would not say which shifts ${emp.employee_name} already has: ${e.message}` };
	}
	const plan = spliceShift(current, { shift, from, to });
	if (plan.same) return { ok: true, msg: `${emp.employee_name} is already on ${shift} on those dates.` };

	/* Make room. Each change is remembered so a refused new shift leaves the
	   person exactly as they were, rather than with a hole in their roster. */
	const done = [];
	const room = [
		...plan.trim.map((a) => [a.name, { end_date: a.end_date }, { end_date: a.was || null }]),
		...plan.retire.map((a) => [a.name, { status: "Inactive" }, { status: "Active" }]),
	];
	for (const [name, patch, back] of room) {
		const r = await apiWrite("Shift Assignment", name, patch);
		if (!r.ok) {
			const stuck = await undo(done);
			return { ok: false, msg: `The site refused to change ${name}: ${r.error}` + (stuck.length ? ` — and ${stuck.join(", ")} could not be put back; check them on the desk.` : " Nothing was changed.") };
		}
		done.push([name, back]);
	}

	let made;
	try {
		made = await apiCreateSubmitted("Shift Assignment", {
			employee: emp.name, employee_name: emp.employee_name, company: emp.company,
			department: emp.department || undefined,
			shift_type: shift, start_date: from, end_date: to || undefined, status: "Active",
		});
	} catch (e) {
		const stuck = await undo(done);
		return { ok: false, msg: `The site refused the shift: ${e.message}` + (stuck.length ? ` — and ${stuck.join(", ")} could not be put back; check them on the desk.` : done.length ? " The shifts it overlapped were put back as they were." : "") };
	}

	/* The old shift's days after the new one. The new shift is in either way;
	   a part that could not come back falls to the working time on those days,
	   which is said rather than hidden. */
	const lost = [];
	for (const a of plan.resume) {
		try {
			await apiCreateSubmitted("Shift Assignment", {
				employee: emp.name, employee_name: emp.employee_name, company: emp.company,
				department: emp.department || undefined,
				shift_type: a.shift_type, start_date: a.start_date, end_date: a.end_date || undefined, status: "Active",
			});
		} catch (e) {
			lost.push(`${a.shift_type} from ${dmy(a.start_date)} could not be put back (${e.message})`);
		}
	}

	/* hrms never re-reads a day it has already made, so a shift given for past
	   dates changes nothing on those days by itself. Said by date, so nobody
	   pays from them believing they moved. */
	let judged = [];
	const last = to && to < todayIso() ? to : dayBefore(todayIso());
	if (from <= last) {
		try {
			judged = (await listAll("Attendance", ["attendance_date", "shift"],
				[["employee", "=", emp.name], ["docstatus", "=", 1], ["attendance_date", ">=", from], ["attendance_date", "<=", last]]))
				.filter((a) => a.shift !== shift).map((a) => a.attendance_date).sort();
		} catch {
			judged = [];
		}
	}

	if (ym) await loadRegMonth(emp.name, ym, true);
	const also = spliceText(plan, dmy);
	return {
		ok: !lost.length,
		msg: [
			`${made && made.name ? made.name + ": " : ""}${shift} from ${dmy(from)}${to ? ` to ${dmy(to)}` : " onwards"}.`,
			also && `Also: ${also}.`,
			...lost,
			judged.length && `Already marked on the old shift, and not changed by this: ${judged.map(dmy).join(", ")}.`,
		].filter(Boolean).join(" "),
	};
}
