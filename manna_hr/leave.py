"""Sandwich Leave — the weekend or holiday between two days of leave.

Factor HR's rule, wanted for the group: a person who takes Friday and Monday
off did not, in practice, come in on the Saturday and Sunday between them
either, and payroll counts the pair as one stretch of leave rather than two
days of leave either side of a weekend they got for free. The weekend or
holiday is swept in only when *both* the working day before it and the
working day after it are leave or absence — see
`manna_hr.rules.sandwich_leave_dates` for why, and for the date-math itself,
which is pure and tested without a site.

Off by default (`Manna HR Settings.enable_sandwich_leave`) — see
docs/OPEN_QUESTIONS.md.
"""

import frappe
from frappe.utils import add_days, getdate

from manna_hr.rules import UNDECIDED_LEAVE, sandwich_leave_dates
from manna_hr.settings import hr_settings

#: How far either side of an application this looks before giving up. A
#: fortnight reaches past every real holiday block on the site's calendars;
#: an application that needs more than that to resolve is not a sandwich, it
#: is a gap in the Holiday List.
_LOOKAROUND_DAYS = 14


@frappe.whitelist()
def sandwich_preview(employee, from_date, to_date):
	"""The holiday/weekend dates this application would sweep in, as isoformat
	strings — or `[]` when the policy is off or nothing is swept.

	Called from the client before the application is written, so the warning
	can name the dates rather than just gesture at "a weekend or holiday". The
	same question, asked again by :func:`sweep` once the application is
	actually submitted, so what the warning promised and what gets marked
	cannot drift apart.
	"""
	if not _enabled():
		return []
	dates = _sandwiched(employee, getdate(from_date), getdate(to_date))
	return [d.isoformat() for d in dates]


def sweep(doc, method=None):
	"""Leave Application · on_submit. Marks the swept days On Leave.

	Only on submit, not on the Open draft `raise.js` creates — an application
	nobody has approved yet is not a fact about the calendar, and marking the
	weekend around it absent before anyone decided would be enforcing a leave
	that might still be refused.
	"""
	if not _enabled():
		return

	dates = _sandwiched(doc.employee, getdate(doc.from_date), getdate(doc.to_date))
	for on in dates:
		try:
			_mark_on_leave(doc.employee, doc.company, on, doc.leave_type, doc.name)
		except Exception:
			# A frozen month refuses the write — see manna_hr/freeze.py. That is
			# a fact about the month, not about this application, and it must
			# not undo a leave that was otherwise correctly submitted. Logged so
			# HR can see the day still needs a manual look.
			frappe.log_error(
				title="Sandwich Leave could not mark {0} for {1}".format(on, doc.employee),
				message=frappe.get_traceback(),
			)


def on_cancel(doc, method=None):
	"""Leave Application · on_cancel. Withdraws the days this application swept in."""
	if not _enabled():
		return
	existing = frappe.get_all(
		"Attendance",
		filters={
			"employee": doc.employee,
			"leave_application": doc.name,
			"docstatus": 1,
		},
		pluck="name",
	)
	for name in existing:
		attendance = frappe.get_doc("Attendance", name)
		attendance.flags.ignore_permissions = True
		attendance.cancel()


def _enabled():
	return bool(hr_settings().get("enable_sandwich_leave"))


def _sandwiched(employee, from_date, to_date):
	"""The pure rule, fed from the site: this application's own span, every
	other leave/absence around it, and the employee's holidays."""
	window_start = add_days(from_date, -_LOOKAROUND_DAYS)
	window_end = add_days(to_date, _LOOKAROUND_DAYS)

	holidays = _holiday_dates(employee, window_start, window_end)
	leave_dates = _leave_or_absent_dates(employee, window_start, window_end)
	leave_dates |= _date_range(from_date, to_date)

	days = []
	on = window_start
	while on <= window_end:
		days.append({"date": on, "is_off": on in holidays, "is_leave": on in leave_dates})
		on = add_days(on, 1)

	return sandwich_leave_dates(days)


def _holiday_dates(employee, start, end):
	holiday_list = frappe.db.get_value("Employee", employee, "holiday_list")
	if not holiday_list:
		return set()
	rows = frappe.get_all(
		"Holiday",
		filters={"parent": holiday_list, "holiday_date": ["between", [start, end]]},
		pluck="holiday_date",
	)
	return {getdate(r) for r in rows}


def _leave_or_absent_dates(employee, start, end):
	"""Every day in the window already leave, requested leave, or absent."""
	dates = set()

	apps = frappe.get_all(
		"Leave Application",
		filters={
			"employee": employee,
			"docstatus": ["!=", 2],
			"status": ["in", ("Approved",) + UNDECIDED_LEAVE],
			"from_date": ["<=", end],
			"to_date": [">=", start],
		},
		fields=["from_date", "to_date"],
	)
	for app in apps:
		dates |= _date_range(max(getdate(app.from_date), start), min(getdate(app.to_date), end))

	absents = frappe.get_all(
		"Attendance",
		filters={
			"employee": employee,
			"status": "Absent",
			"docstatus": 1,
			"attendance_date": ["between", [start, end]],
		},
		pluck="attendance_date",
	)
	dates |= {getdate(a) for a in absents}
	return dates


def _date_range(start, end):
	out = set()
	on = start
	while on <= end:
		out.add(on)
		on = add_days(on, 1)
	return out


def _mark_on_leave(employee, company, on, leave_type, leave_application):
	"""Write the swept day as On Leave, replacing whatever Attendance was there.

	Same shape as `regularization._clear_generated_attendance`: cancel first,
	because a weekend does not normally carry an Attendance row, but a holiday
	that was separately marked Absent by the shift job would otherwise sit
	there disagreeing with the leave record next to it.
	"""
	existing = frappe.get_all(
		"Attendance",
		filters={"employee": employee, "attendance_date": on, "docstatus": 1},
		pluck="name",
	)
	for name in existing:
		attendance = frappe.get_doc("Attendance", name)
		attendance.flags.ignore_permissions = True
		attendance.cancel()

	attendance = frappe.get_doc(
		{
			"doctype": "Attendance",
			"employee": employee,
			"attendance_date": on,
			"status": "On Leave",
			"company": company,
			"leave_type": leave_type,
			"leave_application": leave_application,
		}
	)
	attendance.flags.ignore_permissions = True
	attendance.insert()
	attendance.submit()
