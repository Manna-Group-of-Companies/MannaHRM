/* ---------------------------------------------------------------------------
   One person's month, a row per day.

   What Factor HR's Attendance Regularization screen draws once somebody is
   picked: every day of the cycle, what the roster expected, what the machines
   recorded, and what a correction has asked for. Their screen is the one HR
   opens to answer *"what happened to my 19th of August"*, and this is the
   arithmetic behind it.

   Pure, and importing only `rules.js`. No React, no store, no `frappe`. Same
   bargain as `lib/summary.js` and for a sharper reason: **these rows are read
   to decide whether somebody was paid for a day.** Whether a punch-out with no
   punch-in counts as present should be arguable in a test, not by opening a
   browser and squinting at a row of dots.

   ---------------------------------------------------------------------------
   The day's status is `rules.js`, and deliberately so

   `resolveDayStatus` already holds the order every innocent explanation is
   checked in — a punch beats a leave record, a request nobody has decided is
   not time off, a missing record is not an absence. That order is the rule this
   whole app is about (CLAUDE.md §1) and it is not restated here. What this file
   adds is only what that function has no opinion on: the times, the hours, the
   weekly-off half of "holiday", and the correction sitting against the day.

   ---------------------------------------------------------------------------
   Two things it will not claim

   **A shift window it was not given.** Their row reads
   `Office Shift (08:30-17:30)`, and the parenthesis is what makes Late-In and
   the overtime column mean anything. `Shift Type` carries those times on this
   site; where they have not been read, the shift is drawn by name alone rather
   than with a window invented for it.

   **Optional Holiday.** It is on their legend and there is no field on either
   side of this comparison that says a holiday is optional. The state exists in
   the key so the two legends line up and nothing is ever counted into it.
   --------------------------------------------------------------------------- */

import {
	resolveDayStatus, UNDECIDED_LEAVE,
	ABSENT, HOLIDAY, LEAVE_PENDING, ON_FLOOR, ON_LEAVE, PRESENT, UNMARKED,
} from "./rules.js";

/** The seven Factor HR prints under this screen, plus the two states this side
    can be in that theirs cannot show. `key` is what the dot is classed with;
    `label` is their word where they have one. */
export const ROSTER_STATES = [
	{ key: "full", label: "Fullday" },
	{ key: "partial", label: "Partial" },
	{ key: "absent", label: "Absent" },
	{ key: "leave", label: "Approved leave" },
	{ key: "unappr", label: "UnApproved" },
	{ key: "holiday", label: "Holiday" },
	{ key: "weekoff", label: "Weekoff" },
	{ key: "unmarked", label: "Not yet" },
];

/** `rules.js` decides; this only renames. The two vocabularies differ because
    theirs is about how a day is *paid* and `rules.js` is about what is *known*
    — `on_floor` is "still in" to the rule and "Partial" on their key, and they
    are the same day seen from two ends. */
const DISPLAY = {
	[PRESENT]: "full",
	[ON_FLOOR]: "partial",
	[ON_LEAVE]: "leave",
	[LEAVE_PENDING]: "unappr",
	[HOLIDAY]: "holiday",
	[UNMARKED]: "unmarked",
	[ABSENT]: "absent",
};

/** Every day of `YYYY-MM`, as `YYYY-MM-DD` strings.

    Built by counting rather than by stepping a `Date` through the month:
    `setDate(d + 1)` across a daylight-saving boundary can land on the same day
    twice, and this site runs where that does not happen — which is exactly the
    kind of assumption that survives until somebody deploys it somewhere it does
    not hold. */
export function daysOf(ym) {
	const [y, m] = String(ym || "").split("-").map(Number);
	if (!y || !m) return [];
	const last = new Date(y, m, 0).getDate();
	const out = [];
	for (let d = 1; d <= last; d++) {
		out.push(`${ym}-${String(d).padStart(2, "0")}`);
	}
	return out;
}

const DOUBLE_READ_MS = 10 * 60 * 1000;
const stampMs = (t) => Date.parse(String(t).replace(" ", "T"));

/** The punches of one day, earliest in and latest out.

    **Earliest and latest, not first and second.** A gate that double-reads puts
    four rows on a day, and a pair taken in arrival order would report the
    second read as the punch-out — a nine-hour day as four minutes.

    **A day with no direction on any punch is its first and its last.** Most
    gates here report every punch as `0` and the bridge sends no log type
    (CLAUDE.md §5); read as all arrivals, a whole day at the gate was "in, never
    out". First and last is what hrms's own default pairing does with them —
    except that a last within DOUBLE_READ_MS of the first is the same finger
    read twice, and the day stays in-only: a missing leaving shown as missing
    gets corrected, and one hidden inside a full day does not. */
export function dayPunches(rows) {
	let inAt = "";
	let outAt = "";
	/* A punch HR superseded on Attendance Regularization. It is kept — a
	   punch is evidence and is never deleted — but marked the way hrms's
	   shift job reads it, so the day is built without it. See
	   lib/punchedit.js. */
	const live = rows.filter((c) => c.time && !Number(c.skip_auto_attendance));
	const typed = live.some((c) => c.log_type === "IN" || c.log_type === "OUT");
	for (const c of live) {
		const t = String(c.time);
		if (typed && c.log_type === "OUT") {
			if (!outAt || t > outAt) outAt = t;
		} else if (!inAt || t < inAt) {
			inAt = t;
		}
		if (!typed && (!outAt || t > outAt)) outAt = t;
	}
	if (!typed && outAt && stampMs(outAt) - stampMs(inAt) <= DOUBLE_READ_MS) outAt = "";
	return { inAt, outAt };
}

/** `dayPunches` for the work day `iso`. Where the earliest punch it holds is
    the next morning's, the day has only a night's leaving (`workDateOf` moved
    it back), and that is an Out with its arrival missing — not somebody
    arriving at dawn. */
export function workDayPunches(rows, iso) {
	const p = dayPunches(rows);
	return p.inAt && p.inAt.slice(0, 10) > iso ? { inAt: "", outAt: p.outAt || p.inAt } : p;
}

const nextIso = (iso, n = 1) => {
	const d = new Date(iso + "T00:00:00");
	d.setDate(d.getDate() + n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The day after `YYYY-MM-DD`, for a read that has to reach the morning a
    night shift ends on. */
export const dayAfter = (iso) => nextIso(iso, 1);
export const dayBefore = (iso) => nextIso(iso, -1);

/** The day a punch is worked for — its own date, or the day before.

    A night shift belongs to the day it started (CLAUDE.md §5). So when the
    shift of the day before runs past midnight, a punch before noon is that
    night's leaving and counts there. A typed IN is not moved: it says somebody
    arrived, and an arrival does not end last night.

    `shiftOn(iso)` is the Shift Type of a day, `{start_time, end_time}`, or
    null — without one a punch stays on its own date, which is where it was
    before this rule existed. */
export function workDateOf(punch, shiftOn) {
	/* Placed already: a 24-hour shift's next-morning leaving, put on its
	   arrival's day by the machine that took it (lib/direction.js). */
	if (punch && punch.work_day) return punch.work_day;
	const t = String((punch && punch.time) || "");
	const iso = t.slice(0, 10);
	if (!iso || t.slice(11, 13) >= "12" || punch.log_type === "IN") return iso;
	const prev = nextIso(iso, -1);
	const w = shiftOn ? shiftOn(prev) : null;
	const s = clockMinutes(w && w.start_time);
	const e = clockMinutes(w && w.end_time);
	return s != null && e != null && e <= s ? prev : iso;
}

/** Hours between two `YYYY-MM-DD HH:MM:SS` stamps, as `H:MM`.

    Their column reads `09:07` for nine hours and seven minutes, which is the
    same shape as a clock time and is not one — worth knowing before somebody
    compares it against Time In. */
export function spanHours(inAt, outAt) {
	if (!inAt || !outAt) return "";
	const a = Date.parse(String(inAt).replace(" ", "T"));
	const b = Date.parse(String(outAt).replace(" ", "T"));
	if (!isFinite(a) || !isFinite(b) || b <= a) return "";
	const mins = Math.round((b - a) / 60000);
	return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** Which leave application covers a day, if any.

    **The most explanatory one, not the first one.** A day can carry more than
    one application — somebody applies, is refused, applies again and is
    granted — and `find` would take whichever the site listed first. That is
    usually the older one, which is usually the refused one, and a granted day
    would then read as absent on a screen somebody is paid from.

    So: granted beats undecided beats anything else, which is the same order
    `resolveDayStatus` weighs them in. Half days are not resolved here — the
    site records `half_day_date` and nothing on this screen has a column for
    half of one. */
function leaveOn(iso, leave) {
	const on = (leave || []).filter((r) =>
		String(r.from_date || "") <= iso && iso <= String(r.to_date || ""));
	if (!on.length) return null;
	return on.find((r) => r.status === "Approved")
		|| on.find((r) => UNDECIDED_LEAVE.includes(r.status))
		|| on[0];
}

/**
 * One person's month.
 *
 * `holidays` is the Holiday List child table as the site hands it over —
 * `{ holiday_date, description, weekly_off }` — which is where the weekly-off
 * half of the legend comes from. Nothing else on either side records that a
 * Sunday is a Sunday.
 *
 * `today` is passed rather than read, so a test does not have to freeze the
 * clock and a day is not "not yet" only because the suite ran before midnight.
 */
/** `"8:30:00"` → 510. Padded or not — this site stores one shift as `8:30:00`. */
export function clockMinutes(t) {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes as `H:MM`, or "" for none. */
export const minutesText = (m) => (m > 0 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}` : "");

/** Late and early minutes for a day's pair against a shift window, and the
    hours worked. **No overtime** — since 16 September 2026 OT is only what HR
    enters (Employee Overtime, see `overtimeByDay`); a late punch-out is hours
    worked. Nothing is claimed for a pair whose out is not after its in. The
    six-hour ceiling keeps a night worker's evening punch from reading as nine
    hours late. */
export function dayMinutes(inAt, outAt, window) {
	const w = window || {};
	const start = clockMinutes(w.start_time);
	const end = clockMinutes(w.end_time);
	const inM = inAt ? clockMinutes(String(inAt).slice(11, 16)) : null;
	const outM = outAt ? clockMinutes(String(outAt).slice(11, 16)) : null;
	const a = inAt ? Date.parse(String(inAt).replace(" ", "T")) : NaN;
	const b = outAt ? Date.parse(String(outAt).replace(" ", "T")) : NaN;
	const work = isFinite(a) && isFinite(b) && b > a ? Math.round((b - a) / 60000) : 0;
	const paired = work > 0;
	return {
		workMin: work,
		lateMin: start != null && inM != null && inM > start && inM - start < 360 ? inM - start : 0,
		earlyMin: end != null && outM != null && paired && outM < end && end - outM < 360 ? end - outM : 0,
	};
}

/** HR's overtime rows by day, `YYYY-MM-DD` → the row. */
export function overtimeByDay(rows) {
	const m = new Map();
	for (const r of rows || []) m.set(String(r.ot_date || "").slice(0, 10), r);
	return m;
}

/** The shift assignment covering a day, if any — the latest-starting one wins,
    which is what hrms does when two overlap. */
export function assignmentOn(iso, assignments) {
	return (assignments || [])
		.filter((a) => String(a.start_date) <= iso && (!a.end_date || iso <= String(a.end_date)))
		.sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)))[0] || null;
}

export function monthRoster({ ym, punches, leave, holidays, corrections, shift, today, window, overtime, assignments, windows }) {
	const otDay = overtimeByDay(overtime);

	/* A night shift ends the next morning, and the day it belongs to is the
	   day it started (CLAUDE.md §5) — `workDateOf` moves that morning's
	   leaving back to it, typed OUT or a gate's undirected punch alike.
	   Without it a night worker reads as ½ on every day of the month: an in
	   with no out, and an out with no in. */
	const shiftOf = (iso) => {
		const a = assignmentOn(iso, assignments);
		return a ? (windows || {})[a.shift_type] || null : window;
	};
	const byDay = new Map();
	for (const c of punches || []) {
		const d = workDateOf(c, shiftOf);
		if (!d) continue;
		if (!byDay.has(d)) byDay.set(d, []);
		byDay.get(d).push(c);
	}

	const hol = new Map();
	for (const h of holidays || []) {
		hol.set(String(h.holiday_date || "").slice(0, 10), h);
	}

	const ar = new Map();
	for (const r of corrections || []) {
		ar.set(String(r.attendance_date || "").slice(0, 10), r);
	}

	const rows = daysOf(ym).map((iso) => {
		const mine = byDay.get(iso) || [];
		const { inAt, outAt } = workDayPunches(mine, iso);
		const h = hol.get(iso);
		const lv = leaveOn(iso, leave);

		const status = resolveDayStatus({
			hasPunchIn: Boolean(inAt),
			hasPunchOut: Boolean(outAt),
			leaveStatus: lv ? lv.status : "",
			isHoliday: Boolean(h),
			isPastDay: iso < today,
		});

		/* A weekly off is a holiday to the rule and a different colour on the
		   key, so the split happens here rather than in `rules.js` — that
		   function decides whether somebody is absent, and a Sunday and Diwali
		   are the same answer to that question. */
		const display = status === HOLIDAY && h && h.weekly_off ? "weekoff" : DISPLAY[status];

		/* A dated Shift Assignment beats the default shift for its days. */
		const asg = assignmentOn(iso, assignments);
		const dayShift = asg ? asg.shift_type : shift;
		const dayWindow = asg ? (windows || {})[asg.shift_type] || null : window;

		return {
			iso,
			status,
			display,
			shift: dayShift,
			assigned: Boolean(asg),
			inAt,
			outAt,
			hours: spanHours(inAt, outAt),
			/* Against the shift's window, where one was given — see dayMinutes. */
			...dayMinutes(inAt, outAt, dayWindow),
			/* Overtime is what HR granted for the day, and nothing else. */
			otMin: otDay.has(iso) ? Math.round(Number(otDay.get(iso).hours || 0) * 60) : 0,
			/* The same, to the second, for the OT clock — totals stay in minutes. */
			otSec: otDay.has(iso) ? Math.round(Number(otDay.get(iso).hours || 0) * 3600) : 0,
			otEntry: otDay.get(iso) || null,
			/* Every punch of the day, so a row that looks wrong can be opened
			   rather than argued about. A double-read shows as four stamps. */
			punches: mine.length,
			holiday: h ? h.description || "" : "",
			leave: lv || null,
			ar: ar.get(iso) || null,
		};
	});

	const counts = {};
	for (const st of ROSTER_STATES) counts[st.key] = 0;
	for (const r of rows) counts[r.display] = (counts[r.display] || 0) + 1;
	/* The month's time, beside its days: hours worked, overtime, and how many
	   days started late and ended early. */
	counts.workMin = rows.reduce((a, r) => a + r.workMin, 0);
	counts.otMin = rows.reduce((a, r) => a + r.otMin, 0);
	counts.lateDays = rows.filter((r) => r.lateMin > 0).length;
	counts.lateMin = rows.reduce((a, r) => a + r.lateMin, 0);
	counts.earlyDays = rows.filter((r) => r.earlyMin > 0).length;
	counts.earlyMin = rows.reduce((a, r) => a + r.earlyMin, 0);

	return { rows, counts };
}

/* ---------------------------------------------------------------------------
   Everybody's month, a row per person and a column per day.

   The register HR reads before picking anybody. It is `monthRoster` run once
   per person over one read of everybody's punches — not a second opinion about
   what a day was. A cell here and the row the same person's month draws must
   agree, and running the same function is the only way that stays true.
   --------------------------------------------------------------------------- */

/** What a cell prints. Short, because thirty-one of them sit in a row — and
    every code is spelled out in the legend and in the cell's title, because a
    letter alone is identity by memory. "Not yet" prints nothing: a future day
    with a dot in it reads as data. */
export const REGISTER_CODE = {
	full: "P", partial: "½", absent: "A", leave: "L",
	unappr: "L?", holiday: "H", weekoff: "WO", unmarked: "",
};

const byEmployee = (rows) => {
	const m = new Map();
	for (const r of rows || []) {
		if (!m.has(r.employee)) m.set(r.employee, []);
		m.get(r.employee).push(r);
	}
	return m;
};

/**
 * One `monthRoster` per person.
 *
 * `holidaysOf(emp)` rather than one list, because the calendar belongs to the
 * person — their own where the record names one, otherwise their company's —
 * and a group-wide register spans companies whose holidays differ.
 */
export function monthRegister({ ym, people, punches, leave, corrections, holidaysOf, today, windowOf, overtime }) {
	const o = byEmployee(overtime);
	const p = byEmployee(punches);
	const l = byEmployee(leave);
	const c = byEmployee(corrections);
	return (people || []).map((emp) => ({
		emp,
		...monthRoster({
			ym,
			punches: p.get(emp.name) || [],
			leave: l.get(emp.name) || [],
			corrections: c.get(emp.name) || [],
			holidays: holidaysOf ? holidaysOf(emp) : [],
			shift: emp.default_shift || "",
			today,
			window: windowOf ? windowOf(emp) : null,
			overtime: o.get(emp.name) || [],
		}),
	}));
}
