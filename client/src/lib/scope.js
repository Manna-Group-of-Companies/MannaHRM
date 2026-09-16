/* The company picker in the top bar scopes almost every screen, and it is the
   one control that can silently make a page wrong: an `HR User` with no Company
   permission sees every company, so the default is open and an omission is a
   leak rather than a lockout. See CLAUDE.md §5. Here it is only a filter, but
   it is the same idea — every count on the page is either scoped or it is not,
   and mixing the two in one panel is how a headcount gets argued about. */

export const scoped = (s) =>
	s.company ? s.employees.filter((e) => e.company === s.company) : s.employees;

/** Active is the only status that means "at work today". */
export const active = (s) => scoped(s).filter((e) => e.status === "Active");

export const isOn = (e) => e.status === "Active";

/** Distinct values of one field across a list, sorted. */
export const uniq = (rows, k) => [...new Set(rows.map((e) => e[k]).filter(Boolean))].sort();

/**
 * The store as one company's dashboard should read it.
 *
 * `company` pins the scope. Pass a name and the picker no longer decides: a page
 * titled Manna Treads must not start showing Manna Tyre Retreads because
 * somebody moved the control in the top bar. Pass `undefined` and the picker is
 * back in charge, which is what the group-wide Start Up page wants.
 *
 * ## It narrows four more lists than `scoped` does, on purpose
 *
 * `scoped` above narrows the employee list, and for a long time that was the
 * only half of this that existed: the picker scoped the headcount panels and
 * left punches, corrections, leave and letters reading the whole group. So
 * "Employee Attendance Summary" counted one company's active employees against
 * every company's punches, which is precisely the failure the note at the top
 * of this file names — two populations in one panel, and a number nobody can
 * defend when it is questioned.
 *
 * That was survivable while the only way to narrow anything was a picker the
 * reader had just moved themselves. It is not survivable on a page whose title
 * is a company name, so the four person-keyed lists are narrowed here, once,
 * and every panel downstream reads the narrowed state without knowing.
 *
 * ## The company is resolved through the directory, not read off the row
 *
 * `Employee Checkin` has no company field at all — a punch knows a person and a
 * time and nothing else. The others have one, but it is blank on any row made
 * before it was added. The employee is the only key all four actually carry, so
 * `byName` is what places them.
 *
 * ## A row whose person is not in the directory is dropped
 *
 * This is the one place in the dashboard that rounds towards showing less.
 * Everywhere else a doubtful row is kept, because the expensive mistake is
 * refusing somebody who did turn up (CLAUDE.md §4). Here a row that cannot be
 * placed is not doubtful about a person, it is doubtful about a *company* — and
 * keeping it would add another company's punches to this one's totals under a
 * heading that names this one. An undercount is visible and gets asked about; a
 * total quietly inflated by a neighbour's rows is read out in a meeting.
 */
export function companyView(s, company) {
	const c = company === undefined ? s.company : company;
	if (!c) return s;
	const byName = s.byName || {};
	const mine = (rows) => (rows || []).filter((r) => (byName[r.employee] || {}).company === c);
	const approvals = s.approvals || {};
	return {
		...s,
		company: c,
		checkins: mine(s.checkins),
		letters: mine(s.letters),
		approvals: {
			...approvals,
			attendance: mine(approvals.attendance),
			leave: mine(approvals.leave),
		},
	};
}
