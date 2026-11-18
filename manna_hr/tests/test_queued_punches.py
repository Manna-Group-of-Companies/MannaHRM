"""A punch the phone kept while offline and sent later (rules.queued_punch_time)."""

from datetime import datetime, timedelta

from manna_hr import rules

NOW = datetime(2026, 11, 18, 14, 0, 0)


def test_a_device_id_ending_in_the_marker_is_a_queued_punch():
	assert rules.is_queued_device("PHONE-HR-EMP-00001-Q")
	assert not rules.is_queued_device("PHONE-HR-EMP-00001")
	assert not rules.is_queued_device(None)


def test_a_punch_made_this_morning_keeps_the_time_it_was_made():
	made = NOW - timedelta(hours=6)
	assert rules.queued_punch_time(made, NOW) == made


def test_a_punch_older_than_the_limit_is_not_believed():
	assert rules.queued_punch_time(NOW - timedelta(hours=49), NOW) is None
	assert rules.queued_punch_time(NOW - timedelta(hours=48), NOW) == NOW - timedelta(hours=48)


def test_a_time_in_the_future_is_not_believed_but_a_few_minutes_ahead_is_clipped_to_now():
	assert rules.queued_punch_time(NOW + timedelta(hours=3), NOW) is None
	assert rules.queued_punch_time(NOW + timedelta(minutes=3), NOW) == NOW


def test_a_punch_with_no_time_takes_now():
	assert rules.queued_punch_time(None, NOW) is None
