/* ---------------------------------------------------------------------------
   Deactivating somebody, with the date it took effect (asked for 18 Nov 2026).

   The date is stored in `relieving_date`, ERPNext's own Leaving Date. It is
   the field the rest of the system already reads: hrms stops counting payment
   days after it, its attendance job stops marking the person, and Daily Detail
   stops drawing their days after it (lib/dailydetail.js). A field of our own
   would have been a date only this dashboard knew about.

   Activating somebody again clears it, so a person brought back is not cut
   off at the date they once left.

   Pure: no store, no network.
   --------------------------------------------------------------------------- */

/** What to write to deactivate somebody from `date`. */
export const deactivatePatch = (date) => ({ status: "Inactive", relieving_date: date });

/** What to write to make somebody Active again. */
export const activatePatch = () => ({ status: "Active", relieving_date: null });

/** Why `date` cannot be somebody's deactivation date, or "" when it can. The
    site refuses a leaving date before the joining date; saying so here names
    the person and the date instead of the site's generic refusal. */
export function deactivateDateProblem(date, joining) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "Pick the date they were deactivated.";
	const j = String(joining || "").slice(0, 10);
	if (j && date < j) return `The date is before they joined (${j.split("-").reverse().join("-")}).`;
	return "";
}

/** Whether a person was still with us on any day of `from`–`to`: active
    now, or deactivated (or left) on or after `from`. The question Daily Detail
    has to ask, because a report for a month somebody left in is the report
    their last salary is worked out from. */
export function workedIn(e, from) {
	if (!e) return false;
	if (e.status === "Active") return true;
	const left = String(e.relieving_date || "").slice(0, 10);
	return Boolean(left && from && left >= from);
}
