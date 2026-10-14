/* ---------------------------------------------------------------------------
   The office absence rule — the month's first absence is Casual Leave.

   HR, 3 October 2026: an office employee's first absence in a month is taken
   as Casual Leave, a second is a salary deduction, and a regularized day gives
   its leave back to the next absence. The deduction is nothing written here:
   the day stays Absent and payroll, based on Attendance, does not pay it
   (manna_hr/payrollsetup.py PAYROLL_SETTINGS). The reasoning is in
   `manna_hr/absencerule.py`; **this is a copy of it**, pinned to the Python by
   tests/absencerule.test.js, so the dashboard can apply it on a site where
   `manna_hr` is not installed yet and its hourly job does not run.

   Pure: no React, no network. Days are `YYYY-MM-DD` strings, which compare
   in date order as strings.
   --------------------------------------------------------------------------- */

import { LEAVE_TYPE_NAME, casualLeaveGroup } from "./monthlyleave.js";
import { lastOfMonth } from "./format.js";

export const LEAVE_TYPE = LEAVE_TYPE_NAME;

/** Everybody who earns Casual Leave — office staff, supervisors and drivers
    (HR, widened from office only on 6 October 2026). See the Python. */
export const GROUPS = ["Office", "Supervisor", "Driver"];

/** The start of the application's description: how the rule knows its own,
    and the only thing that lets it cancel one. */
export const AUTO_MARK = "[Office absence rule]";

export const DESCRIPTION = AUTO_MARK + " The first absence this month, taken as Casual Leave. "
	+ "It is given back by itself if the day is regularized.";

/** Never reaches back past this day: September included, HR 6 October 2026 —
    see the Python. */
export const EFFECTIVE_FROM = "2026-09-01";

/** Whether the leave rules run by themselves. Off since 14 October 2026,
    asked for by HR — see AUTO_LEAVE_RULES in the Python, which this is pinned
    to by tests/absencerule.test.js. Off stops every new automatic leave; a
    corrected day still gives back the leave the rule made for it before. */
export const AUTO_LEAVE_RULES = false;

/** A correction's punches carry this `device_id` prefix (decide.js `regDevice`). */
export const REG_PREFIX = "REG-";

export const appliesTo = (designation) => GROUPS.includes(casualLeaveGroup(designation));

export const isAuto = (description) => String(description ?? "").trimStart().startsWith(AUTO_MARK);

const day = (v) => String(v ?? "").slice(0, 10);

/** The month `iso` falls in, as [first day, last day] — clipped to the rule's
    start and to `today`, or null when nothing of it is left. */
export function monthSpan(iso, today) {
	const ym = day(iso).slice(0, 7);
	const start = ym + "-01" < EFFECTIVE_FROM ? EFFECTIVE_FROM : ym + "-01";
	const end = lastOfMonth(ym) > today ? today : lastOfMonth(ym);
	return start <= end ? [start, end] : null;
}

/** This month and last, as absencerule.months_to_check. */
export function monthsToCheck(today) {
	const [y, m] = today.split("-").map(Number);
	const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
	return [monthSpan(prev, today), monthSpan(today, today)].filter(Boolean);
}

/**
 * What to do for one person's month — absencerule.plan.
 *
 * @param {string[]} absent  days their submitted Attendance says Absent
 * @param {{name: string, day: string}[]} auto  this rule's live applications that month
 * @param {string[]} regularized  days a correction's punch landed on
 * @param {string[]} covered  days under any other leave not rejected or cancelled
 * @param {string[]} excluded  days hrms just refused for a reason of the day itself
 * @returns {{cancel: string[], give: string|null}}
 */
export function plan(absent, auto, regularized = [], covered = [], excluded = []) {
	const reg = new Set(regularized.map(day));
	const cov = new Set([...covered, ...excluded].map(day));
	const live = auto.map((a) => ({ name: a.name, day: day(a.day) }))
		.sort((a, b) => (a.day + a.name < b.day + b.name ? -1 : 1));

	const cancel = live.filter((a) => reg.has(a.day)).map((a) => a.name);
	const kept = live.filter((a) => !reg.has(a.day));
	cancel.push(...kept.slice(1).map((a) => a.name));
	if (kept.length) return { cancel, give: null };

	const back = new Set(live.filter((a) => cancel.includes(a.name)).map((a) => a.day));
	const give = [...new Set(absent.map(day))].sort()
		.find((d) => !reg.has(d) && !cov.has(d) && !back.has(d)) || null;
	return { cancel, give };
}

/** The approved one-day Casual Leave Application for `iso` — absencerule.application.
    `approver` is required on this site: HR Settings makes a leave approver
    mandatory, and an application without one is refused. */
export function application(employee, iso, company, today, approver) {
	const doc = {
		employee,
		leave_type: LEAVE_TYPE,
		from_date: day(iso),
		to_date: day(iso),
		half_day: 0,
		status: "Approved",
		posting_date: day(today || iso),
		description: DESCRIPTION,
		follow_via_email: 0,
	};
	if (company) doc.company = company;
	if (approver) doc.leave_approver = approver;
	return doc;
}

/** absencerule.approver_for: the person's own approver, else their manager's
    login, else whoever is applying the rule. */
export const approverFor = (own, managerUser, fallback) => own || managerUser || fallback || null;
