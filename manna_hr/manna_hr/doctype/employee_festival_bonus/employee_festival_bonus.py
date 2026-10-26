import frappe
from frappe import _
from frappe.model.document import Document


class EmployeeFestivalBonus(Document):
	"""A festival bonus given to one person, paid apart from the salary.

	Asked for 22 October 2026: a festival bonus is uploaded as HR's sheet and
	paid by its own bank sheet, not on the month's salary slip. So it is its own
	document rather than an Additional Salary, which hrms would put on the slip.
	"""

	def validate(self):
		if not self.amount or self.amount <= 0:
			frappe.throw(_("The bonus must be more than 0."), title=_("No bonus"))

		twin = frappe.db.get_value(
			"Employee Festival Bonus",
			{"employee": self.employee, "festival": self.festival, "bonus_date": self.bonus_date, "name": ("!=", self.name)},
			"name",
		)
		if twin:
			# Two rows for one festival on one date is a bonus paid twice.
			frappe.throw(_("{0} already has a {1} bonus on {2} ({3}). Change that row instead.").format(
				self.employee, self.festival, self.bonus_date, twin), title=_("Already entered"))

		if not self.entered_by:
			self.entered_by = frappe.session.user
