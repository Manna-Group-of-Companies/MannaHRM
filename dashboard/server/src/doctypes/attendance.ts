import { model, type Model } from "mongoose";
import { docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   Attendance, and the four doctypes around it.

   The chain, in the order a day actually happens:

     Employee Checkin              a punch, as the machine recorded it
     Shift Assignment              which shift that person is measured against
     Attendance                    the day, as it was judged
     Attendance Regularization     somebody disagreeing with that judgement

   The last of those has two spellings, and both are here. The client asks for
   `Attendance Regularization` first and falls back to
   `Employee Attendance Regularization` — see `pendingRegularizations` — because
   which name a given site carries was an open question when the dashboard was
   written, and *which one answers decides where a decision gets written back*.
   Carrying both here keeps that probe meaningful rather than turning it into a
   dead branch that always takes the first arm.
   --------------------------------------------------------------------------- */

const DATE = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

/* --------------------------------------------------------- Employee Checkin */

export interface EmployeeCheckin extends DocBase {
	employee?: string;
	employee_name?: string;
	time?: string;
	log_type?: "IN" | "OUT";
	device_id?: string;
}

export const EmployeeCheckinModel: Model<EmployeeCheckin> = model<EmployeeCheckin>(
	"EmployeeCheckin",
	docSchema<EmployeeCheckin>({
		employee: { type: String, index: true },
		employee_name: String,
		/* `YYYY-MM-DD HH:MM:SS`, as a string, because the client filters on it
		   with `[["time", ">=", today + " 00:00:00"]]` — a lexicographic compare
		   that is only correct while the value is that exact shape. Storing an
		   instant here would make "today's punches" mean today in UTC, which on a
		   night shift in Chennai is the wrong day for everybody who clocked out
		   after half past five in the morning. */
		time: { type: String, index: true },
		log_type: { type: String, enum: ["IN", "OUT"] },
		device_id: String,
		skip_auto_attendance: { type: Number, enum: [0, 1], default: 0 },
		shift: String,
	}),
	"employee_checkins",
);

/* ---------------------------------------------------------------- Attendance */

export interface Attendance extends DocBase {
	employee?: string;
	employee_name?: string;
	attendance_date?: string;
	status?: string;
	company?: string;
	shift?: string;
}

export const AttendanceModel: Model<Attendance> = model<Attendance>(
	"Attendance",
	docSchema<Attendance>({
		employee: { type: String, index: true },
		employee_name: String,
		attendance_date: { ...DATE, index: true },
		/* One letter per cell on the monthly grid. The list is ERPNext's own. */
		status: {
			type: String,
			enum: ["Present", "Absent", "On Leave", "Half Day", "Work From Home"],
			index: true,
		},
		company: String,
		shift: String,
		leave_type: String,
		in_time: String,
		out_time: String,
		working_hours: Number,
		late_entry: { type: Number, enum: [0, 1], default: 0 },
		early_exit: { type: Number, enum: [0, 1], default: 0 },
	}),
	"attendance",
);

/* ---------------------------------------------------------- Shift Assignment */

export interface ShiftAssignment extends DocBase {
	employee?: string;
	shift_type?: string;
	start_date?: string;
	end_date?: string;
}

export const ShiftAssignmentModel: Model<ShiftAssignment> = model<ShiftAssignment>(
	"ShiftAssignment",
	docSchema<ShiftAssignment>({
		employee: { type: String, index: true },
		employee_name: String,
		shift_type: String,
		/* An open-ended assignment has no end date, and that is the normal case
		   rather than a missing value: somebody is on the general shift until
		   they are moved off it. */
		start_date: DATE,
		end_date: DATE,
		company: String,
		department: String,
		status: { type: String, default: "Active" },
	}),
	"shift_assignments",
);

/* -------------------------------------------------- Attendance Regularization

   This site's own doctype (docs/SCHEMA.md), with `Pending Approval` as its open
   state. The decision fields are the half that gets written back through the
   allowlisted PUT — `status` and `decision_note`, and nothing else. */

export interface AttendanceRegularization extends DocBase {
	employee?: string;
	employee_name?: string;
	attendance_date?: string;
	status?: string;
	decision_note?: string;
}

export const AttendanceRegularizationModel: Model<AttendanceRegularization> =
	model<AttendanceRegularization>(
		"AttendanceRegularization",
		docSchema<AttendanceRegularization>({
			employee: { type: String, index: true },
			employee_name: String,
			company: String,
			attendance_date: { ...DATE, index: true },
			/* `HH:MM:SS`, the times being asked for rather than the times recorded. */
			requested_in: String,
			requested_out: String,
			reason: String,
			status: {
				type: String,
				enum: ["Pending Approval", "Approved", "Rejected", "Cancelled"],
				default: "Pending Approval",
				index: true,
			},
			/* Who is entitled to decide — the reporting manager, or HR. The
			   self-approval guard is on the site rather than here; see CLAUDE.md §1. */
			approver_type: String,
			decided_by: String,
			decided_on: Date,
			decision_note: String,
		}),
		"attendance_regularizations",
	);

/* ----------------------------------------- Employee Attendance Regularization

   Factor HR's spelling of the same queue, with their own open state:
   `Initiated` rather than `Pending Approval`. Kept as a separate collection
   rather than folded into the one above, because the two carry different field
   names — `remarks` and `applied_on` here, `decision_note` and `decided_on`
   there — and merging them would mean inventing a mapping nobody has agreed. */

export interface EmployeeAttendanceRegularization extends DocBase {
	employee?: string;
	attendance_date?: string;
	status?: string;
}

export const EmployeeAttendanceRegularizationModel: Model<EmployeeAttendanceRegularization> =
	model<EmployeeAttendanceRegularization>(
		"EmployeeAttendanceRegularization",
		docSchema<EmployeeAttendanceRegularization>({
			employee: { type: String, index: true },
			employee_name: String,
			attendance_date: { ...DATE, index: true },
			requested_in: String,
			requested_out: String,
			reason: String,
			remarks: String,
			status: {
				type: String,
				enum: ["Initiated", "Approved", "Rejected", "Cancelled"],
				default: "Initiated",
				index: true,
			},
			applied_on: Date,
		}),
		"employee_attendance_regularizations",
	);
