"""The two things worth telling somebody about, and the many that are not.

## Why there are two and not twenty

Frappe will mail on every workflow transition if you let it — `send_email_alert`
on the Workflow doc — and that is off deliberately (`workflow.py`). A site with
161 employees generating a mail per correction produces a mailbox rule within a
week, and the rule catches the one that mattered along with the rest.

So: nothing is sent when the system is working. A notification here means
something has stopped.

**A correction nobody has decided.** Attendance is payroll, and a correction
decided after the payroll run is not a correction, it is a dispute. Three
working days is the point at which chasing it is cheaper than arguing about it.

**A correction approved but never applied.** `Approved` means the punches were
written; `Completed` means the shift job rebuilt the day from them. A record
stuck on Approved for a day means that job is not running — which is a fault in
the system rather than a person being slow, and it is invisible from every
screen because the request looks decided.

Both are created idempotently at install and re-applied by the workflow patch,
so editing the definitions below and running `bench migrate` is how they change.
"""

STALE_AFTER_DAYS = 3
UNAPPLIED_AFTER_HOURS = 24

#: One `Notification` per entry. Kept as data for the same reason the workflow
#: is: a rule you have to click through Desk to read is a rule nobody reads.
NOTIFICATIONS = [
	{
		"name": "Manna: correction waiting too long",
		"subject": "Attendance correction waiting {0} days: {{ doc.employee_name }}".format(
			STALE_AFTER_DAYS
		),
		"document_type": "Employee Attendance Regularization",
		"event": "Days After",
		"date_changed": "creation",
		"days_in_advance": STALE_AFTER_DAYS,
		"condition": 'doc.status in ("Draft", "Pending Approval")',
		"recipients": [{"receiver_by_role": "HR Manager"}],
		"message": (
			"**{{ doc.employee_name }}** asked for {{ doc.attendance_date }} to be corrected "
			"and nobody has decided it.\n\n"
			"Routed to: **{{ doc.approver_type }}**. Reason given: {{ doc.reason }}\n\n"
			"A correction decided after the payroll run is not a correction, it is a dispute."
		),
	},
	{
		"name": "Manna: correction approved but the day was never rebuilt",
		"subject": "Approved correction not applied: {{ doc.employee_name }}",
		"document_type": "Employee Attendance Regularization",
		"event": "Days After",
		"date_changed": "decided_on",
		"days_in_advance": 1,
		"condition": 'doc.status == "Approved"',
		"recipients": [{"receiver_by_role": "System Manager"}],
		"message": (
			"**{{ doc.name }}** was approved on {{ doc.decided_on }} and is still not Completed.\n\n"
			"Approving writes the missing `Employee Checkin` rows; the day is only corrected when "
			"the shift job rebuilds `Attendance` from them. A day of this means that job is not "
			"running — the person is still marked absent and the request looks decided, which is "
			"why nothing on any screen shows this.\n\n"
			"Check the scheduler, then `manna_hr.regularization.complete_applied`."
		),
	},
]


def ensure_notifications():
	"""Write the definitions above onto this site. Safe to run repeatedly."""
	import frappe

	for spec in NOTIFICATIONS:
		spec = dict(spec)
		recipients = spec.pop("recipients", [])

		doc = (
			frappe.get_doc("Notification", spec["name"])
			if frappe.db.exists("Notification", spec["name"])
			else frappe.new_doc("Notification")
		)
		doc.update(spec)
		doc.doctype = "Notification"
		doc.channel = "Email"
		# On by default. A notification shipped disabled is a notification
		# nobody switches on, and both of these only fire when something has
		# gone wrong.
		doc.enabled = 1
		doc.set("recipients", [])
		for r in recipients:
			doc.append("recipients", r)

		doc.flags.ignore_permissions = True
		doc.save()
