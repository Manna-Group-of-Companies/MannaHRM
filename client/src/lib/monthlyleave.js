/* ---------------------------------------------------------------------------
   Casual Leave, one a month — the values, for the Give monthly leave button.

   **A copy of `manna_hr/leavepolicy.py`**, field for field, pinned to it by
   tests/leave.test.js. The Python is what the install and
   tools/setup_monthly_leave.py use; this is what the dashboard uses when HR
   presses the button instead of running the tool. Two copies of one policy is
   a drift waiting to happen, which is why the test reads the Python file.

   Pure: no React, no network.
   --------------------------------------------------------------------------- */

import { ymd } from "./format.js";

export const LEAVE_TYPE_NAME = "Casual Leave";
export const ANNUAL_ALLOCATION = 12;
export const POLICY_TITLE = "Manna Casual Leave — 1 a month";

/** The fields that make Casual Leave monthly. Only these are compared and
    written on a site that already has the type. */
export const LEAVE_TYPE = {
	leave_type_name: LEAVE_TYPE_NAME,
	is_earned_leave: 1,
	earned_leave_frequency: "Monthly",
	allocate_on_day: "First Day",
	is_carry_forward: 1,
	maximum_carry_forwarded_leaves: 0,
	max_leaves_allowed: 0,
	is_lwp: 0,
	allow_negative: 0,
};

export const LEAVE_POLICY = {
	title: POLICY_TITLE,
	leave_policy_details: [{ leave_type: LEAVE_TYPE_NAME, annual_allocation: ANNUAL_ALLOCATION }],
};

/** The most a month the Create Employee wizard takes — a ceiling on a typo,
    not a rule HR gave. leavepolicy.MAX_PER_MONTH. */
export const MAX_PER_MONTH = 5;

/** The title of the policy giving `perMonth` of `type` a month. One policy
    per type and rate, because hrms's earned leave belongs to the policy, not
    the person; one Casual Leave must come out as POLICY_TITLE, the policy
    already on the site. leavepolicy.policy_title. */
export const policyTitle = (perMonth, type = LEAVE_TYPE_NAME) =>
	`Manna ${type} — ${Number(perMonth)} a month`;

/** The Leave Policy giving `perMonth` of `type` a month. leavepolicy.leave_policy. */
export const leavePolicy = (perMonth, type = LEAVE_TYPE_NAME) => ({
	title: policyTitle(perMonth, type),
	leave_policy_details: [{ leave_type: type, annual_allocation: ANNUAL_ALLOCATION * Number(perMonth) }],
});

/** Whether a Leave Type row is earned a piece each month — what makes "N a
    month" true. One that is not is handed its whole year the moment a policy
    is assigned. leavepolicy.is_monthly. */
export const isMonthly = (row) =>
	Number(row?.is_earned_leave || 0) === 1 && row?.earned_leave_frequency === "Monthly";

/** Why `type` cannot be given by the month, or null when it can.

    Casual Leave always can: giving it makes the site's Casual Leave monthly,
    which is HR's rule for it (24 September 2026). Any other type is left as
    HR set it — making Sick Leave monthly would change it for everybody who
    has it, and that is not a side effect of hiring one person. A type whose
    row did not say (an older site, a narrower read) is let through here and
    checked again by api/monthlyleave.js before anything is written. */
export function notMonthly(type, leaveTypes) {
	if (!type || type === LEAVE_TYPE_NAME) return null;
	const row = (leaveTypes || []).find((t) => t.name === type);
	if (!row || row.is_earned_leave == null) return null;
	return isMonthly(row) ? null
		: `${type} is not earned monthly on the site, so it cannot be given by the month. Choose `
			+ `${LEAVE_TYPE_NAME}, or on the site set ${type} to Is Earned Leave, Monthly, first.`;
}

/** What is wrong with a leaves-a-month answer, or null. Halves are allowed —
    hrms deals in half days — and 0 means no Casual Leave, which writes nothing.
    leavepolicy.per_month_problem, sentence for sentence. */
export function perMonthProblem(value) {
	const s = String(value ?? "").trim();
	const n = Number(s);
	if (s === "" || !Number.isFinite(n)) return "Leaves A Month is not a number.";
	if (n < 0) return "Leaves A Month cannot be negative.";
	if (!Number.isInteger(n * 2)) return "Leaves A Month goes in half days — 1, 1.5, 2.";
	if (n > MAX_PER_MONTH) return `${n} leaves a month is ${ANNUAL_ALLOCATION * n} a year — check the number.`;
	return null;
}

/** The calendar year a date is in, as [first day, last day]. */
export const leaveYear = (iso) => [iso.slice(0, 4) + "-01-01", iso.slice(0, 4) + "-12-31"];

/** The day an assignment made `today` starts earning from, for this person.

    **This month, not January.** hrms credits every month between the start and
    today the moment an assignment is submitted, so a January start written in
    September hands out nine days at once — on top of leave already taken in
    Factor HR. Never before the month they joined. See leavepolicy.effective_from. */
export function earnFrom(today, joined) {
	const [yearStart] = leaveYear(today);
	let from = today <= yearStart ? yearStart : today.slice(0, 7) + "-01";
	const j = String(joined || "").slice(0, 7);
	if (j && j + "-01" > from) from = j + "-01";
	return from;
}

/** The fields of LEAVE_TYPE the site's row does not already hold. */
export function typeDiffers(row) {
	const out = {};
	for (const [k, want] of Object.entries(LEAVE_TYPE)) {
		const have = row?.[k];
		const same = typeof want === "number" ? Number(have || 0) === want : (have || "") === want;
		if (!same) out[k] = want;
	}
	return out;
}

/** The Leave Policy Assignment for one person, or null when they cannot have
    one this year — somebody joining after 31 December. */
export function assignmentFor(emp, policy, today) {
	const [yearStart, yearEnd] = leaveYear(today);
	const from = earnFrom(today, emp.date_of_joining);
	if (from > yearEnd) return null;
	return {
		employee: emp.name,
		leave_policy: policy,
		effective_from: from,
		effective_to: yearEnd,
		// Carried from last year only when the assignment starts the year; a
		// mid-year first assignment has no earlier allocation to carry from.
		carry_forward: from === yearStart ? 1 : 0,
	};
}

export const todayYmd = () => ymd(new Date());

/** One month of the monthly leave, off the site's own ledger: what came in
    from before, what the month added, what was taken, and what goes on to the
    next month. `null` when the site has written nothing for this person, which
    the page says in words.

    **The ledger is hrms's, and this only adds it up.** Every monthly credit is
    its own positive Leave Allocation entry dated the day it arrived; every
    approved leave is a negative Leave Application entry dated its first day;
    a year end writes the expiry and the carry as entries of their own. So what
    is left at the end of a month is simply every entry up to it — nothing here
    decides what anybody is owed.

    A leave that starts on the 30th and runs into the next month is counted in
    the month it starts, because that is the date hrms puts on its entry. */
export function monthCarry(ledger, ym) {
	if (!ledger?.length) return null;
	const start = ym + "-01";
	const [y, m] = ym.split("-").map(Number);
	const end = ymd(new Date(y, m, 0));
	let brought = 0, earned = 0, taken = 0, other = 0;
	for (const e of ledger) {
		const d = String(e.from_date).slice(0, 10);
		const n = Number(e.leaves) || 0;
		if (d < start) brought += n;
		else if (d <= end) {
			if (e.transaction_type === "Leave Allocation" && n > 0) earned += n;
			else if (e.transaction_type === "Leave Application") taken -= n;
			else other += n;
		}
	}
	return { brought, earned, taken, other, carried: brought + earned - taken + other };
}

/** What leave one person has been given, one row per type per assignment,
    newest first — for the Leave pane on Employee Profile.

    `perMonth` is the policy's year over twelve, and only when the type is
    earned monthly; a type that is not was handed its year at once, and the
    pane says that rather than printing a monthly number that never arrives.
    A type whose row did not say is judged by the policy's own title, which is
    "… a month" exactly when this app made it. Nothing here decides what anybody
    is owed: the policy and the assignment are the site's.

    @param {{name: string, leave_policy: string, effective_from: string, effective_to: string}[]} assignments
    @param {Record<string, {title?: string, leave_policy_details?: {leave_type: string, annual_allocation: number}[]}>} policies by name
    @param {{name: string, is_earned_leave?: number, earned_leave_frequency?: string}[]} leaveTypes */
export function leavePlans(assignments, policies, leaveTypes, today) {
	const rows = [];
	const sorted = [...(assignments || [])]
		.sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
	for (const a of sorted) {
		const p = policies?.[a.leave_policy];
		const title = p?.title || a.leave_policy;
		const from = String(a.effective_from || "").slice(0, 10);
		const to = String(a.effective_to || "").slice(0, 10);
		const base = { assignment: a.name, policy: title, from, to, current: from <= today && today <= to };
		const details = p?.leave_policy_details || [];
		if (!details.length) {
			rows.push({ ...base, type: null, annual: null, perMonth: null });
			continue;
		}
		for (const d of details) {
			const annual = Number(d.annual_allocation) || 0;
			const t = (leaveTypes || []).find((x) => x.name === d.leave_type);
			const monthly = t && t.is_earned_leave != null ? isMonthly(t) : / a month$/.test(title);
			rows.push({ ...base, type: d.leave_type, annual, perMonth: monthly ? annual / 12 : null });
		}
	}
	return rows;
}
