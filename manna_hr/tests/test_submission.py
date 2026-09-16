"""Submit Attendance — the monthly close, and the freeze that follows it.

The rules are in `rules.py` and are tested here without a site. The two tests
at the bottom read `hooks.py` and `freeze.py` as text, because both import
`frappe` and the decisions they pin are the ones somebody would undo without
knowing what it costs: that a punch is never refused, and that the refusal is
the one exception type hrms's shift job steps over instead of dying on.
"""

import ast
import io
import os
from datetime import date, datetime

from manna_hr import rules

APP = os.path.join(os.path.dirname(__file__), "..")


# ------------------------------------------------------------------ periods ---


def test_a_period_runs_to_the_real_last_day_not_the_31st():
	# A freeze to the 31st of September would claim the 1st of October.
	assert rules.period_bounds("2026-09") == (date(2026, 9, 1), date(2026, 9, 30))


def test_february_in_a_leap_year_has_29_days():
	assert rules.period_bounds("2028-02")[1] == date(2028, 2, 29)


def test_a_period_that_is_not_yyyy_mm_is_not_a_period():
	for bad in ("Aug-26", "2026-8", "2026-13", "2026-00", "", None, "2026-08-01"):
		assert rules.period_bounds(bad) is None, bad


def test_a_period_is_written_the_way_factor_hr_writes_it():
	assert rules.period_label("2026-08") == "Aug-26"


def test_a_malformed_period_is_refused_with_the_spelling_it_wants():
	assert "YYYY-MM" in rules.period_problem("Aug-26", date(2026, 9, 11))


def test_a_month_cannot_be_submitted_before_it_has_ended():
	# Freezing the 30th before anybody has worked it makes it an absence.
	problem = rules.period_problem("2026-09", date(2026, 9, 11))
	assert "has not ended" in problem
	assert "2026-09-30" in problem


def test_a_month_cannot_be_submitted_on_its_own_last_day():
	# The last day is still being worked. The night shift has not punched out.
	assert rules.period_problem("2026-08", date(2026, 8, 31))


def test_a_month_can_be_submitted_the_day_after_it_ends():
	assert rules.period_problem("2026-08", date(2026, 9, 1)) == ""


def test_the_server_clock_may_arrive_as_a_datetime_or_a_string():
	assert rules.period_problem("2026-08", datetime(2026, 9, 1, 0, 5)) == ""
	assert rules.period_problem("2026-08", "2026-09-01") == ""


def test_a_leave_across_a_month_end_is_in_both_months():
	assert rules.months_touched("2026-08-28", "2026-09-03") == ["2026-08", "2026-09"]


def test_the_months_run_forward_across_a_year_end():
	assert rules.months_touched(date(2026, 12, 30), date(2027, 1, 2)) == ["2026-12", "2027-01"]


def test_a_one_day_range_is_one_month():
	assert rules.months_touched("2026-08-15") == ["2026-08"]


# ------------------------------------------------------------------ figures ---


def test_the_figures_add_up_to_the_rows():
	rows = [
		{"employee": "E1", "status": "Present"},
		{"employee": "E1", "status": "Absent"},
		{"employee": "E2", "status": "Half Day"},
		{"employee": "E2", "status": "On Leave"},
		{"employee": "E3", "status": "Work From Home"},
	]
	got = rules.attendance_summary(rows)
	assert got["rows"] == 5
	assert got["employees"] == 3
	counted = sum(got[k] for k in ("present", "half_day", "absent", "on_leave", "work_from_home", "other"))
	assert counted == got["rows"]


def test_a_status_nobody_expected_is_counted_as_other_not_dropped():
	# A total that silently omits rows does not add up, and nobody can see why.
	got = rules.attendance_summary([{"employee": "E1", "status": "Comp Off"}])
	assert got["other"] == 1
	assert got["rows"] == 1


def test_an_empty_month_is_zeros_and_not_a_crash():
	got = rules.attendance_summary([])
	assert got["rows"] == 0 and got["employees"] == 0


# ----------------------------------------------------------------- blockers ---


def test_a_month_with_no_attendance_cannot_be_frozen():
	assert "freeze a month of nothing" in rules.submission_blockers(0)[0]


def test_an_open_correction_blocks_the_close():
	# It changes a day after the month was counted.
	out = rules.submission_blockers(120, open_corrections=1)
	assert len(out) == 1
	assert "1 attendance correction for this month is still open" in out[0]


def test_undecided_leave_blocks_the_close():
	# Once frozen, nobody could approve it — the leave would be lost as LOP.
	out = rules.submission_blockers(120, open_leave=2)
	assert "2 leave applications" in out[0]


def test_a_month_with_attendance_and_nothing_open_can_be_frozen():
	assert rules.submission_blockers(120, 0, 0) == []


def test_every_blocker_is_reported_at_once_not_one_per_attempt():
	assert len(rules.submission_blockers(0, 3, 4)) == 3


# ---------------------------------------------------------------- reopening ---


def test_a_month_salary_has_been_paid_from_stays_shut():
	problem = rules.reopen_problem(4)
	assert "4 submitted salary slips" in problem


def test_a_month_nobody_has_been_paid_from_can_be_reopened():
	assert rules.reopen_problem(0) == ""


def test_the_refusal_carries_the_submission_name_in_brackets():
	# `freeze.release_held_punches` finds the punches hrms set aside by this
	# exact bracketed name. Change the brackets and a reopened month keeps its
	# punches skipped forever.
	msg = rules.frozen_message("2026-08", "Manna Rubber", "HR-ATS-2026-00001", "attendance")
	assert "(HR-ATS-2026-00001)" in msg
	assert "Aug-26 is submitted for Manna Rubber" in msg


# -------------------------------------------------- the two design decisions ---


def _module(path):
	return ast.parse(io.open(os.path.join(APP, path), encoding="utf-8").read())


def _literal(path, name):
	for node in _module(path).body:
		if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == name:
			return ast.literal_eval(node.value)
	raise AssertionError("%s not found in %s" % (name, path))


def test_the_freeze_never_refuses_a_punch():
	"""A punch may be the last copy of it, and the bridge must never be told no.
	The freeze refuses the *day* a punch would make, and hrms keeps the punch."""
	events = _literal("hooks.py", "doc_events")
	for method in events.get("Employee Checkin", {}).values():
		assert "freeze" not in method, method


def test_every_door_into_a_month_is_guarded():
	events = _literal("hooks.py", "doc_events")
	assert events["Attendance"]["validate"] == "manna_hr.freeze.guard_attendance"
	assert events["Attendance"]["before_cancel"] == "manna_hr.freeze.guard_attendance_cancel"
	assert events["Leave Application"]["before_submit"] == "manna_hr.freeze.guard_leave"
	assert events["Leave Application"]["before_cancel"] == "manna_hr.freeze.guard_leave"
	assert events["Employee Attendance Regularization"]["validate"] == "manna_hr.freeze.guard_regularization"


def test_a_refusal_in_a_frozen_month_does_not_stop_the_shift_job():
	"""hrms's `mark_attendance` catches `DuplicateAttendanceError` and nothing
	else. Any other exception out of the absent-marking loop ends the run for
	every shift after it — everybody's attendance, group-wide."""
	for node in _module("freeze.py").body:
		if isinstance(node, ast.ClassDef) and node.name == "FrozenMonthError":
			assert [getattr(b, "id", "") for b in node.bases] == ["DuplicateAttendanceError"]
			return
	raise AssertionError("freeze.py has no FrozenMonthError")


def test_every_guard_raises_the_error_the_shift_job_steps_over():
	# `frappe.throw` defaults to a plain ValidationError. One `_refuse` that
	# forgot `exc=` would be the abort the class above exists to prevent.
	source = io.open(os.path.join(APP, "freeze.py"), encoding="utf-8").read()
	tree = _module("freeze.py")
	refuse = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_refuse")
	assert "exc=FrozenMonthError" in ast.get_source_segment(source, refuse)
	for fn in (n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name.startswith("guard_")):
		calls = [c.func.attr for c in ast.walk(fn) if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)]
		assert "throw" not in calls, "%s throws directly instead of through _refuse" % fn.name
