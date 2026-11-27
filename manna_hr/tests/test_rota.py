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



# --------------------------------------------------- no key on the punch --
#
# Most machines here send no direction. HPT-012 and others on Hi-Tech's
# machines worked nights all November and were measured against the day
# shift, because `arrival` needs a key that never came.

from manna_hr.rota import arrival_unkeyed, night_for  # noqa: E402


def _nights(first_evening_day, count, out_min=35, in_min=24):
	"""Consecutive nights from the 2nd of November: in ~20:24, out ~08:35 next day."""
	out = []
	for k in range(count):
		d = first_evening_day + k
		out.append("2026-11-{0:02d} 20:{1:02d}:00".format(d, in_min))
		out.append("2026-11-{0:02d} 08:{1:02d}:00".format(d + 1, out_min))
	return out


def _days(first_day, count):
	out = []
	for k in range(count):
		d = first_day + k
		out.append("2026-11-{0:02d} 08:27:00".format(d))
		out.append("2026-11-{0:02d} 20:32:00".format(d))
	return out


def test_the_first_evening_after_a_weekly_off_is_a_night_arrival():
	# Last week of days ended Saturday 20:32; Sunday off; Monday 20:24.
	earlier = _days(1, 6)  # 1st..6th
	assert arrival_unkeyed("2026-11-08 20:24:00", earlier) == "night"


def test_the_third_night_running_is_still_a_night_with_no_key_anywhere():
	earlier = _days(1, 6) + _nights(8, 2)  # nights of the 8th and 9th
	assert arrival_unkeyed("2026-11-10 20:24:00", earlier) == "night"


def test_a_night_workers_morning_leaving_decides_nothing():
	earlier = _days(1, 6) + _nights(8, 1)[:1]
	assert arrival_unkeyed("2026-11-09 08:35:00", earlier) is None


def test_a_day_workers_evening_leaving_is_not_a_night():
	# The minute that fooled the hour alone: 20:32 after an 08:27 arrival.
	earlier = ["2026-11-01 20:32:00"] + _days(3, 2) + ["2026-11-05 08:27:00"]
	assert arrival_unkeyed("2026-11-05 20:32:00", earlier) is None


def test_a_day_workers_morning_after_a_rest_is_a_day():
	earlier = _nights(2, 5)  # last night out the 7th at 08:35
	assert arrival_unkeyed("2026-11-09 08:27:00", earlier) == "day"


def test_a_missing_punch_in_the_run_makes_everything_after_it_undecided():
	# The out of the 9th's night is missing: 20:24 on the 9th, then 20:24 on
	# the 10th — a day between them, which is one punch short of a run.
	earlier = _days(1, 6) + _nights(8, 1) + ["2026-11-09 20:24:00"]
	assert arrival_unkeyed("2026-11-10 20:24:00", earlier) is None


def test_no_rest_in_the_history_given_decides_nothing():
	assert arrival_unkeyed("2026-11-10 20:24:00", _nights(2, 8)[1:]) is None
	assert arrival_unkeyed("2026-11-10 20:24:00", []) is None


def test_a_second_press_of_the_same_punch_is_one_punch():
	earlier = _days(1, 6) + ["2026-11-08 20:24:00"]
	assert arrival_unkeyed("2026-11-08 20:25:30", earlier) is None
	# …and the press does not shift the count for the morning after.
	earlier = _days(1, 6) + ["2026-11-08 20:24:00", "2026-11-08 20:25:30", "2026-11-09 08:35:00"]
	assert arrival_unkeyed("2026-11-09 20:24:00", earlier) == "night"


def test_an_eight_hour_night_is_counted_the_same_way():
	# 20:30–04:30 with sixteen hours' rest between.
	earlier = ["2026-11-01 16:32:00", "2026-11-03 20:24:00", "2026-11-04 04:35:00"]
	assert arrival_unkeyed("2026-11-04 20:24:00", earlier) == "night"


def test_the_shift_types_own_night_comes_before_the_map():
	assert night_for(DAY, "Some Other Night") == "Some Other Night"
	assert night_for(DAY) == NIGHT
	assert night_for("Hi-Tech Pretreads-Production shift1") is None


def test_the_sites_night_map_is_the_bridges():
	# Kept apart, the site's copy named shifts the 8 October sheet retired
	# for three weeks after the machines moved to the site.
	import ast
	import pathlib

	src = (pathlib.Path(__file__).resolve().parents[2] / "bridge" / "mannabridge" / "rota.py").read_text(encoding="utf-8")
	tree = ast.parse(src)
	bridge = next(
		ast.literal_eval(n.value) for n in tree.body
		if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "NIGHT_OF" for t in n.targets)
	)
	assert NIGHT_OF == bridge


def test_no_shift_is_given_from_a_punch_since_hr_assigns_every_shift():
	# 27 Nov 2026: "HR assigns the shifts in HRMS, so no automatic shift is needed."
	from manna_hr import rota

	assert rota.NIGHT_FROM_PUNCH is False
