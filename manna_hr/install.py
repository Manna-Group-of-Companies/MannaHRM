"""What `bench install-app manna_hr` does.

Idempotent throughout — `after_install` also runs on a restore, and a migration
between benches will run it again. Nothing here may assume it is the first time.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from manna_hr.notifications import ensure_notifications
from manna_hr.workflow import ensure_workflow

CUSTOM_FIELDS = {
	"Employee": [
		{
			"fieldname": "custom_hr_section",
			"label": "Attendance Rules",
			"fieldtype": "Section Break",
			"insert_after": "attendance_device_id",
			"collapsible": 1,
		},
		{
			# Chosen on Create Employee (16 Sep 2026). Recorded, not enforced:
			# refusing a punch that did arrive is the expensive mistake
			# (CLAUDE.md §4), so a machine punch from a "Mobile App" person is
			# still stored.
			"fieldname": "custom_punch_method",
			"label": "Punch Method",
			"fieldtype": "Select",
			"options": "\nFingerprint Machine\nMobile App\nBoth",
			"insert_after": "custom_hr_section",
			"in_standard_filter": 1,
			"description": "How this person punches in: the fingerprint machine, the phone app, or both.",
		},
		{
			"fieldname": "custom_work_location",
			"label": "Work Location",
			"fieldtype": "Link",
			"options": "Work Location",
			"insert_after": "custom_punch_method",
			"description": "Where this person is expected to punch from. Blank means their punches are never measured.",
		},
		{
			"fieldname": "custom_allow_remote_punch",
			"label": "May Punch From Anywhere",
			"fieldtype": "Check",
			"insert_after": "custom_work_location",
			"description": "Field staff, drivers and reps. The coordinate is still recorded — it just does not refuse.",
		},
		{
			"fieldname": "custom_factor_hr_id",
			"label": "Factor HR ID",
			"fieldtype": "Data",
			"insert_after": "custom_allow_remote_punch",
			"unique": 1,
			"read_only": 1,
			"description": "The id this person had in Factor HR. Kept for reconciliation during changeover.",
		},
		{
			"fieldname": "custom_personal_section",
			"label": "Personal Details",
			"fieldtype": "Section Break",
			"insert_after": "custom_factor_hr_id",
			"collapsible": 1,
		},
		# The seven below were read off Factor HR's export on 25 Aug 2026 and
		# added to the live site by hand. They were never in this file, and that
		# was a live fault rather than untidiness: `custom_pan_no` is read by
		# `loadOnBoard`, written by Document Entry and merged into letters by
		# `employee_letter.py`, so a fresh site or a staging site got a dashboard
		# that silently showed blanks. Declared here, they now install anywhere.
		{
			"fieldname": "custom_nationality",
			"label": "Nationality",
			"fieldtype": "Data",
			"insert_after": "custom_personal_section",
		},
		{
			"fieldname": "custom_father_name",
			"label": "Father's Name",
			"fieldtype": "Data",
			"insert_after": "custom_nationality",
		},
		{
			"fieldname": "custom_mother_name",
			"label": "Mother's Name",
			"fieldtype": "Data",
			"insert_after": "custom_father_name",
		},
		{
			"fieldname": "custom_spouse_name",
			"label": "Spouse's Name",
			"fieldtype": "Data",
			"insert_after": "custom_mother_name",
		},
		{
			"fieldname": "custom_column_break_personal",
			"fieldtype": "Column Break",
			"insert_after": "custom_spouse_name",
		},
		{
			"fieldname": "custom_religion",
			"label": "Religion",
			"fieldtype": "Data",
			"insert_after": "custom_column_break_personal",
		},
		{
			"fieldname": "custom_pan_no",
			"label": "PAN",
			"fieldtype": "Data",
			"insert_after": "custom_religion",
			"description": "Read by the letter merge as {PanNo}. Not validated here \u2014 a wrong PAN is a correction, and refusing to save the rest of somebody's record over one is not.",
		},
		{
			"fieldname": "custom_confirmation_date",
			"label": "Confirmation Date",
			"fieldtype": "Date",
			"insert_after": "custom_pan_no",
			"description": "End of probation. Distinct from date of joining, and the date several of Factor HR's seventeen templates actually print.",
		},
		{
			"fieldname": "custom_statutory_section",
			"label": "Statutory & Insurance",
			"fieldtype": "Section Break",
			"insert_after": "custom_confirmation_date",
			"collapsible": 1,
		},
		# The four raised on 19 September 2026: Aadhaar had no field of any name
		# (Employee Profile's Identity pane and the Document register both
		# carried it as null with a reason), and UAN / ESIC Number were the two
		# `pf` pane rows the payroll return cannot be filed without — PF Account
		# already existed, these did not. Insurance was a fourth gap the pane
		# never had a row for at all, because ERPNext models insurance as a
		# payroll component rather than as a document somebody carries — see
		# `docs/OPEN_QUESTIONS.md`. None of these four are validated here: a
		# wrong Aadhaar or UAN is a correction, not a reason to refuse the rest
		# of somebody's record (same argument as `custom_pan_no` above).
		{
			"fieldname": "custom_aadhaar_number",
			"label": "Aadhaar Number",
			"fieldtype": "Data",
			"insert_after": "custom_statutory_section",
			"description": "The one identity document a Kerala payroll actually needs. Read by Employee "
				"Profile's Identity pane and by the Document register's National Id row.",
		},
		{
			"fieldname": "custom_uan",
			"label": "UAN",
			"fieldtype": "Data",
			"insert_after": "custom_aadhaar_number",
			"description": "The number that follows somebody between employers. Every EPF return needs it, "
				"and PF Account (`provident_fund_account`) is not a substitute for it.",
		},
		{
			"fieldname": "custom_esic_number",
			"label": "ESIC Number",
			"fieldtype": "Data",
			"insert_after": "custom_uan",
			"description": "ESIC applies below a wage ceiling, so this is empty for most people as a fact "
				"rather than as a gap.",
		},
		{
			"fieldname": "custom_column_break_statutory",
			"fieldtype": "Column Break",
			"insert_after": "custom_esic_number",
		},
		{
			"fieldname": "custom_insurance_card_no",
			"label": "Insurance Card Number",
			"fieldtype": "Data",
			"insert_after": "custom_column_break_statutory",
			"description": "The health insurance card number. Read by the Document register's Insurance "
				"Card row.",
		},
		{
			"fieldname": "custom_insurance_expiry_date",
			"label": "Insurance Expiry Date",
			"fieldtype": "Date",
			"insert_after": "custom_insurance_card_no",
			"description": "Renewal date for the insurance card. The Document register's countdown chip "
				"reads this the way it already reads a passport's `valid_upto`.",
		},
		# The six raised on 20 September 2026, against Employee Profile's own
		# panes read off the live site: each of these is a row that pane already
		# draws as "not on this site". Deliberately not the whole list — three
		# more (Gratuity Start Date, Transfer Date, Pay Structure Applied From
		# Date) are values hrms already computes or stores elsewhere (gratuity
		# from date_of_joining, a transfer on Employee Transfer, a structure's
		# from_date on Salary Structure Assignment), and PF/ESIC Applicable are
		# derived from the salary structure's components rather than a flag on
		# the person — a field here for any of those would give payroll two
		# answers that can drift apart. See client/src/data/profile.js.
		{
			"fieldname": "custom_group_joining_date",
			"label": "Group Joining Date",
			"fieldtype": "Date",
			"insert_after": "date_of_joining",
			"description": "Manna is a group, and service is dated to the group as well as to the company "
				"that employs a person. date_of_joining is one company's; this is not overwritten when "
				"somebody moves between Manna companies.",
		},
		{
			"fieldname": "custom_probation_period_days",
			"label": "Probation Period In Days",
			"fieldtype": "Int",
			"insert_after": "scheduled_confirmation_date",
			"description": "What Expected Confirmation Date would be computed from. Not added on its own — "
				"scheduled_confirmation_date is already on the site, labelled Offer Date here, so a second "
				"date field for the same idea would be the drift this list exists to avoid.",
		},
		{
			"fieldname": "custom_last_working_date",
			"label": "Last Working Date",
			"fieldtype": "Date",
			"insert_after": "relieving_date",
			"description": "Distinct from relieving_date: the date a resignation takes effect versus the "
				"last day somebody was actually at the gate.",
		},
		{
			"fieldname": "custom_emergency_address",
			"label": "Emergency Address",
			"fieldtype": "Small Text",
			"insert_after": "relation",
			"description": "ERPNext holds a name, a relation and a phone number for the emergency contact, "
				"and no address to go with them.",
		},
		{
			"fieldname": "custom_ifsc",
			"label": "IFSC",
			"fieldtype": "Data",
			"insert_after": "bank_ac_no",
			"description": "The bank account and name were already fields; the branch code payroll needs "
				"to pay by NEFT was not.",
		},
		{
			"fieldname": "custom_driving_licence",
			"label": "Driving Licence",
			"fieldtype": "Data",
			"insert_after": "place_of_issue",
			"description": "Unverified against Factor HR's own Identity section — only the section name has "
				"been seen, not its contents — but low-risk as a plain text field.",
		},
	],
	# hrms ships `Employee Onboarding` and this is **not** a second copy of it.
	# Theirs is a checklist wrapper round a Job Applicant; what the dashboard's
	# Import From Onboarding needs is the candidate's own details, so that
	# pulling somebody can create an `Employee` without retyping a joining date
	# that has already been agreed. Adding a doctype of the same name would
	# break their onboarding outright; these are Custom Fields on theirs.
	#
	# **The `custom_` prefix is Frappe's rule, not a choice.** A field added to
	# a doctype somebody else ships has to carry it, or the next version of that
	# app can collide with it. The dashboard's screens have never known about
	# the prefix and still do not — `loadCandidates` in client/src/api/load.js
	# strips it on the way into the store, so the store keeps this app's
	# vocabulary and the site keeps Frappe's.
	"Employee Onboarding": [
		{
			"fieldname": "custom_candidate_section",
			"label": "Candidate",
			"fieldtype": "Section Break",
			"insert_after": "employee_name",
			"collapsible": 0,
		},
		{
			"fieldname": "custom_salutation",
			"label": "Salutation",
			"fieldtype": "Link",
			"options": "Salutation",
			"insert_after": "custom_candidate_section",
		},
		{
			"fieldname": "custom_first_name",
			"label": "First Name",
			"fieldtype": "Data",
			"insert_after": "custom_salutation",
			# `Employee.employee_name` is derived from the three name parts on
			# validate, so a candidate carrying only a whole name produces an
			# employee whose name has to be split by guesswork. Collected here
			# instead, where somebody knows the answer.
			"description": "Split out, because Employee derives its name from the parts rather than the whole.",
		},
		{
			"fieldname": "custom_last_name",
			"label": "Last Name",
			"fieldtype": "Data",
			"insert_after": "custom_first_name",
		},
		{
			"fieldname": "custom_employee_number",
			"label": "Employee Number",
			"fieldtype": "Data",
			"insert_after": "custom_last_name",
			"description": "The machine code they will punch on. Agreed before they join, not after.",
		},
		{
			"fieldname": "custom_employee_code_series",
			"label": "Employee Code Series",
			"fieldtype": "Data",
			"insert_after": "custom_employee_number",
		},
		{
			"fieldname": "custom_column_break_candidate",
			"fieldtype": "Column Break",
			"insert_after": "custom_employee_code_series",
		},
		{
			"fieldname": "custom_date_of_birth",
			"label": "Date Of Birth",
			"fieldtype": "Date",
			"insert_after": "custom_column_break_candidate",
		},
		{
			"fieldname": "custom_cell_number",
			"label": "Mobile",
			"fieldtype": "Data",
			"options": "Phone",
			"insert_after": "custom_date_of_birth",
		},
		{
			"fieldname": "custom_personal_email",
			"label": "Personal Email",
			"fieldtype": "Data",
			"options": "Email",
			"insert_after": "custom_cell_number",
		},
	],
	"Employee Checkin": [
		{
			"fieldname": "custom_source",
			"label": "Source",
			"fieldtype": "Select",
			"options": "\nbiometric\nmobile\nregularization\nmanual",
			"insert_after": "device_id",
			"read_only": 1,
			# Derived from `device_id` on the server. Read-only so a client
			# cannot declare itself a fingerprint machine and skip the geofence.
			"in_standard_filter": 1,
		},
		{
			"fieldname": "custom_geofence_result",
			"label": "Geofence",
			"fieldtype": "Select",
			"options": "\ninside\noutside\nnot_checked\nno_location",
			"insert_after": "custom_source",
			"read_only": 1,
			"in_standard_filter": 1,
		},
		{
			"fieldname": "custom_distance_metres",
			"label": "Distance From Work Location (m)",
			"fieldtype": "Float",
			"precision": "1",
			"insert_after": "custom_geofence_result",
			"read_only": 1,
		},
	],
	# ---- the box Assets Details draws dead ----
	#
	# Only the ones with a defensible home. `client/src/data/onboard.js` argues
	# three of the assignment form's seven gaps belong somewhere else entirely,
	# and it is right: Recovery Amount is a payroll deduction on somebody's next
	# slip, and Lost Units / Lost On are an ERPNext scrapping entry against the
	# whole asset. Adding fields for them here would put three numbers on a form
	# that nothing downstream reads \u2014 which is worse than a greyed box, because a
	# greyed box says so.
	"Asset": [
		{
			"fieldname": "custom_detail",
			"label": "Detail",
			"fieldtype": "Small Text",
			"insert_after": "asset_name",
			"description": "A free-text note about this asset. Factor HR has one and ERPNext has none under any name, which is why both dashboard screens greyed the box.",
		},
	],
}

ROLES = [
	{
		"role_name": "Manna Attendance Approver",
		"desc": "Decides regularizations and leave for their own reports only.",
	},
]


#: The asset types Factor HR classifies by, read off its Asset Type dropdown on
#: 7 September 2026. Four, and the whole list.
#:
#: `Asset Category` is stock ERPNext and starts empty, so the Asset Type box on
#: the handover form has nothing to offer until somebody fills it. These are
#: what it was filled with over there, so they are what a fresh site starts
#: with here. `Swift Car` is theirs, spelled theirs — it is a model rather than
#: a category, and renaming it later means rewriting every asset pointing at
#: the string, so it is a conversation to have before the assets load.
ASSET_CATEGORIES = ["Computer", "Mobile Phone", "SIM Card", "Swift Car"]


def after_install():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	# Before the workflow: its transitions hold a Link to `Role`, so installing
	# it first fails on a link rather than on the role nobody created.
	_create_roles()
	ensure_workflow()
	ensure_notifications()
	_seed_settings()
	_seed_asset_categories()
	frappe.db.commit()


def _create_roles():
	for role in ROLES:
		if frappe.db.exists("Role", role["role_name"]):
			continue
		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": role["role_name"],
				"desk_access": 1,
			}
		).insert(ignore_permissions=True)


def _seed_asset_categories():
	"""Put Factor HR's four asset types on the site, once.

	Idempotent by name, like `_create_roles` — `after_install` also runs on a
	restore and on a migration between benches, and a category is named by
	itself, so a second insert is a duplicate-name failure rather than a no-op.

	A category renamed or deleted on purpose stays that way: this only ever adds
	the ones that are not there, and never edits one that is. Nothing here sets
	a depreciation schedule, which is the other half of what an Asset Category
	carries on the site — that is Accounts' decision, not attendance's.
	"""
	for name in ASSET_CATEGORIES:
		if frappe.db.exists("Asset Category", name):
			continue
		frappe.get_doc(
			{
				"doctype": "Asset Category",
				"asset_category_name": name,
			}
		).insert(ignore_permissions=True)


def _seed_settings():
	"""Write the shipped defaults once, so HR opens a filled-in form.

	Only on a Single that has never been saved. Re-running must not undo a
	number somebody deliberately changed — the whole point of the doctype is
	that those numbers are theirs to set.
	"""
	from manna_hr.settings import DEFAULTS

	settings = frappe.get_single("Manna HR Settings")
	if settings.get("punch_in_from"):
		return

	for field, value in DEFAULTS.items():
		settings.set(field, value)
	settings.save(ignore_permissions=True)
