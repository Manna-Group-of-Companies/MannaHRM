/* ---------------------------------------------------------------------------
   Monthly Summary Attendance — one row per person per month, the way Factor
   HR's own "Monthly Summary Attendance Report" is: a headcount of the month
   (P/HD/WO/HO/AB), how often somebody was late or left early (LC/EG), leave by
   type (CL/LWP), overtime, and worked hours against the shift's own hours.

   Built on `dailyRows` — the same one row per person per day that Daily Detail
   and Monthly Basic both read — so this report cannot disagree with either
   about what a day was. Nothing here is a second opinion; it counts what
   `dailyRows` already decided.

   **Standard Working Hours is derived, not stored.** Nothing on this site
   holds a person's monthly quota, so it is read back out of their own numbers:
   the shift's own span (`Shift Type.start_time`/`end_time`) times how many
   days they are paid for. "Paid for" here is Present days plus half of any
   Half Day — the same weight Monthly Basic's Payable column gives them
   (`MB_PAID`) — because that is the one paid-day count this site already
   agrees on. A leave or a holiday adds nothing to it: there is no policy
   engine yet to say what a paid leave day's hours should be, and inventing a
   number here would be a second, disagreeing engine. See CLAUDE.md
   §"Known-incomplete".

   **LC and EG are the late and early counts `dailyRows` already keeps per
   day** (`lateMin`/`earlyMin`, off the shift window) — a day, not a duration.
   Factor HR's own two columns are day counts too, which is what makes this a
   reading of the same rule rather than a guess at theirs.

   **CL and LWP read the Leave Application itself**, by `leave_type`, over the
   days that actually fall in this range — a leave spanning a month boundary
   counts only the days inside it, the same clamp `lib/reports.js` warns any
   leave arithmetic needs. Approved only: an application still Open has not
   happened yet as far as a month's hours are concerned. */

import { clockOf, dailyRows, hm, minutesOf } from "./dailydetail.js";

const hmSigned = (mins) => (mins < 0 ? "-" + hm(-mins) : hm(mins) || "0:00");

/** A Shift Type's own daily span, in minutes — end minus start, wrapped past
    midnight for a night shift. Null when the shift or its times are unknown,
    which a report reads as "no quota to compare against" rather than zero. */
function shiftDayMinutes(shiftName, windows) {
	const w = (windows || {})[shiftName];
	if (!w) return null;
	const s = minutesOf(w.start_time);
	const e = minutesOf(w.end_time);
	if (s == null || e == null) return null;
	let mins = e - s;
	if (mins <= 0) mins += 24 * 60;
	return mins;
}

/** "Day" or "Night", read off a shift's own start time — nothing on Shift
    Type says which it is, so this reads the clock the same way
    `shiftDayMinutes` does rather than looking it up. 06:00 up to (not
    including) 18:00 is Day; everything else, including a shift with no
    known start time, is Night — the way it's meant, not a database field. */
export function shiftPeriod(shiftName, windows) {
	const w = (windows || {})[shiftName];
	if (!w) return "";
	const s = minutesOf(w.start_time);
	if (s == null) return "";
	return s >= 6 * 60 && s < 18 * 60 ? "Day" : "Night";
}

/** Days of a leave application that fall inside `[from, till]`, clamped at
    both ends — the same inclusive-both-ends rule `lib/reports.js#leaveDays`
    uses, so a total here and one built from that file agree. */
function overlapDays(r, from, till) {
	const a = String(r.from_date || "").slice(0, 10);
	const b = String(r.to_date || "").slice(0, 10) || a;
	if (!a) return 0;
	const lo = a > from ? a : from;
	const hi = b < till ? b : till;
	if (lo > hi) return 0;
	const ms = Date.parse(hi + "T00:00:00Z") - Date.parse(lo + "T00:00:00Z");
	return Math.round(ms / 86400000) + 1;
}

/** Approved leave, this employee, by `leave_type`, days inside the range. */
function leaveTypeDays(leaveRows, employee, from, till) {
	const by = new Map();
	for (const r of leaveRows || []) {
		if (r.employee !== employee || r.status !== "Approved") continue;
		const n = overlapDays(r, from, till);
		if (!n) continue;
		const t = r.leave_type || "—";
		by.set(t, (by.get(t) || 0) + n);
	}
	return by;
}

/**
 * The report's rows, one per person.
 *
 * @param {object} a - everything `dailyRows` takes, plus `leave` (already
 *   there for it, but this function reads it a second time for leave type)
 * @returns {{rows: object[], days: Date[]}}
 */
export function monthlySummaryRows({ people, from, to, attendance, punches, leave, overtime, holidaysOf, windows, today }) {
	const { rows: dayRows } = dailyRows({
		people, from, to, attendance, punches, leave, overtime, holidaysOf, windows, today, limit: 100000,
	});

	const byEmp = new Map();
	for (const r of dayRows) {
		const k = r.emp.name;
		if (!byEmp.has(k)) byEmp.set(k, []);
		byEmp.get(k).push(r);
	}

	const out = [];
	for (const e of people || []) {
		const rows = byEmp.get(e.name) || [];
		let P = 0, HD = 0, WO = 0, HO = 0, AB = 0, LC = 0, EG = 0, otMin = 0, actualMs = 0;
		for (const r of rows) {
			if (r.status === "Present" || r.status === "Work From Home") P++;
			else if (r.status === "Half Day") HD++;
			else if (r.status === "Absent") AB++;
			if (r.dayType === "weekoff") WO++;
			else if (r.dayType === "holiday") HO++;
			if (r.lateMin) LC++;
			if (r.earlyMin) EG++;
			otMin += r.otMin || 0;
			actualMs += r.ms || 0;
		}
		const leaveByType = leaveTypeDays(leave, e.name, from, to);
		const CL = leaveByType.get("Casual Leave") || 0;
		let LWP = 0;
		for (const [t, n] of leaveByType) if (/without pay/i.test(t)) LWP += n;

		const dayMin = shiftDayMinutes(e.default_shift, windows);
		const payableDays = P + HD * 0.5;
		const standardMin = dayMin != null ? Math.round(dayMin * payableDays) : null;
		const actualMin = Math.round(actualMs / 60000);
		const deficitMin = standardMin != null ? actualMin - standardMin : null;

		out.push({
			emp: e,
			daysInMonth: rows.length,
			P, HD, WO, HO, AB, LC, EG,
			OT: hm(otMin) || "0:00",
			CL, LWP,
			shiftIn: dayMin != null ? clockOf((windows[e.default_shift] || {}).start_time) : "",
			shiftOut: dayMin != null ? clockOf((windows[e.default_shift] || {}).end_time) : "",
			actualHours: hm(actualMin) || "0:00",
			standardHours: standardMin != null ? hm(standardMin) || "0:00" : "—",
			deficitHours: deficitMin != null ? hmSigned(deficitMin) : "—",
			actualPerDay: P ? hm(Math.round(actualMin / P)) || "0:00" : "—",
			standardPerDay: dayMin != null ? hm(dayMin) || "0:00" : "—",
		});
	}
	return out;
}
