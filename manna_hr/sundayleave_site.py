"""Sunday leave, on the site: the hourly run.

The rule is `sundayleave.py`, pure. This reads each office employee's Casual
Leave allocations, the Sundays in them, and what those Sundays hold, and keeps
one Leave Adjustment per allocation carrying the total. hrms books the
adjustment's ledger entry; nothing here writes Attendance or an allocation.

Run before `absencerule_site.run` by `leaverules_site.run`, so a Sunday's
day is in the balance before Monday's absence asks for it.
"""

import frappe
from frappe.utils import getdate, nowdate

from manna_hr import absencerule_site
from manna_hr import sundayleave as sl


def run(today=None):
	"""Scheduler, hourly: every office employee's Casual Leave allocations."""
	# Off with the absence rule — absencerule.AUTO_LEAVE_RULES.
	if not absencerule_site.ar.AUTO_LEAVE_RULES:
		return
	today = getdate(today or nowdate())
	staff = {n: e for n, e in absencerule_site._covered().items() if sl.applies_to(e.designation)}
	if not staff:
		return
	allocations = frappe.get_all(
		"Leave Allocation",
		filters={"employee": ["in", list(staff)], "leave_type": sl.LEAVE_TYPE, "docstatus": 1},
		fields=["name", "employee", "from_date", "to_date", "leave_policy_assignment"],
		order_by="from_date asc",
	)
	allocations = [a for a in allocations if sl.counts(a)]
	# Every allocation is read, ended ones too, only to know each person's
	# first — which is the one that also takes the Sundays before it.
	first = {}
	for a in allocations:
		first.setdefault(a.employee, a.name)
	since = sl.still_open_since(today)
	calendar = _Calendar(staff)
	for a in allocations:
		if getdate(a.to_date) < since or getdate(a.from_date) > today:
			continue
		a.first = first[a.employee] == a.name
		a.company = staff[a.employee].company
		frappe.db.savepoint("sunday_leave")
		said = len(frappe.message_log)
		try:
			_allocation(a, today, calendar)
		except Exception:
			# One person's refusal is theirs; the rest of the office is still owed
			# its Sundays. The message frappe.throw left behind goes too, or the
			# next request that commits shows somebody else's red error.
			frappe.db.rollback(save_point="sunday_leave")
			del frappe.message_log[said:]
			frappe.log_error(frappe.get_traceback(), "Sunday leave: {0}".format(a.name))


class _Calendar:
	"""Holiday List Assignments and Holiday Lists, read once per run."""

	def __init__(self, staff):
		who = list(staff) + list({e.company for e in staff.values() if e.company})
		self.assignments = [
			(r.assigned_to, r.from_date, r.holiday_list)
			for r in frappe.get_all(
				"Holiday List Assignment",
				filters={"assigned_to": ["in", who], "docstatus": 1},
				fields=["assigned_to", "from_date", "holiday_list"],
			)
		]
		self.lists = {}

	def off(self, employee, company, day):
		name = sl.list_on(self.assignments, employee, company, day)
		if name and name not in self.lists:
			hl = frappe.db.get_value("Holiday List", name, ["from_date", "to_date"], as_dict=True)
			self.lists[name] = (
				(hl.from_date, hl.to_date, set(frappe.get_all("Holiday", filters={"parent": name}, pluck="holiday_date")))
				if hl else None
			)
		return sl.is_off(day, name, {k: v for k, v in self.lists.items() if v})


def _allocation(a, today, calendar):
	span = sl.window(a.from_date, a.to_date, today, a.first)
	days = [d for d in sl.sundays(*span) if calendar.off(a.employee, a.company, d)] if span else []

	status = {}
	punches = {}
	if days:
		for r in frappe.get_all(
			"Attendance",
			filters={"employee": a.employee, "docstatus": 1, "attendance_date": ["in", days]},
			fields=["attendance_date", "status"],
		):
			status[getdate(r.attendance_date)] = r.status
		for r in frappe.get_all(
			"Employee Checkin",
			filters={"employee": a.employee, "skip_auto_attendance": 0},
			or_filters=[["time", "between", [str(d) + " 00:00:00", str(d) + " 23:59:59"]] for d in days],
			fields=["time"],
		):
			punches.setdefault(getdate(r.time), set()).add(str(r.time)[:19])

	credits = {d: sl.credit(status.get(d), len(punches.get(d, ()))) for d in days}
	total, worked = sl.earned(credits)
	halves = [d for d in worked if credits[d] == 0.5]
	live = [
		(r.name, r.leaves_to_adjust, r.reason_for_adjustment)
		for r in frappe.get_all(
			"Leave Adjustment",
			filters={"leave_allocation": a.name, "docstatus": 1},
			fields=["name", "leaves_to_adjust", "reason_for_adjustment"],
		)
	]
	cancel, create, blocked = sl.plan(total, live, sl.reason(worked, halves) if worked else None)
	if blocked:
		# Said on the dashboard's Apply Leave, and here once in the bench log —
		# not an Error Log every hour for something only HR can settle.
		frappe.logger("manna_hr").info("Sunday leave: {0}: {1}".format(a.name, blocked))
		return

	for name in cancel:
		doc = frappe.get_doc("Leave Adjustment", name)
		if not sl.is_auto(doc.reason_for_adjustment):
			return
		doc.flags.ignore_permissions = True
		doc.cancel()
	if create:
		doc = frappe.get_doc(
			sl.adjustment(a.employee, a.name, create, worked, today, cancel[-1] if cancel else None, halves)
		)
		# The rule is HR's, applied by the scheduler as Administrator.
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()
