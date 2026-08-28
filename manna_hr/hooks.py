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
				],
			]
		],
	},
	{"dt": "Role", "filters": [["name", "in", ["Manna Attendance Approver"]]]},
]

# ----------------------------------------------------------------- scheduler ---

scheduler_events = {
	"cron": {
		# Every ten minutes: flag shifts left open on a day that has ended, so
		# the morning's regularization queue is already built when HR opens it.
		# Not hourly — a missed punch-out found at 6pm can still be fixed by the
		# person who made it, and one found the next morning usually cannot.
		"*/10 * * * *": ["manna_hr.tasks.flag_open_shifts"],
	},
	"daily": [
		# The bridge is a process on somebody's shelf. When it dies it does so
		# quietly, and a silent bridge is indistinguishable from a workforce
		# that stopped coming in until payroll runs.
		"manna_hr.tasks.alert_on_silent_devices",
	],
}

# --------------------------------------------------------------------- setup ---

after_install = "manna_hr.install.after_install"
