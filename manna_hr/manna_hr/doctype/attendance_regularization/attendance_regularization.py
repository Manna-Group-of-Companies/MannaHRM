import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from manna_hr.regularization import approver_type_for


class AttendanceRegularization(Document):
	def validate(self):
		if not self.requested_in and not self.requested_out:
			frappe.throw(_("Give at least one time to correct."))

		if getdate(self.attendance_date) > getdate(today()):
			# A correction for a day that has not happened is either a typo or
			# somebody pre-approving their own attendance.
			frappe.throw(_("You cannot correct a day in the future."))

		if self.requested_in and self.requested_out and self.requested_out < self.requested_in:
			frappe.throw(_("The punch-out is before the punch-in."))

		if not self.approver_type:
			self.approver_type = approver_type_for(self.employee)
