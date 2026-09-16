"""The month freeze: once a company's month is submitted, nothing in it changes.

Factor HR's Submit Attendance, which Frappe HR has no equivalent of — payroll
there reads `Attendance` live, so a correction approved the day after the pay
run silently disagrees with the payslip. Here a submitted `Attendance
Submission` is the gate, and these are the four doors it shuts:

- **Attendance** — no new day, no change to one, and no cancelling one.
- **Leave Application** — no approving, and no cancelling an approved one,
  for any day in the month. hrms writes those days with `db_set`, which never
  reaches Attendance's own `validate`, so the leave has to be stopped itself.
- **Employee Attendance Regularization** — raising one for a frozen day is
  allowed, because a person's record of what went wrong is worth keeping; the
  step into Approved is not, because that is what writes the punches.
- **Employee Checkin — deliberately not guarded.** A punch is evidence and may
  be the last copy of it (CLAUDE.md §5); the bridge must never be told no. A
  punch that lands in a frozen month is kept, and it is the shift job's attempt
  to turn it into a day that is refused — see `FrozenMonthError`.

The arithmetic and the wording are in `rules.py`, testable without a site.
"""

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime, today

# hrms is a required app (hooks.py), so this import is safe wherever this module
# can be loaded at all — and the class below cannot be written without it.
from hrms.hr.doctype.attendance.attendance import DuplicateAttendanceError

from manna_hr import rules
from manna_hr.workflow import STATUS_APPROVED, STATUS_PENDING

DOCTYPE = "Attendance Submission"


class FrozenMonthError(DuplicateAttendanceError):
	"""A write into a submitted month.

	**It is a `DuplicateAttendanceError`, and that is the reason the class
	exists.** hrms's shift job reaches Attendance two ways, and a plain
	`ValidationError` raised on the second of them would be a disaster:

	- Turning punches into a day catches any `ValidationError` for that group of
	  punches, sets them aside with `skip_auto_attendance` and writes the
	  refusal onto each as a comment. Recorded and marked, never refused.
	- Marking absent the days nobody punched calls `mark_attendance`, which
	  catches *only* `DuplicateAttendanceError` and `OverlappingShiftAttendance
	  Error`. Anything else propagates out of the per-employee loop and ends the
	  run — for every shift after this one, across the whole group. One person
	  with an unmarked day in a frozen month would stop everybody's attendance.

	As this subclass, both paths step over the frozen day and carry on, and a
	person at the desk still reads the sentence.
	"""


# ------------------------------------------------------------------ lookups ---


def submitted_for(company, day):
	"""The submission that freezes `day` for `company`, or None."""
	if not company or not day:
		return None
	day = getdate(day)
	return frappe.db.get_value(
		DOCTYPE,
		{"company": company, "docstatus": 1, "from_date": ("<=", day), "to_date": (">=", day)},
		["name", "period"],
		as_dict=True,
	)


def _company_of(doc):
	"""The document's company, or its employee's.

	Attendance fetches `company` from the employee, and a hook can run before
	the fetch has. Asking the employee is the same answer, earlier.

	**No company, no freeze** — a doubtful write is let through rather than
	refused (CLAUDE.md §4). Employee.company is mandatory in ERPNext, so this is
	a record that is broken in some other way, and refusing it here would hide
	that behind a sentence about a month.
	"""
	return doc.get("company") or frappe.db.get_value("Employee", doc.get("employee"), "company")


def _refuse(hit, company, what):
	frappe.throw(
		_(rules.frozen_message(hit.period, company, hit.name, what)),
		exc=FrozenMonthError,
		title=_("Month submitted"),
	)


def _who(doc):
	return doc.get("employee_name") or doc.get("employee") or _("this employee")


# ------------------------------------------------------------------- guards ---


def guard_attendance(doc, method=None):
	"""Attendance · validate — on insert, on save and on submit."""
	company = _company_of(doc)
	hit = submitted_for(company, doc.attendance_date)
	if hit:
		_refuse(hit, company, _("attendance for {0} on {1}").format(_who(doc), doc.attendance_date))


def guard_attendance_cancel(doc, method=None):
	"""Attendance · before_cancel.

	The correction path cancels the day it is about to rebuild
	(`regularization._clear_generated_attendance`), so this is also what stops
	a correction that slipped past `guard_regularization`.
	"""
	company = _company_of(doc)
	hit = submitted_for(company, doc.attendance_date)
	if hit:
		_refuse(
			hit, company,
			_("cancelling the attendance of {0} on {1}").format(_who(doc), doc.attendance_date),
		)


def guard_leave(doc, method=None):
	"""Leave Application · before_submit and before_cancel.

	Only an approved leave writes days. A rejected one is submitted too, and
	changes nothing in the month, so it is let through.
	"""
	if doc.status != "Approved":
		return
	company = _company_of(doc)
	for period in rules.months_touched(doc.from_date, doc.to_date):
		hit = frappe.db.get_value(
			DOCTYPE, {"company": company, "docstatus": 1, "period": period}, ["name", "period"], as_dict=True
		)
		if hit:
			_refuse(
				hit, company,
				_("{0} of {1} from {2} to {3}").format(
					_("cancelling the leave") if method == "before_cancel" else _("approving the leave"),
					_who(doc), doc.from_date, doc.to_date,
				),
			)


def guard_regularization(doc, method=None):
	"""Employee Attendance Regularization · validate — the step into Approved only."""
	if doc.status != STATUS_APPROVED:
		return
	before = doc.get_doc_before_save()
	if before and before.status == STATUS_APPROVED:
		return
	company = _company_of(doc)
	hit = submitted_for(company, doc.attendance_date)
	if hit:
		_refuse(
			hit, company,
			_("approving the correction for {0} on {1}").format(_who(doc), doc.attendance_date),
		)


# -------------------------------------------------------- the submission ---


def refuse_a_second(doc):
	"""One live submission per company per month.

	Drafts count. Two drafts for one month is two people about to close it, and
	whichever submits second would be refused with a sentence about the first
	that neither of them was looking at.
	"""
	clash = frappe.db.get_value(
		DOCTYPE,
		{
			"company": doc.company,
			"period": doc.period,
			"docstatus": ("<", 2),
			"name": ("!=", doc.name or ""),
		},
		"name",
	)
	if clash:
		frappe.throw(
			_("{0} for {1} already has a submission — {2}. Open that one, or cancel it first.").format(
				rules.period_label(doc.period), doc.company, clash
			),
			title=_("Already there"),
		)


def blockers(doc):
	"""What `rules.submission_blockers` needs, read off the site."""
	start, end = doc.from_date, doc.to_date
	rows = frappe.db.count(
		"Attendance",
		{"company": doc.company, "docstatus": 1, "attendance_date": ("between", (start, end))},
	)
	corrections = frappe.db.count(
		"Employee Attendance Regularization",
		{
			"company": doc.company,
			"attendance_date": ("between", (start, end)),
			# Approved is still open: the punches are written and the day is not
			# rebuilt yet, so the figure about to be frozen is the old one.
			"status": ("in", (STATUS_PENDING, STATUS_APPROVED)),
		},
	)
	leave = frappe.db.count(
		"Leave Application",
		{
			"company": doc.company,
			"status": "Open",
			"docstatus": ("<", 2),
			# Overlapping, not contained — a leave from July into August is in
			# August.
			"from_date": ("<=", end),
			"to_date": (">=", start),
		},
	)
	return rules.submission_blockers(rows, corrections, leave)


def keep_figures(doc):
	"""Count the month onto the submission, at the moment it is frozen."""
	rows = frappe.get_all(
		"Attendance",
		filters={
			"company": doc.company,
			"docstatus": 1,
			"attendance_date": ("between", (doc.from_date, doc.to_date)),
		},
		fields=["employee", "status"],
		limit_page_length=0,
	)
	figures = rules.attendance_summary(rows)
	doc.attendance_rows = figures["rows"]
	doc.employee_count = figures["employees"]
	doc.present_days = figures["present"]
	doc.half_days = figures["half_day"]
	doc.absent_days = figures["absent"]
	doc.leave_days = figures["on_leave"]
	doc.work_from_home_days = figures["work_from_home"]
	doc.other_days = figures["other"]


def salary_slips(doc):
	"""Submitted salary slips for this company that cover any day of the month."""
	return frappe.db.count(
		"Salary Slip",
		{
			"company": doc.company,
			"docstatus": 1,
			"start_date": ("<=", doc.to_date),
			"end_date": (">=", doc.from_date),
		},
	)


def release_held_punches(doc):
	"""Hand the shift job back the punches it set aside while the month was shut.

	When `FrozenMonthError` refuses the day a punch would have made, hrms sets
	`skip_auto_attendance` on that punch and writes the refusal onto it as a
	comment — the sentence from `rules.frozen_message`, with this submission's
	name in brackets. So the comments find exactly the punches this submission
	held, and none of the ones hrms or a person set aside for another reason.

	Left alone, those punches would stay skipped after the month reopened, and
	the days they prove would never be made.
	"""
	held = set(
		frappe.get_all(
			"Comment",
			filters={
				"reference_doctype": "Employee Checkin",
				"content": ("like", "%({0})%".format(doc.name)),
			},
			pluck="reference_name",
		)
	)
	released = 0
	for name in held:
		row = frappe.db.get_value("Employee Checkin", name, ["attendance", "skip_auto_attendance"], as_dict=True)
		if row and row.skip_auto_attendance and not row.attendance:
			frappe.db.set_value("Employee Checkin", name, "skip_auto_attendance", 0, update_modified=False)
			released += 1
	return released


def server_today():
	"""The site's date. Never the browser's — CLAUDE.md §1."""
	return getdate(today())


def stamp():
	return frappe.session.user, now_datetime()
