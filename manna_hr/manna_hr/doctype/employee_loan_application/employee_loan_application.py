"""One staff loan, from the day it was asked for to the day it is settled.

The order below is the design: check the scheme, read what has actually come
back, work the status out *from* that, build or refresh the schedule, then set
the completion flag. Every step needs the one before it.
"""

from frappe.model.document import Document

from manna_hr import loans


class EmployeeLoanApplication(Document):
	def validate(self):
		loans.check_against_type(self)
		loans.refresh_totals(self)
		loans.build_schedule(self)
		loans.apply_repayments(self)
		loans.close_if_finished(self)
