"""Late punches on a real site: hrms's shift job sets them aside, and we bring them back.

Not collected by the plain `pytest` run (no `test_` prefix): it needs a bench.

    bench --site att.localhost run-tests --module manna_hr.tests.bench_latepunch

The live site on 26 November 2026: Amal V P punched in at 08:21 on the 25th,
the day was made at 20:02 with no punch-out, and his 17:37 punch-out reached
the site at 08:33 the next morning — where hrms set it aside, because the day
was already made. Each scenario below is that, on its own person and day.

Background jobs run in line here (`_inline`), so a rebuild queued by a punch
has happened by the next line.
"""

import frappe
from frappe.tests import IntegrationTestCase

from manna_hr import latepunch, latepunch_site, reprocess_site
from manna_hr.tests.bench_phase0 import _employee, _holiday_list, _punch

SHIFT = "_T Late 08:30-17:00"
HOOK_INSERT = "manna_hr.latepunch_site.on_checkin_insert"
HOOK_GUARD = "manna_hr.adms_site.guard_last_sync"


def _shift():
	if not frappe.db.exists("Shift Type", SHIFT):
		frappe.get_doc({
			"doctype": "Shift Type", "name": SHIFT, "start_time": "08:30:00", "end_time": "17:00:00",
			"enable_auto_attendance": 1, "process_attendance_after": "2026-11-09",
			"last_sync_of_checkin": "2026-11-09 00:00:00",
			"determine_check_in_and_check_out": "Alternating entries as IN and OUT during the same shift",
			"working_hours_calculation_based_on": "First Check-in and Last Check-out",
			"begin_check_in_before_shift_start_time": 60, "allow_check_out_after_shift_end_time": 240,
			"holiday_list": _holiday_list(),
		}).insert()


def _close(until):
	"""Where the bridge, or advance_shifts, would have moved the shift to."""
	frappe.db.set_value("Shift Type", SHIFT, "last_sync_of_checkin", until, update_modified=False)


def _job():
	reprocess_site.process_shifts([SHIFT])


def _day(emp, on):
	return frappe.db.get_value(
		"Attendance", {"employee": emp, "attendance_date": on, "docstatus": 1},
		["name", "status", "in_time", "out_time"], as_dict=True,
	)


def _wire(doctype, event, method, on):
	"""Our hook on or off, in this process — on a bench that runs this app the
	hooks.py wiring is already there; off reproduces the site before the fix."""
	hooks = frappe.get_doc_hooks().setdefault(doctype, {}).setdefault(event, [])
	if on and method not in hooks:
		hooks.append(method)
	if not on and method in hooks:
		hooks.remove(method)


def _inline(method, **kwargs):
	for k in ("queue", "job_id", "deduplicate", "enqueue_after_commit", "timeout", "now", "at_front", "job_name"):
		kwargs.pop(k, None)
	return frappe.get_attr(method)(**kwargs)


class TestLatePunch(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Manna HR Settings", "trusted_device_prefix", "BIO-")
		_shift()
		cls._enqueue = frappe.enqueue
		frappe.enqueue = _inline

	@classmethod
	def tearDownClass(cls):
		frappe.enqueue = cls._enqueue
		_wire("Employee Checkin", "after_insert", HOOK_INSERT, True)
		_wire("Shift Type", "validate", HOOK_GUARD, True)
		super().tearDownClass()

	def setUp(self):
		frappe.set_user("Administrator")

	def test_hrms_sets_a_late_punch_out_aside_and_the_sweep_brings_it_back_into_its_day(self):
		_wire("Employee Checkin", "after_insert", HOOK_INSERT, False)
		emp = _employee("_T-LATE-SWEEP", shift=SHIFT).name
		_punch(emp, "2026-11-10 08:21:00")
		_close("2026-11-10 23:30:00")
		_job()
		made = _day(emp, "2026-11-10")
		self.assertTrue(made and not made.out_time)

		# The punch-out the machine sent the next morning.
		late = _punch(emp, "2026-11-10 17:37:00")
		_job()
		self.assertEqual(frappe.db.get_value("Employee Checkin", late.name, "skip_auto_attendance"), 1)
		said = frappe.get_all("Comment", filters={"reference_doctype": "Employee Checkin", "reference_name": late.name},
		                      pluck="content")
		self.assertTrue(any(latepunch.is_late_set_aside(c) for c in said), said)

		latepunch_site.sweep()
		self.assertEqual(frappe.db.get_value("Employee Checkin", late.name, "skip_auto_attendance"), 0)
		self.assertEqual(frappe.db.get_value("Attendance", made.name, "docstatus"), 2)
		again = _day(emp, "2026-11-10")
		self.assertEqual(str(again.out_time), "2026-11-10 17:37:00")
		self.assertEqual(frappe.db.get_value("Employee Checkin", late.name, "attendance"), again.name)

		# Released once: a second sweep leaves it as it is.
		latepunch_site.sweep()
		said = frappe.get_all("Comment", filters={"reference_doctype": "Employee Checkin", "reference_name": late.name},
		                      pluck="content")
		self.assertEqual(sum(1 for c in said if latepunch.is_release(c)), 1)

	def test_a_late_punch_out_rebuilds_its_day_as_it_arrives_and_is_never_set_aside(self):
		_wire("Employee Checkin", "after_insert", HOOK_INSERT, True)
		emp = _employee("_T-LATE-ARRIVE", shift=SHIFT).name
		_punch(emp, "2026-11-11 08:20:00")
		_close("2026-11-11 23:30:00")
		_job()
		made = _day(emp, "2026-11-11")
		self.assertTrue(made and not made.out_time)

		late = _punch(emp, "2026-11-11 17:40:00")
		_job()
		self.assertEqual(frappe.db.get_value("Employee Checkin", late.name, "skip_auto_attendance"), 0)
		again = _day(emp, "2026-11-11")
		self.assertEqual((str(again.in_time), str(again.out_time)), ("2026-11-11 08:20:00", "2026-11-11 17:40:00"))

	def test_punches_delivered_onto_days_already_marked_absent_make_those_days_present(self):
		# SIMODH: a month of punches waiting on his machine number, delivered
		# the day it was put right, onto days marked Absent.
		_wire("Employee Checkin", "after_insert", HOOK_INSERT, True)
		emp = _employee("_T-LATE-ABSENT", shift=SHIFT).name
		# hrms marks a day Absent only once the next day's shift has closed too.
		_close("2026-11-13 23:30:00")
		_job()
		self.assertEqual(_day(emp, "2026-11-12").status, "Absent")

		_punch(emp, "2026-11-12 08:15:00")
		_punch(emp, "2026-11-12 17:20:00")
		_job()
		day = _day(emp, "2026-11-12")
		self.assertEqual(day.status, "Present")
		self.assertEqual((str(day.in_time), str(day.out_time)), ("2026-11-12 08:15:00", "2026-11-12 17:20:00"))

	def test_a_bridge_cannot_close_a_shift_past_its_own_newest_punch(self):
		_wire("Shift Type", "validate", HOOK_GUARD, True)
		emp = _employee("_T-LATE-GUARD", shift=SHIFT).name
		_punch(emp, "2026-11-13 08:29:00")
		newest = str(frappe.db.sql("select max(time) from `tabEmployee Checkin` where shift = %s", SHIFT)[0][0])
		_close("2026-11-09 06:00:00")
		doc = frappe.get_doc("Shift Type", SHIFT)
		# What the old bridge at the Hi-Tech gate did: another plant's punch time.
		doc.last_sync_of_checkin = "2026-11-25 20:00:00"
		doc.save()
		self.assertEqual(str(frappe.db.get_value("Shift Type", SHIFT, "last_sync_of_checkin"))[:19], newest[:19])
