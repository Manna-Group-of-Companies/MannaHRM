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

# The workflow owns these — manna_hr/workflow.py is where the transitions
# between them are, and this module imports the names rather than restating
# them so the two cannot drift into disagreeing about a spelling.
from manna_hr.workflow import (  # noqa: E402  (kept beside the constants it re-exports)
	STATUS_APPROVED,
	STATUS_COMPLETED,
	STATUS_DRAFT,
	STATUS_PENDING,
	STATUS_REJECTED,
)


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


# --------------------------------------------------------------- completion ---


def complete_applied():
	"""Move approved corrections to `Completed` once the day has been rebuilt.

	**Approving does not fix the day, and this is the job that notices when it
	finally is.** `apply` writes the missing `Employee Checkin` rows and cancels
	whatever `Attendance` the shift job had already generated; the day is not
	actually corrected until that job next runs and builds a new row from the
	punches. Between the two, the request says Approved and the report still
	says Absent — which is the gap that produces "I approved that on Tuesday,
	why is he still down as absent?", and it is the reason `Completed` is a
	state rather than a synonym for Approved.

	So: a submitted `Attendance` row exists for that person and day, created
	after the decision. The `creation` test is what stops this passing on the
	very row `apply` cancelled — a cancelled document keeps its name and its
	creation time, and `docstatus` is the only thing that distinguishes it.

	Scheduled hourly rather than every ten minutes. The shift job it is waiting
	on is itself scheduled, so a tighter loop only spends the site's daily
	compute allowance re-asking a question whose answer cannot have changed —
	see docs/OPEN_QUESTIONS.md §0.
	"""
	pending = frappe.get_all(
		"Employee Attendance Regularization",
		filters={"status": STATUS_APPROVED},
		fields=["name", "employee", "attendance_date", "decided_on"],
	)

	done = 0
	for row in pending:
		if not _day_rebuilt(row):
			continue
		# `db_set` rather than a workflow action: this is a system transition
		# with no person behind it, so there is nobody for `allow_self_approval`
		# or a role check to be about. The workflow still offers HR Manager the
		# same move by hand, for when this job has not run.
		frappe.db.set_value("Employee Attendance Regularization", row.name, "status", STATUS_COMPLETED)
		done += 1

	if done:
		frappe.db.commit()
	return done


def _day_rebuilt(row):
	"""Is there a live `Attendance` for this day, made after the decision?"""
	if not row.get("decided_on"):
		# Decided before this field was being written, or set by hand. The
		# honest answer is "cannot tell", and leaving it Approved is the safe
		# way to be wrong: a record that should say Completed and says Approved
		# is a cosmetic fault, and the other way round is a report claiming a
		# day was fixed when it was not.
		return False

	return bool(
		frappe.db.exists(
			"Attendance",
			{
				"employee": row.employee,
				"attendance_date": getdate(row.attendance_date),
				"docstatus": 1,
				"creation": (">", row.decided_on),
			},
		)
	)
