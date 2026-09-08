"""A change somebody wants made to their own Employee record.

Approving one does **not** write to `Employee`. It says the change was agreed;
somebody then makes it, and `applied_on` records that they did. The two are kept
apart on purpose — an approved request that never landed is a common and
invisible failure, and it is only visible at all because the second step is its
own fact.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

#: Fields a person may not ask to have changed about themselves this way.
#: Every one of them decides money or who approves what, and a change to any is
#: an HR act with a document behind it rather than a profile correction.
GUARDED = {
	"employee_number", "company", "date_of_joining", "relieving_date", "status",
	"reports_to", "ctc", "salary_currency", "salary_mode", "designation", "grade",
	"department", "branch", "employment_type", "default_shift", "holiday_list",
	"attendance_device_id",
}


class EmployeeProfileChangeRequest(Document):
	def validate(self):
		if not self.requested_on:
			self.requested_on = now_datetime()

		self._check_fields()
		self._capture_old_values()
		self._guard_self_approval()

		if self.status in ("Approved", "Rejected"):
			if not self.decided_by:
				self.decided_by = frappe.session.user
			if not self.decided_on:
				self.decided_on = now_datetime()
		if self.status == "Rejected" and not (self.decision_note or "").strip():
			frappe.throw(_("Say why. A refusal with no reason is one that gets raised again unchanged."))

	def _check_fields(self):
		meta = frappe.get_meta("Employee")
		for row in self.changes or []:
			if row.fieldname in GUARDED:
				frappe.throw(
					_(
						"{0} is not a profile correction — it decides pay or approvals. Raise it with "
						"HR as the document it actually is."
					).format(row.label or row.fieldname)
				)
			field = meta.get_field(row.fieldname)
			if not field:
				frappe.throw(_("Employee has no field called {0}.").format(row.fieldname))
			if not row.label:
				row.label = field.label

	def _capture_old_values(self):
		"""Read `From` when the request is raised, and never again.

		An approver is agreeing to a change *from* something. A From column that
		re-reads the record shows whatever it says today, which on a record
		edited in between is a decision about numbers nobody saw.
		"""
		if not self.is_new():
			return
		for row in self.changes or []:
			row.old_value = frappe.db.get_value("Employee", self.employee, row.fieldname)

	def _guard_self_approval(self):
		"""Nobody decides their own.

		Frappe's workflow guard covers a request you raised. This covers the
		other case — one raised *about* you by somebody else — which is the same
		conflict wearing a different owner.
		"""
		if self.status not in ("Approved", "Rejected"):
			return
		mine = frappe.db.get_value("Employee", self.employee, "user_id")
		if mine and mine == frappe.session.user:
			frappe.throw(_("You cannot decide a change to your own record."))
