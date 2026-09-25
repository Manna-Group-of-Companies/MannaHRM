"""tools/assign_holiday_lists.py: which company gets which holiday list.

Holidays are paid days, so the rule worth pinning is that the tool decides
nothing — it copies each company's own default and refuses to guess one.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "tools"))

import assign_holiday_lists as ahl  # noqa: E402

LISTS = [{"name": "Manna Holidays 2026-27", "from_date": "2026-04-01", "to_date": "2027-03-31"}]


def test_a_company_is_assigned_the_list_it_already_names_from_the_day_that_list_starts():
	todo, skipped = ahl.plan([{"name": "Manna Treads", "default_holiday_list": "Manna Holidays 2026-27"}], LISTS, [])
	assert todo == [("Manna Treads", "Manna Holidays 2026-27", "2026-04-01")]
	assert skipped == []


def test_a_company_with_no_default_is_skipped_rather_than_given_a_guessed_list():
	todo, skipped = ahl.plan([{"name": "Manna Tyre UAE", "default_holiday_list": None}], LISTS, [])
	assert todo == []
	assert skipped[0][0] == "Manna Tyre UAE"


def test_a_company_already_assigned_that_list_is_left_alone_so_a_rerun_is_safe():
	todo, skipped = ahl.plan([{"name": "Manna Treads", "default_holiday_list": "Manna Holidays 2026-27"}], LISTS,
		[{"assigned_to": "Manna Treads", "holiday_list": "Manna Holidays 2026-27"}])
	assert todo == []
	assert "already assigned" in skipped[0][1]


def test_a_default_naming_a_list_the_site_does_not_hold_is_reported_not_sent():
	todo, skipped = ahl.plan([{"name": "Manna Treads", "default_holiday_list": "Old 2025"}], LISTS, [])
	assert todo == []
	assert "not a Holiday List" in skipped[0][1]
