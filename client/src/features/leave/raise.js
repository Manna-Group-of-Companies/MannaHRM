import { apiCreate, apiUpload, getDoc } from "@/api/client";
import { dmy } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Raising one leave application — Apply Leave's Submit.

   **It raises; it never decides.** What goes up is a draft Leave Application
   with status Open, which is Frappe HR's own "applied for, waiting". Approving
   it and submitting it are the approver's, and submitting is what writes the
   Leave Ledger Entry a balance is read from — so nothing here touches a balance
   (`apiCreate` sends `docstatus: 0` whatever it is given).

   **The site is what says no.** Frappe HR checks the application against the
   person's Leave Allocation, their other applications, the type's limits and
   the block list when it is saved. The form checks the three things it can
   answer instantly and kindly; everything else is the site's refusal, shown in
   the site's own words. CLAUDE.md §1.
   --------------------------------------------------------------------------- */

export const DOCTYPE = "Leave Application";

/** The words hrms uses when there is no allocation behind an application —
    "Application period cannot be outside leave allocation period" and
    "Insufficient leave balance for Leave Type …". Matched so the refusal can
    say what fixes it, never to decide anything. */
export const NO_ALLOCATION = /allocation|leave balance/i;

/**
 * The document to send, or why none can be.
 *
 * Pure. `f` is the form (`s.apply`), with `from` and `till` already defaulted.
 *
 * **Which half is kept, in the remarks.** Factor HR asks First Half or Second
 * Half; Frappe HR's Leave Application has one `half_day` flag and one
 * `half_day_date`, and no field for which half. Dropping it would lose
 * something the person told us, so it goes on the end of `description`, where
 * the approver reads it.
 *
 * @returns {{doc?: object, refuse?: string}}
 */
export function leaveDoc(f, emp, today) {
	const single = f.from === f.till;
	const fromHalf = f.fromval !== "1";
	const tillHalf = !single && f.tillval !== "1";

	/* The one shape the doctype cannot hold. Refused before anything is sent,
	   rather than written as a whole day at one end — that would be somebody's
	   leave rounded up by half a day without their knowing. */
	if (fromHalf && tillHalf) {
		return {
			refuse: "Half a day at both ends needs two <code>half_day_date</code> values, and Frappe HR's "
				+ "Leave Application has one. Raise it as two applications, or make one end a full day.",
		};
	}

	const halfOn = fromHalf ? f.from : tillHalf ? f.till : "";
	const which = halfOn === f.from ? f.fromval : f.tillval;
	const note = halfOn ? `Half day on ${dmy(halfOn)}: ${which === "0.5s" ? "second" : "first"} half.` : "";

	const doc = {
		employee: emp.name,
		leave_type: f.type,
		from_date: f.from,
		to_date: f.till,
		posting_date: today,
		status: "Open",
		half_day: halfOn ? 1 : 0,
	};
	if (halfOn) doc.half_day_date = halfOn;
	/* The doctype fetches it from the employee; sent anyway so a site whose
	   fetch did not run still files the application under the right company —
	   which is what decides who can see it. */
	if (emp.company) doc.company = emp.company;
	const description = [String(f.remarks || "").trim(), note].filter(Boolean).join("\n");
	if (description) doc.description = description;
	return { doc };
}

/**
 * Who the application goes to: the approver set on the person's record, else
 * their reporting manager's login.
 *
 * `leave_approver` is a User, not an Employee, and neither is in the employee
 * list this dashboard loads — so both are read here, at the moment of asking.
 * A manager with no login is nobody to send it to, and the answer is empty
 * rather than a guess; the site then accepts it without one or says it needs
 * one, in its own words.
 *
 * @returns {Promise<{user: string, inferred: boolean}>}
 */
export async function approverFor(emp) {
	const own = await getDoc("Employee", emp.name);
	if (own?.leave_approver) return { user: own.leave_approver, inferred: false };
	if (emp.reports_to) {
		const mgr = await getDoc("Employee", emp.reports_to);
		if (mgr?.user_id) return { user: mgr.user_id, inferred: true };
	}
	return { user: "", inferred: false };
}

/**
 * Raise it: the application, then the attachment against it.
 *
 * In that order because a File is filed *against* a document, and there is no
 * document to file it against until the first write has been accepted. A file
 * that fails does not undo the application — the leave was asked for, and a
 * missing scan is something to add, not a reason to have asked for nothing.
 *
 * @returns {Promise<
 *   {ok: true, made: object, approver: {user: string, inferred: boolean}, fileError: string}
 *   | {ok: false, refuse?: string, error?: string, noAllocation?: boolean}>}
 */
export async function raiseLeave(f, emp, today, file) {
	const { doc, refuse } = leaveDoc(f, emp, today);
	if (refuse) return { ok: false, refuse };

	const approver = await approverFor(emp);
	if (approver.user) doc.leave_approver = approver.user;

	let made;
	try {
		made = await apiCreate(DOCTYPE, doc);
	} catch (e) {
		const error = String(e?.message || e);
		return { ok: false, error, noAllocation: NO_ALLOCATION.test(error) };
	}

	let fileError = "";
	if (file) {
		try {
			await apiUpload(file, { doctype: DOCTYPE, name: made.name });
		} catch (e) {
			fileError = String(e?.message || e);
		}
	}
	return { ok: true, made: { ...doc, ...made }, approver, fileError };
}
