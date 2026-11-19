"""The attendance policy on the site. The rules are `attpolicy.py`.

Four places it acts, none of them writing a day by hand (CLAUDE.md §5):

1. **`Attendance` validate** (`on_attendance_validate`) — as hrms's shift job
   makes a day from its punches, the person's policy reads it: late and early
   minutes, net hours, overtime, a missed punch, and the status the policy
   gives. Written onto the row hrms is making, before it is submitted.
2. **`Attendance` submit** (`on_attendance_submit`) — overtime the policy
   counts becomes a *pending* `Employee Overtime` row, which HR approves or
   rejects on Daily Detail as before (18 Nov 2026).
3. **Saving a policy** (`push_to_shifts`) — its thresholds and grace go onto
   the Shift Types it names, so hrms's own reading agrees with it.
4. **Nightly** (`settle`) — each open month is counted again. A day whose
   penalty no longer agrees with the count (a correction took a late away) is
   rebuilt; a penalty the policy takes from Casual Leave first becomes a
   half-day Casual Leave while the balance lasts.

**Never stops the shift job.** Anything that goes wrong in the hook is logged
and the day is left exactly as hrms made it: refusing the day would be the
expensive mistake (CLAUDE.md §4), and any exception other than a
`DuplicateAttendanceError` here ends hrms's run for the whole group (§5).
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, get_first_day, get_last_day, getdate, nowdate

from manna_hr import attpolicy as ap
from manna_hr import freeze

DOCTYPE = "Manna Attendance Policy"
#: Leave this job makes carries this at the start of its description, so it
#: only ever cancels its own.
AUTO_MARK = "Attendance policy penalty"
OT_MARK = "From the punches, by attendance policy"


# --------------------------------------------------------------- policies ---


def active_policies():
	"""Every active policy with its scopes, cached for the request."""
	cache = frappe.local.flags.get("manna_policies")
	if cache is not None:
		return cache
	rows = frappe.get_all(DOCTYPE, filters={"is_active": 1}, fields=["*"], limit_page_length=0)
	scopes = frappe.get_all(
		"Manna Attendance Policy Scope", filters={"parenttype": DOCTYPE},
		fields=["parent", "applies_on", "value"], limit_page_length=0,
	)
	for r in rows:
		r["scopes"] = [s for s in scopes if s.parent == r.name]
	frappe.local.flags.manna_policies = rows
	return rows


def policy_for(employee, shift=None):
	"""(policy dict or None) for an Employee name."""
	emp = frappe.db.get_value(
		"Employee", employee, ["name", "company", "department", "designation", "default_shift"], as_dict=True
	)
	if not emp:
		return None
	emp["shift"] = shift or emp.default_shift
	policies = active_policies()
	name = ap.resolve(policies, emp)
	return next((p for p in policies if p.name == name), None)


def push_to_shifts(policy):
	"""Policy · on_update. Its numbers onto the Shift Types it names."""
	frappe.local.flags.manna_policies = None
	if not policy.is_active:
		return
	for row in policy.shift_types or []:
		times = frappe.db.get_value("Shift Type", row.shift_type, ["start_time", "end_time"], as_dict=True)
		window = ap.shift_window("2026-01-01", times.start_time, times.end_time) if times else None
		hours = (window[1] - window[0]).total_seconds() / 3600 if window else None
		frappe.db.set_value("Shift Type", row.shift_type, ap.shift_settings(policy.as_dict(), hours))
		frappe.get_doc("Shift Type", row.shift_type).add_comment(
			"Comment", _("Thresholds and grace set by attendance policy {0}.").format(policy.name)
		)


# ------------------------------------------------------------ the hook ---


#: hrms's statuses this hook may read and change. A day on leave or from an
#: Attendance Request is the leave's or the request's, never the policy's.
_JUDGED = ap.JUDGED


def on_attendance_validate(doc, method=None):
	"""Attendance · validate. See the module docstring, point 1."""
	if doc.docstatus != 0 and not doc.is_new():
		return
	if doc.flags.get("manna_policy_done"):
		return
	if doc.status not in _JUDGED or doc.leave_application or doc.leave_type or doc.get("attendance_request"):
		return
	frappe.db.savepoint("manna_policy")
	try:
		_judge(doc)
		doc.flags.manna_policy_done = True
	except Exception:
		frappe.db.rollback(save_point="manna_policy")
		frappe.log_error(title="Attendance policy not applied: {0} {1}".format(doc.employee, doc.attendance_date))


def _judge(doc):
	policy = policy_for(doc.employee, doc.shift)
	shift = None
	if doc.shift:
		shift = frappe.get_cached_value("Shift Type", doc.shift, ["start_time", "end_time"], as_dict=True)
	on = getdate(doc.attendance_date)
	first = get_first_day(on)
	prior = frappe.db.sql(
		"""SELECT COALESCE(SUM(custom_late_counted), 0), COALESCE(SUM(custom_early_counted), 0)
		FROM `tabAttendance`
		WHERE employee = %s AND docstatus = 1 AND attendance_date >= %s AND attendance_date < %s AND name != %s""",
		(doc.employee, first, on, doc.name or ""),
	)[0]
	got = ap.evaluate_day(
		dict(policy) if policy else {},
		shift,
		{
			"attendance_date": on,
			"status": doc.status,
			"working_hours": doc.working_hours,
			"in_time": doc.in_time,
			"out_time": doc.out_time,
			"punches": _punch_count(doc),
			"prior_lates": int(prior[0] or 0),
			"prior_earlies": int(prior[1] or 0),
			"is_holiday": _is_holiday(doc.employee, on),
		},
	)
	doc.custom_attendance_policy = policy.name if policy else None
	doc.custom_late_minutes = got["late_minutes"]
	doc.custom_early_minutes = got["early_minutes"]
	doc.custom_net_hours = got["net_hours"]
	doc.custom_ot_minutes = got["ot_minutes"]
	doc.custom_punch_count = _punch_count(doc)
	doc.custom_missed_punch = got["missed_punch"]
	doc.custom_late_counted = got["late_counted"]
	doc.custom_early_counted = got["early_counted"]
	doc.custom_penalty = got["penalty"] or ""
	doc.custom_exceptions = ", ".join(got["exceptions"])
	doc.custom_policy_note = "; ".join(got["notes"])
	if got["late_counted"]:
		doc.late_entry = 1
	if got["early_counted"]:
		doc.early_exit = 1
	if got["status"] != doc.status:
		doc.status = got["status"]
		doc.modify_half_day_status = 0
		doc.half_day_status = got["half_day_status"]


def _punch_count(doc):
	"""Punches the day was made from. At validate hrms has not linked them yet,
	so they are found the way it found them: this person, this shift, a shift
	starting on this day, not set aside. Two presses a few seconds apart are
	one punch."""
	if getattr(doc, "_manna_punches", None) is not None:
		return doc._manna_punches
	on = getdate(doc.attendance_date)
	filters = {
		"employee": doc.employee,
		"skip_auto_attendance": 0,
		"shift_start": ["between", [on, add_days(on, 1)]],
	}
	if doc.shift:
		filters["shift"] = doc.shift
	times = sorted(frappe.get_all("Employee Checkin", filters=filters, pluck="time"))
	count, last = 0, None
	for t in times:
		if last is None or (t - last) > timedelta(minutes=3):
			count += 1
		last = t
	doc._manna_punches = count
	return count


def _is_holiday(employee, on):
	from erpnext.setup.doctype.employee.employee import is_holiday

	try:
		return bool(is_holiday(employee, on, raise_exception=False))
	except Exception:
		return False


# ------------------------------------------------------------- overtime ---


def on_attendance_submit(doc, method=None):
	"""Attendance · on_submit. The policy's overtime, as a pending row."""
	minutes = int(doc.get("custom_ot_minutes") or 0)
	try:
		_overtime(doc, minutes)
	except Exception:
		frappe.log_error(title="Overtime row not written: {0} {1}".format(doc.employee, doc.attendance_date))


def _overtime(doc, minutes):
	row = frappe.db.get_value(
		"Employee Overtime", {"employee": doc.employee, "ot_date": doc.attendance_date},
		["name", "status", "reason"], as_dict=True,
	)
	if row and row.status in ("Approved", "Rejected"):
		# Somebody decided this day. The decision stands; only the figure the
		# punches earned is kept beside it, for the report.
		frappe.db.set_value("Employee Overtime", row.name, "auto_hours", round(minutes / 60, 2), update_modified=False)
		return
	if not minutes:
		if row and (row.reason or "").startswith(OT_MARK):
			frappe.delete_doc("Employee Overtime", row.name, ignore_permissions=True)
		return
	hours = round(minutes / 60, 2)
	if row:
		frappe.db.set_value("Employee Overtime", row.name, {"hours": hours, "auto_hours": hours})
		return
	frappe.get_doc({
		"doctype": "Employee Overtime",
		"employee": doc.employee,
		"ot_date": doc.attendance_date,
		"hours": hours,
		"auto_hours": hours,
		"status": "Pending Approval",
		"reason": "{0} {1}.".format(OT_MARK, doc.get("custom_attendance_policy") or ""),
	}).insert(ignore_permissions=True)


# ----------------------------------------------------------- the month ---


def settle(today=None):
	"""Nightly: this month and last, for every person with a policy."""
	today = getdate(today or nowdate())
	for start in (get_first_day(add_days(get_first_day(today), -1)), get_first_day(today)):
		end = min(get_last_day(start), add_days(today, -1))
		if end < start:
			continue
		_settle_month(start, end)


def _settle_month(start, end):
	rows = frappe.get_all(
		"Attendance",
		filters={"docstatus": 1, "attendance_date": ["between", [start, end]],
		         "custom_attendance_policy": ["is", "set"]},
		fields=["name", "employee", "company", "attendance_date", "status", "leave_application",
		        "custom_attendance_policy", "custom_late_counted", "custom_early_counted", "custom_penalty"],
		order_by="employee, attendance_date",
		limit_page_length=0,
	)
	by_emp = {}
	for r in rows:
		by_emp.setdefault(r.employee, []).append(r)
	policies = {p.name: p for p in active_policies()}
	for employee, days in by_emp.items():
		policy = policies.get(days[-1].custom_attendance_policy)
		if not policy or freeze.submitted_for(days[-1].company, start):
			continue
		try:
			_settle_person(employee, days, policy)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title="Attendance policy month not settled: {0} {1}".format(employee, start))


def _settle_person(employee, days, policy):
	from manna_hr import reprocess_site

	plan = ap.month_plan([
		{"attendance_date": d.attendance_date, "late_counted": d.custom_late_counted,
		 "early_counted": d.custom_early_counted, "penalty": d.custom_penalty}
		for d in days
	], dict(policy))
	if plan["rebuild"]:
		# A penalty that moved: our own leave on those days goes first, or the
		# day is the leave's and cannot be rebuilt.
		for d in days:
			if getdate(d.attendance_date) in plan["rebuild"] and d.leave_application:
				_cancel_own_leave(d.leave_application)
		reprocess_site.run([employee], min(plan["rebuild"]), max(plan["rebuild"]), write=True,
		                   rebuild=plan["rebuild"])
		return  # the leave step runs on the rebuilt days tomorrow night
	if policy.casual_leave_type:
		for d in days:
			if ap.deduct_from(dict(policy), d.custom_penalty) != ap.DEDUCT_CL_FIRST:
				continue
			if d.custom_penalty and not d.leave_application and d.status in (ap.HALF_DAY, ap.ABSENT):
				# One day hrms refuses (no allocation, a holiday) never costs
				# the rest of the month its leave.
				frappe.db.savepoint("manna_cl")
				try:
					_take_from_casual_leave(employee, d, policy)
				except Exception:
					frappe.db.rollback(save_point="manna_cl")
					frappe.log_error(title="Penalty not taken from Casual Leave: {0} {1}".format(employee, d.attendance_date))


def _take_from_casual_leave(employee, day, policy):
	from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on

	from manna_hr.absencerule_site import _approver

	half = day.status == ap.HALF_DAY
	need = 0.5 if half else 1.0
	balance = get_leave_balance_on(employee, policy.casual_leave_type, day.attendance_date, for_consumption=True)
	if isinstance(balance, dict):
		balance = balance.get("leave_balance_for_consumption", balance.get("leave_balance", 0))
	if float(balance or 0) < need:
		return  # stays Leave Without Pay: the half or day is unpaid
	doc = frappe.get_doc({
		"doctype": "Leave Application",
		"employee": employee,
		"leave_type": policy.casual_leave_type,
		"from_date": day.attendance_date,
		"to_date": day.attendance_date,
		"half_day": 1 if half else 0,
		"half_day_date": day.attendance_date if half else None,
		"status": "Approved",
		"leave_approver": _approver(employee),
		"description": "{0}: {1} on {2}.".format(AUTO_MARK, day.custom_penalty, day.attendance_date),
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()


def _cancel_own_leave(name):
	doc = frappe.get_doc("Leave Application", name)
	if doc.docstatus != 1 or not (doc.description or "").startswith(AUTO_MARK):
		return  # somebody's own leave is never touched
	doc.flags.ignore_permissions = True
	doc.cancel()
