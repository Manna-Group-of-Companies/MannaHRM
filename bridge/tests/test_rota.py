"""Day or night from the punch-in (mannabridge/rota.py).

VIKRAM ASUR (MRP-298), off the site: a day week, then nights from 28 Sep —
in at 20:24, out at 08:35 next morning. Nobody told the website, and hrms
measured every night against the day shift."""

from mannabridge.main import drain
from mannabridge.queue import PunchQueue
from mannabridge.rota import NIGHT_OF, Rota, arrival, plan

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


class FakeRota(Rota):
	"""Rota's own decisions, against an in-memory site."""

	def __init__(self, people, fail=False):
		self._people = people
		self.rows = []
		self.writes = []
		self.fail = fail

	def employee(self, device_user):
		return self._people.get(device_user)

	def assignments(self, employee, on):
		if self.fail:
			raise RuntimeError("site unreachable")
		return [dict(r) for r in self.rows if r["status"] == "Active"]

	def apply(self, emp, action):
		self.writes.append(action)
		if action[0] == "create":
			self.rows.append(dict(action[1], name="SA-%d" % len(self.rows), status="Active"))
		else:
			row = next(r for r in self.rows if r["name"] == action[1])
			row.update(action[2])


VIKRAM = {"name": "HR-EMP-00130", "employee_name": "VIKRAM ASUR", "company": "Manna Rubber Products Private Limited", "default_shift": DAY}


def test_a_night_week_and_the_day_week_after_it_off_the_gate(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	week = [
		("2026-09-26 08:27:33", "IN"), ("2026-09-26 20:31:41", "OUT"),   # Saturday, a day
		("2026-09-28 20:24:31", "IN"), ("2026-09-29 08:35:21", "OUT"),   # Monday night
		("2026-09-29 20:24:54", "IN"), ("2026-09-30 08:35:36", "OUT"),   # Tuesday night
		("2026-09-30 20:23:06", "IN"), ("2026-10-01 08:31:45", "OUT"),   # Wednesday night
		("2026-10-01 20:25:00", "IN"), ("2026-10-02 08:33:00", "OUT"),   # Thursday night
		("2026-10-02 20:22:00", "IN"), ("2026-10-03 08:34:00", "OUT"),   # Friday night
		("2026-10-03 20:23:00", "IN"), ("2026-10-04 08:31:00", "OUT"),   # Saturday night
		("2026-10-05 08:27:00", "IN"), ("2026-10-05 20:30:00", "OUT"),   # Monday, a day again
	]
	for t, k in week:
		queue.offer("BIO-MRP-GATE1", "298", t, k)
	rota = FakeRota({"298": VIKRAM})
	site = Site()
	assert drain(queue, site, rota=rota) == (len(week), 0)
	assert [(r["start_date"], r["end_date"], r["status"]) for r in rota.rows] == [("2026-09-28", "2026-10-03", "Active")]
	assert site.got == [t for t, _ in week]


def test_somebody_whose_working_time_has_no_night_partner_is_left_alone(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "516", "2026-09-30 20:24:00", "IN")
	rota = FakeRota({"516": dict(VIKRAM, default_shift="Hi-Tech Rubber Industries-Cook shift")})
	drain(queue, Site(), rota=rota)
	assert rota.writes == []


def test_a_site_that_cannot_answer_about_shifts_still_gets_the_punch(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "298", "2026-09-28 20:24:31", "IN")
	site = Site()
	assert drain(queue, site, rota=FakeRota({"298": VIKRAM}, fail=True)) == (1, 0)
	assert site.got == ["2026-09-28 20:24:31"]


def test_the_queue_finds_the_punch_before_on_any_machine(tmp_path):
	queue = PunchQueue(str(tmp_path / "q.sqlite3"))
	queue.offer("BIO-MRP-GATE1", "298", "2026-09-29 08:35:21", "OUT")
	queue.offer("BIO-OTHER", "298", "2026-09-29 12:00:00", None)
	queue.offer("BIO-MRP-GATE1", "777", "2026-09-29 19:00:00", "IN")
	assert queue.previous("298", "2026-09-29 20:24:54") == ("2026-09-29 12:00:00", None)
	assert queue.previous("298", "2026-09-29 08:35:21") is None


def test_every_company_s_day_shift_has_its_night_and_tyre_retreads_is_left_to_its_machines():
	assert NIGHT_OF["HRI-Day Shift"] == "HRI-Night Shift"
	assert NIGHT_OF["Manna Rubber Products Pvt.Ltd-Production8hrshift1"] == "Manna Rubber Products Pvt.Ltd-Production8hrshift2"
	assert not any(k.startswith("Manna Tyre Retreads") for k in NIGHT_OF)
	# A night is never somebody's day as well: that would make every arrival both.
	assert not set(NIGHT_OF) & set(NIGHT_OF.values())
