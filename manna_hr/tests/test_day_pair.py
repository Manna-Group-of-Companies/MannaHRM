"""The day's in and out: its first punch and its last, whatever key was pressed.

The same rule as the dashboard's `dayPunches` (client/src/lib/roster.js) and the
phone app's `pair`. The punches are HRI-053's, read off the site for November
2026, where the gate recorded the evening leaving as IN on four days.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr.rules import day_pair  # noqa: E402


def at(text):
	return datetime.strptime(text, "%Y-%m-%d %H:%M:%S")


def test_a_leaving_punched_with_the_in_key_is_still_the_days_out():
	day = [(at("2026-11-03 18:02:21"), "IN"), (at("2026-11-03 08:25:39"), "IN")]
	assert day_pair(day) == (at("2026-11-03 08:25:39"), at("2026-11-03 18:02:21"))


def test_an_arrival_punched_with_the_out_key_is_still_the_days_in():
	day = [(at("2026-11-03 08:25:00"), "OUT"), (at("2026-11-03 18:02:00"), "OUT")]
	assert day_pair(day) == (at("2026-11-03 08:25:00"), at("2026-11-03 18:02:00"))


def test_an_in_pressed_just_before_the_out_does_not_move_the_out_earlier():
	day = [(at("2026-11-10 08:25:18"), "IN"), (at("2026-11-10 18:03:33"), "IN"), (at("2026-11-10 18:04:07"), "OUT")]
	assert day_pair(day) == (at("2026-11-10 08:25:18"), at("2026-11-10 18:04:07"))


def test_two_punches_minutes_apart_are_one_finger_read_twice_not_a_day():
	day = [(at("2026-11-03 08:25:00"), "IN"), (at("2026-11-03 08:28:00"), "OUT")]
	assert day_pair(day) == (at("2026-11-03 08:25:00"), None)


def test_a_lone_out_stays_a_leaving_with_its_arrival_missing():
	assert day_pair([(at("2026-11-04 08:29:00"), "OUT")]) == (None, at("2026-11-04 08:29:00"))


def test_a_gate_that_sends_no_key_is_paired_the_same_way():
	day = [(at("2026-11-03 08:29:00"), None), (at("2026-11-03 17:31:00"), None)]
	assert day_pair(day) == (at("2026-11-03 08:29:00"), at("2026-11-03 17:31:00"))


def test_a_day_with_no_punches_has_neither_side():
	assert day_pair([]) == (None, None)
