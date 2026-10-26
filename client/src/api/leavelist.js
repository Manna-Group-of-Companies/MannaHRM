/* ---------------------------------------------------------------------------
   Team Time Off's read (21 October 2026): every Leave Application from the
   start of last year on, whatever its status — the reference's Pending,
   Approved, Declined and All tabs, and its calendar.

   The first load already holds the open ones (`approvals.leave`), and that
   list stays the queue: deciding goes through features/approvals/decideLeave,
   which reads it back. This read is the rest, asked for when the page opens
   and again after a decision.
   --------------------------------------------------------------------------- */

import { listAll } from "@/api/client";
import { getState, set } from "@/store";

const FIELDS = ["name", "employee", "employee_name", "company", "leave_type", "from_date", "to_date",
	"half_day", "total_leave_days", "leave_balance", "leave_approver", "leave_approver_name",
	"posting_date", "status", "description", "docstatus", "modified", "modified_by"];

export async function loadLeaveList({ fresh = false } = {}) {
	const cur = getState().lvAll;
	if (!fresh && (cur.state === "loading" || cur.state === "ok")) return;
	set({ lvAll: { state: "loading", rows: cur.rows || [] } });
	const since = `${new Date().getFullYear() - 1}-01-01`;
	const rows = await listAll("Leave Application", FIELDS, [["to_date", ">=", since]], 500).catch(() => null);
	set({ lvAll: rows ? { state: "ok", rows } : { state: "error", rows: [] } });
}
