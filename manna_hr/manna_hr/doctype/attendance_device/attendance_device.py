"""One fingerprint machine.

The register exists so a punch can be traced to a machine somebody can point at,
and so silence can be told from an empty factory. It holds no punches; the
punches are `Employee Checkin` rows and always were.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr import rules
from manna_hr.settings import hr_settings


class AttendanceDevice(Document):
	def validate(self):
		self.device_id = (self.device_id or "").strip()

		# **The prefix is not cosmetic.** `checkin.py` treats a `device_id` that
		# does not start with it as a phone punch — geofenced, and refused,
		# because no fingerprint machine sends a coordinate. A machine registered
		# under the wrong string is a gate where nobody can clock in, and the
		# error the workers see says nothing about this record.
		prefix = hr_settings().trusted_device_prefix
		if prefix and not rules.device_is_trusted(self.device_id, prefix):
			frappe.throw(
				_(
					"A device ID has to start with {0}. Punches from {1!r} would be judged as phone "
					"punches — geofenced, and refused, because a fingerprint machine sends no "
					"coordinate."
				).format(prefix, self.device_id)
			)

	def on_trash(self):
		"""Deleting a device orphans every punch that names it.

		Refused. The punches stay whatever happens here, and a register that no
		longer explains them is worse than one with a retired row in it — untick
		Active instead.
		"""
		if frappe.db.exists("Employee Checkin", {"device_id": self.device_id}):
			frappe.throw(
				_(
					"{0} has punches against it. Untick Active instead — deleting this leaves those "
					"punches naming a machine nothing can explain."
				).format(self.device_id)
			)
