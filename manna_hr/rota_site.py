"""Day or night on the site: the shift a punch-in starts, given before it lands.

The rule is `rota.py`. This reads the person and their Shift Assignments and
writes what it decides, as `adms_site._deliver` hands each machine punch over —
before the `Employee Checkin` is inserted, because hrms gives a checkin its
shift on insert.
"""

from datetime import timedelta

import frappe
from frappe.utils import getdate

from manna_hr import rota


def before_deliver(employee, punched_at, log_type):
	"""Give `employee` the shift this punch starts, if it says. Returns the writes."""
	emp = frappe.db.get_value(
		"Employee", employee,
		["name", "employee_name", "company", "department", "default_shift"], as_dict=True,
	)
	night = emp and rota.NIGHT_OF.get(emp.default_shift or "")
	if not night or not frappe.db.exists("Shift Type", night):
		return []

	previous = frappe.db.get_value(
		"Employee Checkin",
		{"employee": employee, "time": ["<", punched_at]},
		["time", "log_type"],
		order_by="time desc",
	)
	before, before_key = previous if previous else (None, None)
	kind = rota.arrival(punched_at, log_type, before, before_key)
	if not kind:
		return []

	on = getdate(punched_at)
	actions = rota.plan(_assignments(employee, on), on, kind, night)
	for action in actions:
		_apply(emp, action)
	return actions


def _assignments(employee, on):
	rows = frappe.get_all(
		"Shift Assignment",
		filters={
			"employee": employee, "docstatus": 1, "status": "Active",
			"start_date": ["<=", on + timedelta(days=1)],
		},
		fields=["name", "shift_type", "start_date", "end_date"],
	)
	return [a for a in rows if not a.end_date or getdate(a.end_date) >= on - timedelta(days=1)]


def _apply(emp, action):
	if action[0] == "create":
		doc = frappe.get_doc({
			"doctype": "Shift Assignment",
			**action[1],
			"employee": emp.name,
			"employee_name": emp.employee_name,
			"company": emp.company,
			"department": emp.department,
			"status": "Active",
		})
		doc.insert(ignore_permissions=True)
		doc.submit()
		return
	doc = frappe.get_doc("Shift Assignment", action[1])
	doc.update(action[2])
	doc.save(ignore_permissions=True)
