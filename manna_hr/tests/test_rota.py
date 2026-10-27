"""Day or night from the punch-in (manna_hr/rota.py, moved from the bridge).

VIKRAM ASUR (MRP-298), off the site: a day week, then nights from 28 Sep —
in at 20:24, out at 08:35 next morning. Nobody told the website, and hrms
measured every night against the day shift."""

from manna_hr.rota import NIGHT_OF, arrival, log_type_for, plan

DAY = "Manna Rubber Products Pvt.Ltd-Production12hrshift1"
NIGHT = NIGHT_OF[DAY]


# ----------------------------------------------------------------- arrival --

def test_an_in_at_twenty_past_eight_in_the_evening_after_a_morning_out_starts_a_night():
	assert arrival("2026-09-28 20:24:31", "IN", "2026-09-26 20:31:41", "OUT") == "night"
	assert arrival("2026-09-29 20:24:54", "IN", "2026-09-29 08:35:21", "OUT") == "night"


def test_an_in_at_half_past_eight_in_the_morning_starts_a_day():
	assert arrival("2026-09-25 08:27:33", "IN", "2026-09-24 20:32:00", "OUT") == "day"


def test_a_day_workers_leaving_is_not_a_night_whatever_the_hour():
	assert arrival("2026-09-25 20:32:32", "OUT", "2026-09-25 08:27:33", "IN") is None


def test_an_evening_in_straight_after_a_morning_in_decides_nothing():
	# One of the two keys is wrong and there is no telling which.
	assert arrival("2026-09-25 20:32:32", "IN", "2026-09-25 08:27:33", "IN") is None


def test_a_punch_with_no_key_decides_nothing():
	assert arrival("2026-09-28 20:24:31", None, None, None) is None
	assert arrival("2026-09-28 20:24:31", "", None, None) is None


def test_an_in_at_an_hour_that_starts_neither_shift_decides_nothing():
	assert arrival("2026-09-28 14:00:00", "IN", None, None) is None
	assert arrival("2026-09-28 02:00:00", "IN", None, None) is None


def test_the_first_punch_after_a_rest_is_judged_on_its_own_key():
	# The previous IN was Saturday's — another shift entirely.
	assert arrival("2026-09-28 20:24:31", "IN", "2026-09-26 08:27:33", "IN") == "night"


# -------------------------------------------------------------------- plan --

def A(name, start, end, shift=NIGHT):
	return {"name": name, "shift_type": shift, "start_date": start, "end_date": end}


def test_the_first_night_of_a_week_gives_that_night_and_the_next_one():
	assert plan([], "2026-09-28", "night", NIGHT) == [
		("create", {"shift_type": NIGHT, "start_date": "2026-09-28", "end_date": "2026-09-29"})]


def test_each_night_arrival_moves_the_provisional_night_one_on():
	assert plan([A("SA-1", "2026-09-28", "2026-09-29")], "2026-09-29", "night", NIGHT) == [
		("update", "SA-1", {"end_date": "2026-09-30"})]


def test_a_night_after_one_missed_carries_on_the_same_assignment():
	# In Tuesday, absent Wednesday, in Thursday: one assignment, not two.
	assert plan([A("SA-1", "2026-09-28", "2026-09-30")], "2026-10-01", "night", NIGHT) == [
		("update", "SA-1", {"end_date": "2026-10-02"})]


def test_a_night_hr_already_rostered_needs_nothing():
	assert plan([A("SA-9", "2026-09-28", "2026-10-03")], "2026-09-30", "night", NIGHT) == []
	assert plan([A("SA-9", "2026-09-28", None)], "2026-09-30", "night", NIGHT) == []


def test_the_monday_after_a_night_week_cuts_off_the_sunday_nobody_came_for():
	# Saturday's arrival made Sunday provisional; Monday 08:27 is a day.
	assert plan([A("SA-1", "2026-09-28", "2026-10-04")], "2026-10-05", "day", NIGHT) == [
		("update", "SA-1", {"end_date": "2026-10-03"})]


def test_a_provisional_night_with_no_real_one_before_it_is_set_inactive():
	assert plan([A("SA-1", "2026-10-04", "2026-10-04")], "2026-10-05", "day", NIGHT) == [
		("update", "SA-1", {"status": "Inactive"})]


def test_a_day_arrival_leaves_a_night_roster_that_ended_before_yesterday_alone():
	assert plan([A("SA-9", "2026-09-28", "2026-10-03")], "2026-10-05", "day", NIGHT) == []


def test_hr_s_own_shift_on_those_dates_wins():
	other = A("SA-5", "2026-09-28", "2026-10-03", shift="Manna Rubber Products Pvt.Ltd-HK shift")
	assert plan([other], "2026-09-30", "night", NIGHT) == []


def test_hr_s_shift_starting_tomorrow_leaves_tonight_a_night_of_its_own():
	other = A("SA-5", "2026-10-01", None, shift=DAY)
	assert plan([other], "2026-09-30", "night", NIGHT) == [
		("create", {"shift_type": NIGHT, "start_date": "2026-09-30", "end_date": "2026-09-30"})]


# ------------------------------------------------------------- the bridge --

class Site:
	def __init__(self):
		self.got = []

	def send(self, device_user, punched_at, device_id, log_type=None):
		self.got.append(punched_at)
		return {}


# --------------------------------------------------------------- direction --

def test_a_machine_nobody_checked_gives_no_direction_even_for_a_zero():
	assert log_type_for("0", 0) is None


def test_a_checked_machine_gives_in_and_out_from_its_keys():
	assert (log_type_for("0", 1), log_type_for("1", 1)) == ("IN", "OUT")


def test_a_status_the_machine_was_not_set_up_for_is_no_direction():
	assert log_type_for("255", 1) is None


def test_every_night_shift_named_is_a_different_shift_from_its_day():
	assert all(day != night for day, night in NIGHT_OF.items())

