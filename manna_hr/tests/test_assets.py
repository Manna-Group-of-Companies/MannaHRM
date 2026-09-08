"""Handing a thing to a person, and getting it back.

Seven of the fifteen boxes on Factor HR's Assets Assignment form had nowhere to
land in ERPNext, because an `Asset Movement` is a log and their form is a little
contract. `manna_hr/assets.py` holds the contract's arithmetic, and every rule
in it is here — because the cost of getting one wrong is a recovery deduction
taken off the wrong person's salary, or kit written off as lost that is sitting
in a drawer.
"""

from manna_hr.assets import CLOSED, outstanding, overdue, problems, status_for

OUT = {
	"employee": "HR-EMP-00001",
	"asset": "ACC-ASS-2026-00004",
	"assign_units": 10,
	"assign_date": "2026-08-01",
}


def row(**over):
	got = dict(OUT)
	got.update(over)
	return got


# ------------------------------------------------------------- outstanding ---

def test_everything_issued_is_outstanding_until_something_comes_back():
	assert outstanding(row()) == 10


def test_returned_and_lost_both_come_off_what_is_outstanding():
	assert outstanding(row(return_unit=3, lost_units=2)) == 5


def test_a_blank_count_is_zero_not_a_crash():
	# Frappe sends an untouched Int as 0 and an untouched Data as "", and this
	# module is called from a controller and from a browser.
	assert outstanding(row(return_unit="", lost_units=None)) == 10


# ------------------------------------------------------------------ status ---

def test_nothing_back_is_in_use():
	assert status_for(row()) == "In Use"


def test_all_of_it_back_is_returned():
	assert status_for(row(return_unit=10, returned_on="2026-09-01")) == "Returned"


def test_some_of_it_back_is_partly_returned():
	assert status_for(row(return_unit=4, returned_on="2026-09-01")) == "Partly Returned"


def test_a_loss_beats_a_return_because_the_missing_one_is_the_open_question():
	got = status_for(row(return_unit=9, returned_on="2026-09-01",
	                     lost_units=1, lost_on="2026-09-01"))
	assert got == "Partly Lost"


def test_all_of_it_lost_is_lost():
	assert status_for(row(lost_units=10, lost_on="2026-09-01")) == "Lost"


def test_returned_and_lost_are_both_closed_states():
	assert "Returned" in CLOSED and "Lost" in CLOSED
	assert "In Use" not in CLOSED and "Partly Returned" not in CLOSED


# ---------------------------------------------------------------- problems ---

def test_a_plain_handover_has_nothing_wrong_with_it():
	assert problems(row()) == []


def test_more_back_than_went_out_is_refused():
	said = problems(row(return_unit=11, returned_on="2026-09-01"))
	assert any("more than the 10 that went out" in s for s in said)


def test_returned_plus_lost_over_the_total_is_refused():
	said = problems(row(return_unit=8, returned_on="2026-09-01",
	                    lost_units=5, lost_on="2026-09-01"))
	assert any("more than the 10 that went out" in s for s in said)


def test_a_return_count_with_no_date_is_half_a_fact():
	said = problems(row(return_unit=3))
	assert any("Returned On needs the date" in s for s in said)


def test_a_return_date_with_no_count_is_the_other_half():
	said = problems(row(returned_on="2026-09-01"))
	assert any("Return Unit says nothing came back" in s for s in said)


def test_a_loss_count_with_no_date_is_refused():
	said = problems(row(lost_units=2))
	assert any("Lost On needs the date" in s for s in said)


def test_recovery_money_with_no_loss_behind_it_is_refused():
	# This one is somebody's pay. A deduction with no reason attached is the
	# expensive mistake this module exists to prevent.
	said = problems(row(recovery_amount=4500))
	assert any("needs the loss it recovers" in s for s in said)


def test_recovery_money_is_fine_when_something_was_lost():
	assert problems(row(lost_units=1, lost_on="2026-09-02", recovery_amount=4500)) == []


def test_nothing_handed_over_is_not_a_handover():
	said = problems(row(assign_units=0))
	assert any("at least 1" in s for s in said)


def test_a_negative_count_is_refused_rather_than_clamped():
	said = problems(row(return_unit=-2))
	assert any("cannot be negative" in s for s in said)


def test_an_assignment_needs_a_person_an_asset_and_a_date():
	said = problems({"assign_units": 1})
	assert any("needs the person" in s for s in said)
	assert any("needs the asset" in s for s in said)
	assert any("needs the date" in s for s in said)


def test_a_return_before_the_handover_is_refused():
	said = problems(row(return_unit=1, returned_on="2026-07-30"))
	assert any("before the assignment went out on 2026-08-01" in s for s in said)


def test_a_valid_till_before_the_handover_is_refused():
	said = problems(row(valid_till="2026-07-01"))
	assert any("Valid Till is before" in s for s in said)


# ----------------------------------------------------------------- overdue ---

def test_lent_until_a_date_that_has_passed_is_overdue():
	assert overdue(row(valid_till="2026-08-31"), "2026-09-07") is True


def test_still_within_its_term_is_not_overdue():
	assert overdue(row(valid_till="2026-09-30"), "2026-09-07") is False


def test_no_end_agreed_is_not_overdue():
	# Most handovers have no Valid Till. "No end agreed" is not "late".
	assert overdue(row(), "2026-09-07") is False


def test_something_already_back_is_not_overdue_however_old():
	got = row(valid_till="2026-08-02", return_unit=10, returned_on="2026-08-03")
	assert overdue(got, "2026-09-07") is False
