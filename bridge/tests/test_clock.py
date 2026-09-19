"""Keeping a machine's clock on the site's, without hiding punches doing it.

No machine and no site: a fake device records what would have been written, and
the queue is a real one in a temp file, because the rule that matters most is
about the cursor and not about the clock.
"""

from datetime import datetime, timedelta

import pytest

from mannabridge import clock
from mannabridge.main import keep_clocks
from mannabridge.queue import PunchQueue

SITE = datetime(2026, 9, 19, 8, 40, 0)


class FakeDevice:
	def __init__(self, name, machine_time, fails=False):
		self.name = name
		self._time = machine_time
		self._fails = fails
		self.written = []

	def clock(self):
		if self._fails:
			raise OSError("the machine did not answer")
		return self._time

	def set_clock(self, when):
		self.written.append(when)
		self._time = when
		return when


# --- the decision -----------------------------------------------------------


def test_a_clock_a_few_seconds_out_is_left_alone():
	# Writing the clock every pass would be a write nobody asked for, five
	# minutes apart, for ever.
	action, _ = clock.decide(SITE + timedelta(seconds=20), SITE)
	assert action == "leave"


def test_the_drift_that_was_actually_found_is_corrected():
	# BIO-MRP-GATE1, 19 September 2026: 7m43s slow, three years in, and nothing
	# in the system had noticed.
	action, drift = clock.decide(SITE - timedelta(seconds=463), SITE)
	assert action == "set"
	assert round(drift) == -463


def test_a_clock_a_day_out_is_shouted_about_rather_than_moved():
	# A machine that far out has had its battery changed or its date typed in
	# wrong, and quietly moving it could hide months of punches at a wrong date.
	action, _ = clock.decide(SITE - timedelta(days=1), SITE)
	assert action == "refuse"


# --- the cursor, which is the dangerous half --------------------------------


def test_setting_a_clock_back_moves_the_cursor_back_with_it():
	# The bridge reads what is newer than its cursor. Without this, the next
	# eight minutes of punches are read, judged old, and never sent.
	assert clock.rewound_cursor("2026-09-19 08:39:00", 463) == "2026-09-19 08:30:17"


def test_setting_a_clock_forward_leaves_the_cursor_alone():
	# Nothing is reused, so nothing can be skipped.
	assert clock.rewound_cursor("2026-09-19 08:39:00", -463) == "2026-09-19 08:39:00"


def test_a_machine_with_no_cursor_yet_needs_none():
	assert clock.rewound_cursor(None, 463) is None


# --- the pass ---------------------------------------------------------------


def queue_at(tmp_path, cursor):
	q = PunchQueue(str(tmp_path / "punches.sqlite3"))
	q.set_last_seen("BIO-TEST-GATE", cursor)
	return q


def test_a_slow_machine_is_set_and_the_cursor_is_not_touched(tmp_path):
	q = queue_at(tmp_path, "2026-09-19 08:30:00")
	device = FakeDevice("BIO-TEST-GATE", SITE - timedelta(seconds=463))
	assert keep_clocks([device], q, SITE) == 1
	assert device.written == [SITE]
	assert q.last_seen("BIO-TEST-GATE") == "2026-09-19 08:30:00"


def test_a_fast_machine_has_its_cursor_moved_back_before_the_clock(tmp_path):
	q = queue_at(tmp_path, "2026-09-19 08:39:00")
	device = FakeDevice("BIO-TEST-GATE", SITE + timedelta(seconds=463))
	keep_clocks([device], q, SITE)
	assert q.last_seen("BIO-TEST-GATE") == "2026-09-19 08:30:17"
	assert device.written == [SITE]


def test_nothing_is_written_when_the_site_clock_could_not_be_read(tmp_path):
	# This PC's clock is only as right as whoever set it, and the site's is what
	# judges the punch.
	device = FakeDevice("BIO-TEST-GATE", SITE - timedelta(hours=1))
	assert keep_clocks([device], queue_at(tmp_path, "2026-09-19 08:30:00"), None) == 0
	assert device.written == []


def test_a_machine_that_will_not_answer_does_not_stop_the_others(tmp_path):
	q = queue_at(tmp_path, "2026-09-19 08:30:00")
	dead = FakeDevice("BIO-DEAD", SITE, fails=True)
	alive = FakeDevice("BIO-TEST-GATE", SITE - timedelta(seconds=463))
	assert keep_clocks([dead, alive], q, SITE) == 1
	assert alive.written == [SITE]
