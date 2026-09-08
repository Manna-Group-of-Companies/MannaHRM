"""Which punches skip the geofence, and when silence is worth an alert."""

from datetime import datetime, timedelta

from manna_hr import rules


def test_a_device_id_carrying_the_prefix_is_a_machine():
	assert rules.device_is_trusted("BIO-K90-GATE1", "BIO-")


def test_anything_else_is_a_phone_and_gets_geofenced():
	assert not rules.device_is_trusted("android-9f2c", "BIO-")


def test_an_empty_prefix_trusts_nothing():
	# The failure that matters is a phone punch treated as a machine punch, so
	# a missing setting has to fail closed rather than open.
	assert not rules.device_is_trusted("BIO-K90", "")


def test_a_device_quiet_past_its_own_threshold_is_silent():
	now = datetime(2026, 9, 8, 9, 0)
	assert rules.device_is_silent(now - timedelta(hours=20), now, 12)


def test_a_device_inside_its_threshold_is_not():
	now = datetime(2026, 9, 8, 9, 0)
	assert not rules.device_is_silent(now - timedelta(hours=6), now, 12)


def test_a_threshold_of_zero_means_never_alert():
	# Right for a yard that works one shift a week.
	now = datetime(2026, 9, 8, 9, 0)
	assert not rules.device_is_silent(now - timedelta(days=6), now, 0)


def test_a_device_that_has_never_sent_anything_is_not_silent():
	# It is not commissioned. Alerting on it daily forever is how people learn
	# to ignore the alert.
	assert not rules.device_is_silent(None, datetime(2026, 9, 8, 9, 0), 12)
