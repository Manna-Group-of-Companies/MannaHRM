import { spanOf } from "@/lib/format";

/* The In / Out report's arithmetic on a list of Employee Checkin rows. Pure, so
   the rules can be argued about in a test rather than in front of a payslip. */

const dayKey = (r) => `${r.employee}|${String(r.time || "").slice(0, 10)}`;

/** Each person's punches, one entry per person per calendar day, in time order.
    A night shift crossing midnight is split across two days here — this is a
    reading aid over punches, not Attendance, which the shift job decides. */
function byPersonDay(rows) {
	const m = new Map();
	for (const r of rows) {
		const k = dayKey(r);
		if (!m.has(k)) m.set(k, []);
		m.get(k).push(r);
	}
	for (const list of m.values()) list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
	return m;
}

/** One row per person per day: the first punch, the last, and the span between.
    Earliest and latest rather than first IN and last OUT, because most of the
    machines here report every punch as 0 and a guessed direction would move
    somebody's arrival. A day with one punch has no last and no span. */
export function firstLast(rows) {
	return [...byPersonDay(rows).values()].map((list) => {
		const a = list[0];
		const b = list.length > 1 ? list[list.length - 1] : null;
		return {
			name: dayKey(a),
			employee: a.employee,
			employee_name: a.employee_name,
			date: String(a.time || "").slice(0, 10),
			time: a.time,
			first: a.time,
			last: b ? b.time : "",
			span: b ? spanOf(a.time, b.time) || "" : "",
			punches: list.length,
		};
	});
}
