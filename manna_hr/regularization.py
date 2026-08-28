"""Approving a correction writes the punch that was missing.

The alternative — editing `Attendance` directly — was rejected. `Attendance` is
generated from checkins by the shift job, so a hand-edited row is invisible to
the thing that would have created it, and the two disagree the moment anything
is reprocessed. Worse, the edited row carries no trace of what was actually
wrong or who decided it.

Writing the checkin instead means the record says: this punch exists, it came
from a regularization, and here is the user who approved it. Everything
downstream — hours, half-days, late flags, payroll — is then computed by the
same code that computes it for everybody else.
"""

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime

STATUS_PENDING = "Pending Approval"
STATUS_APPROVED = "Approved"
STATUS_REJECTED = "Rejected"


def on_update(doc, method=None):
	"""Fire once, on the transition into Approved."""
	if doc.status != STATUS_APPROVED:
		return

	before = doc.get_doc_before_save()
	if before and before.status == STATUS_APPROVED:
		return

	_guard_self_approval(doc)
	apply(doc)


def _guard_self_approval(doc):
	"""Nobody signs off their own attendance.

	The routing already sends a manager's own correction to HR rather than to
	themselves, but routing is data and data gets edited. This is the check that
	does not depend on the routing being right.
	"""
	approver = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if approver and approver == doc.employee:
		frappe.throw(
			_("You cannot approve your own attendance correction. This one goes to HR."),
			title=_("Not yours to decide"),
		)


def apply(doc):
	"""Write the corrected punches and let the shift job rebuild the day."""
	_clear_generated_attendance(doc.employee, doc.attendance_date)

	device = "REG-{0}".format(frappe.session.user)
	made = []

	if doc.requested_in:
		made.append(_write_checkin(doc, doc.requested_in, "IN", device))
	if doc.requested_out:
		made.append(_write_checkin(doc, doc.requested_out, "OUT", device))

	if not made:
		frappe.throw(
			_("This correction has neither a punch-in nor a punch-out time, so there is nothing to record."),
			title=_("Nothing to apply"),
		)

	doc.db_set("decided_by", frappe.session.user, update_modified=False)
	doc.db_set("decided_on", now_datetime(), update_modified=False)

	return made


def _write_checkin(doc, when, log_type, device):
	checkin = frappe.get_doc(
		{
			"doctype": "Employee Checkin",
			"employee": doc.employee,
			"time": get_datetime(when),
			"log_type": log_type,
			"device_id": device,
			# The shift job must see these. A regularization whose punches were
			# skipped would be approved, visible, and change nothing — the worst
			# of the three possible outcomes, because it looks handled.
			"skip_auto_attendance": 0,
		}
	)
	checkin.flags.ignore_permissions = True
	checkin.insert()
	return checkin.name


def _clear_generated_attendance(employee, date):
	"""Cancel the day's existing Attendance so it can be generated again.

	`hrms.mark_attendance` refuses to write when a row already exists for the
	employee and date, and returns quietly rather than raising. So a day already
	marked Absent will swallow the correction: the checkins land, the job runs,
	and the day stays Absent with nothing anywhere saying why.

	Cancelled rather than deleted. The wrong record is part of the history of
	the dispute, and a cancelled document is the framework's own way of saying
	"this was here, and it was withdrawn".
	"""
	existing = frappe.get_all(
		"Attendance",
		filters={"employee": employee, "attendance_date": getdate(date), "docstatus": 1},
		pluck="name",
	)
	for name in existing:
		attendance = frappe.get_doc("Attendance", name)
		attendance.flags.ignore_permissions = True
		attendance.cancel()


# ----------------------------------------------------------------- routing ---


def approver_type_for(employee):
	"""Who decides this person's corrections.

	A rep's correction is their manager's to decide; a manager's own correction
	goes to HR. Carried over from the sales system, where the rule exists
	because an approver deciding their own attendance is not an approval.
	"""
	reports_to = frappe.db.get_value("Employee", employee, "reports_to")
	return "Reporting Manager" if reports_to else "HR"
