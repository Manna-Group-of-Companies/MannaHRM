/* Who decides a time correction raised on Attendance Regularization.

   One login, named by HR on 17 September 2026. Here rather than on Manna HR
   Settings because that doctype is still `custom: 1` on the site and has no
   field for it; move it there once the app is installed.

   **This decides what the screen offers, not what the site allows.** The
   dashboard hides Approve from everybody else and refuses the decision before
   writing, but a login with write on the doctype can still change its status
   through the API until the approval workflow (manna_hr/workflow.py) is
   installed — CLAUDE.md §1. */
export const ATTENDANCE_APPROVER = "hr@mannarubber.com";

/** Whether `user` decides corrections. `Administrator` too, so a request is
    never stuck behind one login that is locked out. */
export const isAttendanceApprover = (user) => {
	const u = String(user || "").trim().toLowerCase();
	return u === ATTENDANCE_APPROVER || u === "administrator";
};
