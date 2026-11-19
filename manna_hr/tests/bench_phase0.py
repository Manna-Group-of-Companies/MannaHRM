"""Phase 0 on a real site: hrms's shift job, our hooks, and the punches between.

Not collected by the plain `pytest` run (no `test_` prefix): it needs a bench.

    bench --site att.localhost run-tests --module manna_hr.tests.bench_phase0

Every scenario is one person and one shift made here, so the file needs nothing
on the site beyond erpnext, hrms and this app.
"""

from datetime import datetime, timedelta

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate

from manna_hr import reprocess_site
from manna_hr.checkin import DuplicatePunchError

COMPANY = "_Test Manna Company"
DAY = "_T Day 08:30-17:00"
NIGHT = "_T Night 20:30-08:30"
D = getdate("2026-11-03")


def _company():
	if not frappe.db.exists("Company", COMPANY):
		frappe.get_doc({
			"doctype": "Company", "company_name": COMPANY, "abbr": "_TMC",
			"default_currency": "INR", "country": "India",
		}).insert()
	return COMPANY


def _holiday_list():
	name = "_T Holidays 2026"
	if not frappe.db.exists("Holiday List", name):
		frappe.get_doc({
			"doctype": "Holiday List", "holiday_list_name": name,
			"from_date": "2026-01-01", "to_date": "2026-12-31",
		}).insert()
	return name


def _shift(name, start, end):
	if frappe.db.exists("Shift Type", name):
		return name
	frappe.get_doc({
		"doctype": "Shift Type", "name": name, "start_time": start, "end_time": end,
		"enable_auto_attendance": 1, "process_attendance_after": "2026-10-01",
		"last_sync_of_checkin": "2026-11-30 00:00:00",
		"determine_check_in_and_check_out": "Alternating entries as IN and OUT during the same shift",
		"working_hours_calculation_based_on": "First Check-in and Last Check-out",
		"begin_check_in_before_shift_start_time": 60, "allow_check_out_after_shift_end_time": 240,
		"holiday_list": _holiday_list(),
	}).insert()
	return name


def _employee(code, shift=None, user=None):
	doc = frappe.get_doc({
		"doctype": "Employee", "first_name": code, "employee_name": code,
		"company": _company(), "gender": "Male", "date_of_birth": "1990-01-01",
		"date_of_joining": "2026-01-01", "status": "Active", "default_shift": shift,
		"holiday_list": _holiday_list(), "user_id": user,
	})
	doc.insert()
	return doc


def _punch(emp, at, device="BIO-T1", log_type=None):
	return frappe.get_doc({
		"doctype": "Employee Checkin", "employee": emp, "time": at,
		"device_id": device, **({"log_type": log_type} if log_type else {}),
	}).insert()


class TestPhase0(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Manna HR Settings", "trusted_device_prefix", "BIO-")
		_shift(DAY, "08:30:00", "17:00:00")
		_shift(NIGHT, "20:30:00", "08:30:00")

	# ------------------------------------------------------------ reprocess --

	def test_a_shift_given_after_the_punches_turns_the_absent_day_present(self):
		emp = _employee("_T-REPRO")
		a = _punch(emp.name, "2026-11-03 08:27:00")
		b = _punch(emp.name, "2026-11-03 17:04:00")
		self.assertEqual(frappe.db.get_value("Employee Checkin", a.name, "offshift"), 1)
		# What hrms did on the live site: nobody had a shift, so the day was marked Absent.
		absent = frappe.get_doc({"doctype": "Attendance", "employee": emp.name, "attendance_date": D,
		                         "status": "Absent", "company": COMPANY}).submit()

		frappe.db.set_value("Employee", emp.name, "default_shift", DAY)
		preview = reprocess_site.run([emp.name], D, D, write=False)
		self.assertEqual(preview["cancelled"], 1)
		self.assertEqual(frappe.db.get_value("Attendance", absent.name, "docstatus"), 1)

		reprocess_site.run([emp.name], D, D, write=True)
		self.assertEqual(frappe.db.get_value("Attendance", absent.name, "docstatus"), 2)
		self.assertEqual(frappe.db.get_value("Employee Checkin", b.name, "shift"), DAY)

		reprocess_site.process_shifts([DAY])
		status = frappe.db.get_value("Attendance", {"employee": emp.name, "attendance_date": D, "docstatus": 1}, "status")
		self.assertEqual(status, "Present")

	def test_a_day_from_leave_is_left_alone(self):
		emp = _employee("_T-LEAVE", shift=DAY)
		_punch(emp.name, "2026-11-04 08:27:00")
		row = frappe.get_doc({"doctype": "Attendance", "employee": emp.name, "attendance_date": "2026-11-04",
		                      "status": "On Leave", "company": COMPANY, "leave_type": "Leave Without Pay"})
		row.flags.ignore_validate = True
		row.submit()
		out = reprocess_site.run([emp.name], "2026-11-04", "2026-11-04", scope="all", write=True)
		self.assertEqual(out["cancelled"], 0)
		self.assertEqual(frappe.db.get_value("Attendance", row.name, "docstatus"), 1)

	# ----------------------------------------------------------- duplicates --

	def test_the_same_second_twice_is_refused_whatever_the_direction(self):
		emp = _employee("_T-DUP", shift=DAY)
		_punch(emp.name, "2026-11-05 08:27:00", log_type="IN")
		with self.assertRaises(DuplicatePunchError):
			_punch(emp.name, "2026-11-05 08:27:00")

	# -------------------------------------------------------------- spoofing --

	def test_an_employee_login_cannot_pass_its_punch_off_as_a_machines(self):
		user = "_t-phone@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc({"doctype": "User", "email": user, "first_name": "Phone",
			                "roles": [{"role": "Employee"}]}).insert(ignore_permissions=True)
		emp = _employee("_T-PHONE", shift=DAY, user=user)
		other = _employee("_T-OTHER", shift=DAY)
		frappe.set_user(user)
		try:
			doc = frappe.get_doc({"doctype": "Employee Checkin", "employee": emp.name,
			                      "time": "2026-11-01 08:00:00", "device_id": "BIO-FAKE"})
			doc.insert(ignore_permissions=True)
			self.assertEqual(doc.custom_source, "mobile")
			# The server clock, not the back-dated time it asked for.
			self.assertGreater(doc.time if isinstance(doc.time, datetime) else datetime.fromisoformat(str(doc.time)),
			                   datetime.now() - timedelta(minutes=5))
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc({"doctype": "Employee Checkin", "employee": other.name,
				                "time": "2026-11-01 08:00:00", "device_id": "BIO-FAKE"}).insert(ignore_permissions=True)
		finally:
			frappe.set_user("Administrator")

	# ---------------------------------------------------------------- night --

	def test_an_evening_arrival_after_a_rest_gives_the_night_shift_with_no_key(self):
		frappe.db.set_value("Shift Type", DAY, "custom_night_shift", NIGHT)
		emp = _employee("_T-NIGHT", shift=DAY)
		for d in range(9, 14):  # a week of days, no key on any punch
			_punch(emp.name, "2026-11-{0:02d} 08:27:00".format(d))
			_punch(emp.name, "2026-11-{0:02d} 20:32:00".format(d))
		# Sunday off, then Monday evening.
		evening = _punch(emp.name, "2026-11-16 20:24:00")
		morning = _punch(emp.name, "2026-11-17 08:35:00")
		self.assertEqual(frappe.db.get_value("Employee Checkin", evening.name, "shift"), NIGHT)
		self.assertEqual(frappe.db.get_value("Employee Checkin", morning.name, "shift"), NIGHT)
		self.assertEqual(
			getdate(frappe.db.get_value("Employee Checkin", morning.name, "shift_start")), getdate("2026-11-16")
		)

	# -------------------------------------------------- settling duplicates --

	def test_duplicates_already_on_the_site_are_set_aside_and_their_day_rebuilt(self):
		from manna_hr import dedupe_site

		emp = _employee("_T-OLDDUP", shift=DAY)
		first = _punch(emp.name, "2026-11-06 08:27:00")
		# How the live site got them: written past the check (before it existed).
		twin = frappe.get_doc({"doctype": "Employee Checkin", "employee": emp.name,
		                       "time": "2026-11-06 08:27:00", "device_id": "BIO-T2", "shift": DAY,
		                       "offshift": 0, "shift_start": "2026-11-06 08:30:00"})
		twin.db_insert()
		_punch(emp.name, "2026-11-06 17:03:00")
		reprocess_site.process_shifts([DAY])

		got = dedupe_site.preview("2026-11-06", "2026-11-06", employee=emp.name)
		self.assertEqual((got["punches_doubled"], got["copies_to_set_aside"]), (1, 1))
		dedupe_site.apply("2026-11-06", "2026-11-06", employee=emp.name)
		skipped = {n: frappe.db.get_value("Employee Checkin", n, "skip_auto_attendance") for n in (first.name, twin.name)}
		self.assertEqual(sorted(skipped.values()), [0, 1])
		self.assertTrue(frappe.db.exists("Employee Checkin", twin.name))  # set aside, never deleted

	# ------------------------------------------- a shift's settings changed --

	def test_a_strict_shift_with_unkeyed_punches_is_fixed_by_the_setting_and_a_rebuild_of_every_day(self):
		strict = "_T Strict 08:30-17:00"
		_shift(strict, "08:30:00", "17:00:00")
		frappe.db.set_value("Shift Type", strict, "determine_check_in_and_check_out",
		                    "Strictly based on Log Type in Employee Checkin")
		emp = _employee("_T-STRICT", shift=strict)
		_punch(emp.name, "2026-11-07 08:27:00")
		_punch(emp.name, "2026-11-07 17:05:00")
		reprocess_site.process_shifts([strict])
		before = frappe.db.get_value("Attendance", {"employee": emp.name, "attendance_date": "2026-11-07", "docstatus": 1},
		                             ["status", "working_hours"], as_dict=True)

		frappe.db.set_value("Shift Type", strict, "determine_check_in_and_check_out",
		                    "Alternating entries as IN and OUT during the same shift")
		out = reprocess_site.run([emp.name], "2026-11-07", "2026-11-07", scope="days", write=True)
		reprocess_site.process_shifts([strict])
		after = frappe.db.get_value("Attendance", {"employee": emp.name, "attendance_date": "2026-11-07", "docstatus": 1},
		                            ["status", "working_hours"], as_dict=True)
		# What the live site shows for Hi-Tech, and what it should.
		print("strict before:", before, "after:", after, "cancelled:", out["cancelled"])
		self.assertTrue(after and after.working_hours > 8)
