import { scoped } from "@/lib/scope";
import { Note } from "@/components/ui";

/* The eight new Payroll screens all say the same two things before they say
   anything of their own: this module is deferred, and this page is not allowed
   to read payroll. Said once here so that eight pages cannot drift into eight
   slightly different versions of a decision that was taken once, on 23 Aug
   2026, and applies to all of them. */

/** The strip at the top of every payroll page. `what` is Factor HR's own menu
    label, spelled the way their menu spells it.

    Deferred is the default because it is true of eight of these nine screens.
    A page that has since grown a working form says so instead — the badge is
    what somebody reads to decide whether a blank column is a gap or a page
    nobody has written yet, so a page that lies in either direction is worse
    than no badge at all. */
export function PayLegend({ what, cov = "skip", tag = "Deferred", children }) {
	return (
		<div className="legend">
			<b className="font-display">{what}</b>
			<span className={"cov " + cov}>{tag}</span>
			<span>{children}</span>
		</div>
	);
}

/** Why every number on these pages comes from somewhere other than payroll.
    Worth repeating on the page rather than hiding in a doc: a dash where a
    figure should be reads as a broken page unless the page says otherwise. */
export const NotReadable = () => (
	<Note>
		<b>No payroll doctype is on the proxy&rsquo;s allowlist</b>, so nothing here is a live payroll
		figure. That is deliberate rather than pending — this process holds a System Manager token, and
		salary is the one table where a read-only window is still a leak. Counts on these pages come off
		the <code>Employee</code> master, and they are labelled where they do. See{" "}
		<code>app/serve.js</code>.
	</Note>
);

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
