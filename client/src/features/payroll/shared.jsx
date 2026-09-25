import { scoped } from "@/lib/scope";
import {  } from "@/components/ui";

/* The eight new Payroll screens all say the same two things before they say
   anything of their own: this module is deferred, and this page is not allowed
   to read payroll. Said once here so that eight pages cannot drift into eight
   slightly different versions of a decision that was taken once, on 23 Aug
   2026, and applies to all of them. */

/** "for Manna Treads" or "across the group". A count with no scope on it is a
    count people argue about — same helper as On Board's, kept local so that a
    payroll page never depends on a module it has nothing to do with. */
export const scopeSaid = (s) =>
	s.company ? (
		<>
			{" "}
			for <b>{s.company}</b>
		</>
	) : (
		<> across the group</>
	);

/** Active people, scoped to the company picker. Every headcount on these pages
    is the same population, so it is counted in one place. */
export const payRows = (s) =>
	s.employees.filter((e) => e.status === "Active" && (!s.company || e.company === s.company));
