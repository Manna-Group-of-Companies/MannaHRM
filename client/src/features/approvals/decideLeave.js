import { apiCall, apiDecide } from "@/api/client";
import { load } from "@/api/load";
import { getState } from "@/store";
import { dmy } from "@/lib/format";
import { forgetAttendanceReads } from "@/features/approvals/decide";

/* ---------------------------------------------------------------------------
   Deciding one leave application — the tick and the cross on a Leave card.

   Asked for on 25 September 2026: Apply Leave raises an Open draft, and until
   now the approver had to leave this page for the desk to decide it.

   **The site decides; this page asks.** hrms's Leave Application is a stock
   doctype, so its controller runs (unlike this app's own, CLAUDE.md §7): the
   submit is refused for a balance that will not cover the days, for leave
   overlapping leave already taken, for somebody without the role, and — if HR
   Settings says so — for approving your own. None of those is repeated here
   as a rule, because a copy of a rule that the site already enforces is a
   second answer waiting to disagree with the first. The only checks here are
   the ones that save a round trip and cannot contradict it: that there is a
   request, and that it is still open.

   **Approving writes leave, never `Attendance`.** hrms marks the days On Leave
   itself, on submit, which is the same boundary the correction queue keeps.
   --------------------------------------------------------------------------- */

export const LEAVE_OPEN = "Open";
export const LEAVE_APPROVED = "Approved";
export const LEAVE_REJECTED = "Rejected";

const days = (n) => (n == null ? "" : `${n} day${Number(n) === 1 ? "" : "s"} of `);

/** The span a card is about, as a person reads it: "08-Sep-2026" or "08-Sep-2026 to 10-Sep-2026". */
export function leaveSpan(r) {
	const from = String(r.from_date || "").slice(0, 10);
	const to = String(r.to_date || "").slice(0, 10);
	return !to || to === from ? dmy(from) : `${dmy(from)} to ${dmy(to)}`;
}

/**
 * Approve or reject one leave application, and read the queue back.
 *
 * @param {object} r the application as the queue holds it
 * @param {"Approve"|"Reject"} action
 * @param {string} [note] the approver's note, added to the application's comments
 * @returns {Promise<{ok: boolean, msg: string, persisted: boolean}>}
 */
export async function decideLeave(r, action, note) {
	const approve = action === "Approve";
	const verb = approve ? "approve" : "reject";
	const fail = (msg) => ({ ok: false, msg, persisted: false });

	if (!r || !r.name) return fail("This application has no document behind it, so there is nothing to decide.");
	if (r.status !== LEAVE_OPEN) return fail(`${r.name} is ${r.status || "not open"} — only an open application is decided.`);

	try {
		await apiDecide("Leave Application", r.name, approve ? LEAVE_APPROVED : LEAVE_REJECTED);
	} catch (e) {
		return fail(`The site refused to ${verb} ${r.name}: ${e.message || "no reason given"}.`);
	}

	/* The note goes on the application's comment thread — the stock doctype has
	   no field for an approver's remarks, and the thread is where the desk shows
	   them. After the decision, and never able to undo it: a decision that
	   landed without its note is still the decision. */
	const text = String(note || "").trim();
	let noted = "";
	if (text) {
		const user = getState().user || "";
		noted = await apiCall("frappe.desk.form.utils.add_comment", {
			reference_doctype: "Leave Application", reference_name: r.name,
			content: text, comment_email: user, comment_by: user,
		}).then(() => " Your note is on its comments.", (e) => ` The note could not be added (${e.message}).`);
	}

	forgetAttendanceReads();
	await load();
	const who = r.employee_name || r.employee;
	return {
		ok: true,
		persisted: true,
		msg: approve
			? `${r.name} approved: ${days(r.total_leave_days)}${r.leave_type || "leave"} for ${who}, ${leaveSpan(r)}. `
				+ "It is booked against their balance, and the days show On Leave in attendance." + noted
			: `${r.name} rejected. No leave was booked for ${who}.` + noted,
	};
}
