import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr.geo import is_real_coordinate


class WorkLocation(Document):
	def validate(self):
		if not is_real_coordinate(self.latitude, self.longitude):
			# (0, 0) is in the Atlantic and is what an unset Float reads as. A
			# location saved that way refuses every punch at that gate, and the
			# error the employee sees blames their phone.
			frappe.throw(
				_("Latitude and longitude do not look like a real place. Capture them while standing at the gate."),
				title=_("Coordinate not usable"),
			)

		if self.radius_metres is not None and self.radius_metres < 0:
			frappe.throw(_("Radius cannot be negative."))
