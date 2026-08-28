"""Scheduled jobs.

Both of these exist to make a silent failure loud. Attendance goes wrong quietly
— a dead bridge and an empty factory produce identical data — and the cost is
only discovered when payroll runs, by which time a month is in dispute.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime, today

# How long a device may say nothing before somebody is told. Long enough to
# cover a lunch-hour gap at a small gate, short enough that a power cut is
# noticed the same day.
SILENT_DEVICE_HOURS = 14

# How far back to look for a device that used to report. A machine that has been
# quiet for a month has been decommissioned, and alerting on it daily forever
# teaches people to ignore the alert.
DEVICE_LOOKBACK_DAYS = 30


def flag_open_shifts():
	"""Employees who punched IN on a past day and never punched OUT.

	Today's open punches are deliberately excluded: somebody still on the floor
	has not missed anything yet, and a system that nags them at 3pm is a system
	people learn to dismiss.
	"""
	rows = frappe.db.sql(
		"""
		SELECT
			c.employee,
			c.employee_name,
			DATE(c.time) AS on_date,
			MAX(c.time)  AS last_punch
		FROM `tabEmployee Checkin` c
		WHERE DATE(c.time) < %(today)s
		  AND DATE(c.time) >= %(since)s
		GROUP BY c.employee, c.employee_name, DATE(c.time)
		HAVING SUM(CASE WHEN c.log_type = 'OUT' THEN 1 ELSE 0 END) = 0
		   AND SUM(CASE WHEN c.log_type = 'IN'  THEN 1 ELSE 0 END) > 0
		""",
		{"today": today(), "since": add_to_date(today(), days=-21, as_string=True)},
		as_dict=True,
	)

	for row in rows:
		if _already_regularized(row.employee, row.on_date):
			continue
		_notify_employee(
			row.employee,
			subject=_("Missed punch-out on {0}").format(row.on_date),
			message=_(
				"You punched in on {0} but never punched out, so that day has no "
				"hours against it. Request a correction and your manager can fix it."
			).format(row.on_date),
		)


def _already_regularized(employee, on_date):
	return bool(
		frappe.db.exists(
			"Attendance Regularization",
			{
				"employee": employee,
				"attendance_date": on_date,
				"status": ["in", ["Pending Approval", "Approved"]],
			},
		)
	)


def alert_on_silent_devices():
	"""Devices that used to report punches and have stopped.

	The bridge is a process on a shelf in a factory. When it dies it does so
	without telling anybody, and its silence is indistinguishable from a shift
	that nobody worked. This is the only thing that tells them apart.
	"""
	cutoff = add_to_date(now_datetime(), hours=-SILENT_DEVICE_HOURS)
	since = add_to_date(now_datetime(), days=-DEVICE_LOOKBACK_DAYS)

	rows = frappe.db.sql(
		"""
		SELECT device_id, MAX(time) AS last_seen
		FROM `tabEmployee Checkin`
		WHERE device_id IS NOT NULL
		  AND device_id != ''
		  AND custom_source = 'biometric'
		  AND time >= %(since)s
		GROUP BY device_id
		HAVING MAX(time) < %(cutoff)s
		""",
		{"since": since, "cutoff": cutoff},
		as_dict=True,
	)

	if not rows:
		return

	lines = [
		_("{0} — last punch {1}").format(r.device_id, get_datetime(r.last_seen))
		for r in rows
	]
	_notify_role(
		"HR Manager",
		subject=_("{0} attendance device(s) have gone quiet").format(len(rows)),
		message=_(
			"These fingerprint machines have sent nothing for over {0} hours:"
		).format(SILENT_DEVICE_HOURS)
		+ "\n\n"
		+ "\n".join(lines)
		+ "\n\n"
		+ _(
			"Either the machine is off, or the bridge on that site has stopped. "
			"Until it is fixed, everybody punching there looks absent."
		),
	)


# --------------------------------------------------------------- messaging ---


def _notify_employee(employee, subject, message):
	user = frappe.db.get_value("Employee", employee, "user_id")
	if not user:
		# Most factory workers have no login. Their missed punch-outs surface on
		# the HR queue instead, which is where somebody can act on them.
		return
	_make_notification(user, subject, message)


def _notify_role(role, subject, message):
	users = frappe.get_all(
		"Has Role", filters={"role": role, "parenttype": "User"}, pluck="parent"
	)
	for user in set(users):
		_make_notification(user, subject, message)


def _make_notification(user, subject, message):
	frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": user,
			"type": "Alert",
			"subject": subject,
			"email_content": message,
		}
	).insert(ignore_permissions=True)
