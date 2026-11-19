"""Phase 1 on a real site: the attendance policy, through hrms's own shift job.

    bench --site att.localhost run-tests --module manna_hr.tests.bench_phase1

The numbers are an example policy (manna_hr/tests/test_attpolicy.py POLICY),
not Manna's. Each scenario is one employee; days are in November 2026.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from manna_hr import attpolicy_site, reprocess_site
from manna_hr.install import CUSTOM_FIELDS
from manna_hr.tests.bench_phase0 import COMPANY, _employee, _holiday_list, _punch

SHIFT = "_T P1 Day 08:30-17:00"
NIGHT = "_T P1 Night 20:30-08:30"
POLICY_NAME = "_T Example Policy"
CL = "_T Casual Leave"


def _shift(name, start, end):
	if not frappe.db.exists("Shift Type", name):
		frappe.get_doc({
			"doctype": "Shift Type", "name": name, "start_time": start, "end_time": end,
			"enable_auto_attendance": 1, "process_attendance_after": "2026-10-31",
			"last_sync_of_checkin": "2026-11-18 23:00:00",
			"determine_check_in_and_check_out": "Alternating entries as IN and OUT during the same shift",
			"working_hours_calculation_based_on": "First Check-in and Last Check-out",
			"begin_check_in_before_shift_start_time": 60, "allow_check_out_after_shift_end_time": 240,
			"holiday_list": _holiday_list(),
		}).insert()


def _policy(**over):
	values = {
		"policy_name": POLICY_NAME, "is_active": 1, "company": COMPANY,
		"full_day_hours": 8, "half_day_below_hours": 6, "absent_below_hours": 4,
		"break_minutes": 30, "break_after_hours": 6, "msp_status": "Half Day",
		"late_grace_minutes": 10, "late_half_day_after_minutes": 120,
		"late_forgiven_per_month": 3, "late_penalty_every": 1, "late_penalty_days": "0.5",
		"early_grace_minutes": 10, "early_forgiven_per_month": 3,
		"ot_enabled": 1, "ot_min_minutes": 30, "ot_round_minutes": 30, "ot_max_minutes": 240,
		"holiday_work": "Overtime",
		"scopes": [{"applies_on": "Company", "value": COMPANY}],
		"shift_types": [{"shift_type": SHIFT}, {"shift_type": NIGHT}],
	}
	values.update(over)
	if frappe.db.exists("Manna Attendance Policy", POLICY_NAME):
		doc = frappe.get_doc("Manna Attendance Policy", POLICY_NAME)
		doc.scopes, doc.shift_types = [], []
		doc.update(values)
		doc.save()
	else:
		doc = frappe.get_doc({"doctype": "Manna Attendance Policy", **values}).insert()
	frappe.local.flags.manna_policies = None
	return doc


def _day(emp, on):
	return frappe.db.get_value(
		"Attendance", {"employee": emp, "attendance_date": on, "docstatus": 1},
		["name", "status", "half_day_status", "working_hours", "custom_late_minutes", "custom_early_minutes",
		 "custom_net_hours", "custom_ot_minutes", "custom_missed_punch", "custom_penalty", "custom_policy_note",
		 "custom_exceptions", "custom_attendance_policy", "leave_type"],
		as_dict=True,
	)


def _worked(emp, on, a, b=None):
	_punch(emp, "{0} {1}:00".format(on, a))
	if b:
		_punch(emp, "{0} {1}:00".format(on, b))


class TestPhase1(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
		frappe.db.set_single_value("Manna HR Settings", "trusted_device_prefix", "BIO-")
		_shift(SHIFT, "08:30:00", "17:00:00")
		_shift(NIGHT, "20:30:00", "08:30:00")
		_policy()
		# hrms 16 reads the weekly off from a Holiday List Assignment, as the
		# live site's companies have (manna_hr/holidayroll.py).
		if not frappe.db.exists("Holiday List Assignment", {"assigned_to": COMPANY, "docstatus": 1}):
			frappe.get_doc({"doctype": "Holiday List Assignment", "applicable_for": "Company",
			                "assigned_to": COMPANY, "holiday_list": _holiday_list(),
			                "from_date": "2026-01-01"}).submit()

	def run_job(self):
		frappe.local.flags.manna_policies = None
		reprocess_site.process_shifts([SHIFT, NIGHT])

	# ----------------------------------------------------------- the shift --

	def test_saving_the_policy_sets_its_shifts_thresholds_and_grace(self):
		row = frappe.db.get_value("Shift Type", SHIFT, ["working_hours_threshold_for_half_day",
		                                                "working_hours_threshold_for_absent",
		                                                "late_entry_grace_period", "enable_late_entry_marking"], as_dict=True)
		self.assertEqual((row.working_hours_threshold_for_half_day, row.working_hours_threshold_for_absent), (6, 4))
		self.assertEqual((row.late_entry_grace_period, row.enable_late_entry_marking), (10, 1))

	# ------------------------------------------------------------- the day --

	def test_on_time_is_present_with_the_break_off_and_no_exceptions(self):
		emp = _employee("_T-P1-ONTIME", shift=SHIFT).name
		_worked(emp, "2026-11-02", "08:27", "17:04")
		self.run_job()
		d = _day(emp, "2026-11-02")
		self.assertEqual(d.status, "Present")
		self.assertEqual(d.custom_attendance_policy, POLICY_NAME)
		self.assertAlmostEqual(d.custom_net_hours, 8.12, places=1)
		self.assertEqual((d.custom_late_minutes, d.custom_ot_minutes, d.custom_exceptions or ""), (0, 0, ""))

	def test_the_fourth_late_of_the_month_is_a_half_day_payroll_counts_as_half_absent(self):
		emp = _employee("_T-P1-LATE", shift=SHIFT).name
		for on in ("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"):
			_worked(emp, on, "08:50", "17:04")
		self.run_job()
		got = [_day(emp, on) for on in ("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05")]
		self.assertEqual([g.status for g in got], ["Present", "Present", "Present", "Half Day"])
		self.assertEqual(got[3].half_day_status, "Absent")
		self.assertEqual(got[3].custom_penalty, "late")
		self.assertIn("4th late", got[3].custom_policy_note)

	def test_a_single_punch_is_a_missed_punch_half_day(self):
		emp = _employee("_T-P1-MSP", shift=SHIFT).name
		_worked(emp, "2026-11-06", "08:27")
		self.run_job()
		d = _day(emp, "2026-11-06")
		self.assertEqual((d.status, d.custom_missed_punch), ("Half Day", 1))

	def test_four_hours_is_a_half_day_and_three_absent(self):
		emp = _employee("_T-P1-SHORT", shift=SHIFT).name
		_worked(emp, "2026-11-09", "08:25", "13:30")
		_worked(emp, "2026-11-10", "08:25", "11:30")
		self.run_job()
		self.assertEqual(_day(emp, "2026-11-09").status, "Half Day")
		self.assertEqual(_day(emp, "2026-11-10").status, "Absent")

	def test_a_long_day_makes_a_pending_overtime_row_at_the_policys_figure(self):
		emp = _employee("_T-P1-OT", shift=SHIFT).name
		_worked(emp, "2026-11-11", "08:25", "19:05")
		self.run_job()
		self.assertEqual(_day(emp, "2026-11-11").custom_ot_minutes, 90)
		ot = frappe.db.get_value("Employee Overtime", {"employee": emp, "ot_date": "2026-11-11"},
		                         ["status", "hours"], as_dict=True)
		self.assertEqual((ot.status, ot.hours), ("Pending Approval", 1.5))

	def test_a_night_crossing_midnight_is_one_day_on_the_day_it_started(self):
		emp = _employee("_T-P1-NIGHT", shift=NIGHT).name
		_punch(emp, "2026-11-12 20:24:00")
		_punch(emp, "2026-11-13 08:35:00")
		self.run_job()
		d = _day(emp, "2026-11-12")
		self.assertEqual((d.status, d.custom_late_minutes, d.custom_early_minutes), ("Present", 0, 0))
		# The 08:35 leaving is the 12th's: the 13th has no night worked, so
		# hrms marks it Absent with nothing in it — not a day made of that punch.
		after = _day(emp, "2026-11-13")
		self.assertTrue(after is None or (after.status == "Absent" and not after.working_hours))

	# ----------------------------------------------------------- the month --

	def test_a_corrected_late_moves_the_penalty_to_the_right_day(self):
		emp = _employee("_T-P1-MOVE", shift=SHIFT).name
		days = ("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06")
		for on in days:
			_worked(emp, on, "08:50", "17:04")
		self.run_job()
		self.assertEqual(_day(emp, "2026-11-05").custom_penalty, "late")
		# The 3rd's late was a machine fault: HR moves its arrival to 08:25.
		arrival = frappe.db.get_value("Employee Checkin", {"employee": emp, "time": "2026-11-03 08:50:00"}, "name")
		frappe.db.set_value("Employee Checkin", arrival, "skip_auto_attendance", 1)
		_punch(emp, "2026-11-03 08:25:00", device="REG-hr@test")
		reprocess_site.run([emp], "2026-11-03", "2026-11-03", scope="days", write=True)
		self.run_job()
		attpolicy_site.settle("2026-11-19")
		self.run_job()
		self.assertEqual(_day(emp, "2026-11-03").status, "Present")
		self.assertEqual(_day(emp, "2026-11-05").custom_penalty or "", "")
		self.assertEqual(_day(emp, "2026-11-06").custom_penalty, "late")

	def test_a_penalty_is_taken_from_casual_leave_while_there_is_some(self):
		if not frappe.db.exists("Leave Type", CL):
			frappe.get_doc({"doctype": "Leave Type", "leave_type_name": CL, "max_leaves_allowed": 12}).insert()
		_policy(penalty_deduct_from="Casual Leave, then Leave Without Pay", casual_leave_type=CL)
		try:
			emp = _employee("_T-P1-CL", shift=SHIFT)
			frappe.db.set_value("Employee", emp.name, "leave_approver", "Administrator")
			frappe.get_doc({"doctype": "Leave Allocation", "employee": emp.name, "leave_type": CL,
			                "from_date": "2026-01-01", "to_date": "2026-12-31", "new_leaves_allocated": 2}).submit()
			for on in ("2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"):
				_worked(emp.name, on, "08:50", "17:04")
			self.run_job()
			attpolicy_site.settle("2026-11-19")
			d = _day(emp.name, "2026-11-05")
			# hrms turned the penalty half into half a Casual Leave: paid.
			self.assertEqual((d.status, d.leave_type, d.half_day_status), ("Half Day", CL, "Present"))
		finally:
			_policy()


# ------------------------------------------------- factoHR's own numbers --


class TestFactohrPolicy(IntegrationTestCase):
	"""Manna General Attendance Policy as read off factoHR on 19 Nov 2026
	(docs/FACTOHR_SCREENS.md §8), for three people, through hrms's own job."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
		frappe.db.set_single_value("Manna HR Settings", "trusted_device_prefix", "BIO-")
		_shift(SHIFT, "08:30:00", "17:00:00")
		_shift(NIGHT, "20:30:00", "08:30:00")
		_policy()
		if not frappe.db.exists("Leave Type", CL):
			frappe.get_doc({"doctype": "Leave Type", "leave_type_name": CL, "max_leaves_allowed": 12}).insert()
		cls.people = {}
		for code in ("_T-FH-SHORT", "_T-FH-EARLY", "_T-FH-OT"):
			emp = _employee(code, shift=SHIFT)
			frappe.db.set_value("Employee", emp.name, "leave_approver", "Administrator")
			frappe.get_doc({"doctype": "Leave Allocation", "employee": emp.name, "leave_type": CL,
			                "from_date": "2026-01-01", "to_date": "2026-12-31", "new_leaves_allocated": 3}).submit()
			cls.people[code] = emp.name
		name = "_T factoHR General"
		if frappe.db.exists("Manna Attendance Policy", name):
			frappe.delete_doc("Manna Attendance Policy", name, force=1)
		frappe.get_doc({
			"doctype": "Manna Attendance Policy", "policy_name": name, "is_active": 1, "priority": 10,
			"company": COMPANY,
			"absent_upto_percent": 12, "half_day_upto_percent": 99, "msp_status": "Absent",
			"late_forgiven_per_month": 5, "late_penalty_every": 1, "late_penalty_days": "0.5",
			"early_half_day_after_minutes": 119,
			"penalty_deduct_from": "Casual Leave, then Leave Without Pay",
			"early_deduct_from": "Leave Without Pay",
			"hours_deduct_from": "Casual Leave, then Leave Without Pay",
			"casual_leave_type": CL,
			"ot_enabled": 1, "ot_basis": "Before the start and after the end", "ot_min_minutes": 30,
			"holiday_work": "Overtime",
			"scopes": [{"applies_on": "Employee", "value": v} for v in cls.people.values()],
		}).insert()
		frappe.local.flags.manna_policies = None
		# Every punch before any job runs: hrms marks a day with no punches
		# Absent, and punches that arrive after that are not looked at again
		# (the live site's November, and reprocess_site's reason to exist).
		_worked(cls.people["_T-FH-SHORT"], "2026-11-16", "08:40", "17:00")
		_worked(cls.people["_T-FH-EARLY"], "2026-11-16", "08:28", "14:55")
		_worked(cls.people["_T-FH-OT"], "2026-11-16", "08:00", "17:20")
		reprocess_site.process_shifts([SHIFT])
		attpolicy_site.settle("2026-11-19")

	def test_ten_minutes_short_is_a_half_day_taken_from_casual_leave(self):
		emp = self.people["_T-FH-SHORT"]
		d = _day(emp, "2026-11-16")
		self.assertEqual((d.status, d.leave_type, d.half_day_status), ("Half Day", CL, "Present"))

	def test_leaving_two_hours_early_is_short_hours_before_it_is_early_going(self):
		# Under 99% of the shift is a half day first, and factoHR ignores late and
		# early on such a day: so the half comes from Casual Leave, not Loss of
		# Pay. The early-going rule can only ever bite on a day the hours are met.
		d = _day(self.people["_T-FH-EARLY"], "2026-11-16")
		self.assertEqual((d.status, d.leave_type), ("Half Day", CL))

	def test_overtime_is_time_before_the_start_and_after_the_end(self):
		emp = self.people["_T-FH-OT"]
		self.assertEqual(_day(emp, "2026-11-16").custom_ot_minutes, 50)
		self.assertEqual(frappe.db.get_value("Employee Overtime", {"employee": emp, "ot_date": "2026-11-16"}, "hours"),
		                 round(50 / 60, 2))
