"""Duplicate punches (manna_hr/dedupe.py): 1,383 of November's 4,345 on the
live site were a second copy of a punch already there."""

from manna_hr.dedupe import groups, keeper, plan


def c(name, at="2026-11-03 08:27:10", emp="HR-EMP-1", creation="2026-11-03 08:30:00", att=None, log=None, skip=0):
	return {"name": name, "employee": emp, "time": at, "creation": creation,
	        "attendance": att, "log_type": log, "skip_auto_attendance": skip}


def test_the_same_person_at_the_same_second_is_one_group_and_a_different_second_is_not():
	rows = [c("A"), c("B"), c("C", at="2026-11-03 08:27:11"), c("D", emp="HR-EMP-2")]
	assert [sorted(r["name"] for r in g) for g in groups(rows)] == [["A", "B"]]


def test_the_copy_a_day_was_built_from_is_the_one_kept():
	assert keeper([c("A"), c("B", att="ATT-1", creation="2026-11-03 09:00")])["name"] == "B"


def test_a_copy_with_a_direction_beats_one_without():
	assert keeper([c("A"), c("B", log="IN", creation="2026-11-03 09:00")])["name"] == "B"


def test_otherwise_the_first_made_is_kept():
	assert keeper([c("B", creation="2026-11-03 09:00"), c("A")])["name"] == "A"


def test_extra_copies_are_set_aside_never_deleted_and_name_the_one_kept():
	got = plan([c("A", att="ATT-1"), c("B"), c("C")])
	assert got["keep"] == ["A"]
	assert got["set_aside"] == [("B", "A"), ("C", "A")]
	assert got["rebuild"] == set()


def test_a_day_a_set_aside_copy_was_counted_into_is_rebuilt():
	# Both copies made it into the day (alternating IN/OUT): the day's pairing
	# was wrong from that punch on.
	got = plan([c("A", att="ATT-1", log="IN"), c("B", att="ATT-1")])
	assert got["set_aside"] == [("B", "A")] and got["rebuild"] == {"ATT-1"}


def test_a_copy_already_set_aside_is_left_alone():
	assert plan([c("A"), c("B", skip=1)])["set_aside"] == []


def test_a_month_with_no_duplicates_has_nothing_to_do():
	assert plan([c("A"), c("B", at="2026-11-03 17:02:00")]) == {"keep": [], "set_aside": [], "rebuild": set()}
