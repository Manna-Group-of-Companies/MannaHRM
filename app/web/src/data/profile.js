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

/* Only ever drawn when a pane's own Factor HR screenshot does not exist, so
   that a guess is never presented as a comparison. */
const GUESSED = "Factor HR's own version of this pane has not been screenshotted open. "
	+ "These are the fields this site holds under that heading — the list to argue with, not a copy of theirs.";

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
		note: GUESSED,
	},

	/* Transcribed off the screenshot, label for label and in its order. Six of
	   the sixteen have no field behind them on ERPNext's Employee, and each says
	   which one it is and where the answer actually lives. */
	joining: {
		groups: [
			["Joining Details", [
				["Status", "status"],
				["Employment Type", "employment_type"],
				["Company Email Id", "company_email"],
				["Date Of Joining", "date_of_joining"],
				["Group Joining Date", null,
					"Manna is a group, and Factor HR dates service to the group as well as to the company "
					+ "that employs a person. ERPNext has one joining date. It decides gratuity, so this is a "
					+ "field to add rather than a row to drop."],
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
				["Probation Period In Days", null,
					"No field, and without it nothing can compute the row above."],
				["Confirmation Date", ["custom_confirmation_date", "final_confirmation_date"]],
				["Date Of Leaving", "relieving_date"],
				["Last Working Date", null,
					"Factor HR keeps the two apart — the date a resignation takes effect, and the last day "
					+ "somebody was actually at the gate. ERPNext has one relieving date, above."],
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
		tables: [["employee_external_work_history", "Employment before Manna", [
			["company_name", "Company"], ["designation", "Designation"], ["salary", "Salary"],
			["total_experience", "Experience"], ["address", "Address"], ["contact", "Contact"],
		]]],
		note: "Factor HR's Employee Detail report lists <b>Past History</b> as one of its fourteen sections, so "
			+ "the tenant holds this for people. It is a child table on the ERPNext record, which is why it "
			+ "can be drawn here and not on any of the report screens — those read lists, and a list call "
			+ "cannot reach a child table.",
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
		tables: [["employee_internal_work_history", "Transfer and promotion history", [
			["branch", "Branch"], ["department", "Department"], ["designation", "Designation"],
			["from_date", "From"], ["to_date", "To"],
		]]],
		note: GUESSED,
	},

	attendance: {
		groups: [
			["How this person's punches are judged", [
				["Machine Code", "attendance_device_id"],
				["Default Shift", "default_shift"],
				["Holiday List", "holiday_list"],
				["Work Location", "custom_work_location"],
				["Punch From Anywhere", "custom_allow_remote_punch"],
			]],
		],
		note: "<b>None of these decides anything on this page.</b> They are read here; the rules that use them "
			+ "run on the site, on the site's clock — see CLAUDE.md §1. A device id that does not start with "
			+ "the trusted prefix is treated as a mobile punch and geofenced, so renaming a machine in "
			+ "<code>bridge/config.toml</code> breaks this person's punches.",
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
				["Aadhaar", null,
					"No field, standard or backfilled. It is the one identity document a Kerala payroll "
					+ "actually needs and the export did not carry it."],
				["Driving Licence", null, "No field. Factor HR's Identity section may hold more than this; only "
					+ "the section name has been seen, not its contents."],
			]],
		],
		note: "Expiry is the half ERPNext has no answer for — see On Board → Document Entry. A passport with "
			+ "a <code>valid_upto</code> in the past is a finding nothing here is watching for.",
	},

	pf: {
		groups: [
			["Statutory", [
				["PF Account", "provident_fund_account"],
				["PAN Number", ["custom_pan_no", "pan_number"]],
				["UAN", null,
					"The number that actually follows somebody between employers. No field on ERPNext's "
					+ "Employee, and every EPF return needs it."],
				["ESIC Number", null,
					"No field. ESIC applies below a wage ceiling, so this is not needed for everybody — but "
					+ "it is needed for the people it is needed for."],
				["PF Applicable", null, "hrms decides PF from the salary structure's components rather than "
					+ "from a flag on the person."],
				["ESIC Applicable", null, "As above."],
			]],
		],
		note: "<b>This pane is the statutory blocker in one screen.</b> Payroll cannot file a return without UAN "
			+ "and ESIC, neither of which exists here. See docs/OPEN_QUESTIONS.md.",
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
		note: "One address each, as free text. Factor HR gives this a pane of its own, which usually means the "
			+ "parts are separate fields there — district, PIN, state. Nothing here can be reported on by area, "
			+ "and a factory group that buses people in may well want to.",
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
		note: "The three names were added on 25 Aug and are empty for everybody — Factor HR holds them and the "
			+ "export did not carry them. <b>ERPNext's Employee has no family member table at all</b>, so "
			+ "dependants, their dates of birth and the <b>nominee</b> have nowhere to go. The nominee is the "
			+ "one that matters when somebody dies in service.",
	},

	misc: {
		groups: [
			["Miscellaneous Info.", [
				["Biography", "bio"],
				["Health Details", "health_details"],
				["Preferred Contact Email", "prefered_contact_email"],
			]],
		],
		note: GUESSED,
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
		note: "<b>This is the pane somebody reads at two in the morning</b>, and on this site it is empty for "
			+ "everybody. A group running night shifts in factories should treat that as a gap to close before "
			+ "go-live rather than after it.",
	},

	qualification: {
		tables: [["employee_education", "Qualification Details", [
			["school_univ", "Institute"], ["qualification", "Qualification"], ["level", "Level"],
			["year_of_passing", "Year"], ["class_per", "Score"], ["maj_opt_subj", "Subjects"],
		]]],
		note: "Factor HR's Employee Detail report lists <b>Qualification</b> as one of its fourteen sections, so "
			+ "the tenant holds this for people. It is a child table here, which is why it can be drawn on this "
			+ "screen and on none of the report screens — see §15.",
	},

	other: {
		groups: [
			["What ERPNext holds that no pane we have seen accounts for", [
				["Linked Job Applicant", "job_applicant"],
				["Preferred Email", "prefered_email"],
				["Unsubscribed", "unsubscribed"],
			]],
		],
		note: "<b>Factor HR draws a caret on this one too, and nobody has opened it</b> — so it keeps the three "
			+ "leftovers rather than six invented sub-items. Their report screen names <b>Skill Set</b> and "
			+ "<b>Nominee</b> as sections of their own, and neither has an ERPNext equivalent — skill sets "
			+ "probably do not matter, nominees do.",
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
		note: "<b>344 people have left and none of them came across.</b> The count is in the site survey; the "
			+ "records are not on the site. So this pane is empty for everybody by construction, and will "
			+ "stay that way until somebody decides whether leavers are migrated at all.",
	},

	document: {
		groups: [],
		note: "<b>Nothing can be drawn here, and that is deliberate.</b> Attachments live on the <code>File</code> doctype, "
			+ "which is not on the proxy's allowlist: a token that can read every attachment on the site is "
			+ "not something to hand to a page running on localhost. What ERPNext holds *about* documents — "
			+ "passport, PAN, nationality — is on Employee Identity, and On Board → Document Entry counts how "
			+ "much of it is filled in across everybody.",
	},

	assets: { groups: [] },

	bank: {
		groups: [
			["How this person is paid", [
				["Salary Mode", "salary_mode"],
				["Bank Name", "bank_name"],
				["Bank Account", "bank_ac_no"],
				["IBAN", "iban"],
				["Currency", "salary_currency"],
				["CTC", "ctc"],
				["Payroll Cost Center", "payroll_cost_center"],
				["IFSC", null,
					"No field on ERPNext's Employee. A bank transfer file for an Indian payroll cannot be "
					+ "written without it, so it is one of the two things this pane is short of."],
			]],
		],
		note: "IBAN is ERPNext's field and belongs to the UAE company; the Kerala companies need IFSC, which "
			+ "is not here. See docs/SITE_SURVEY.md §7 — the UAE company is a finding that keeps surfacing.",
	},
};
