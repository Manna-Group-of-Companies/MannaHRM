"""One company's month, closed.

Submitting this document is the freeze: from then on `manna_hr/freeze.py`
refuses anything that would change a day in the month. Cancelling it reopens
the month, and is refused once salary has been processed from it.

Frappe's own docstatus carries the whole life of it, on purpose. Draft is a
month somebody means to close, Submitted is closed, Cancelled is closed and then
opened again — and cancel-and-amend is already how everybody on this site
corrects a submitted document, so there is no second vocabulary to learn.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from manna_hr import freeze, rules


class AttendanceSubmission(Document):
	def validate(self):
		self.period = (self.period or "").strip()
		problem = rules.period_problem(self.period, freeze.server_today())
		if problem:
			frappe.throw(_(problem), title=_("Not yet"))
		self.from_date, self.to_date = rules.period_bounds(self.period)
		freeze.refuse_a_second(self)

	def before_submit(self):
		# Checked at the moment of submitting rather than when the draft was
		# saved: a draft can sit for a week, and a correction raised in that week
		# is exactly the thing this is here to catch.
		problems = freeze.blockers(self)
		if problems:
			frappe.throw(
				"<br><br>".join(_(p) for p in problems),
				title=_("{0} cannot be closed yet").format(rules.period_label(self.period)),
			)
		freeze.keep_figures(self)
		self.submitted_by, self.submitted_on = freeze.stamp()

	def before_cancel(self):
		problem = rules.reopen_problem(freeze.salary_slips(self))
		if problem:
			frappe.throw(_(problem), title=_("Salary processed"))

	def on_cancel(self):
		user, when = freeze.stamp()
		self.db_set({"reopened_by": user, "reopened_on": when}, update_modified=False)
		released = freeze.release_held_punches(self)
		if released:
			frappe.msgprint(
				_("{0} punches set aside while {1} was closed go back to the shift job, which makes their days on its next run.").format(
					released, rules.period_label(self.period)
				)
			)

	def on_trash(self):
		# A draft can go. A cancelled one is the record that the month was closed
		# and opened again, and by whom — deleting it leaves payroll's history
		# with a month that was never shut, which is not what happened.
		if self.docstatus == 2:
			frappe.throw(
				_("{0} is the record that this month was closed and then reopened. It stays.").format(self.name),
				title=_("Not deleted"),
			)
