"""The endpoints the phone app calls.

Thin on purpose. Every rule lives in `checkin.py` and runs on insert, so these
functions cannot accidentally become a second, laxer way in — which is exactly
what a convenience endpoint that "just writes the row" turns into.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, today

from manna_hr.regularization import approver_type_for


@frappe.whitelist()
def punch(log_type, latitude=None, longitude=None, device_id="MOBILE"):
	"""Record the calling user's own punch.

	`employee` is resolved from the session, never accepted as a parameter. An
	endpoint that takes an employee id is an endpoint that punches for somebody
	else the first time a client gets it wrong.

	Time is not accepted either — `checkin.py` stamps it from the server clock.
	"""
	if log_type not in ("IN", "OUT"):
		frappe.throw(_("log_type must be IN or OUT"))

	employee = _my_employee()

	checkin = frappe.get_doc(
		{
			"doctype": "Employee Checkin",
			"employee": employee,
			"log_type": log_type,
			"device_id": device_id or "MOBILE",
			"latitude": latitude,
			"longitude": longitude,
		}
	)
	checkin.insert()

	return {
		"name": checkin.name,
		"time": checkin.time,
		"log_type": checkin.log_type,
		"geofence": checkin.custom_geofence_result,
		"distance_metres": checkin.custom_distance_metres,
	}


@frappe.whitelist()
def my_day(date=None):
	"""Today's punches for the calling user, and what to offer them next."""
	employee = _my_employee()
	on = date or today()

	punches = frappe.get_all(
		"Employee Checkin",
		filters={"employee": employee, "time": ["between", [f"{on} 00:00:00", f"{on} 23:59:59"]]},
		fields=["name", "time", "log_type", "custom_source", "custom_geofence_result"],
		order_by="time asc",
	)

	last = punches[-1] if punches else None
	return {
		"date": on,
		"punches": punches,
		# What the button should say. Derived here rather than in the client so
		# a phone that has been offline all morning cannot offer the wrong one.
		"next": "OUT" if last and last.log_type == "IN" else "IN",
	}


@frappe.whitelist()
def request_regularization(attendance_date, reason, requested_in=None, requested_out=None):
	"""Ask for a missing or wrong punch to be corrected."""
	if not reason or not reason.strip():
		frappe.throw(_("Say what happened — the person deciding this was not there."))

	if not requested_in and not requested_out:
		frappe.throw(_("Give at least one time to correct."))

	employee = _my_employee()

	if frappe.db.exists(
		"Attendance Regularization",
		{
			"employee": employee,
			"attendance_date": attendance_date,
			"status": "Pending Approval",
		},
	):
		# Re-submitting rather than waiting is the commonest thing people do
		# with an approval queue, and two requests for one day get approved
		# twice by two different people.
		frappe.throw(
			_("You already have a correction waiting for {0}.").format(attendance_date),
			title=_("Already requested"),
		)

	doc = frappe.get_doc(
		{
			"doctype": "Attendance Regularization",
			"employee": employee,
			"attendance_date": attendance_date,
			"requested_in": requested_in,
			"requested_out": requested_out,
			"reason": reason.strip(),
			"status": "Pending Approval",
			"approver_type": approver_type_for(employee),
		}
	)
	doc.insert()
	return {"name": doc.name, "approver_type": doc.approver_type}


def _my_employee():
	employee = frappe.db.get_value(
		"Employee", {"user_id": frappe.session.user, "status": "Active"}, "name"
	)
	if not employee:
		frappe.throw(
			_("Your login is not linked to an employee record. Ask HR to set it."),
			title=_("Not an employee"),
		)
	return employee
