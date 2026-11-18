"""manna_hr/holidayroll.py: next year's Holiday List, made by itself.

The plan is pure; these pin what it carries forward and what it leaves to HR.
The list is the one on the site on 18 November 2026.
"""

from datetime import date

from manna_hr.holidayroll import due, is_fixed, next_list_plan, next_name


def sundays(start, end):
	d = date.fromisoformat(start)
	out = []
	while d <= date.fromisoformat(end):
		if d.weekday() == 6:
			out.append({"holiday_date": d.isoformat(), "description": "Sunday", "weekly_off": 1})
		d = date.fromordinal(d.toordinal() + 1)
	return out


CUR = {
	"name": "Manna Holidays 2026-27",
	"from_date": "2026-04-01",
	"to_date": "2027-03-31",
	"holidays": sundays("2026-04-01", "2027-03-31") + [
		{"holiday_date": "2026-04-03", "description": "Good Friday", "weekly_off": 0},
		{"holiday_date": "2026-04-15", "description": "Vishu", "weekly_off": 0},
		{"holiday_date": "2026-05-01", "description": "May Day", "weekly_off": 0},
		{"holiday_date": "2026-08-15", "description": "Independence Day", "weekly_off": 0},
		{"holiday_date": "2026-08-25", "description": "Onam - Uthradam", "weekly_off": 0},
		{"holiday_date": "2026-08-26", "description": "Onam - Thiruvonam", "weekly_off": 0},
		{"holiday_date": "2026-10-02", "description": "Gandhi Jayanti", "weekly_off": 0},
		{"holiday_date": "2026-12-25", "description": "Christmas", "weekly_off": 0},
		{"holiday_date": "2027-01-26", "description": "Republic Day", "weekly_off": 0},
	],
}


def test_the_next_list_is_the_following_year_named_the_same_way():
	p = next_list_plan(CUR)
	assert p["name"] == "Manna Holidays 2027-28"
	assert (p["from_date"], p["to_date"]) == ("2027-04-01", "2028-03-31")


def test_every_sunday_of_next_year_is_a_weekly_off():
	p = next_list_plan(CUR)
	offs = [h for h in p["holidays"] if h["weekly_off"]]
	assert all(date.fromisoformat(h["holiday_date"]).weekday() == 6 for h in offs)
	assert len(offs) == len(sundays("2027-04-01", "2028-03-31")) - 1  # 15 Aug 2027 is Independence Day
	assert p["weekly_off_days"] == ["Sunday"]


def test_fixed_date_holidays_move_to_next_year_and_festivals_do_not():
	p = next_list_plan(CUR)
	named = {h["holiday_date"]: h["description"] for h in p["holidays"] if not h["weekly_off"]}
	assert named == {
		"2027-05-01": "May Day",
		"2027-08-15": "Independence Day",
		"2027-10-02": "Gandhi Jayanti",
		"2027-12-25": "Christmas",
		"2028-01-26": "Republic Day",
	}
	assert p["to_add"] == ["Good Friday", "Onam - Thiruvonam", "Onam - Uthradam", "Vishu"]


def test_a_fixed_holiday_on_a_sunday_keeps_its_name_and_the_date_is_not_twice():
	p = next_list_plan(CUR)
	dates = [h["holiday_date"] for h in p["holidays"]]
	assert len(dates) == len(set(dates))
	# 15 August 2027 is a Sunday.
	assert date(2027, 8, 15).weekday() == 6
	assert [h for h in p["holidays"] if h["holiday_date"] == "2027-08-15"][0]["description"] == "Independence Day"


def test_a_holiday_is_fixed_only_when_both_the_date_and_the_name_match():
	assert is_fixed("2026-08-15", "Independence Day")
	assert not is_fixed("2026-08-26", "Onam - Thiruvonam")
	assert not is_fixed("2026-08-15", "Onam")


def test_names_with_a_calendar_year_or_none_get_the_next_one():
	assert next_name("Holidays 2026", date(2027, 1, 1), date(2027, 12, 31)) == "Holidays 2027"
	assert next_name("Manna Holidays 2026-2027", date(2027, 4, 1), date(2028, 3, 31)) == "Manna Holidays 2027-2028"
	assert next_name("Factory list", date(2027, 1, 1), date(2027, 12, 31)) == "Factory list 2027"


def test_the_next_list_is_made_sixty_days_before_this_one_ends():
	assert not due("2027-03-31", "2027-01-29")
	assert due("2027-03-31", "2027-01-30")
	assert due("2027-03-31", "2027-04-02")
