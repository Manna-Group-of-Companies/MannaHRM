"""One recovery against one loan.

Writing a repayment changes the loan it belongs to, so the loan is re-saved
afterwards rather than patched here. Two places writing the same total is how a
register ends up with a figure nothing produced.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr import loans, rules


class EmployeeLoanRepayment(Document):
	def validate(self):
		loan = frappe.db.get_value(
			"Employee Loan Application",
			self.loan_application,
			["opening_balance", "disbursed_amount", "loan_status"],
			as_dict=True,
		)
		if not loan:
			return

		# Everything else recovered against this loan — this row excluded, so
		# editing one does not measure itself against its own old amount.
		already = loans.recovered_for(self.loan_application) - self._previous_amount()
		outstanding = rules.loan_outstanding(
			loan.opening_balance, loan.disbursed_amount, already
		)

		# Over-recovery is allowed on a Manual row and refused on a payroll one.
		# A deduction larger than the balance is a payroll mistake and the person
		# is owed the difference back; a cash adjustment that overshoots is
		# somebody settling a rounding, and refusing it leaves them unable to
		# record what happened.
		problem = rules.repayment_problem(
			self.amount, outstanding, allow_overpay=self.source == "Manual"
		)
		if problem:
			frappe.throw(_(problem))

	def on_update(self):
		self._resave_loan()

	def on_trash(self):
		self._resave_loan()

	def _previous_amount(self):
		if self.is_new():
			return 0.0
		return float(frappe.db.get_value("Employee Loan Repayment", self.name, "amount") or 0)

	def _resave_loan(self):
		"""Let the loan recompute itself from its repayments.

		`save` rather than `db_set`: the totals, the status, the schedule and the
		completion flag are one calculation, and writing only the total would
		leave a closed loan still saying Running.
		"""
		if not self.loan_application:
			return
		loan = frappe.get_doc("Employee Loan Application", self.loan_application)
		loan.save(ignore_permissions=True)
