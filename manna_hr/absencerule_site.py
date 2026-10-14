"""The office absence rule, on the site: the hourly run and the regularization hook.

The rule itself is `absencerule.py`, pure. This is the half that reads a month
and does what the plan says, as hrms documents: a submitted Casual Leave
Application for the first Absent day, and a cancel when that day is
regularized. hrms marks the day On Leave on submit and withdraws it on cancel;
nothing here writes `Attendance` (CLAUDE.md §5).

**Hourly, not on the Attendance hook.** The shift job marks absentees through
`mark_attendance`, and any exception raised under it other than a
`DuplicateAttendanceError` ends the run for every shift after it, group-wide
(see freeze.py). A leave written from inside that would put the whole job's
morning at the mercy of one person's balance. An hour later is soon enough for
a day that payroll reads at the end of the month.
"""

from datetime import timedelta

import frappe
from frappe.utils import getdate, nowdate

from manna_hr import absencerule as ar


def run(today=None):
	"""Scheduler, hourly: everybody who earns Casual Leave, this month and last."""
	if not ar.AUTO_LEAVE_RULES:
		return
	today = getdate(today or nowdate())
	staff = _covered()
	for start, end in ar.months_to_check(today):
		_month(staff, start, end, today)


def after_regularization(employee, day):
	"""Give a regularized day's leave back, before its punches are written.

	Called by `regularization.apply` ahead of `_clear_generated_attendance`.
	**It must come first:** while the leave stands, hrms's Attendance validation
	finds it and builds the rebuilt day as On Leave again, punches or not — the
	correction would land and change nothing. Raises on a refusal, so the
	approval is refused with it rather than left half done.
	"""
	day = getdate(day)
	for r in frappe.get_all(
		"Leave Application",
		filters={"employee": employee, "docstatus": 1, "from_date": day, "to_date": day},
		fields=["name", "description"],
	):
		if ar.is_auto(r.description):
			_cancel(r.name)


def next_absence(employee, day):
	"""After a regularization: the month's next Absent day takes the leave.

	Never raises. The correction is the thing being approved, and the hourly
	run does this again anyway. Nothing when the rules are switched off
	(`ar.AUTO_LEAVE_RULES`): that would be the rule writing new leave.
	"""
	if not ar.AUTO_LEAVE_RULES:
		return
	day = getdate(day)
	if day < ar.EFFECTIVE_FROM:
		return
	emp = frappe.db.get_value("Employee", employee, ["name", "designation", "company"], as_dict=True)
	if not emp or not ar.applies_to(emp.designation):
		return
	start = day.replace(day=1)
	end = min((start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1), getdate(nowdate()))
	said = len(frappe.message_log)
	try:
		_month({emp.name: emp}, start, end, getdate(nowdate()))
	except Exception:
		# The approval succeeded; a red error from the leave behind it would
		# read as though it had not.
		del frappe.message_log[said:]
		frappe.log_error(frappe.get_traceback(), "Office absence rule: after a regularization")


# ------------------------------------------------------------------ reading ---


def _covered():
	"""Active employees the absence rule covers — everybody who earns Casual
	Leave, office or not. Sunday leave narrows this to the office itself."""
	rows = frappe.get_all("Employee", filters={"status": "Active"}, fields=["name", "designation", "company"])
	return {r.name: r for r in rows if ar.applies_to(r.designation)}


def _month(staff, start, end, today):
	if not staff:
		return
	ids = list(staff)
	absent, auto, covered, regularized = {}, {}, {}, {}

	for r in frappe.get_all(
		"Attendance",
		filters={"employee": ["in", ids], "status": "Absent", "docstatus": 1,
			"attendance_date": ["between", [start, end]]},
		fields=["employee", "attendance_date"],
	):
		absent.setdefault(r.employee, []).append(r.attendance_date)

	for r in frappe.get_all(
		"Leave Application",
		filters={"employee": ["in", ids], "docstatus": ["<", 2], "status": ["not in", ["Rejected", "Cancelled"]],
			"from_date": ["<=", end], "to_date": [">=", start]},
		fields=["name", "employee", "from_date", "to_date", "description", "docstatus"],
	):
		if ar.is_auto(r.description) and r.docstatus == 1:
			auto.setdefault(r.employee, []).append((r.name, r.from_date))
			continue
		d = max(getdate(r.from_date), start)
		while d <= min(getdate(r.to_date), end):
			covered.setdefault(r.employee, []).append(d)
			d += timedelta(days=1)

	# The calendar day of the punch. A night shift's corrected OUT lands on the
	# morning after and marks that day regularized too, which only ever keeps a
	# day *out* of the leave — the cheaper way to be wrong.
	#
	# Any correction punch, set aside or not. hrms sets aside a punch it could
	# not build a day from — which is what happens to a correction landing on a
	# day the leave has already made On Leave — and the day was still corrected.
	for r in frappe.get_all(
		"Employee Checkin",
		filters={"employee": ["in", ids], "device_id": ["like", ar.REG_PREFIX + "%"],
			"time": ["between", [str(start) + " 00:00:00", str(end) + " 23:59:59"]]},
		fields=["employee", "time"],
	):
		regularized.setdefault(r.employee, []).append(getdate(r.time))

	for emp in (set(absent) | set(auto)) & set(staff):
		args = (absent.get(emp, ()), auto.get(emp, ()), regularized.get(emp, ()), covered.get(emp, ()))
		cancel, give = ar.plan(*args)
		if not cancel and not give:
			continue
		frappe.db.savepoint("absence_rule")
		said = len(frappe.message_log)
		try:
			for name in cancel:
				_cancel(name)
			_give_first_taken(emp, staff[emp].company, today, args, give)
		except Exception:
			# One person's refusal — a frozen month, a cancel refused — is theirs.
			# The rest of the office is still owed its run.
			frappe.db.rollback(save_point="absence_rule")
			del frappe.message_log[said:]
			frappe.log_error(frappe.get_traceback(), "Office absence rule: {0}".format(emp))


#: How many Absent days in a month one run will try before giving up on it.
TRIES = 5


def _give_first_taken(emp, company, today, args, give):
	"""Give the month's leave to the first Absent day hrms will take.

	**The balance is checked before writing, not discovered by the refusal.** A
	write that fails costs an Error Log every hour for somebody who simply has
	no Casual Leave yet — 22 of 26 office staff on 3 October 2026.

	A refusal of the day itself (a holiday added afterwards, a block date) moves
	on to the next Absent day; one about the balance does not, because no other
	day of that month would be paid from a different balance.
	"""
	from hrms.hr.doctype.leave_application.leave_application import (
		InsufficientLeaveBalanceError,
		get_leave_balance_on,
	)

	excluded = []
	for _ in range(TRIES):
		if not give:
			return
		have = get_leave_balance_on(
			emp, ar.LEAVE_TYPE, give, give, consider_all_leaves_in_the_allocation_period=True, for_consumption=True
		)
		if (have or {}).get("leave_balance_for_consumption", 0) < 1:
			return
		frappe.db.savepoint("absence_rule_day")
		said = len(frappe.message_log)
		try:
			_give(emp, give, company, today)
			return
		except InsufficientLeaveBalanceError:
			frappe.db.rollback(save_point="absence_rule_day")
			del frappe.message_log[said:]
			return
		except frappe.ValidationError:
			frappe.db.rollback(save_point="absence_rule_day")
			del frappe.message_log[said:]
			excluded.append(give)
			_, give = ar.plan(*args, excluded=excluded)


# ------------------------------------------------------------------ writing ---


def _approver(employee):
	own, manager = frappe.db.get_value("Employee", employee, ["leave_approver", "reports_to"]) or (None, None)
	manager_user = frappe.db.get_value("Employee", manager, "user_id") if manager else None
	return ar.approver_for(own, manager_user, frappe.session.user)


def _give(employee, day, company, today):
	doc = frappe.get_doc(ar.application(employee, day, company, today, _approver(employee)))
	# The scheduler is Administrator and a regularization is decided by an
	# approver who may hold no Leave Application rights. The rule is HR's, not
	# theirs, so the permission it runs under is the rule's.
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc.name


def _cancel(name):
	doc = frappe.get_doc("Leave Application", name)
	if not ar.is_auto(doc.description):
		# Belt and braces: the reads above already filter on the mark. A
		# person's own leave is never cancelled by this rule.
		return
	doc.flags.ignore_permissions = True
	doc.cancel()
