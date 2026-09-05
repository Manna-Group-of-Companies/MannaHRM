import { model, type Model } from "mongoose";
import { childSchema, docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   Employee — the record everything else points at.

   The field list is not invented. Every name here is one the client actually
   asks for: `EMP_FIELDS` in client/src/api/load.js, the five DETAIL_GROUPS and
   the three-step wizard in client/src/data/employees.js, and the panes in
   client/src/data/profile.js. That matters more than usual because of how the
   client probes — it asks for the long field list and falls back to the short
   one when the read is refused, so **a field missing from this schema is a
   feature that silently degrades**, not one that errors.

   Two fields it deliberately does *not* carry:

     `custom_work_location`  read by data/profile.js and absent from the live
                             ERPNext site this was built against. Adding it here
                             would make the dashboard disagree with the system
                             of record about what it knows.
     `short_name`            the wizard draws the box and refuses to collect it
                             — see NEW_EMP_NOFIELD. A field here would turn a
                             disabled box into a box that discards.

   `employee_name` is derived on save, not accepted from the caller, the way
   hrms derives it. A name that looks set and is not is worse than one that is
   plainly built from the three parts above it.
   --------------------------------------------------------------------------- */

/** Past employment — one of the three child tables the profile reads. */
const externalWorkHistory = childSchema({
	company_name: String,
	designation: String,
	salary: Number,
	total_experience: String,
	address: String,
	contact: String,
});

const education = childSchema({
	school_univ: String,
	qualification: String,
	level: String,
	year_of_passing: Number,
	class_per: String,
	maj_opt_subj: String,
});

/** Transfers and promotions inside the group. */
const internalWorkHistory = childSchema({
	branch: String,
	department: String,
	designation: String,
	grade: String,
	from_date: String,
	to_date: String,
});

export interface Employee extends DocBase {
	employee_number?: string;
	employee_name?: string;
	first_name?: string;
	middle_name?: string;
	last_name?: string;
	salutation?: string;
	gender?: string;
	date_of_birth?: string;
	image?: string;
	status?: string;
	company?: string;
	department?: string;
	designation?: string;
	branch?: string;
	grade?: string;
	employment_type?: string;
	date_of_joining?: string;
	reports_to?: string;
	leave_approver?: string;
	attendance_device_id?: string;
	default_shift?: string;
	holiday_list?: string;
	ctc?: number;
	relieving_date?: string;
	[key: string]: unknown;
}

/* Dates are strings, not Dates, and that is on purpose. The client compares
   them with `<` and slices them with `.slice(0, 10)` throughout, and a Date
   round-tripped through JSON arrives as an ISO instant in UTC — which turns a
   joining date of 2026-04-01 in Chennai into 2026-03-31 for anybody reading it
   after five thirty in the evening. A calendar date has no timezone and is
   stored as what it is: ten characters.

   `creation` and `modified` are real Dates, because those are instants. */
const DATE = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

const schema = docSchema<Employee>({
	/* ---- identity ---- */
	employee_number: { type: String, index: true },
	employee_name: { type: String, index: true },
	first_name: String,
	middle_name: String,
	last_name: String,
	salutation: String,
	gender: String,
	date_of_birth: DATE,
	blood_group: String,
	marital_status: String,
	/* ERPNext's own `image` on Employee: an Attach Image, so what it holds is a
	   URL into `File` rather than bytes. Added 4 Sep 2026 because Employee
	   Detail's Download Document dialog offers **Employee Profile Picture** as
	   its first and default option, and a field this schema simply did not have
	   would make that option dead for a reason that is ours rather than
	   ERPNext's — which is exactly the distinction every other gap on this
	   dashboard is careful to keep. */
	image: String,

	/* ---- employment ---- */
	status: { type: String, default: "Active", index: true },
	company: { type: String, index: true },
	department: { type: String, index: true },
	designation: { type: String, index: true },
	branch: String,
	grade: String,
	employment_type: String,
	date_of_joining: DATE,
	scheduled_confirmation_date: DATE,
	final_confirmation_date: DATE,
	custom_confirmation_date: DATE,
	contract_end_date: DATE,
	notice_number_of_days: Number,
	date_of_retirement: DATE,
	reports_to: { type: String, index: true },
	leave_approver: String,
	payroll_cost_center: String,
	job_applicant: String,
	user_id: String,

	/* ---- how their attendance is judged ----
	   `attendance_device_id` has no unique index, and that is a copy of the
	   live site rather than an omission. Two active people on one machine code
	   is a real and silent failure — see `clashes` in client/src/lib/newemp.js,
	   which is where it is caught, and CLAUDE.md §5. A unique index here would
	   be a better system and a worse mirror; the client warns instead. */
	attendance_device_id: { type: String, index: true },
	default_shift: String,
	holiday_list: String,
	custom_allow_remote_punch: { type: Number, enum: [0, 1], default: 0 },

	/* ---- contact ---- */
	cell_number: String,
	personal_email: String,
	company_email: String,
	prefered_email: String,
	prefered_contact_email: String,
	current_address: String,
	permanent_address: String,
	current_accommodation_type: String,
	permanent_accommodation_type: String,
	person_to_be_contacted: String,
	relation: String,
	emergency_phone_number: String,

	/* ---- family, read by the profile's Family pane ---- */
	custom_father_name: String,
	custom_mother_name: String,
	custom_spouse_name: String,
	custom_nationality: String,
	custom_religion: String,
	family_background: String,
	health_details: String,
	bio: String,

	/* ---- identity documents ---- */
	pan_number: String,
	custom_pan_no: String,
	passport_number: String,
	valid_upto: DATE,
	date_of_issue: DATE,
	place_of_issue: String,
	custom_factor_hr_id: String,

	/* ---- statutory and pay ---- */
	provident_fund_account: String,
	ctc: { type: Number, default: 0 },
	salary_currency: { type: String, default: "INR" },
	salary_mode: String,
	bank_name: String,
	bank_ac_no: String,
	iban: String,

	/* ---- separation ---- */
	relieving_date: DATE,
	reason_for_leaving: String,
	resignation_letter_date: DATE,
	held_on: DATE,
	new_workplace: String,
	feedback: String,
	encashment_date: DATE,
	leave_encashed: String,

	/* ---- child tables ---- */
	employee_external_work_history: { type: [externalWorkHistory], default: [] },
	employee_education: { type: [education], default: [] },
	employee_internal_work_history: { type: [internalWorkHistory], default: [] },

	unsubscribed: { type: Number, enum: [0, 1], default: 0 },
});

/** hrms builds the display name from the three parts and overwrites anything
    sent in `employee_name`. Same here, and for the same reason: a derived field
    that can also be typed has two values that disagree the first time somebody
    corrects a spelling in one of them. */
schema.pre("validate", function deriveName(next) {
	const parts = [this.get("first_name"), this.get("middle_name"), this.get("last_name")]
		.map((p) => String(p ?? "").trim())
		.filter(Boolean);
	if (parts.length) this.set("employee_name", parts.join(" "));
	next();
});

export const EmployeeModel: Model<Employee> = model<Employee>("Employee", schema, "employees");
