"""Rebuilding days after a shift change (manna_hr/reprocess.py).

The case it exists for, off the live site on 19 November 2026: a person given
`default_shift` on 17 November had punched every day of the month before it,
each punch saved `offshift` with no shift, and hrms marked every one of those
days Absent."""

import pytest

from manna_hr.reprocess import SCOPE_ALL, changed, day_of, is_generated, plan, range_problem

DAY = "Hi-Tech Pretreads-Production shift1"
NIGHT = "Hi-Tech Pretreads-Production shift4 (20:30-04:30)"


def punch(name, at, shift=None, start=None, new_shift=None, new_start=None, attendance=None):
	return {
		"name": name, "time": at, "attendance": attendance,
		"shift": shift, "offshift": 0 if shift else 1, "shift_start": start,
		"new_shift": new_shift, "new_start": new_start,
	}


def row(name, on, status="Absent", leave=None, request=None):
	return {"name": name, "attendance_date": on, "status": status,
	        "leave_application": leave, "attendance_request": request}


def test_an_absent_day_with_an_offshift_punch_on_it_is_cancelled_and_the_punch_given_its_shift():
	p = [
		punch("CHK-1", "2026-11-03 08:27", new_shift=DAY, new_start="2026-11-03 08:30"),
		punch("CHK-2", "2026-11-03 17:04", new_shift=DAY, new_start="2026-11-03 08:30"),
	]
	got = plan(p, [row("ATT-1", "2026-11-03")])
	assert got["cancel"] == ["ATT-1"]
	assert got["refetch"] == ["CHK-1", "CHK-2"]
	assert [str(d) for d in got["days"]] == ["2026-11-03"]


def test_a_punch_that_still_has_no_shift_changes_nothing():
	# Nobody gave them a shift yet: there is nothing a rebuild would decide.
	got = plan([punch("CHK-1", "2026-11-03 08:27")], [row("ATT-1", "2026-11-03")])
	assert got["cancel"] == [] and got["refetch"] == []


def test_an_absent_on_a_day_with_no_punches_is_left_absent():
	p = [punch("CHK-1", "2026-11-03 08:27", new_shift=DAY, new_start="2026-11-03 08:30")]
	got = plan(p, [row("ATT-1", "2026-11-03"), row("ATT-2", "2026-11-04")])
	assert got["cancel"] == ["ATT-1"]


def test_a_day_on_leave_is_never_cancelled_even_with_a_punch_on_it():
	p = [punch("CHK-1", "2026-11-03 08:27", new_shift=DAY, new_start="2026-11-03 08:30")]
	got = plan(p, [row("ATT-1", "2026-11-03", status="On Leave", leave="HR-LAP-1")])
	assert got["cancel"] == []
	assert got["skipped"][0][:2] == ("attendance", "ATT-1")


def test_a_half_day_from_a_leave_application_is_not_the_shift_jobs_to_rebuild():
	assert not is_generated(row("A", "2026-11-03", status="Half Day", leave="HR-LAP-2"))
	assert not is_generated(row("A", "2026-11-03", status="Present", request="HR-ARQ-1"))
	assert is_generated(row("A", "2026-11-03", status="Half Day"))


def test_a_frozen_day_is_neither_cancelled_nor_has_its_punches_moved():
	p = [punch("CHK-1", "2026-10-30 08:27", new_shift=DAY, new_start="2026-10-30 08:30")]
	got = plan(p, [row("ATT-1", "2026-10-30")], frozen={"2026-10-30"})
	assert got["cancel"] == [] and got["refetch"] == []
	assert {s[0] for s in got["skipped"]} == {"attendance", "checkin"}


def test_by_default_a_day_already_built_from_punches_stays_as_it_was_built():
	# default_shift has no effective date: changing it today says nothing
	# about which shift last month's processed days were on.
	p = [punch("CHK-1", "2026-11-03 08:27", shift="General", start="2026-11-03 09:00",
	           new_shift=DAY, new_start="2026-11-03 08:30", attendance="ATT-1")]
	got = plan(p, [row("ATT-1", "2026-11-03", status="Present")])
	assert got["cancel"] == [] and got["refetch"] == []


def test_a_shift_assignment_rebuilds_the_days_it_names():
	p = [punch("CHK-1", "2026-11-03 08:27", shift="General", start="2026-11-03 09:00",
	           new_shift=DAY, new_start="2026-11-03 08:30", attendance="ATT-1")]
	got = plan(p, [row("ATT-1", "2026-11-03", status="Present")], scope=SCOPE_ALL)
	assert got["cancel"] == ["ATT-1"] and got["refetch"] == ["CHK-1"]


def test_a_night_split_across_two_days_is_rebuilt_as_one_night_on_the_day_it_started():
	# HPT-012: in 20:31 on the 5th, out 08:34 on the 6th, both measured against
	# the day shift — the evening made a Present on the 5th and the morning an
	# early arrival on the 6th. Given the night shift, both belong to the 5th.
	p = [
		punch("CHK-1", "2026-11-05 20:31", shift=DAY, start="2026-11-05 08:30",
		      new_shift=NIGHT, new_start="2026-11-05 20:30", attendance="ATT-5"),
		punch("CHK-2", "2026-11-06 08:34", shift=DAY, start="2026-11-06 08:30",
		      new_shift=NIGHT, new_start="2026-11-05 20:30", attendance="ATT-6"),
	]
	got = plan(p, [row("ATT-5", "2026-11-05", "Present"), row("ATT-6", "2026-11-06", "Present")],
	           scope=SCOPE_ALL)
	assert got["cancel"] == ["ATT-5", "ATT-6"]
	assert sorted(got["refetch"]) == ["CHK-1", "CHK-2"]


def test_a_punch_that_did_not_change_is_not_saved_again():
	p = [punch("CHK-1", "2026-11-03 08:27", shift=DAY, start="2026-11-03 08:30",
	           new_shift=DAY, new_start="2026-11-03 08:30")]
	assert not changed(p[0])
	assert plan(p, [], scope=SCOPE_ALL)["refetch"] == []


def test_rebuild_cancels_a_days_generated_row_even_when_no_punch_moved():
	p = [punch("CHK-1", "2026-11-03 08:27", shift=DAY, start="2026-11-03 08:30",
	           new_shift=DAY, new_start="2026-11-03 08:30", attendance="ATT-1")]
	got = plan(p, [row("ATT-1", "2026-11-03", "Present")], rebuild={"2026-11-03"})
	assert got["cancel"] == ["ATT-1"]
	# Unlinked by the cancel: it goes back to the shift job with its shift.
	assert got["refetch"] == ["CHK-1"]


def test_day_of_a_punch_with_no_shift_is_none():
	assert day_of(punch("C", "2026-11-03 08:27")) is None
	assert day_of(punch("C", "2026-11-03 08:27"), new=False) is None


def test_an_unknown_scope_is_refused():
	with pytest.raises(ValueError):
		plan([], [], scope="everything")


@pytest.mark.parametrize("a,b,why", [
	("2026-11-10", "2026-11-01", "ends before"),
	("2026-11-01", "2026-11-20", "not happened"),
	("2026-08-01", "2026-11-19", "At most 62"),
])
def test_a_range_that_cannot_be_rebuilt_says_why(a, b, why):
	assert why in range_problem(a, b, "2026-11-19")


def test_the_open_month_can_be_rebuilt():
	assert range_problem("2026-11-01", "2026-11-19", "2026-11-19") is None
