/* Factor HR's **Employee Profile** — the record page, screenshotted 29 Aug 2026.
   See docs/FACTOHR_SCREENS.md §23.

   Not to be confused with Employee Detail, which §15 established is a *report
   builder*. This is the other screen: one person, a header card, and a
   thirteen-item sidebar down the left.

   ## Why every row names its own field

   Only one of the thirteen panes has been screenshotted open — Joining Details
   — and that one is transcribed here label for label, in its order, including
   the six rows ERPNext has no field behind. Those six are the deliverable: a
   row quietly dropped reads as an oversight when somebody puts the two screens
   side by side, and each of these is a decision waiting to be taken about what
   Manna actually needs migrated.

   The other twelve panes carry the fields ERPNext holds that plainly belong
   under that heading. Where Factor HR's own pane has never been seen, the pane
   says so on the screen rather than pretending the two were compared.

   A row is `[label, field, why]`:
     field  a fieldname, or a list of fieldnames tried in order (the migration
            backfilled some of Factor HR's own under `custom_`), or null for
            "Factor HR has this and this site does not"
     why    the reason, on hover. Required when field is null. */

/* A row is `[key, label, icon]`, and a fourth element makes it a **group**: the
   caret Factor HR draws, and the sub-items under it. A group is not a pane of
   its own — clicking it opens and closes the list, and its children are what
   can be selected. That is how theirs behaves, and it is also the only shape
   that survives the 900px breakpoint, where this list becomes one scrolling
   strip and a nested box would have nowhere to nest.

   **Personal Details is expanded here because its six sub-items have been
   seen** (29 Aug 2026). Other Details carries the same caret on their screen
   and has never been opened, so it stays a leaf rather than growing six
   invented children — see FACTOHR_SCREENS §23. */
export const PROFILE_TABS = [
	["about", "About", "🧍"],
	["joining", "Joining Details", "🤝"],
	["past", "Past Company Detail", "💼"],
	["org", "Organization Info.", "🏢"],
	["attendance", "Attendance Info.", "🕒"],
	/* Ours, like All Fields: not one of their thirteen. Asked for on 24 September
	   2026, once Create Employee started giving leave by type and by the month —
	   what somebody was given is otherwise only on the site's desk. */
	["leave", "Leave", "🌴"],
	["identity", "Employee Identity", "🪪"],
	["pf", "PF & ESIC Details", "🧾"],
	["personal", "Personal Details", "👤", [
		["personal_info", "Personal Info.", "🧑"],
		["address_info", "Address Info.", "📍"],
		["family", "Family Details", "👪"],
		["misc", "Miscellaneous Info.", "💬"],
		["emergency", "Emergency Address", "🆘"],
		["qualification", "Qualification Details", "🎓"],
	]],
	["other", "Other Details", "🗂"],
	["separation", "Separation", "🚪"],
	["document", "Document", "📄"],
	["assets", "Assets", "📦"],
	["bank", "Bank", "🏦"],
	/* Ours, and the last item deliberately: it is not one of their thirteen.
	   Every pane above is a *curated* list — Factor HR's labels, in their order,
	   against the fields this site holds under them — which means a field
	   nobody thought to map is on the record, is read on every open of this
	   page, and is drawn nowhere. That is the wrong default for a record page:
	   a custom field added to Employee next month would be invisible here until
	   somebody edited `data/profile.js`, and nobody would know to. This pane is
	   the whole document, so the answer to "where is that field" is never
	   "nowhere". */
	/* Ours: every app this person's login opens, switched (27 October 2026).
	   Drawn for HR Manager and System Manager only — `accessAdmin`. */
	["access", "Apps & access", "🔑"],
	["all", "All Fields", "🗃"],
];

/** The pane a group opens on. */
export const PROFILE_FIRST_CHILD = Object.fromEntries(
	PROFILE_TABS.filter((t) => t[3]).map((t) => [t[0], t[3][0][0]]),
);

/* The four lines under the name, and the eight dated fields beneath them.
   `custom_confirmation_date` first: it came across in the 25 Aug backfill and
   holds Factor HR's own value, where `final_confirmation_date` is ERPNext's
   field and is empty on every record read so far. */
export const PROFILE_CHIPS = [
	["Machine Code", "attendance_device_id"],
	["Old Code", "custom_factor_hr_id"],
];

export const PROFILE_HEAD = [
	["Date Of Birth", "date_of_birth"],
	["Date Of Joining", "date_of_joining"],
	["Leaving Date", "relieving_date"],
	["Confirmation Date", ["custom_confirmation_date", "final_confirmation_date"]],
	["Company Email", "company_email"],
	["Mobile Number", "cell_number"],
	["Reporting Manager", "reports_to"],
	["Approving Manager", "leave_approver",
		"ERPNext's nearest field is leave_approver, which holds a User rather than an Employee — "
		+ "close enough to mislead. Shown as the site holds it, which is why it may read as an email address."],
];

/** Rendered as Yes / No rather than 1 / 0. */
export const PROFILE_CHECKS = new Set(["custom_allow_remote_punch", "leave_encashed", "unsubscribed"]);

/** Prose rather than a value — wraps, and is never set in the mono column. */
export const PROFILE_LONG = new Set([
	"current_address", "permanent_address", "bio", "health_details", "family_background", "feedback",
	"reason_for_leaving", "new_workplace",
]);

export const PROFILE_PANES = {
	about: {
		groups: [
			["Who", [
				["Employee Code", "employee_number"],
				["Name", "employee_name"],
				["Status", "status"],
				["Company", "company"],
				["Department", "department"],
				["Designation", "designation"],
				["Reporting Manager", "reports_to"],
			]],
			["Reach", [
				["Mobile Number", "cell_number"],
				["Company Email", "company_email"],
				["Personal Email", "personal_email"],
				["Current Address", "current_address"],
			]],
		],
	},

	/* Transcribed off the screenshot, label for label and in its order. Four
	   of the sixteen read fields this app adds (custom_), and the rows still
	   drawn from nothing say where the answer actually lives. */
	joining: {
		groups: [
			["Joining Details", [
				["Status", "status"],
				["Employment Type", "employment_type"],
				["Company Email Id", "company_email"],
				["Date Of Joining", "date_of_joining"],
				["Group Joining Date", "custom_group_joining_date",
					"Ours — Manna is a group, and Factor HR dates service to the group as well as to the "
					+ "company that employs a person. ERPNext has one joining date, above."],
				["Gratuity Start Date", null,
					"hrms computes gratuity from date_of_joining when a Gratuity is raised; there is no "
					+ "per-person start date on Employee. The two differ exactly when somebody has moved "
					+ "between Manna companies."],
				["Transfer Date", null,
					"Lives on the Employee Transfer document in hrms, not on Employee. The record exists; "
					+ "this row on this screen does not."],
				["Expected Confirmation Date", null,
					"The date probation was due to end. ERPNext holds the confirmation itself but not the "
					+ "date it was expected."],
				["Probation Period In Days", "custom_probation_period_days"],
				["Confirmation Date", ["custom_confirmation_date", "final_confirmation_date"]],
				["Date Of Leaving", "relieving_date"],
				["Last Working Date", "custom_last_working_date",
					"Ours — Factor HR keeps the two apart: the date a resignation takes effect, above, and "
					+ "the last day somebody was actually at the gate."],
				["Retirement Date", "date_of_retirement"],
				["Pay Structure Applied From Date", null,
					"Lives on the Salary Structure Assignment (from_date), one per revision. Payroll has "
					+ "not been started here — see Salary Master."],
				["Notice Period For Employer", null,
					"ERPNext holds a single notice period, below, and does not say whose."],
				["Notice Period For Employee", "notice_number_of_days"],
			]],
		],
	},

	past: {
		tables: [["external_work_history", "Employment before Manna", [
			["company_name", "Company"], ["designation", "Designation"], ["salary", "Salary"],
			["total_experience", "Experience"], ["address", "Address"], ["contact", "Contact"],
		]]],
	},

	org: {
		groups: [
			["Where this person sits", [
				["Company", "company"],
				["Department", "department"],
				["Designation", "designation"],
				["Grade", "grade"],
				["Branch", "branch"],
				["Employment Type", "employment_type"],
				["Reporting Manager", "reports_to"],
				["Work Location", "custom_work_location"],
				["Employee Code", "employee_number"],
				["Factor HR Id", "custom_factor_hr_id"],
				["ERPNext Record", "name"],
				["Linked User", "user_id"],
			]],
		],
		tables: [["internal_work_history", "Transfer and promotion history", [
			["branch", "Branch"], ["department", "Department"], ["designation", "Designation"],
			["from_date", "From"], ["to_date", "To"],
		]]],
	},

	attendance: {
		groups: [
			["How this person's punches are judged", [
				["Punch Method", "custom_punch_method"],
				["Machine Code", "attendance_device_id"],
				["Default Shift", "default_shift"],
				["Holiday List", "holiday_list"],
				["Work Location", "custom_work_location"],
				["Punch From Anywhere", "custom_allow_remote_punch"],
			]],
		],
	},

	identity: {
		groups: [
			["Passport", [
				["Passport Number", "passport_number"],
				["Valid Upto", "valid_upto"],
				["Date Of Issue", "date_of_issue"],
				["Place Of Issue", "place_of_issue"],
			]],
			["Everything else on file", [
				["PAN Number", ["custom_pan_no", "pan_number"]],
				["Nationality", "custom_nationality"],
				["Aadhaar", "custom_aadhaar_number"],
				["Driving Licence", "custom_driving_licence", "Unverified against Factor HR's own Identity "
					+ "section — only the section name has been seen, not its contents."],
			]],
		],
	},

	pf: {
		groups: [
			["Statutory", [
				["PF Account", "provident_fund_account"],
				["PAN Number", ["custom_pan_no", "pan_number"]],
				["UAN", "custom_uan"],
				["ESIC Number", "custom_esic_number"],
				["PF Applicable", null, "hrms decides PF from the salary structure's components rather than "
					+ "from a flag on the person."],
				["ESIC Applicable", null, "As above."],
			]],
			["Insurance", [
				["Insurance Card Number", "custom_insurance_card_no"],
				["Insurance Expiry Date", "custom_insurance_expiry_date"],
			]],
		],
	},

	/* Personal Details' six sub-items, screenshotted expanded on 29 Aug 2026.
	   The names are theirs; what is under each is ours, because only the list has
	   been seen and not the panes themselves. Five of the six land on fields
	   ERPNext already has, which is the useful half of the finding — this is a
	   menu deeper than ours, not a system wider than ours. */
	personal_info: {
		groups: [
			["Personal Info.", [
				["Salutation", "salutation"],
				["Gender", "gender"],
				["Date Of Birth", "date_of_birth"],
				["Blood Group", "blood_group"],
				["Marital Status", "marital_status"],
				["Nationality", "custom_nationality"],
				["Religion", "custom_religion"],
				["Mobile Number", "cell_number"],
				["Personal Email", "personal_email"],
			]],
		],
	},

	address_info: {
		groups: [
			["Address Info.", [
				["Current Address", "current_address"],
				["Current Accommodation", "current_accommodation_type"],
				["Permanent Address", "permanent_address"],
				["Permanent Accommodation", "permanent_accommodation_type"],
			]],
		],
	},

	family: {
		groups: [
			["Family Details", [
				["Father's Name", "custom_father_name"],
				["Mother's Name", "custom_mother_name"],
				["Spouse's Name", "custom_spouse_name"],
				["Family Background", "family_background"],
			]],
		],
	},

	misc: {
		groups: [
			["Miscellaneous Info.", [
				["Biography", "bio"],
				["Health Details", "health_details"],
				["Preferred Contact Email", "prefered_contact_email"],
			]],
		],
	},

	emergency: {
		groups: [
			["Emergency Address", [
				["Contact Name", "person_to_be_contacted"],
				["Relation", "relation"],
				["Emergency Phone", "emergency_phone_number"],
				["Emergency Address", null,
					"ERPNext holds a name, a relation and a phone number, and no address to go with them. "
					+ "Factor HR names this pane after the address, so theirs has one."],
			]],
		],
	},

	qualification: {
		tables: [["education", "Qualification Details", [
			["school_univ", "Institute"], ["qualification", "Qualification"], ["level", "Level"],
			["year_of_passing", "Year"], ["class_per", "Score"], ["maj_opt_subj", "Subjects"],
		]]],
	},

	other: {
		groups: [
			["What ERPNext holds that no pane we have seen accounts for", [
				["Linked Job Applicant", "job_applicant"],
				["Preferred Email", "prefered_email"],
				["Unsubscribed", "unsubscribed"],
			]],
		],
	},

	separation: {
		groups: [
			["Leaving", [
				["Resignation Letter Date", "resignation_letter_date"],
				["Date Of Leaving", "relieving_date"],
				["Reason For Leaving", "reason_for_leaving"],
				["New Workplace", "new_workplace"],
			]],
			["Exit interview", [
				["Held On", "held_on"],
				["Feedback", "feedback"],
				["Leave Encashed", "leave_encashed"],
				["Encashment Date", "encashment_date"],
			]],
		],
	},

	document: {
		groups: [],
	},

	assets: { groups: [] },

	/* Drawn by LeavePane in features/employees/EmployeeProfile.jsx, off
	   Leave Policy Assignment and hrms's own balance — neither is on Employee. */
	leave: {
		groups: [],
	},

	/* Drawn from the document rather than from a list here — that is the point
	   of it. See `AllFields` in features/employees/EmployeeProfile.jsx. */
	all: {
		groups: [],
	},

	bank: {
		groups: [
			["How this person is paid", [
				["Salary Mode", "salary_mode"],
				["Bank share (%)", "custom_bank_percent"],
				["Bank amount (₹)", "custom_bank_amount"],
				["Bank Name", "bank_name"],
				["Bank Account", "bank_ac_no"],
				["IBAN", "iban"],
				["Currency", "salary_currency"],
				["CTC", "ctc"],
				["Payroll Cost Center", "payroll_cost_center"],
				["IFSC", "custom_ifsc",
					"Ours — ERPNext's Employee has no IFSC, and a bank transfer file for an Indian payroll "
					+ "cannot be written without it."],
			]],
		],
	},
};

/* --------------------------------------------------------------------------
   What the thirteen panes above between them claim, and what is left over.

   Computed from the map rather than written a second time: a list of "fields
   already shown" maintained by hand would be wrong the first time somebody
   added a row above and did not think to come down here, and being wrong here
   means All Fields hides something the record holds — the one thing that pane
   must never do.
   -------------------------------------------------------------------------- */

/** Every fieldname any pane, chip or header row on this page draws. */
export const PROFILE_MAPPED = new Set(
	[
		...PROFILE_CHIPS,
		...PROFILE_HEAD,
		...Object.values(PROFILE_PANES).flatMap((p) => (p.groups || []).flatMap((g) => g[1])),
	]
		.flatMap((row) => (row[1] == null ? [] : Array.isArray(row[1]) ? row[1] : [row[1]]))
		.concat(Object.values(PROFILE_PANES).flatMap((p) => (p.tables || []).map((t) => t[0]))),
);

/** Frappe's own columns, on every doctype it has ever made.

    Held apart rather than hidden: `modified_by` and `creation` are the answer
    to "who typed this and when", which is a real question about a person's
    record — but listed among their salary and their passport they are noise.
    So they get their own card at the foot of the pane. */
export const PROFILE_PLUMBING = new Set([
	"doctype", "docstatus", "idx", "parent", "parentfield", "parenttype",
	"owner", "creation", "modified", "modified_by", "_user_tags", "_comments",
	"_assign", "_liked_by", "_seen", "naming_series",
]);

/** A fieldname as a label, for the fields nobody has written one for.

    The doctype's own labels live in its meta, which needs a read this dashboard
    does not make and a permission an HR User does not have (`DocType` is System
    Manager's to read). So the fieldname is tidied instead, and the fieldname
    itself is kept beside it on the screen — a guessed label that quietly
    replaced the real one would be worse than no label, because the thing
    somebody came here to match is the fieldname. */
export function fieldLabel(key) {
	return String(key)
		.replace(/^custom_/, "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase())
		.replace(/\bId\b/g, "ID")
		.replace(/\bCtc\b/g, "CTC")
		.replace(/\bPan\b/g, "PAN")
		.replace(/\bIfsc\b/g, "IFSC")
		.replace(/\bIban\b/g, "IBAN")
		.replace(/\bPf\b/g, "PF")
		.replace(/\bEsic?\b/g, "ESIC")
		.replace(/\bUan\b/g, "UAN");
}
