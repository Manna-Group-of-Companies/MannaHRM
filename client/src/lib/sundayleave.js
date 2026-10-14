/* ---------------------------------------------------------------------------
   Sunday leave — each Sunday an office employee works adds a day of Casual
   Leave.

   HR, 3 October 2026. Why it is a Leave Adjustment, why one per allocation
   and why punches decide a Sunday are all in `manna_hr/sundayleave.py`;
   **this is a copy of it**, pinned to the Python by tests/sundayleave.test.js,
   so the dashboard can apply it before `manna_hr` is installed.

   Pure: no React, no network. Days are `YYYY-MM-DD` strings.
   --------------------------------------------------------------------------- */

import { LEAVE_TYPE_NAME, casualLeaveGroup } from "./monthlyleave.js";
import { MON } from "./format.js";

export const LEAVE_TYPE = LEAVE_TYPE_NAME;

/** Office staff — sundayleave.GROUPS. Not the absence rule's list, which
    was widened to supervisors and drivers on 6 October 2026. */
export const GROUPS = ["Office"];

export const appliesTo = (designation) => GROUPS.includes(casualLeaveGroup(designation));

export const AUTO_MARK = "[Sunday leave]";

/** September counts — see the Python for why Sunday leave reaches back and
    the absence rule does not. */
export const EFFECTIVE_FROM = "2026-09-01";

/** sundayleave.BACKFILL_UNTIL: only a first allocation starting by this day
    reaches back to EFFECTIVE_FROM. */
export const BACKFILL_UNTIL = "2026-10-01";

export const GRACE_DAYS = 31;

/** What a Sunday's Attendance earns, when the site has marked one. */
export const WORKED = { Present: 1, "Work From Home": 1, "Half Day": 0.5 };

const day = (v) => String(v ?? "").slice(0, 10);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const at = (s) => new Date(day(s) + "T00:00:00");

export const isAuto = (reason) => String(reason ?? "").trimStart().startsWith(AUTO_MARK);

/** sundayleave.still_open_since. */
export function stillOpenSince(today) {
	const d = at(today);
	d.setDate(d.getDate() - GRACE_DAYS);
	return iso(d) > EFFECTIVE_FROM ? iso(d) : EFFECTIVE_FROM;
}

/** sundayleave.window: [first, last] of an allocation whose Sundays count, or
    null. The person's `first` allocation also takes the Sundays before it. */
/** Whether Sunday leave goes on this allocation — sundayleave.counts: only
    one the Casual Leave policy made. A one-month allocation made so a
    September absence could be taken as leave is not somebody's first. */
export const counts = (allocation) => Boolean(allocation?.leave_policy_assignment);

export function window(from, to, today, first = false) {
	const reachBack = first && day(from) <= BACKFILL_UNTIL;
	const start = !reachBack && day(from) > EFFECTIVE_FROM ? day(from) : EFFECTIVE_FROM;
	const end = day(to) < day(today) ? day(to) : day(today);
	return start <= end ? [start, end] : null;
}

/** sundayleave.sundays: the Sundays from `start` to `end` that are the
    person's weekly off. `holidays` null means the list could not be read, and
    every Sunday is taken as one. */
export function sundays(start, end, holidays = null) {
	const keep = holidays ? new Set([...holidays].map(day)) : null;
	const d = at(start);
	d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
	const out = [];
	for (; iso(d) <= day(end); d.setDate(d.getDate() + 7)) {
		if (!keep || keep.has(iso(d))) out.push(iso(d));
	}
	return out;
}

/** sundayleave.list_on: the holiday list in force for somebody on `d`, as
    hrms 16 decides it — their own latest Holiday List Assignment starting on
    or before the day, else their company's. Per day, never as of today: an
    allocation runs January to December and the lists April to March.
    @param {{assigned_to: string, from_date: string, holiday_list: string}[]} assignments */
export function listOn(assignments, employee, company, d) {
	for (const who of [employee, company]) {
		const hits = assignments.filter((a) => a.assigned_to === who && day(a.from_date) <= day(d))
			.sort((x, y) => (day(x.from_date) < day(y.from_date) ? 1 : -1));
		if (hits.length) return hits[0].holiday_list;
	}
	return null;
}

/** sundayleave.is_off: whether `d` is a holiday on list `name`. `lists` is
    {name: {from, to, dates: Set}}; a day no list answers for counts as one. */
export function isOff(d, name, lists) {
	const got = name ? lists[name] : null;
	if (!got) return true;
	if (day(d) < day(got.from) || day(d) > day(got.to)) return true;
	return got.dates.has(day(d));
}

/** sundayleave.credit: 1, 0.5 or 0 for one Sunday. */
export function credit(status, punches = 0) {
	if (status) return WORKED[status] || 0;
	return punches >= 2 ? 1 : 0;
}

/** sundayleave.earned: {sunday: credit} → {total, worked}. */
export function earned(days) {
	const worked = Object.keys(days).filter((d) => days[d]).sort();
	return { total: worked.reduce((n, d) => n + days[d], 0), worked };
}

const dmy = (d) => `${d.slice(8, 10)}-${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}`;

/** sundayleave.reason. */
export function reason(worked, halves = []) {
	const half = new Set(halves.map(day));
	return `${AUTO_MARK} Casual Leave for ${worked.length} Sunday${worked.length === 1 ? "" : "s"} worked: `
		+ `${worked.map((d) => dmy(d) + (half.has(day(d)) ? " (half day)" : "")).join(", ")}.`;
}

/** The Sundays an adjustment's reason names, as {YYYY-MM-DD: 1 or 0.5} — what
    the calendar marks on each. Empty for an adjustment this rule did not make. */
export function credited(text) {
	const out = {};
	if (!isAuto(text)) return out;
	for (const m of String(text).matchAll(/(\d{2})-([A-Z][a-z]{2})-(\d{4})( \(half day\))?/g)) {
		const mon = MON.indexOf(m[2]);
		if (mon >= 0) out[`${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1]}`] = m[4] ? 0.5 : 1;
	}
	return out;
}

/**
 * sundayleave.plan: what to do for one allocation.
 *
 * @param {number} total  what its Sundays have earned
 * @param {{name: string, leaves: number, reason: string}[]} live  its submitted Leave Adjustments
 * @param {string} [text]  the reason it should carry
 * @returns {{cancel: string[], create: number|null, blocked: string|null}}
 */
export function plan(total, live, text) {
	const theirs = live.filter((a) => !isAuto(a.reason)).map((a) => a.name);
	const ours = live.filter((a) => isAuto(a.reason));
	if (theirs.length) {
		return { cancel: [], create: null, blocked: `${theirs.join(", ")} already adjusts this allocation, and hrms allows one.` };
	}
	const have = ours.reduce((n, a) => n + Number(a.leaves || 0), 0);
	const sameText = text == null || !ours.length || String(ours[0].reason || "").trim() === text.trim();
	if (ours.length <= 1 && have === total && sameText) return { cancel: [], create: null, blocked: null };
	return { cancel: ours.map((a) => a.name), create: total > 0 ? total : null, blocked: null };
}

/** sundayleave.adjustment: the Leave Adjustment giving `total` on `allocation`. */
export function adjustment(employee, allocation, total, worked, today, amendedFrom, halves = []) {
	const doc = {
		employee,
		leave_type: LEAVE_TYPE,
		leave_allocation: allocation,
		adjustment_type: "Allocate",
		leaves_to_adjust: total,
		posting_date: day(today),
		reason_for_adjustment: reason(worked, halves),
	};
	if (amendedFrom) doc.amended_from = amendedFrom;
	return doc;
}
