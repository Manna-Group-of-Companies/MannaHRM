"""Day or night on the site: the shift a punch-in starts, given before it lands.

The rule is `rota.py`. This reads the person and their Shift Assignments and
writes what it decides, from `checkin.validate` as every machine punch is
saved — before hrms's own validation gives the checkin its shift. It used to
run only for the site's ADMS punches, and only for those with a key.
"""

from datetime import timedelta

import frappe
from frappe.utils import get_datetime, getdate

from manna_hr import rota


def before_deliver(employee, punched_at, log_type):
	"""Give `employee` the shift this punch starts, if it says. Returns the writes."""
	emp = frappe.db.get_value(
		"Employee", employee,
		["name", "employee_name", "company", "department", "default_shift"], as_dict=True,
	)
	if not emp or not emp.default_shift:
		return []
	partner = frappe.db.get_value("Shift Type", emp.default_shift, "custom_night_shift") if _has_partner_field() else None
	night = rota.night_for(emp.default_shift, partner)
	if not night or not frappe.db.exists("Shift Type", night):
		return []

	if log_type:
		previous = frappe.db.get_value(
			"Employee Checkin",
			{"employee": employee, "time": ["<", punched_at], "skip_auto_attendance": 0},
			["time", "log_type"],
			order_by="time desc",
		)
		before, before_key = previous if previous else (None, None)
		kind = rota.arrival(punched_at, log_type, before, before_key)
	else:
		# No key on the punch — most machines here: count from the last rest.
		earlier = frappe.get_all(
			"Employee Checkin",
			filters={
				"employee": employee,
				"skip_auto_attendance": 0,
				"time": ["between", [get_datetime(punched_at) - timedelta(days=10), get_datetime(punched_at)]],
			},
			pluck="time",
			limit_page_length=0,
		)
		kind = rota.arrival_unkeyed(punched_at, earlier)
	if not kind:
		return []

	on = getdate(punched_at)
	actions = rota.plan(_assignments(employee, on), on, kind, night)
	for action in actions:
		_apply(emp, action)
	return actions


def _has_partner_field():
	# `Shift Type.custom_night_shift` arrives with install.py; a site without
	# it yet reads the map alone.
	return frappe.get_meta("Shift Type").has_field("custom_night_shift")


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
		# Made before the punch it is for is saved, so that punch takes the
		# shift by itself: nothing for reprocess_site to rebuild.
		doc.flags.manna_rota = True
		doc.insert(ignore_permissions=True)
		doc.submit()
		return
	doc = frappe.get_doc("Shift Assignment", action[1])
	doc.flags.manna_rota = True
	doc.update(action[2])
	doc.save(ignore_permissions=True)
