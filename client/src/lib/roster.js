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

/** The punches of one day, earliest in and latest out.

    **Earliest and latest, not first and second.** A gate that double-reads puts
    four rows on a day, and a pair taken in arrival order would report the
    second read as the punch-out — a nine-hour day as four minutes. */
export function dayPunches(rows) {
	let inAt = "";
	let outAt = "";
	for (const c of rows) {
		const t = String(c.time || "");
		if (!t) continue;
		if (c.log_type === "OUT") {
			if (!outAt || t > outAt) outAt = t;
		} else if (!inAt || t < inAt) {
			inAt = t;
		}
	}
	return { inAt, outAt };
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
export function monthRoster({ ym, punches, leave, holidays, corrections, shift, today }) {
	const byDay = new Map();
	for (const c of punches || []) {
		const d = String(c.time || "").slice(0, 10);
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
		const { inAt, outAt } = dayPunches(mine);
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

		return {
			iso,
			status,
			display,
			shift,
			inAt,
			outAt,
			hours: spanHours(inAt, outAt),
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

	return { rows, counts };
}
