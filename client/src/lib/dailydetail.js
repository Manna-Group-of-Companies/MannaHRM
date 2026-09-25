/* ---------------------------------------------------------------------------
   Daily Detail Attendance Report — one row per person per day, from what the
   site actually holds.

   Until 16 September 2026 this report read `s.checkins`, which the first load
   fills with **today's punches only**, so every other day in the range came out
   with no In, no Out and a dash for status — while the site had the whole
   month. It now reads, for the range:

     Attendance       the day as hrms's shift job decided it — status, in and
                      out, working hours, late entry — **the source of truth
                      wherever a submitted row exists**;
     Employee Checkin for days the job has not processed yet (today, or a day
                      whose shift is not rostered), paired the way the roster
                      pairs them and skipping punches HR set aside;
     Leave Application and the holiday list (the person's, else the company's),
                      to say why a day with no punch is not an absence.

   Pure: no store, no network, so every number here can be argued in a test.
   --------------------------------------------------------------------------- */

import { resolveDayStatus, ABSENT, HOLIDAY, LEAVE_PENDING, ON_FLOOR, ON_LEAVE, PRESENT, UNMARKED } from "./rules.js";
import { dayPunches } from "./roster.js";

const two = (n) => String(n).padStart(2, "0");
const ymdOf = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** `"8:30:00"` or `"08:30"` → minutes after midnight, or null. The site stores
    this shift's start as `8:30:00`, without the leading zero, so slicing the
    string reads it as `8:30:` and every late figure off it is wrong. */
export function minutesOf(t) {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A datetime's clock time in minutes, or null. */
const stampMinutes = (v) => (v ? minutesOf(String(v).slice(11, 16)) : null);

/** `"8:30:00"` → `"08:30"`. */
export const clockOf = (t) => {
	const m = minutesOf(t);
	return m == null ? "" : `${two(Math.floor(m / 60))}:${two(m % 60)}`;
};

/** Minutes as `H:MM`, or "" for none. */
export const hm = (mins) => (mins > 0 ? `${Math.floor(mins / 60)}:${two(Math.round(mins % 60))}` : "");

/** Minutes between two `YYYY-MM-DD HH:MM:SS` stamps; null when out is not after in. */
function spanMinutes(a, b) {
	if (!a || !b) return null;
	const x = Date.parse(String(a).replace(" ", "T"));
	const y = Date.parse(String(b).replace(" ", "T"));
	return isFinite(x) && isFinite(y) && y > x ? Math.round((y - x) / 60000) : null;
}

const STATUS_WORD = {
	[PRESENT]: "Present", [ON_FLOOR]: "In Only", [ON_LEAVE]: "On Leave",
	[LEAVE_PENDING]: "Leave Applied", [ABSENT]: "Absent", [UNMARKED]: "—",
};

function leaveOn(iso, rows) {
	const on = (rows || []).filter((r) => String(r.from_date) <= iso && iso <= String(r.to_date));
	return on.find((r) => r.status === "Approved") || on.find((r) => r.status === "Open") || on[0] || null;
}

const byEmp = (rows) => {
	const m = new Map();
	for (const r of rows || []) {
		if (!m.has(r.employee)) m.set(r.employee, []);
		m.get(r.employee).push(r);
	}
	return m;
};

/**
 * The report's rows.
 *
 * @param {object} a
 * @param {object[]} a.people      Employee rows, already filtered
 * @param {string} a.from, a.to    `YYYY-MM-DD`
 * @param {object[]} a.attendance  submitted Attendance rows
 * @param {object[]} a.punches     Employee Checkin rows
 * @param {object[]} a.leave       Leave Application rows
 * @param {(e) => object[]} a.holidaysOf  the holiday rows that apply to a person
 * @param {object} a.windows       Shift Type by name: `{start_time, end_time}`
 * @param {string} a.today
 * @param {number[]} [a.dow]       weekdays to keep, `Date.getDay` numbering
 * @param {string} [a.punch]       "req" working days only, "not" holidays only
 * @param {number} [a.limit]
 */
export function dailyRows({ people, from, to, attendance, punches, leave, holidaysOf, windows, today, dow = [], punch = "", limit = 1500, overtime }) {
	/* Overtime is HR's Employee Overtime rows only (16 Sep 2026). */
	const otRow = new Map((overtime || []).map((r) => [r.employee + "|" + String(r.ot_date).slice(0, 10), r]));
	if (!from || !to || to < from) return { rows: [], capped: 0, bad: true };
	const att = new Map();
	for (const r of attendance || []) {
		if (Number(r.docstatus) !== 1) continue;
		att.set(r.employee + "|" + String(r.attendance_date).slice(0, 10), r);
	}
	/* Punches grouped by person and calendar day — the fallback only, used where
	   hrms has not written the day. */
	const byDay = new Map();
	for (const c of punches || []) {
		const k = c.employee + "|" + String(c.time || "").slice(0, 10);
		if (!byDay.has(k)) byDay.set(k, []);
		byDay.get(k).push(c);
	}
	const lv = byEmp(leave);

	const rows = [];
	let capped = 0;
	for (const e of people || []) {
		const hol = new Map((holidaysOf ? holidaysOf(e) : []).map((h) => [String(h.holiday_date).slice(0, 10), h]));
		for (const d = new Date(from + "T00:00:00"); ymdOf(d) <= to; d.setDate(d.getDate() + 1)) {
			const iso = ymdOf(d);
			const h = hol.get(iso);
			if (dow.length && !dow.includes(d.getDay())) continue;
			if (punch === "req" && h) continue;
			if (punch === "not" && !h) continue;
			if (rows.length >= limit) { capped++; continue; }

			const a = att.get(e.name + "|" + iso);
			const shiftName = (a && a.shift) || e.default_shift || "";
			const w = (windows || {})[shiftName] || {};
			const startM = minutesOf(w.start_time);
			const endM = minutesOf(w.end_time);

			let inAt = "";
			let outAt = "";
			let status;
			let source;
			let lateFlag = false;
			if (a) {
				inAt = a.in_time || "";
				outAt = a.out_time || "";
				status = a.status || "—";
				source = "attendance";
				lateFlag = Boolean(Number(a.late_entry));
			} else {
				const p = dayPunches(byDay.get(e.name + "|" + iso) || []);
				inAt = p.inAt;
				outAt = p.outAt;
				const l = leaveOn(iso, lv.get(e.name));
				const st = resolveDayStatus({
					hasPunchIn: Boolean(inAt), hasPunchOut: Boolean(outAt),
					leaveStatus: l ? l.status : "", isHoliday: Boolean(h), isPastDay: iso < today,
				});
				status = st === HOLIDAY ? (h.weekly_off ? "Weekly Off" : h.description || "Holiday") : STATUS_WORD[st];
				/* An OUT with no IN is still somebody who was there. */
				if (!inAt && outAt && status === "Absent") status = "Out Only";
				source = inAt || outAt ? "punches" : "";
			}

			/* A pair whose out is not after its in — a night worker's morning out
			   matched to the evening in, which hrms has done on this site — has no
			   duration. The times are shown as read; the hours are not invented. */
			let mins = spanMinutes(inAt, outAt);
			if (a && Number(a.working_hours) > 0) mins = Math.round(Number(a.working_hours) * 60);
			const crossed = Boolean(inAt && outAt && spanMinutes(inAt, outAt) == null);

			const inM = stampMinutes(inAt);
			const outM = stampMinutes(outAt);
			const late = startM != null && inM != null && inM > startM && inM - startM < 360 ? inM - startM : 0;
			const early = endM != null && outM != null && !crossed && outM < endM && endM - outM < 360 ? endM - outM : 0;
			const otR = otRow.get(e.name + "|" + iso);
			const ot = otR ? Math.round(Number(otR.hours || 0) * 60) : 0;

			rows.push({
				emp: e,
				date: iso,
				shift: shiftName,
				shiftWindow: startM != null && endM != null ? `${clockOf(w.start_time)}-${clockOf(w.end_time)}` : "",
				in: inAt ? String(inAt).slice(11, 16) : "",
				out: outAt ? String(outAt).slice(11, 16) : "",
				/* The punch object, not the time — In Location opens it on a map. */
				inAt: (byDay.get(e.name + "|" + iso) || [])
					.filter((c) => c.log_type !== "OUT" && !Number(c.skip_auto_attendance))
					.sort((x, y) => String(x.time).localeCompare(String(y.time)))[0] || null,
				work: mins ? hm(mins) : "",
				ms: mins ? mins * 60000 : 0,
				late: hm(late) || (lateFlag ? "late" : ""),
				lateMin: late,
				early: hm(early),
				earlyMin: early,
				ot: hm(ot),
				otMin: ot,
				otEntry: otR || null,
				crossed,
				status,
				dayType: h ? (h.weekly_off ? "weekoff" : "holiday") : "",
				source,
			});
		}
	}
	return { rows, capped, bad: false };
}

/** Month Wise: the same rows, one per person per month. */
export function monthRollup(rows) {
	const m = new Map();
	for (const r of rows) {
		const key = r.emp.name + "|" + r.date.slice(0, 7);
		const g = m.get(key) || { emp: r.emp, month: r.date.slice(0, 7), days: 0, off: 0, hol: 0, punched: 0,
			present: 0, absent: 0, leave: 0, half: 0, ms: 0, lateMin: 0, earlyMin: 0, otMin: 0, lateDays: 0 };
		g.days++;
		if (r.dayType === "weekoff") g.off++;
		else if (r.dayType === "holiday") g.hol++;
		if (r.in || r.out) g.punched++;
		if (r.status === "Present" || r.status === "Work From Home") g.present++;
		if (r.status === "Half Day") g.half++;
		if (r.status === "Absent") g.absent++;
		if (r.status === "On Leave") g.leave++;
		if (r.lateMin || r.late === "late") g.lateDays++;
		g.ms += r.ms || 0;
		g.lateMin += r.lateMin || 0;
		g.earlyMin += r.earlyMin || 0;
		g.otMin += r.otMin || 0;
		m.set(key, g);
	}
	return [...m.values()].map((g) => ({
		...g,
		working: g.days - g.off - g.hol,
		work: g.ms ? hm(Math.round(g.ms / 60000)) : "",
		late: g.lateMin ? `${hm(g.lateMin)} (${g.lateDays} days)` : "",
		early: hm(g.earlyMin),
		ot: hm(g.otMin),
	}));
}

/** The figures over Daily Detail: what the days came to. A day with one punch
    is counted as a missed punch — In Only or Out Only — not as an absence; leave
    applied for counts as leave, as Monthly Basic's tile counts it. */
export function daySummary(rows) {
	const n = { people: new Set(), days: rows.length, present: 0, absent: 0, half: 0, leave: 0, late: 0, missed: 0, off: 0 };
	for (const r of rows) {
		n.people.add(r.emp.name);
		if (r.status === "Present" || r.status === "Work From Home") n.present++;
		else if (r.status === "Absent") n.absent++;
		else if (r.status === "Half Day") n.half++;
		else if (r.status === "On Leave" || r.status === "Leave Applied") n.leave++;
		else if (r.status === "In Only" || r.status === "Out Only") n.missed++;
		if (r.dayType) n.off++;
		if (r.lateMin || r.late === "late") n.late++;
	}
	return { ...n, people: n.people.size };
}
