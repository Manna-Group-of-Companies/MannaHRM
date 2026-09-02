/**
 * Rules that need no database, and are therefore testable without a site.
 *
 * Plain functions over plain data, so "where did this person stand" and "is
 * this punch inside the window" can be argued about, and tested, in one
 * command. Nothing here imports React, the store, or the API client. That is
 * the point, and it is worth keeping.
 *
 * ## Where this came from, and what changed
 *
 * These were `manna_hr/rules.py` — a Frappe app that ran them on the ERPNext
 * server, on the server's clock. That app is gone; this is the same arithmetic,
 * in the language the rest of the site is written in, with the same tests
 * (`tests/rules.test.js`).
 *
 * **What did not survive the move is where they run.** A rule enforced only in
 * a browser is a suggestion to anybody holding `curl`, and here the
 * consequence is somebody's wages rather than a wrong number on a dashboard.
 * So these decide what this site *draws* and what it *warns about*; they do
 * not decide what anybody is paid. Until the same rules run inside ERPNext —
 * as a Server Script, or as an app on a private bench — the site is a fast,
 * kind error message in front of a site that has not yet been told the rule.
 * See docs/ENFORCEMENT.md.
 */

/* --------------------------------------------------------------- statuses */

export const PRESENT = "present";
export const ON_FLOOR = "on_floor";
export const ON_LEAVE = "on_leave";
export const LEAVE_PENDING = "leave_pending";
export const HOLIDAY = "holiday";
export const WEEKLY_OFF = "weekly_off";
export const UNMARKED = "unmarked";
export const ABSENT = "absent";

export const LABELS = {
	[PRESENT]: "Present",
	[ON_FLOOR]: "Still in",
	[ON_LEAVE]: "On leave",
	[LEAVE_PENDING]: "Leave not yet granted",
	[HOLIDAY]: "Holiday",
	[WEEKLY_OFF]: "Weekly off",
	[UNMARKED]: "Not marked",
	[ABSENT]: "Absent",
};

/** Frappe's Leave Application statuses that mean "nobody has decided yet". */
export const UNDECIDED_LEAVE = ["Open", "Applied"];

/**
 * Where one person stood on one day.
 *
 * `absent` is deliberately the last resort. Calling somebody absent is a
 * payroll consequence and, on a bad day, an accusation. So every innocent
 * explanation is checked first, in this order:
 *
 *   1. **A punch beats everything.** Somebody who turned up worked, whatever
 *      leave record exists. A worker who cancelled their leave and came in
 *      must not be marked absent because the request was never withdrawn.
 *   2. **Both punches, or they are still in.** A day counts as worked only
 *      with a punch in *and* out; an open shift is not a complete day and is
 *      not payroll-ready.
 *   3. **Granted leave, then requested leave.** These are different facts. A
 *      request nobody has decided is not time off, and treating it as such
 *      would let unapproved absence disappear into the leave column.
 *   4. **A holiday is nobody's absence.**
 *   5. **A day still running, or one the shift job has not reached, is
 *      unmarked — not absent.** Treating a missing record as an absence would
 *      quietly mark the whole group absent at nine in the morning.
 *
 * Only what survives all five is absent.
 */
export function resolveDayStatus({ hasPunchIn, hasPunchOut, leaveStatus, isHoliday, isPastDay }) {
	if (hasPunchIn) return hasPunchOut ? PRESENT : ON_FLOOR;

	if (leaveStatus === "Approved") return ON_LEAVE;

	/* A rejected request is decided, and the answer was no — so it explains
	   nothing and must not sit in the pending column. It is still worth carrying
	   alongside the row, because "asked, was refused, did not come in" is exactly
	   the context HR wants when they open it. */
	if (UNDECIDED_LEAVE.includes(leaveStatus)) return LEAVE_PENDING;

	if (isHoliday) return HOLIDAY;

	if (!isPastDay) return UNMARKED;

	return ABSENT;
}

/**
 * A period can be signed off only when nothing is still open.
 *
 * An `on_floor` day means somebody's hours are unknown, so paying from that
 * period is guesswork. Regularize them first.
 */
export function isPayrollReady(statuses) {
	return !Array.from(statuses).includes(ON_FLOOR);
}

/* ----------------------------------------------------------- punch window */

export function minuteOfDay(hour, minute) {
	return hour * 60 + minute;
}

/**
 * Whether a self-service punch at `minute` is inside the working window.
 *
 * Not a fraud check — an honesty check on the shape of the day. A punch at 2am
 * either mistyped or is something that needs a human to look at it, and the
 * regularization queue is where a human looks.
 */
export function isWithinPunchWindow(minute, opens, closes) {
	return opens <= minute && minute <= closes;
}
