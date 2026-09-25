"""Casual Leave: one a month, carried forward. The values hrms is handed.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import leavepolicy as lp  # noqa: E402


def test_twelve_a_year_earned_monthly_is_one_a_month():
	assert lp.LEAVE_TYPE["is_earned_leave"] == 1
	assert lp.LEAVE_TYPE["earned_leave_frequency"] == "Monthly"
	assert lp.ANNUAL_ALLOCATION / 12 == 1


def test_the_policy_grants_the_type_it_defines():
	(row,) = lp.LEAVE_POLICY["leave_policy_details"]
	assert row["leave_type"] == lp.LEAVE_TYPE["leave_type_name"] == lp.LEAVE_TYPE_NAME
	assert row["annual_allocation"] == lp.ANNUAL_ALLOCATION


def test_unused_leave_carries_forward_with_no_cap():
	assert lp.LEAVE_TYPE["is_carry_forward"] == 1
	# 0 is hrms for unlimited. Anything else deletes days somebody earned.
	assert lp.LEAVE_TYPE["maximum_carry_forwarded_leaves"] == 0


def test_casual_leave_is_paid_and_never_goes_negative():
	assert lp.LEAVE_TYPE["is_lwp"] == 0
	assert lp.LEAVE_TYPE["allow_negative"] == 0


def test_the_calendar_leave_year_runs_january_to_december():
	assert lp.leave_year(2026) == (date(2026, 1, 1), date(2026, 12, 31))


def test_a_financial_leave_year_ends_the_last_day_of_march():
	assert lp.leave_year(2026, 4) == (date(2026, 4, 1), date(2027, 3, 31))


def test_a_leap_february_does_not_move_a_march_year_end():
	assert lp.leave_year(2027, 3) == (date(2027, 3, 1), date(2028, 2, 29))


def test_an_assignment_made_mid_year_starts_this_month_not_january():
	# A January start written in September is nine days handed out at once.
	assert lp.effective_from(date(2026, 1, 1), date(2026, 9, 24)) == date(2026, 9, 1)


def test_an_assignment_made_before_the_year_starts_on_its_first_day():
	assert lp.effective_from(date(2027, 1, 1), date(2026, 12, 20)) == date(2027, 1, 1)
	assert lp.effective_from(date(2027, 1, 1), date(2027, 1, 1)) == date(2027, 1, 1)


def test_a_site_row_that_already_matches_needs_nothing_written():
	row = dict(lp.LEAVE_TYPE, maximum_carry_forwarded_leaves=0.0, max_leaves_allowed=None)
	assert lp.differs(row) == {}


def test_a_plain_casual_leave_is_patched_only_where_it_differs():
	row = {"leave_type_name": "Casual Leave", "is_earned_leave": 0, "is_carry_forward": 0,
		"is_lwp": 0, "allow_negative": 0, "max_leaves_allowed": 0,
		"maximum_carry_forwarded_leaves": 0, "earned_leave_frequency": None,
		"allocate_on_day": None, "color": "#abc"}
	assert lp.differs(row) == {
		"is_earned_leave": 1,
		"earned_leave_frequency": "Monthly",
		"allocate_on_day": "First Day",
		"is_carry_forward": 1,
	}


def test_one_a_month_is_the_policy_already_on_the_site():
	assert lp.policy_title(1) == lp.POLICY_TITLE
	assert lp.leave_policy(1)["leave_policy_details"] == lp.LEAVE_POLICY["leave_policy_details"]


def test_two_a_month_is_a_policy_of_twenty_four_a_year():
	p = lp.leave_policy(2)
	assert p["title"] == "Manna Casual Leave — 2 a month"
	assert p["leave_policy_details"][0]["annual_allocation"] == 24


def test_a_half_day_rate_keeps_its_half_in_the_title():
	assert lp.policy_title(1.5) == "Manna Casual Leave — 1.5 a month"
	assert lp.leave_policy(1.5)["leave_policy_details"][0]["annual_allocation"] == 18


def test_zero_a_month_is_an_answer_not_a_mistake():
	assert lp.per_month_problem(0) is None


def test_a_rate_that_is_not_a_half_day_is_refused():
	assert lp.per_month_problem(1.25)
	assert lp.per_month_problem(-1)
	assert lp.per_month_problem("x")


def test_a_rate_past_the_ceiling_is_questioned():
	assert lp.per_month_problem(lp.MAX_PER_MONTH) is None
	assert lp.per_month_problem(10)


def test_another_leave_type_gets_a_policy_of_its_own_name():
	p = lp.leave_policy(1, "Sick Leave")
	assert p["title"] == "Manna Sick Leave — 1 a month"
	assert p["leave_policy_details"][0]["leave_type"] == "Sick Leave"


def test_a_type_is_monthly_only_when_earned_and_monthly():
	assert lp.is_monthly({"is_earned_leave": 1, "earned_leave_frequency": "Monthly"})
	assert not lp.is_monthly({"is_earned_leave": 1, "earned_leave_frequency": "Yearly"})
	assert not lp.is_monthly({"is_earned_leave": 0, "earned_leave_frequency": "Monthly"})
	assert not lp.is_monthly({})
