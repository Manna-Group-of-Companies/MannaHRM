"""Tests for the rules that need no site.

Each test states the rule in its name, the way the sales repo's suite does — a
test called `test_filter_works` teaches nothing when it fails at midnight, and
these are the rules somebody will be arguing about when it does.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import rules  # noqa: E402
from manna_hr import geo  # noqa: E402


# ----------------------------------------------------------- day statuses ---


def test_a_punch_beats_an_approved_leave_record():
	# Somebody who cancelled their leave and came in anyway must not be marked
	# on leave because the request was never withdrawn.
	assert (
		rules.resolve_day_status(
			has_punch_in=True,
			has_punch_out=True,
			leave_status="Approved",
			is_holiday=False,
			is_past_day=True,
		)
		== rules.PRESENT
	)


def test_one_punch_is_still_in_not_present():
	# An open shift has no measured end, so counting it as a full day would pay
	# somebody on the strength of a missing punch.
	assert (
		rules.resolve_day_status(
			has_punch_in=True,
			has_punch_out=False,
			leave_status=None,
			is_holiday=False,
			is_past_day=True,
		)
		== rules.ON_FLOOR
	)


def test_an_undecided_leave_request_is_not_time_off():
	# Treating it as leave would let unapproved absence disappear into the
	# leave column, which is exactly the number HR is chasing.
	assert (
		rules.resolve_day_status(
			has_punch_in=False,
			has_punch_out=False,
			leave_status="Open",
			is_holiday=False,
			is_past_day=True,
		)
		== rules.LEAVE_PENDING
	)


def test_a_rejected_request_explains_nothing():
	# Decided, and the answer was no. It must not sit in the pending column
	# looking like something still being handled.
	assert (
		rules.resolve_day_status(
			has_punch_in=False,
			has_punch_out=False,
			leave_status="Rejected",
			is_holiday=False,
			is_past_day=True,
		)
		== rules.ABSENT
	)


def test_a_holiday_is_nobodys_absence():
	assert (
		rules.resolve_day_status(
			has_punch_in=False,
			has_punch_out=False,
			leave_status=None,
			is_holiday=True,
			is_past_day=True,
		)
		== rules.HOLIDAY
	)


def test_today_is_unmarked_not_absent():
	# The rule that stops the whole group being marked absent at nine in the
	# morning, every morning.
	assert (
		rules.resolve_day_status(
			has_punch_in=False,
			has_punch_out=False,
			leave_status=None,
			is_holiday=False,
			is_past_day=False,
		)
		== rules.UNMARKED
	)


def test_absent_survives_only_when_nothing_else_explains_the_day():
	assert (
		rules.resolve_day_status(
			has_punch_in=False,
			has_punch_out=False,
			leave_status=None,
			is_holiday=False,
			is_past_day=True,
		)
		== rules.ABSENT
	)


def test_a_period_with_an_open_shift_is_not_payroll_ready():
	assert not rules.is_payroll_ready([rules.PRESENT, rules.ON_FLOOR, rules.ON_LEAVE])
	assert rules.is_payroll_ready([rules.PRESENT, rules.ON_LEAVE, rules.ABSENT])


# ----------------------------------------------------------- punch window ---


def test_the_window_includes_both_of_its_ends():
	opens, closes = rules.minute_of_day(5, 0), rules.minute_of_day(21, 30)
	assert rules.is_within_punch_window(opens, opens, closes)
	assert rules.is_within_punch_window(closes, opens, closes)
	assert not rules.is_within_punch_window(opens - 1, opens, closes)
	assert not rules.is_within_punch_window(closes + 1, opens, closes)


# ------------------------------------------------------------------- geo ---


def test_zero_zero_is_not_a_place():
	# (0, 0) is in the Atlantic and is what an unset Float field reads as. A
	# punch measured against it would be half a world from every gate.
	assert not geo.is_real_coordinate(0, 0)
	assert not geo.is_real_coordinate(None, None)
	assert not geo.is_real_coordinate(91, 0)
	assert geo.is_real_coordinate(9.9312, 76.2673)


def test_distance_between_two_known_points():
	# Kochi to Thrissur, about 70 km by air.
	metres = geo.metres_between(9.9312, 76.2673, 10.5276, 76.2144)
	assert 65_000 < metres < 72_000


def test_a_point_is_zero_metres_from_itself():
	assert geo.metres_between(9.9312, 76.2673, 9.9312, 76.2673) == 0.0


def test_antipodal_points_do_not_raise():
	# Rounding can push the haversine term a hair above 1, and asin(1.0000001)
	# raises. Clamped, so it does not.
	assert geo.metres_between(0, 0, 0, 180) > 0


def test_the_bounding_box_never_falls_inside_the_circle():
	# The box only pre-selects rows; the haversine then decides. A box a little
	# too big costs extra rows, a box too small silently drops a match — so the
	# only acceptable error is outwards.
	lat, lng, radius = 9.9312, 76.2673, 300.0
	min_lat, max_lat, min_lng, max_lng = geo.bounding_box(lat, lng, radius)

	assert geo.metres_between(lat, lng, max_lat, lng) >= radius
	assert geo.metres_between(lat, lng, min_lat, lng) >= radius
	assert geo.metres_between(lat, lng, lat, max_lng) >= radius
	assert geo.metres_between(lat, lng, lat, min_lng) >= radius


def test_nearest_skips_places_with_no_coordinate():
	class Place:
		def __init__(self, latitude, longitude):
			self.latitude = latitude
			self.longitude = longitude

	uncaptured = Place(0, 0)
	real = Place(9.9312, 76.2673)

	found = geo.nearest(9.9310, 76.2670, [uncaptured, real])
	assert found is not None
	assert found[0] is real


def test_nearest_returns_none_when_nothing_can_be_measured():
	# None means "cannot tell", not "too far". A caller that treats it as a
	# refusal strands every employee whose gate was never captured.
	assert geo.nearest(9.93, 76.26, []) is None


def test_distance_reads_the_way_a_person_would_say_it():
	assert geo.format_distance(240.4) == "240 m"
	assert geo.format_distance(2400) == "2.4 km"
