"""The loan arithmetic, stated as the rules it is.

Every name here says what is supposed to be true, so a failure at midnight tells
the reader what broke rather than which assertion number it was.
"""

from manna_hr import rules


# ------------------------------------------------------------- outstanding ---


def test_an_opening_balance_and_a_disbursement_are_added_not_chosen_between():
	# A loan carried over from Factor HR and then topped up is both, and
	# treating them as alternatives silently forgives one of them.
	assert rules.loan_outstanding(opening_balance=5000, disbursed_amount=3000) == 8000


def test_over_recovery_does_not_make_the_outstanding_negative():
	assert rules.loan_outstanding(disbursed_amount=1000, recovered_amount=1500) == 0


def test_over_recovery_is_reported_on_its_own():
	assert rules.loan_overpaid(disbursed_amount=1000, recovered_amount=1500) == 500


def test_a_blank_figure_is_zero_and_not_a_crash():
	# Frappe hands over None for an untouched Currency field.
	assert rules.loan_outstanding(None, None, None) == 0


# ------------------------------------------------------------------ status ---


def test_sanctioned_but_not_paid_out_is_not_owing():
	assert rules.loan_status(sanctioned_amount=10000) == rules.LOAN_SANCTIONED


def test_paid_out_with_nothing_back_yet_is_disbursed():
	assert rules.loan_status(10000, disbursed_amount=10000) == rules.LOAN_DISBURSED


def test_part_way_through_recovery_is_running():
	assert rules.loan_status(10000, 10000, recovered_amount=3000) == rules.LOAN_RUNNING


def test_fully_recovered_closes_itself():
	assert rules.loan_status(10000, 10000, recovered_amount=10000) == rules.LOAN_CLOSED


def test_a_person_may_impose_applied_and_closed_and_nothing_else():
	assert rules.loan_status(10000, 10000, chosen="Applied") == "Applied"
	assert rules.loan_status(10000, 10000, chosen="Closed") == "Closed"
	# Running is arithmetic, so a person choosing it does not make it true.
	assert rules.loan_status(10000, chosen="Running") == rules.LOAN_SANCTIONED


def test_closing_a_loan_that_is_still_owed_is_refused_with_the_figure():
	problem = rules.loan_status_problem("Closed", 10000, 10000, recovered_amount=3000)
	assert "7000" in problem


def test_a_status_that_agrees_with_the_figures_raises_nothing():
	assert rules.loan_status_problem("Closed", 10000, 10000, recovered_amount=10000) == ""


# -------------------------------------------------------------- repayments ---


def test_a_repayment_larger_than_the_balance_is_refused():
	assert rules.repayment_problem(500, outstanding=300)


def test_an_overpayment_is_allowed_where_it_is_somebody_settling_a_rounding():
	assert rules.repayment_problem(500, outstanding=300, allow_overpay=True) == ""


def test_a_repayment_of_nothing_is_refused():
	assert rules.repayment_problem(0, outstanding=300)


def test_an_instalment_paid_short_is_partly_paid_and_not_paid():
	assert rules.instalment_status(1000, 999) == "Partly Paid"
	assert rules.instalment_status(1000, 1000) == "Paid"
	assert rules.instalment_status(1000, 0) == "Pending"


# ---------------------------------------------------------------- schedule ---


def test_the_schedule_lines_add_up_to_the_loan():
	# The whole reason the rounding goes into the last instalment: a schedule
	# whose lines do not total the loan is one payroll and the register argue
	# about forever.
	rows = rules.flat_schedule(10000, 3, "2026-11")
	assert round(sum(r["total_amount"] for r in rows), 2) == 10000


def test_the_rounding_lands_on_the_last_instalment():
	rows = rules.flat_schedule(10000, 3, "2026-11")
	assert rows[0]["total_amount"] == 3333.33
	assert rows[-1]["total_amount"] == 3333.34


def test_the_months_run_forward_across_a_year_end():
	rows = rules.flat_schedule(3000, 3, "2026-11")
	assert [r["period"] for r in rows] == ["2026-11", "2026-12", "2027-01"]


def test_a_flat_rate_spreads_the_interest_evenly():
	rows = rules.flat_schedule(12000, 12, "2026-01", annual_rate=10)
	assert round(sum(r["total_amount"] for r in rows), 2) == 13200


def test_a_loan_with_no_term_yet_has_no_schedule():
	# The normal state of a draft, and not an error.
	assert rules.flat_schedule(10000, 0, "2026-11") == []
	assert rules.flat_schedule(10000, 3, "") == []
