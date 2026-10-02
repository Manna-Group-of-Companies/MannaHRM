import { periodOf, spanOf } from "@/lib/format";
import { workDateOf } from "@/lib/roster";

/* The In / Out report's arithmetic on a list of Employee Checkin rows. Pure, so
   the rules can be argued about in a test rather than in front of a payslip. */

/** Each person's punches, one entry per person per work day, in time order.

    A night shift crossing midnight is one day, the one it began on: its
    morning leaving is moved back by `workDateOf`, the same rule the month and
    Daily Detail use. `shiftOn(employee, iso)` is a day's Shift Type; without
    it a punch stays on its calendar day. Still a reading aid over punches, not
    Attendance, which the shift job decides. */
function byPersonDay(rows, shiftOn) {
	const m = new Map();
	for (const r of rows) {
		const date = workDateOf(r, shiftOn ? (iso) => shiftOn(r.employee, iso) : null);
		const k = `${r.employee}|${date}`;
		if (!m.has(k)) m.set(k, { date, list: [] });
		m.get(k).list.push(r);
	}
	for (const { list } of m.values()) list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
	return m;
}

/** One row per person per work day: the first punch, the last, and the span between.
    Earliest and latest rather than first IN and last OUT, because most of the
    machines here report every punch as 0 and a guessed direction would move
    somebody's arrival. A day with one punch has no last and no span. */
export function firstLast(rows, shiftOn) {
	return [...byPersonDay(rows, shiftOn)].map(([name, { date, list }]) => {
		const a = list[0];
		const b = list.length > 1 ? list[list.length - 1] : null;
		return {
			name,
			employee: a.employee,
			employee_name: a.employee_name,
			date,
			time: a.time,
			first: a.time,
			last: b ? b.time : "",
			span: b ? spanOf(a.time, b.time) || "" : "",
			punches: list.length,
		};
	});
}

/** A punch's clock time on a work day, `08:30 (+1)` when it fell the morning
    after — the Date column says the day the shift began, and a bare 08:30
    under it reads as that morning. */
export function clockOn(t, date) {
	if (!t) return "";
	const hm = String(t).slice(11, 16);
	return String(t).slice(0, 10) > date ? `${hm} (+1)` : hm;
}

/** Day or Night for a work day, off its first punch. A day whose first punch
    is already the next morning holds only a night's leaving — nothing else is
    ever moved back onto a day — so it is Night whatever that clock says. */
export function dayPeriod(r) {
	if (!r || !r.first) return "";
	return String(r.first).slice(0, 10) > r.date ? "Night" : periodOf(r.first);
}
