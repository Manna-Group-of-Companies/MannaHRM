"""Scheduled jobs.

Both of these exist to make a silent failure loud. Attendance goes wrong quietly
— a dead bridge and an empty factory produce identical data — and the cost is
only discovered when payroll runs, by which time a month is in dispute.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime, today

from manna_hr import rules

# The fallback threshold, for a device that is not in the register or leaves
# its own blank. Long enough to cover a lunch-hour gap at a small gate, short
# enough that a power cut is noticed the same day.
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
			"Employee Attendance Regularization",
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

	**Registered devices are asked first.** `Attendance Device` carries a
	per-device threshold, because a factory gate quiet for twelve hours is
	broken and a yard that works one shift a week is not, and one number for
	both means either missing the first or crying wolf about the second. A
	machine sending punches under an id nobody has registered still raises the
	alarm — on the default threshold — because an unregistered device is a gap
	in the register rather than a device that does not matter.
	"""
	now = now_datetime()
	since = add_to_date(now, days=-DEVICE_LOOKBACK_DAYS)

	# What each device last sent, over the window worth looking at. One query;
	# the judgment is applied per device afterwards, where the threshold is.
	last = {
		r.device_id: get_datetime(r.last_seen)
		for r in frappe.db.sql(
			"""
			SELECT device_id, MAX(time) AS last_seen
			FROM `tabEmployee Checkin`
			WHERE device_id IS NOT NULL
			  AND device_id != ''
			  AND custom_source = 'biometric'
			  AND time >= %(since)s
			GROUP BY device_id
			""",
			{"since": since},
			as_dict=True,
		)
	}

	registered = frappe.get_all(
		"Attendance Device",
		filters={"is_active": 1},
		fields=["name", "device_name", "device_id", "silent_after_hours"],
	)

	silent = []
	for device in registered:
		seen = last.get(device.device_id)
		hours = device.silent_after_hours or SILENT_DEVICE_HOURS
		if rules.device_is_silent(seen, now, hours):
			silent.append((device.device_name or device.device_id, seen, hours))
		# The register is also the health record, so it is written whether or
		# not this device is in trouble — `last_punch_at` is what the next run
		# and every report read.
		if seen:
			frappe.db.set_value("Attendance Device", device.name, "last_punch_at", seen,
			                    update_modified=False)

	known = {d.device_id for d in registered}
	for device_id, seen in last.items():
		if device_id in known:
			continue
		if rules.device_is_silent(seen, now, SILENT_DEVICE_HOURS):
			silent.append((device_id + " " + _("(not registered)"), seen, SILENT_DEVICE_HOURS))

	if not silent:
		return

	lines = [
		_("{0} — last punch {1}, silent for over {2}h").format(name, seen, hours)
		for name, seen, hours in sorted(silent)
	]
	_notify_role(
		"HR Manager",
		subject=_("{0} attendance device(s) have gone quiet").format(len(silent)),
		message=_("These fingerprint machines have stopped sending punches:")
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
