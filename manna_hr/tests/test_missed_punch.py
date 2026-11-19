"""Missed punch alerts (tasks.flag_open_shifts, rules.shift_is_over)."""

from datetime import datetime

from manna_hr.rules import shift_is_over

NOW = datetime(2026, 11, 19, 6, 0)


def test_a_night_that_started_yesterday_is_still_running_at_six_in_the_morning():
	assert not shift_is_over("2026-11-18", "2026-11-19 08:30:00", NOW)


def test_a_day_shift_that_ended_yesterday_evening_is_over():
	assert shift_is_over("2026-11-18", "2026-11-18 17:00:00", NOW)


def test_a_punch_with_no_shift_is_judged_once_its_calendar_day_has_ended():
	assert shift_is_over("2026-11-18", None, NOW)
	assert not shift_is_over("2026-11-19", None, NOW)
