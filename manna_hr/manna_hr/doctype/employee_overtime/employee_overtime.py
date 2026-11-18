import frappe
from frappe import _
from frappe.model.document import Document

APPROVED = "Approved"
REJECTED = "Rejected"


class EmployeeOvertime(Document):
	"""One day's overtime, and whether it is paid.

	Since 18 November 2026 Daily Detail works OT out from the punches and shows
	it as pending; this row is the decision on it. Only an Approved row is paid
	(client/src/lib/overtime.js). A Rejected row keeps the day decided, so the
	punches' figure does not come back as pending, and it holds 0 hours, so it
	pays nothing even where `status` is not read.

	The rules that keep the number honest live here, on the server — one row
	per person per day, and an amount a day can hold.
	"""

	def validate(self):
		if not self.get("status"):
			# A row from before approval existed was HR's own entry.
			self.status = APPROVED

		if self.hours is None or self.hours < 0 or self.hours > 16:
			frappe.throw(_("OT hours must be between 0 and 16."), title=_("Not an amount of overtime"))
		if self.get("status") == REJECTED:
			# Rejected is no OT: whatever hours came with it are not paid.
			self.hours = 0
		elif self.hours <= 0:
			frappe.throw(_("Approved or pending OT must be more than 0 hours. Reject the day instead."),
				title=_("Not an amount of overtime"))

		twin = frappe.db.get_value(
			"Employee Overtime",
			{"employee": self.employee, "ot_date": self.ot_date, "name": ("!=", self.name)},
			"name",
		)
		if twin:
			# Two rows for one day would pay the day twice.
			frappe.throw(_("{0} already has overtime for {1} ({2}). Change that row instead.").format(
				self.employee, self.ot_date, twin), title=_("Already entered"))

		if not self.entered_by:
			self.entered_by = frappe.session.user
