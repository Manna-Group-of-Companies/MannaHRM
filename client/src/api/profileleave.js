import { api, getDoc, listAll } from "@/api/client";
import { getState, set } from "@/store";
import { todayIso } from "@/lib/format";

/* ---------------------------------------------------------------------------
   The Leave pane on Employee Profile: what this person was given, and what
   they have left. Read, never written.

   Made when somebody opens the pane rather than with the profile, for the
   reason Assets gives: three requests on a site with a daily compute limit,
   for a pane most visits never open.
   --------------------------------------------------------------------------- */

/** Fills `profLeave` for one Employee. A refusal is kept as the site's words
    on the half it belongs to, so a login allowed the balance but not the
    policies still sees the balance. */
export async function loadProfileLeave(emp) {
	set({ profLeave: { emp, busy: true } });
	const mine = () => getState().profLeave?.emp === emp;

	let assignments = [], policies = {}, planErr = "";
	try {
		assignments = await listAll("Leave Policy Assignment",
			["name", "leave_policy", "effective_from", "effective_to"],
			[["employee", "=", emp], ["docstatus", "=", 1]]);
		/* One read per distinct policy, not per assignment: a person renewed
		   each January is on the same policy every year. */
		const names = [...new Set(assignments.map((a) => a.leave_policy).filter(Boolean))];
		const docs = await Promise.all(names.map((n) => getDoc("Leave Policy", n)));
		names.forEach((n, i) => { if (docs[i]) policies[n] = docs[i]; });
	} catch (e) {
		planErr = String(e.message || e).slice(0, 220);
	}

	/* The same call the desk's Leave Application form makes for its balance
	   table, so the number is the one the site measures an application
	   against — see loadLeaveBalance in api/load.js. */
	let balance = [], balErr = "";
	try {
		const r = await api("/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
			{ employee: emp, date: todayIso() });
		balance = Object.entries(r?.message?.leave_allocation || {}).map(([type, a]) => ({
			type,
			total: Number(a.total_leaves) || 0,
			taken: Number(a.leaves_taken) || 0,
			pending: Number(a.leaves_pending_approval) || 0,
			remaining: Number(a.remaining_leaves) || 0,
		}));
	} catch (e) {
		balErr = String(e.message || e).slice(0, 220);
	}

	if (mine()) set({ profLeave: { emp, busy: false, assignments, policies, planErr, balance, balErr } });
}
