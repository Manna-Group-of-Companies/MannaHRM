app_name = "manna_hr"
app_title = "Manna HR"
app_publisher = "Manna Group of Companies"
app_description = "Group-wide attendance and HR rules for the Manna companies"
app_email = "it@mannarubber.com"
app_license = "mit"

# Frappe HR carries every doctype this app extends. Without it, install fails
# loudly here rather than at the first punch.
required_apps = ["frappe/hrms"]

# ---------------------------------------------------------------- documents ---

doc_events = {
	"Employee Checkin": {
		# `before_validate`, not `validate`: the server clock overwrites
		# `doc.time`, and hrms' own validation reads that field to resolve the
		# shift. Running after it would resolve the shift from a time we are
		# about to change.
		"before_validate": "manna_hr.checkin.validate",
	},
	"Attendance Regularization": {
		"on_update": "manna_hr.regularization.on_update",
	},
}

# --------------------------------------------------------------- permissions ---

# **Who may see a correction, not only who may decide one.**
#
# The workflow already says who may act. These say which rows exist at all for
# a reader — `permission_query_conditions` for a list, `has_permission` for one
# document, because Frappe asks the question twice and a system that answers
# only the first has a list that hides a row and a URL that still opens it.
#
# Before this, `Manna Attendance Approver` had read and write on the doctype
# with nothing narrowing which rows, so a supervisor at one company could list
# and decide every correction in the group. See manna_hr/permissions.py.

permission_query_conditions = {
	"Attendance Regularization": "manna_hr.permissions.regularization_query",
	# A letter can carry a salary, a warning or a reason for leaving. Signing
	# off somebody's attendance does not make those yours to read, so an
	# approver sees their reports' corrections and not their reports' letters.
	"Employee Letter": "manna_hr.permissions.letter_query",
}

has_permission = {
	"Attendance Regularization": "manna_hr.permissions.regularization_has_permission",
	"Employee Letter": "manna_hr.permissions.letter_has_permission",
}

# ------------------------------------------------------------------ fixtures ---

# Custom fields ship as fixtures so an install is reproducible and a second site
# (staging) gets the same schema without anybody clicking through Desk.
fixtures = [
	{
		"dt": "Custom Field",
		"filters": [
			[
				"name",
				"in",
				[
					"Employee-custom_work_location",
					"Employee-custom_allow_remote_punch",
					"Employee-custom_factor_hr_id",
					"Employee Checkin-custom_distance_metres",
					"Employee Checkin-custom_geofence_result",
					"Employee Checkin-custom_source",
					# The candidate's own details, on hrms' `Employee Onboarding`
					# rather than on a doctype of ours shadowing it — see
					# CUSTOM_FIELDS in install.py.
					"Employee Onboarding-custom_candidate_section",
					"Employee Onboarding-custom_salutation",
					"Employee Onboarding-custom_first_name",
					"Employee Onboarding-custom_last_name",
					"Employee Onboarding-custom_employee_number",
					"Employee Onboarding-custom_employee_code_series",
					"Employee Onboarding-custom_column_break_candidate",
					"Employee Onboarding-custom_date_of_birth",
					"Employee Onboarding-custom_cell_number",
					"Employee Onboarding-custom_personal_email",
				],
			]
		],
	},
	{"dt": "Role", "filters": [["name", "in", ["Manna Attendance Approver"]]]},
]

# The approval workflow is deliberately **not** a fixture. Fixture files are
# imported in whatever order the filesystem lists them, and a Workflow whose
# transitions link to a Role that has not been created yet fails at insert with
# a message about a broken link rather than about a missing role. So it is
# installed from code, after the roles — see manna_hr/workflow.py.

# ----------------------------------------------------------------- scheduler ---

scheduler_events = {
	"cron": {
		# Every ten minutes: flag shifts left open on a day that has ended, so
		# the morning's regularization queue is already built when HR opens it.
		# Not hourly — a missed punch-out found at 6pm can still be fixed by the
		# person who made it, and one found the next morning usually cannot.
		"*/10 * * * *": ["manna_hr.tasks.flag_open_shifts"],
	},
	"hourly": [
		# Approving a correction writes the punches; the shift job rebuilds the
		# day from them later. This is what notices that it has, and moves the
		# request from Approved to Completed — the difference between "somebody
		# said yes" and "the day is actually fixed".
		"manna_hr.regularization.complete_applied",
	],
	"daily": [
		# The bridge is a process on somebody's shelf. When it dies it does so
		# quietly, and a silent bridge is indistinguishable from a workforce
		# that stopped coming in until payroll runs.
		"manna_hr.tasks.alert_on_silent_devices",
	],
}

# --------------------------------------------------------------------- setup ---

after_install = "manna_hr.install.after_install"
