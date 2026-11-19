"""The attendance policy (manna_hr/attpolicy.py), one employee scenario at a time.

The shift in most of them is Hi-Tech's production day, 08:30–17:00 (8.5 h),
and the night is 20:30–08:30. The numbers in POLICY are an example to test
against, not Manna's: those have to come from factoHR's own policy screen."""

import pytest

from manna_hr.attpolicy import (
	ABSENT, HALF_DAY, PRESENT, evaluate_day, month_plan, overtime_minutes, policy_problems,
	resolve, shift_settings, shift_window,
)

DAY = {"start_time": "08:30:00", "end_time": "17:00:00"}
NIGHT = {"start_time": "20:30:00", "end_time": "08:30:00"}
POLICY = {
	"full_day_hours": 8, "half_day_below_hours": 6, "absent_below_hours": 4,
	"break_minutes": 30, "break_after_hours": 6,
	"msp_status": HALF_DAY,
	"late_grace_minutes": 10, "late_half_day_after_minutes": 120,
	"late_forgiven_per_month": 3, "late_penalty_every": 1, "late_penalty_days": 0.5,
	"early_grace_minutes": 10, "early_forgiven_per_month": 3,
	"ot_enabled": 1, "ot_min_minutes": 30, "ot_round_minutes": 30, "ot_max_minutes": 240,
	"holiday_work": "Overtime",
}


def day(in_t="08:27", out_t="17:04", on="2026-11-03", hours=None, punches=2, status=PRESENT,
        prior_lates=0, prior_earlies=0, holiday=False, out_on=None):
	in_at = "{0} {1}:00".format(on, in_t) if in_t else None
	out_at = "{0} {1}:00".format(out_on or on, out_t) if out_t else None
	if hours is None and in_at and out_at:
		from datetime import datetime
		hours = (datetime.fromisoformat(out_at) - datetime.fromisoformat(in_at)).total_seconds() / 3600
	return {"attendance_date": on, "status": status, "working_hours": hours or 0, "in_time": in_at,
	        "out_time": out_at, "punches": punches, "prior_lates": prior_lates,
	        "prior_earlies": prior_earlies, "is_holiday": holiday}


# ---------------------------------------------------------------- nothing set --

def test_a_policy_with_nothing_set_leaves_the_day_as_hrms_made_it():
	got = evaluate_day({}, DAY, day("10:45", "13:00"))
	assert got["status"] == PRESENT and got["ot_minutes"] == 0 and got["notes"] == []
	# …but still measures it, so the reports have the minutes.
	assert got["late_minutes"] == 135


# ----------------------------------------------------------------- on time --

def test_on_time_and_a_full_day_is_present_with_the_break_taken_off():
	got = evaluate_day(POLICY, DAY, day("08:27", "17:04"))
	assert got["status"] == PRESENT
	assert got["late_minutes"] == 0 and got["early_minutes"] == 0
	assert got["net_hours"] == pytest.approx(8.12, abs=0.01)
	assert got["exceptions"] == []


def test_three_minutes_late_inside_the_grace_is_not_a_late():
	got = evaluate_day(POLICY, DAY, day("08:33", "17:04"))
	assert got["late_minutes"] == 3 and not got["late_counted"] and got["exceptions"] == []


def test_twenty_minutes_late_is_counted_but_costs_nothing_while_forgiven():
	got = evaluate_day(POLICY, DAY, day("08:50", "17:04", prior_lates=2))
	assert got["late_counted"] and got["status"] == PRESENT and got["penalty"] is None


def test_the_fourth_late_of_the_month_is_a_half_day():
	# factoHR's own example: three a month forgiven, the fourth costs a half day.
	got = evaluate_day(POLICY, DAY, day("08:50", "17:04", prior_lates=3))
	assert got["status"] == HALF_DAY and got["penalty"] == "late"
	assert got["half_day_status"] == "Absent"  # what payroll counts as half unpaid
	assert "4th late" in got["notes"][0]


def test_more_than_two_hours_late_is_a_half_day_and_not_also_a_counted_late():
	got = evaluate_day(POLICY, DAY, day("10:45", "17:30", prior_lates=3))
	assert got["status"] == HALF_DAY and not got["late_counted"] and got["penalty"] is None


def test_leaving_early_past_the_grace_is_counted():
	got = evaluate_day(POLICY, DAY, day("08:25", "16:30"))
	assert got["early_minutes"] == 30 and got["early_counted"]


# ------------------------------------------------------------------ hours --

def test_four_hours_worked_is_a_half_day_and_three_is_absent():
	assert evaluate_day(POLICY, DAY, day("08:25", "13:30"))["status"] == HALF_DAY
	assert evaluate_day(POLICY, DAY, day("08:25", "11:30"))["status"] == ABSENT


def test_hrms_half_day_on_gross_hours_becomes_present_on_the_policy_when_the_hours_are_enough():
	got = evaluate_day(POLICY, DAY, day("08:25", "16:55", status=HALF_DAY))
	assert got["status"] == PRESENT


def test_the_break_is_taken_only_off_a_day_long_enough_to_have_one():
	got = evaluate_day(POLICY, DAY, day("08:25", "12:25"))
	assert got["net_hours"] == pytest.approx(4.0)


# ----------------------------------------------------------- missed punch --

def test_a_single_punch_is_a_missed_punch_and_takes_the_policys_status():
	got = evaluate_day(POLICY, DAY, day("08:27", None, punches=1))
	assert got["missed_punch"] and got["status"] == HALF_DAY and "Missed punch" in got["exceptions"]


def test_a_single_punch_with_no_msp_rule_stays_as_hrms_decided():
	got = evaluate_day({}, DAY, day("08:27", None, punches=1))
	assert got["missed_punch"] and got["status"] == PRESENT


def test_three_punches_is_a_missed_punch_but_judged_on_its_hours():
	got = evaluate_day(POLICY, DAY, day("08:27", "17:04", punches=3))
	assert got["missed_punch"] and got["status"] == PRESENT


# ------------------------------------------------------------------ night --

def test_a_night_crossing_midnight_is_measured_against_the_morning_after():
	got = evaluate_day(POLICY, NIGHT, day("20:24", "08:35", out_on="2026-11-04"))
	assert got["late_minutes"] == 0 and got["early_minutes"] == 0
	assert got["status"] == PRESENT


def test_a_night_left_two_hours_early_is_counted_early():
	got = evaluate_day(POLICY, NIGHT, day("20:24", "06:30", out_on="2026-11-04"))
	assert got["early_minutes"] == 120 and got["early_counted"]


def test_the_window_of_a_night_ends_the_next_day():
	s, e = shift_window("2026-11-03", "20:30:00", "08:30:00")
	assert (s.day, e.day) == (3, 4)


# --------------------------------------------------------------- overtime --

def test_overtime_is_past_the_shift_rounded_down_and_capped():
	# 08:25 to 19:05, 10 h 40 m, less a 30 m break: 10 h 10 m against 8.5 h.
	got = evaluate_day(POLICY, DAY, day("08:25", "19:05"))
	assert got["ot_minutes"] == 90  # 100 minutes, rounded down to 90


def test_overtime_under_the_minimum_is_none():
	assert evaluate_day(POLICY, DAY, day("08:25", "17:20"))["ot_minutes"] == 0


def test_a_sunday_worked_is_all_overtime_when_the_policy_says_so():
	got = evaluate_day(POLICY, DAY, day("09:00", "13:00", holiday=True))
	assert got["ot_minutes"] == 240


def test_a_sunday_earns_nothing_by_default():
	assert overtime_minutes({"ot_enabled": 1}, None, 4.0, is_holiday=True) == 0


def test_a_half_day_earns_no_overtime():
	got = overtime_minutes(POLICY, shift_window("2026-11-03", "08:30", "17:00"), 10.0, status=HALF_DAY)
	assert got == 0


# ----------------------------------------------------------------- absent --

def test_an_absent_day_with_no_punches_is_only_named_absent():
	got = evaluate_day(POLICY, DAY, day(None, None, punches=0, status=ABSENT))
	assert got["status"] == ABSENT and got["exceptions"] == ["Absent"]


def test_a_day_on_leave_is_never_judged():
	got = evaluate_day(POLICY, DAY, day("08:50", "17:04", status="On Leave", prior_lates=9))
	assert got["status"] == "On Leave" and got["penalty"] is None


# ------------------------------------------------------------- the month --

def test_the_month_finds_a_penalty_that_should_move_after_a_late_was_corrected():
	# Late every day from the 2nd to the 7th: the 5th, 6th and 7th were the
	# 4th, 5th and 6th lates and were penalised. Then the 3rd's late was
	# corrected away, so the 5th is only the 3rd late now: its penalty goes.
	days = [
		{"attendance_date": "2026-11-0{0}".format(d), "late_counted": d != 3, "penalty": "late" if d >= 5 else None}
		for d in (2, 3, 4, 5, 6, 7)
	]
	plan = month_plan(days, POLICY)
	assert plan["lates"] == 5
	assert [str(d) for d in plan["rebuild"]] == ["2026-11-05"]


def test_a_month_as_the_policy_says_needs_nothing_rebuilt():
	days = [{"attendance_date": "2026-11-0{0}".format(d), "late_counted": 1, "penalty": "late" if d == 5 else None}
	        for d in (2, 3, 4, 5)]
	assert month_plan(days, POLICY)["rebuild"] == []


# ---------------------------------------------------------- which policy --

POLICIES = [
	{"name": "Group default", "is_default": 1, "scopes": []},
	{"name": "Hi-Tech", "company": "Hi-Tech Pretreads", "scopes": [{"applies_on": "Company", "value": "Hi-Tech Pretreads"}]},
	{"name": "Hi-Tech office", "scopes": [{"applies_on": "Department", "value": "Office - HPT"}]},
	{"name": "Night crew", "scopes": [{"applies_on": "Shift Type", "value": "Night"}]},
	{"name": "One person", "scopes": [{"applies_on": "Employee", "value": "HPT-012"}]},
]


def emp(**kw):
	base = {"name": "HPT-001", "company": "Hi-Tech Pretreads", "department": "Production - HPT", "designation": "Helper", "shift": "Day"}
	base.update(kw)
	return base


def test_the_most_specific_policy_wins():
	assert resolve(POLICIES, emp()) == "Hi-Tech"
	assert resolve(POLICIES, emp(department="Office - HPT")) == "Hi-Tech office"
	assert resolve(POLICIES, emp(shift="Night", department="Office - HPT")) == "Night crew"
	assert resolve(POLICIES, emp(name="HPT-012", shift="Night")) == "One person"


def test_a_company_policy_does_not_reach_another_company_and_the_default_catches_them():
	assert resolve(POLICIES, emp(company="Manna Treads")) == "Group default"


def test_with_no_default_nobody_matched_has_no_policy():
	assert resolve(POLICIES[1:], emp(company="Manna Treads")) is None


def test_a_tie_goes_to_priority_then_name_never_to_the_order_read():
	a = {"name": "B", "priority": 0, "scopes": [{"applies_on": "Department", "value": "X"}]}
	b = {"name": "A", "priority": 0, "scopes": [{"applies_on": "Department", "value": "X"}]}
	assert resolve([a, b], emp(department="X")) == resolve([b, a], emp(department="X")) == "A"
	a["priority"] = 5
	assert resolve([a, b], emp(department="X")) == "B"


# ------------------------------------------------------------- the shift --

def test_the_shift_takes_the_policys_thresholds_and_grace():
	got = shift_settings(POLICY)
	assert got["working_hours_threshold_for_half_day"] == 6
	assert got["working_hours_threshold_for_absent"] == 4
	assert got["late_entry_grace_period"] == 10 and got["enable_late_entry_marking"] == 1
	assert got["mark_auto_attendance_on_holidays"] == 1


def test_the_pairing_mode_is_set_only_when_the_policy_names_one():
	assert "determine_check_in_and_check_out" not in shift_settings(POLICY)
	mode = "Alternating entries as IN and OUT during the same shift"
	assert shift_settings({**POLICY, "check_in_out_mode": mode})["determine_check_in_and_check_out"] == mode


# ------------------------------------------------------------- problems --

def test_numbers_that_contradict_each_other_are_named():
	bad = {"half_day_below_hours": 4, "absent_below_hours": 6, "late_grace_minutes": 30,
	       "late_half_day_after_minutes": 20, "late_penalty_days": 0.75}
	got = " ".join(policy_problems(bad))
	assert "Absent below" in got and "half-day limit" in got and "half a day or a whole day" in got


def test_the_example_policy_is_consistent():
	assert policy_problems(POLICY) == []
