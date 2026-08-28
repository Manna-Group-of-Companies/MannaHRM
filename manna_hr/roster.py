"""Where everybody stood on one day.

Ported from the sales dashboard's `client/src/domain/attendance.ts`, whose
`rosterFor` has been HR's daily screen since August 2026. The port is worth
making because the *order of the checks* is the design, and that order was
argued out against real disputes rather than derived from the data model.

Frappe HR answers a narrower question — it gives you an `Attendance` row with a
status — and it answers it only for days the shift job has already processed.
This fills the gap either side: the day that is still running, and the day
nobody has marked.
"""

import frappe
from frappe.utils import getdate

from manna_hr.rules import LABELS, resolve_day_status


@frappe.whitelist()
def roster(date=None, company=None):
	"""Every active employee, and where they stood on `date`.

	Scoped by `company` when given. Without it, the caller sees every company
	their User Permissions allow — which for an `HR User` with no Company
	permission is all of them.
	"""
	on = getdate(date or frappe.utils.today())
	is_past_day = on < getdate(frappe.utils.today())

	filters = {"status": "Active", "date_of_joining": ["<=", on]}
	if company:
		filters["company"] = company

	employees = frappe.get_all(
		"Employee",
		filters=filters,
		fields=[
			"name",
			"employee_name",
			"company",
			"department",
			"holiday_list",
			"custom_work_location",
		],
	)
	if not employees:
		return []

	ids = [e.name for e in employees]
	punches = _punches_on(ids, on)
	leave = _leave_on(ids, on)
	holidays = _holiday_lists_covering(on)

	rows = []
	for employee in employees:
		punch = punches.get(employee.name, {})
		status = resolve_day_status(
			has_punch_in=bool(punch.get("first_in")),
			has_punch_out=bool(punch.get("last_out")),
			leave_status=leave.get(employee.name),
			is_holiday=employee.holiday_list in holidays,
			is_past_day=is_past_day,
		)
		rows.append(
			{
				"employee": employee.name,
				"employee_name": employee.employee_name,
				"company": employee.company,
				"department": employee.department,
				"status": status,
				"label": LABELS[status],
				"first_in": punch.get("first_in"),
				"last_out": punch.get("last_out"),
			}
		)

	rows.sort(key=lambda r: (r["company"] or "", r["employee_name"] or ""))
	return rows


def _punches_on(employee_ids, on):
	"""First IN and last OUT per employee, from the raw checkins.

	Read from `Employee Checkin` rather than `Attendance` on purpose: this has
	to answer for the day that is still running, and `Attendance` for today does
	not exist until the shift job has run.
	"""
	rows = frappe.db.sql(
		"""
		SELECT
			employee,
			MIN(CASE WHEN log_type = 'IN'  THEN time END) AS first_in,
			MAX(CASE WHEN log_type = 'OUT' THEN time END) AS last_out
		FROM `tabEmployee Checkin`
		WHERE DATE(time) = %(on)s
		  AND employee IN %(ids)s
		GROUP BY employee
		""",
		{"on": on, "ids": employee_ids},
		as_dict=True,
	)
	return {r.employee: r for r in rows}


def _leave_on(employee_ids, on):
	"""Leave status per employee for the day, granted outranking requested."""
	rows = frappe.get_all(
		"Leave Application",
		filters={
			"employee": ["in", employee_ids],
			"from_date": ["<=", on],
			"to_date": [">=", on],
			"docstatus": ["!=", 2],
		},
		fields=["employee", "status"],
	)

	best = {}
	for row in rows:
		# A granted request outranks a pending one for the same day. Somebody
		# with both — usually a re-submission — is on leave, not waiting.
		if row.status == "Approved" or row.employee not in best:
			best[row.employee] = row.status
	return best


def _holiday_lists_covering(on):
	"""The names of every Holiday List with a holiday on this date.

	Per company, because a factory's list is not an office's and Kerala's is not
	everybody's — which is the whole reason `Employee.holiday_list` exists.
	"""
	return set(
		frappe.get_all(
			"Holiday",
			filters={"holiday_date": on},
			pluck="parent",
		)
	)
