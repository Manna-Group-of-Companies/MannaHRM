import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from manna_hr.regularization import approver_type_for
from manna_hr.workflow import STATUS_DRAFT, STATUS_PENDING, path_from_draft


class EmployeeAttendanceRegularization(Document):
	def before_insert(self):
		# The workflow refuses a new correction in any state but Draft, and the
		# phone app asks for Pending Approval, HR's Save for Approved. Both were
		# refused outright once the app was installed, and the correction was
		# lost. Inserted as Draft; `after_insert` takes it the rest of the way.
		wanted = self.status or STATUS_DRAFT
		if path_from_draft(wanted) is None:
			frappe.throw(_("A new correction cannot start as {0}.").format(wanted))
		self.flags.wanted_status = wanted
		self.status = STATUS_DRAFT

	def after_insert(self):
		"""Walk the new correction to the state it was asked for.

		Each step is an ordinary save, so the workflow judges it against this
		person's roles and the routing condition: an employee asking for
		Approved is refused here, and the insert with it. A fresh copy is saved
		rather than `self`, which is still inside its own insert.
		"""
		steps = path_from_draft(self.flags.wanted_status)
		if not steps:
			return
		doc = frappe.get_doc(self.doctype, self.name)
		for state in steps:
			doc.status = state
			# `ignore_permissions`: an Employee may create a correction and not
			# write one. Moving their own request to Pending is the workflow's
			# call, and the workflow still makes it.
			doc.save(ignore_permissions=True)
		# What the caller is answered with. Flagged, because Frappe runs this
		# object's `on_update` after `after_insert`, and the copy above has
		# already applied an approved correction once.
		self.flags.walked_on_insert = True
		self.status = doc.status
		self.modified = doc.modified

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

		self._refuse_a_second_open_request()

	def _refuse_a_second_open_request(self):
		"""One live correction per person per day.

		Two approved corrections for the same day write two sets of punches.
		`apply` cancels the day's generated `Attendance` and inserts the
		requested checkins; run twice, that leaves four punches on a day that
		had two, and the shift job pairs them into hours nobody worked. It is
		not caught anywhere downstream — the punches are individually valid.

		Only *open* ones block. A rejected request being replaced by a better
		one is the normal way this gets used, and an approved one that is being
		corrected again is a real case too — somebody got the times wrong twice.
		What must not exist is two requests waiting at once, because whichever
		is decided second silently doubles the first.
		"""
		if not self.employee or not self.attendance_date:
			return

		clash = frappe.db.exists(
			self.doctype,
			{
				"employee": self.employee,
				"attendance_date": getdate(self.attendance_date),
				"status": ("in", (STATUS_DRAFT, STATUS_PENDING)),
				"name": ("!=", self.name or ""),
			},
		)
		if clash:
			frappe.throw(
				_("{0} already has a correction waiting for {1} — {2}. Decide or withdraw that one first.")
				.format(self.employee_name or self.employee, self.attendance_date, clash),
				title=_("Already waiting"),
			)
