"""Sunday leave: each Sunday an office employee works adds a day of Casual Leave.

Run without a bench:

    python -m pytest manna_hr/tests -q
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from manna_hr import sundayleave as sl  # noqa: E402

OCT = lambda d: date(2026, 10, d)  # noqa: E731


def test_a_sunday_with_an_in_and_an_out_earns_a_day():
	assert sl.credit(None, 2) == 1


def test_a_single_punch_is_not_a_sunday_worked():
	assert sl.credit(None, 1) == 0
	assert sl.credit(None, 0) == 0


def test_attendance_decides_when_the_site_has_marked_the_sunday():
	assert sl.credit("Present", 0) == 1
	assert sl.credit("Half Day", 5) == 0.5
	assert sl.credit("Absent", 4) == 0


def test_the_days_added_are_the_number_of_sundays_worked():
	total, worked = sl.earned({OCT(4): 1, OCT(11): 0, OCT(18): 1})
	assert total == 2
	assert worked == [OCT(4), OCT(18)]


def test_only_sundays_on_the_holiday_list_count():
	assert sl.sundays(OCT(1), OCT(31), holidays=[OCT(2), OCT(4), OCT(18)]) == [OCT(4), OCT(18)]


def test_every_sunday_counts_when_the_holiday_list_cannot_be_read():
	assert sl.sundays(OCT(1), OCT(31)) == [OCT(4), OCT(11), OCT(18), OCT(25)]


def test_sundays_before_the_rule_began_earn_nothing():
	assert sl.window(date(2026, 1, 1), date(2026, 12, 31), OCT(20)) == (date(2026, 9, 1), OCT(20))
	assert sl.window(date(2026, 1, 1), date(2026, 8, 31), OCT(20)) is None


def test_september_sundays_go_into_the_first_allocation_even_though_it_starts_in_october():
	assert sl.window(OCT(1), date(2026, 12, 31), OCT(20), first=True) == (date(2026, 9, 1), OCT(20))
	assert sl.sundays(*sl.window(OCT(1), date(2026, 12, 31), OCT(3), first=True)) == [
		date(2026, 9, 6), date(2026, 9, 13), date(2026, 9, 20), date(2026, 9, 27)]


def test_a_later_allocation_does_not_reach_back_past_its_own_start():
	assert sl.window(date(2027, 1, 1), date(2027, 12, 31), date(2027, 1, 20)) == (date(2027, 1, 1), date(2027, 1, 20))


def test_a_sunday_still_to_come_is_not_counted():
	assert sl.window(OCT(1), date(2026, 12, 31), OCT(3)) == (OCT(1), OCT(3))
	assert sl.sundays(OCT(1), OCT(3)) == []


def test_a_half_day_sunday_is_said_as_one_in_the_reason():
	assert sl.reason([OCT(4), OCT(11)], halves=[OCT(11)]) == (
		"[Sunday leave] Casual Leave for 2 Sundays worked: 04-Oct-2026, 11-Oct-2026 (half day).")


def test_the_first_sunday_worked_creates_the_adjustment():
	assert sl.plan(1, []) == ([], 1, None)


def test_a_further_sunday_replaces_the_adjustment_with_the_new_total():
	live = [("LAD-1", 1, sl.reason([OCT(4)]))]
	assert sl.plan(2, live, sl.reason([OCT(4), OCT(11)])) == (["LAD-1"], 2, None)


def test_nothing_changes_when_the_total_and_the_sundays_agree():
	live = [("LAD-1", 2.0, sl.reason([OCT(4), OCT(11)]))]
	assert sl.plan(2, live, sl.reason([OCT(4), OCT(11)])) == ([], None, None)


def test_a_sunday_that_no_longer_counts_takes_its_day_back():
	live = [("LAD-1", 2, sl.reason([OCT(4), OCT(11)]))]
	assert sl.plan(1, live, sl.reason([OCT(4)])) == (["LAD-1"], 1, None)
	assert sl.plan(0, [("LAD-1", 1, sl.reason([OCT(4)]))]) == (["LAD-1"], None, None)


def test_an_adjustment_hr_made_is_never_cancelled_and_blocks_the_rule():
	cancel, create, blocked = sl.plan(1, [("LAD-HR", 3, "Opening balance from Factor HR")])
	assert (cancel, create) == ([], None)
	assert "LAD-HR" in blocked


def test_no_sunday_worked_and_no_adjustment_is_nothing_to_do():
	assert sl.plan(0, []) == ([], None, None)


def test_the_adjustment_allocates_the_total_to_casual_leave_and_names_the_sundays():
	doc = sl.adjustment("HR-EMP-1", "HR-LAL-1", 2, [OCT(4), OCT(11)], OCT(12), amended_from="LAD-1")
	assert doc["doctype"] == "Leave Adjustment"
	assert doc["leave_type"] == "Casual Leave"
	assert doc["adjustment_type"] == "Allocate"
	assert doc["leaves_to_adjust"] == 2
	assert doc["leave_allocation"] == "HR-LAL-1"
	assert doc["amended_from"] == "LAD-1"
	assert doc["reason_for_adjustment"] == "[Sunday leave] Casual Leave for 2 Sundays worked: 04-Oct-2026, 11-Oct-2026."
	assert sl.is_auto(doc["reason_for_adjustment"])


def test_only_office_staff_earn_it():
	assert sl.applies_to("PRODUCTION MANAGER")
	assert not sl.applies_to("DRIVER")
	assert not sl.applies_to("WELDER")


def test_an_allocation_that_ended_last_month_is_still_looked_at_for_a_late_correction():
	assert sl.still_open_since(date(2027, 1, 15)) == date(2026, 12, 15)
	assert sl.still_open_since(OCT(3)) == date(2026, 9, 2)
	assert sl.still_open_since(date(2026, 9, 15)) == sl.EFFECTIVE_FROM


ASSIGNMENTS = [
	("Manna Rubber", date(2026, 4, 1), "Manna Holidays 2026-27"),
	("Manna Rubber", date(2027, 4, 1), "Manna Holidays 2027-28"),
]


def test_the_holiday_list_is_the_one_in_force_on_each_sunday_not_today():
	assert sl.list_on(ASSIGNMENTS, "E1", "Manna Rubber", date(2027, 1, 10)) == "Manna Holidays 2026-27"
	assert sl.list_on(ASSIGNMENTS, "E1", "Manna Rubber", date(2027, 4, 4)) == "Manna Holidays 2027-28"


def test_the_employees_own_assignment_wins_over_the_companys():
	own = ASSIGNMENTS + [("E1", date(2026, 10, 1), "Branch Holidays")]
	assert sl.list_on(own, "E1", "Manna Rubber", OCT(4)) == "Branch Holidays"
	assert sl.list_on(own, "E2", "Manna Rubber", OCT(4)) == "Manna Holidays 2026-27"


def test_january_sundays_keep_their_day_after_the_april_list_arrives():
	lists = {
		"Manna Holidays 2026-27": (date(2026, 4, 1), date(2027, 3, 31), {date(2027, 1, 10)}),
		"Manna Holidays 2027-28": (date(2027, 4, 1), date(2028, 3, 31), {date(2027, 4, 4)}),
	}
	for d in (date(2027, 1, 10), date(2027, 4, 4)):
		assert sl.is_off(d, sl.list_on(ASSIGNMENTS, "E1", "Manna Rubber", d), lists)


def test_a_sunday_no_list_answers_for_counts_rather_than_losing_the_day():
	lists = {"Manna Holidays 2026-27": (date(2026, 4, 1), date(2027, 3, 31), set())}
	# April 2027 before next year's list is assigned: the old list does not reach it.
	assert sl.is_off(date(2027, 4, 4), "Manna Holidays 2026-27", lists)
	assert sl.is_off(OCT(4), None, lists)
	# Inside the list's dates and not on it: a working Sunday for this person.
	assert not sl.is_off(OCT(4), "Manna Holidays 2026-27", lists)


def test_only_the_october_changeover_reaches_back_to_september():
	assert sl.window(date(2027, 2, 1), date(2027, 12, 31), date(2027, 3, 1), first=True) == (
		date(2027, 2, 1), date(2027, 3, 1))
