import { model, type Model } from "mongoose";
import { docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   Leave Application — the approval queue, the history, and half a balance.

   Read three separate ways by the client, and the three are deliberately not
   one query:

     status = "Open"      the approval queue, on every page load
     employee = <one>     that person's whole history, any status, when picked
     status = "Approved"  the availed half of the balance report, once

   The report's other half — entitlement — would come off Leave Allocation, and
   that doctype is not here. Not an omission: the client says so on the report
   and leaves the column empty rather than deriving a number nothing holds. See
   `loadLeaveBalances` in client/src/api/load.js.
   --------------------------------------------------------------------------- */

const DATE = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

export interface LeaveApplication extends DocBase {
	employee?: string;
	employee_name?: string;
	leave_type?: string;
	from_date?: string;
	to_date?: string;
	total_leave_days?: number;
	status?: string;
}

export const LeaveApplicationModel: Model<LeaveApplication> = model<LeaveApplication>(
	"LeaveApplication",
	docSchema<LeaveApplication>({
		employee: { type: String, index: true },
		employee_name: String,
		company: String,
		leave_type: { type: String, index: true },
		from_date: { ...DATE, index: true },
		to_date: DATE,
		/* A half day is a flag plus the date it falls on, not a fractional range.
		   Two days off with the second one a half is `total_leave_days: 1.5`, and
		   which of the two is the half is `half_day_date`. */
		half_day: { type: Number, enum: [0, 1], default: 0 },
		half_day_date: DATE,
		total_leave_days: { type: Number, default: 0 },
		/* What the balance was when the application was made. A snapshot, not a
		   live figure — it is what the approver saw. */
		leave_balance: Number,
		leave_approver: String,
		leave_approver_name: String,
		posting_date: DATE,
		status: {
			type: String,
			enum: ["Open", "Approved", "Rejected", "Cancelled"],
			default: "Open",
			index: true,
		},
		description: String,
	}),
	"leave_applications",
);
