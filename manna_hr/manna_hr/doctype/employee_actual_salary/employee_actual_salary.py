import frappe
from frappe import _
from frappe.model.document import Document


class EmployeeActualSalary(Document):
	"""A person's actual salary from a date, kept apart from payroll.

	Asked for 14 October 2026: the actual salary is not the payroll salary, so
	it is its own document rather than a field on the Salary Structure
	Assignment. Nothing in payroll reads it — the slip, PF and ESI come from
	the assignment's Base — so it can be corrected freely and no pay moves.
	"""

	def validate(self):
		if not self.actual_salary or self.actual_salary <= 0:
			frappe.throw(_("The actual salary must be more than 0."), title=_("No salary"))

		twin = frappe.db.get_value(
			"Employee Actual Salary",
			{"employee": self.employee, "from_date": self.from_date, "name": ("!=", self.name)},
			"name",
		)
		if twin:
			# Two rows from one date leave nobody able to say which is the salary.
			frappe.throw(_("{0} already has an actual salary from {1} ({2}). Change that row instead.").format(
				self.employee, self.from_date, twin), title=_("Already entered"))

		if not self.entered_by:
			self.entered_by = frappe.session.user
