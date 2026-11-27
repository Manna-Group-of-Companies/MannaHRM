"""Punches that arrive after their day was made (manna_hr/latepunch.py).

On 26 November 2026 the live site held 64 punches hrms had set aside because
their day was already made when they arrived — Amal V P's and FARISAMOL VS's
punch-outs of 25 November among them — and the dashboard showed none of them.
"""

from datetime import date, datetime

from manna_hr import latepunch as lp
from manna_hr.adms import sync_limit

# hrms's comment, word for word as the live site holds it on EMP-CKIN-11-2026-007144.
HRMS_DATE = (
	"<strong>Reason for skipping auto attendance:</strong><br>Attendance for employee "
	"<strong>HR-EMP-00092</strong> is already marked for the date <strong>25-11-2026</strong>: "
	'<a href="https://mannarubber.m.frappe.cloud/desk/attendance/HR-ATT-2026-17970" '
	'rel="noopener noreferrer">HR-ATT-2026-17970</a>'
)
HRMS_OVERLAP = (
	"<strong>Reason for skipping auto attendance:</strong><br>Attendance for employee "
	"<strong>HR-EMP-00085</strong> is already marked for an overlapping shift "
	"Manna Rubber Products Pvt.Ltd-Production8hrshift1: <a href=\"/desk/attendance/HR-ATT-2026-15781\">HR-ATT-2026-15781</a>"
)
HRMS_OTHER = "<strong>Reason for skipping auto attendance:</strong><br>Employee is not Active"


def cm(content, at="2026-11-26 09:02:07"):
	return {"content": content, "creation": at}


SET_ASIDE = {"skip_auto_attendance": 1, "attendance": None}
PRESENT = {"status": "Present", "leave_application": None, "attendance_request": None, "docstatus": 1}


# ------------------------------------------------------------- the comment --


def test_hrms_already_made_comments_are_recognised_for_a_date_and_for_an_overlapping_shift():
	assert lp.is_late_set_aside(HRMS_DATE)
	assert lp.is_late_set_aside(HRMS_OVERLAP)


def test_hrms_setting_a_punch_aside_for_another_reason_is_not_a_late_punch():
	assert not lp.is_late_set_aside(HRMS_OTHER)
	assert not lp.is_late_set_aside("Set aside: a second copy of EMP-CKIN-1, the same person at the same second.")


def test_the_attendance_hrms_found_already_made_is_read_off_its_comment():
	assert lp.blocking_attendance(HRMS_DATE) == "HR-ATT-2026-17970"
	assert lp.blocking_attendance(HRMS_OVERLAP) == "HR-ATT-2026-15781"
	assert lp.blocking_attendance(HRMS_OTHER) is None


# -------------------------------------------------------------- releasing --


def test_a_punch_out_set_aside_because_its_day_was_made_without_it_is_released():
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], blocker=PRESENT) == (True, None)


def test_a_punch_set_aside_against_an_absent_the_shift_job_marked_is_released():
	absent = dict(PRESENT, status="Absent")
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], blocker=absent) == (True, None)


def test_a_punch_whose_blocking_day_is_gone_is_still_released():
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], blocker=None) == (True, None)


def test_a_second_copy_of_a_punch_that_already_counts_is_never_released():
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], has_live_twin=True, blocker=PRESENT) == (False, lp.KEPT_DUPLICATE)


def test_a_punch_in_a_submitted_month_is_left_to_the_freeze():
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], frozen=True, blocker=PRESENT) == (False, lp.KEPT_FROZEN)


def test_a_day_made_from_leave_is_hrs_to_decide_and_its_punch_stays_set_aside():
	leave = dict(PRESENT, status="On Leave", leave_application="HR-LAP-1")
	assert lp.releasable(SET_ASIDE, [cm(HRMS_DATE)], blocker=leave) == (False, lp.KEPT_NOT_PUNCHES)


def test_a_punch_released_once_and_set_aside_again_is_not_released_a_second_time():
	comments = [
		cm(HRMS_DATE, "2026-11-26 09:02:07"),
		cm(lp.RELEASED, "2026-11-26 09:10:00"),
		cm(HRMS_DATE, "2026-11-26 10:02:07"),
	]
	assert lp.releasable(SET_ASIDE, comments, blocker=PRESENT) == (False, lp.KEPT_TWICE)


def test_a_punch_set_aside_again_against_the_day_its_release_cancelled_is_released_once_more():
	# BUDHWA ASUR, 25 Nov 2026: released at 13:10, then set aside again by a second
	# shift job naming HR-ATT-2026-18336, the Absent the release had just cancelled.
	# The day read Absent with both of his punches set aside.
	comments = [
		cm(HRMS_DATE, "2026-11-27 12:39:00"),
		cm(lp.RELEASED, "2026-11-27 13:10:01"),
		cm(HRMS_DATE, "2026-11-27 13:10:04"),
	]
	cancelled = dict(PRESENT, status="Absent", docstatus=2)
	assert lp.releasable(SET_ASIDE, comments, blocker=cancelled) == (True, None)
	assert lp.releasable(SET_ASIDE, comments, blocker=None) == (True, None)


def test_a_punch_released_twice_is_never_released_a_third_time():
	comments = [
		cm(HRMS_DATE, "2026-11-27 12:39:00"),
		cm(lp.RELEASED, "2026-11-27 13:10:01"),
		cm(HRMS_DATE, "2026-11-27 13:10:04"),
		cm(lp.RELEASED, "2026-11-27 13:20:01"),
		cm(HRMS_DATE, "2026-11-27 13:20:04"),
	]
	cancelled = dict(PRESENT, status="Absent", docstatus=2)
	assert lp.releasable(SET_ASIDE, comments, blocker=cancelled) == (False, lp.KEPT_TWICE)


def test_a_punch_somebody_set_aside_after_hrms_did_stays_set_aside():
	comments = [cm(HRMS_DATE, "2026-11-26 09:02:07"), cm("Set aside by HR: wrong person", "2026-11-26 11:00:00")]
	assert lp.releasable(SET_ASIDE, comments, blocker=PRESENT) == (False, lp.KEPT_NOT_LATE)


def test_a_punch_set_aside_with_no_hrms_comment_was_set_aside_by_a_person_and_stays():
	assert lp.releasable(SET_ASIDE, [], blocker=PRESENT) == (False, lp.KEPT_NOT_LATE)


def test_a_punch_that_counts_has_nothing_to_release():
	assert lp.releasable({"skip_auto_attendance": 0, "attendance": None}, [cm(HRMS_DATE)]) == (False, None)
	assert lp.releasable({"skip_auto_attendance": 1, "attendance": "HR-ATT-1"}, [cm(HRMS_DATE)]) == (False, None)


# ---------------------------------------------------- counted, yet set aside --

# ERENIUS BECK, 17 Nov 2026, as the live site held it after the backfill of 27
# Nov: released, counted into HR-ATT-2026-18300 by one shift job, and set
# aside in the same second by a second job on the same shift.
COUNTED = {"skip_auto_attendance": 1, "attendance": "HR-ATT-2026-18300"}
MADE = {"docstatus": 1}
RACE = [
	cm(HRMS_OVERLAP, "2026-11-18 09:02:06.000000"),
	cm(lp.RELEASED, "2026-11-27 12:39:03.120000"),
	cm(HRMS_DATE, "2026-11-27 12:39:03.410000"),
]


def test_a_punch_hrms_set_aside_although_its_day_counts_it_has_the_flag_taken_off():
	assert lp.counted_but_set_aside(COUNTED, RACE, day=MADE)


def test_a_punch_its_day_does_not_count_is_for_releasing_not_for_this():
	assert not lp.counted_but_set_aside(SET_ASIDE, RACE, day=MADE)
	assert not lp.counted_but_set_aside(COUNTED, RACE, day={"docstatus": 2})
	assert not lp.counted_but_set_aside(COUNTED, RACE, day=None)


def test_a_punch_that_is_not_set_aside_has_no_flag_to_take_off():
	assert not lp.counted_but_set_aside(dict(COUNTED, skip_auto_attendance=0), RACE, day=MADE)


def test_a_counted_punch_set_aside_by_a_person_or_dedupe_stays_set_aside():
	assert not lp.counted_but_set_aside(COUNTED, [], day=MADE)
	later = RACE + [cm("Set aside: a second copy of EMP-CKIN-1, the same person at the same second.", "2026-11-27 13:00:00")]
	assert not lp.counted_but_set_aside(COUNTED, later, day=MADE)


def test_a_counted_second_copy_and_a_submitted_month_stay_as_they_are():
	assert not lp.counted_but_set_aside(COUNTED, RACE, day=MADE, has_live_twin=True)
	assert not lp.counted_but_set_aside(COUNTED, RACE, day=MADE, frozen=True)


def test_a_copy_beside_a_punch_that_counts_again_is_never_released_with_it():
	# ERENIUS BECK, 17 Nov 2026, 17:01:15: the gate's own post (003932) is
	# counted again; the bridge's OUT copy (003936), set aside on 18 Nov, would
	# otherwise pass `releasable` and count the same punch twice.
	gate = {"name": "EMP-CKIN-11-2026-003932", "employee": "HR-EMP-00054", "time": "2026-11-17 17:01:15"}
	bridge = {"name": "EMP-CKIN-11-2026-003936", "employee": "HR-EMP-00054", "time": "2026-11-17 17:01:15"}
	other = {"name": "X", "employee": "HR-EMP-00054", "time": "2026-11-17 17:01:16"}
	keep, duplicates = lp.beside_counted([bridge, other], [gate])
	assert [r["name"] for r in keep] == ["X"]
	assert [r["name"] for r in duplicates] == ["EMP-CKIN-11-2026-003936"]


def copy(name, log_type=None, creation="2026-11-02 07:57:32", at="2026-11-01 06:10:32", emp="HR-EMP-00478"):
	return {"name": name, "employee": emp, "time": at, "creation": creation, "attendance": None, "log_type": log_type}


def test_when_both_copies_of_one_punch_were_set_aside_only_one_is_released():
	# JAGESHAR ORAON, 1 Nov 2026 06:10:32: MRP Gate 1's own post and the
	# bridge's IN copy of it, both set aside. Releasing both would count one
	# punch twice and turn the day's pairing round.
	release, duplicates = lp.one_per_second([copy("BRIDGE", "IN", "2026-11-02 11:58:00"), copy("GATE")])
	assert [r["name"] for r in release] == ["GATE"]
	assert [r["name"] for r in duplicates] == ["BRIDGE"]


def test_different_seconds_and_different_people_are_each_released():
	release, duplicates = lp.one_per_second([
		copy("A"), copy("B", at="2026-11-01 17:30:00"), copy("C", emp="HR-EMP-00001"),
	])
	assert sorted(r["name"] for r in release) == ["A", "B", "C"] and duplicates == []


# ------------------------------------------------------------- on arrival --


def arrival(**over):
	p = {"shift": "MRP Office", "shift_start": datetime(2026, 11, 25, 8, 30), "offshift": 0, "skip_auto_attendance": 0}
	p.update(over)
	return p


def day(status="Present", on="2026-11-25", **over):
	r = {"attendance_date": on, "status": status, "leave_application": None, "attendance_request": None, "docstatus": 1}
	r.update(over)
	return r


def test_a_punch_out_arriving_the_next_morning_rebuilds_the_day_it_belongs_to():
	# Amal V P: in at 08:21 on the 25th, the day made at 20:02 with no out,
	# the 17:37 out sent by MRP Gate 1 at 08:33 on the 26th.
	assert lp.rebuild_on_arrival(arrival(), [day()]) == date(2026, 11, 25)


def test_punches_reaching_a_day_marked_absent_rebuild_it():
	assert lp.rebuild_on_arrival(arrival(), [day("Absent")]) == date(2026, 11, 25)


def test_a_night_shifts_morning_leaving_rebuilds_the_night_it_began():
	night = arrival(shift="Night", shift_start=datetime(2026, 11, 24, 20, 30))
	assert lp.rebuild_on_arrival(night, [day(on="2026-11-24")]) == date(2026, 11, 24)


def test_a_punch_on_a_day_not_made_yet_rebuilds_nothing():
	assert lp.rebuild_on_arrival(arrival(), []) is None
	assert lp.rebuild_on_arrival(arrival(), [day(on="2026-11-24")]) is None


def test_a_day_made_from_leave_is_not_rebuilt_by_a_punch():
	assert lp.rebuild_on_arrival(arrival(), [day("On Leave", leave_application="HR-LAP-1")]) is None


def test_a_punch_with_no_shift_or_set_aside_rebuilds_nothing():
	assert lp.rebuild_on_arrival(arrival(shift=None, offshift=1), [day()]) is None
	assert lp.rebuild_on_arrival(arrival(skip_auto_attendance=1), [day()]) is None


def test_a_cancelled_day_is_not_a_made_day():
	assert lp.rebuild_on_arrival(arrival(), [day(docstatus=2)]) is None


# ------------------------------------------------- closing a shift (adms) --


def test_a_bridge_closing_every_shift_at_another_plants_punch_is_held_at_this_shifts_own_newest():
	# 26 Nov 2026 17:09: the Hi-Tech bridge set MRP's Office Shift to 17:07:01,
	# a Hi-Tech punch. MRP Office's own newest punch was earlier.
	assert sync_limit("2026-11-26 08:40:00", "2026-11-26 17:07:01", "2026-11-26 16:58:12") == "2026-11-26 16:58:12"


def test_a_bridge_moving_a_shift_to_its_own_newest_punch_is_left_alone():
	assert sync_limit("2026-11-26 08:40:00", "2026-11-26 17:07:01", "2026-11-26 17:07:01") == "2026-11-26 17:07:01"


def test_moving_it_back_is_somebody_reopening_days_and_is_left_alone():
	assert sync_limit("2026-11-26 17:07:01", "2026-11-20 00:00:00", "2026-11-26 17:07:01") == "2026-11-20 00:00:00"


def test_a_shift_with_no_punch_on_it_is_not_moved_forward():
	assert sync_limit("2026-11-20 10:00:00", "2026-11-26 17:07:01", None) == "2026-11-20 10:00:00"
	assert sync_limit(None, "2026-11-26 17:07:01", None) is None


def test_it_is_never_held_behind_where_it_already_was():
	assert sync_limit("2026-11-26 12:00:00", "2026-11-26 17:07:01", "2026-11-26 09:00:00") == "2026-11-26 12:00:00"
