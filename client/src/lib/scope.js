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
