"""One person enrolled on one fingerprint machine.

Written by the bridge from the machine's own user list, never by hand: a row
typed here would claim somebody can punch at a gate that has never seen their
finger. The point of the list is the blank Employee column — a person the
machine accepts and ERPNext cannot match, whose every punch is refused.
"""

import frappe
from frappe.model.document import Document


class AttendanceDeviceUser(Document):
	def validate(self):
		self.device_id = (self.device_id or "").strip()
		self.device_user_id = (self.device_user_id or "").strip()

		# The bridge fills both, because on a site still holding this doctype as
		# custom this controller does not run. Here they are filled again so a
		# row is right however it arrived.
		if not self.attendance_device:
			self.attendance_device = frappe.db.get_value("Attendance Device", {"device_id": self.device_id})
		if not self.employee:
			self.employee = _only_employee_with(self.device_user_id)


def _only_employee_with(device_user_id):
	"""The one Employee with this Attendance Device ID, or None.

	Two people with the same number is a data error, and picking either would
	show a name the punches do not belong to. An Active match is preferred over
	somebody who has Left, because a number reused after a leaver is the usual
	way two rows come to share one.
	"""
	rows = frappe.get_all(
		"Employee", filters={"attendance_device_id": device_user_id}, fields=["name", "status"]
	)
	active = [r.name for r in rows if r.status == "Active"]
	if len(active) == 1:
		return active[0]
	if not active and len(rows) == 1:
		return rows[0].name
	return None
