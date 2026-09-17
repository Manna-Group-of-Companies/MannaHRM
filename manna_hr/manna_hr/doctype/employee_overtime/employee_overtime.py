import frappe
from frappe import _
from frappe.model.document import Document


class EmployeeOvertime(Document):
	"""One day's overtime, as HR granted it.

	OT on every attendance report is these rows and nothing else (16 Sep 2026):
	a late punch-out is hours worked until HR says it is overtime. So the two
	rules that keep the number honest live here, on the server — one row per
	person per day, and an amount a day can hold.
	"""

	def validate(self):
		if self.hours is None or self.hours <= 0 or self.hours > 16:
			frappe.throw(_("OT hours must be more than 0 and at most 16."), title=_("Not an amount of overtime"))

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
