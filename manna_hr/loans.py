"""The parts of a staff loan that need a site.

The arithmetic is in `rules.py` and is testable without one. This file is the
three things that are not arithmetic: reading the repayments back off the site,
building the schedule, and refusing a save that would leave the register saying
two different things about the same loan.

**A loan here is the application.** There is no second document for "the loan"
once it is sanctioned, because there was never a moment when the two disagreed
and a second document is a second place for somebody to correct only one of
them. `loan_status` carries it from Applied to Closed.
"""

import frappe
from frappe import _
from frappe.utils import add_months, get_first_day, getdate

from manna_hr import rules


def recovered_for(loan):
	"""Everything recovered against one loan, from the repayment rows.

	Read rather than accumulated. A running total kept on the loan drifts the
	first time a repayment is cancelled, and it drifts silently — the figure
	still looks like money.
	"""
	if not loan:
		return 0.0
	total = frappe.db.get_value(
		"Employee Loan Repayment",
		{"loan_application": loan, "docstatus": ["<", 2]},
		"sum(amount)",
	)
	return float(total or 0)


def refresh_totals(doc):
	"""Recovered, outstanding and status, in that order — each needs the last."""
	doc.recovered_amount = recovered_for(doc.name)
	doc.outstanding_amount = rules.loan_outstanding(
		doc.opening_balance, doc.disbursed_amount, doc.recovered_amount
	)

	problem = rules.loan_status_problem(
		doc.loan_status, doc.sanctioned_amount, doc.disbursed_amount,
		doc.opening_balance, doc.recovered_amount,
	)
	if problem:
		frappe.throw(_(problem))

	doc.loan_status = rules.loan_status(
		doc.sanctioned_amount, doc.disbursed_amount, doc.opening_balance,
		doc.recovered_amount, chosen=doc.loan_status,
	)


def check_against_type(doc):
	"""What the scheme allows. Named figures, never a silent trim."""
	if not doc.loan_type:
		return
	scheme = frappe.db.get_value(
		"Employee Loan Type",
		doc.loan_type,
		["maximum_amount", "term_months", "is_active"],
		as_dict=True,
	) or {}

	if not scheme.get("is_active") and doc.is_new():
		frappe.throw(_("{0} has been retired. Pick a scheme that is still offered.").format(doc.loan_type))

	ceiling = float(scheme.get("maximum_amount") or 0)
	if ceiling and float(doc.sanctioned_amount or 0) > ceiling:
		frappe.throw(
			_("{0} allows at most {1}. Sanction less, or raise the ceiling on the scheme.").format(
				doc.loan_type, frappe.format_value(ceiling, {"fieldtype": "Currency"})
			)
		)


def build_schedule(doc):
	"""Fill the repayment schedule, but only while nothing has been recovered.

	A schedule that rewrites itself under a loan somebody has been paying is a
	loan nobody can reconcile: the register would show instalments that were
	never the ones deducted. So once a rupee has come back, the schedule is
	frozen and a change of term is a decision for a person with a keyboard.
	"""
	if doc.repayment_schedule and float(doc.recovered_amount or 0) > 0:
		return

	term = _term_for(doc)
	start = doc.deduction_start_from or doc.payment_date or doc.loan_date
	if not (doc.sanctioned_amount and term and start):
		return

	first = get_first_day(getdate(start))
	rows = rules.flat_schedule(
		doc.sanctioned_amount, term, first.strftime("%Y-%m"),
		annual_rate=_rate_for(doc),
	)
	if doc.monthly_instalment:
		# An instalment somebody agreed to that the arithmetic would not have
		# produced. The term follows the figure rather than the other way round,
		# and the last line still carries the rounding.
		rows = rules.flat_schedule(
			doc.sanctioned_amount,
			max(1, int(round(float(doc.sanctioned_amount) / float(doc.monthly_instalment)))),
			first.strftime("%Y-%m"), annual_rate=_rate_for(doc),
		)

	doc.set("repayment_schedule", [])
	for i, row in enumerate(rows):
		row = dict(row)
		row["due_date"] = add_months(first, i)
		doc.append("repayment_schedule", row)


def apply_repayments(doc):
	"""Mark schedule lines against the repayments actually recorded.

	Matched by `period` where a repayment names one, and spilled forward
	otherwise — money recovered outside payroll rarely names a month, and
	dropping it would leave a schedule that says nothing was paid on a loan that
	is visibly shrinking.
	"""
	if not doc.repayment_schedule:
		return

	paid = frappe.get_all(
		"Employee Loan Repayment",
		filters={"loan_application": doc.name, "docstatus": ["<", 2]},
		fields=["period", "amount"],
	)
	by_period = {}
	spill = 0.0
	for row in paid:
		if row.get("period"):
			by_period[row["period"]] = by_period.get(row["period"], 0.0) + float(row["amount"] or 0)
		else:
			spill += float(row["amount"] or 0)

	for line in doc.repayment_schedule:
		amount = by_period.get(line.period, 0.0)
		if spill > 0:
			room = float(line.total_amount or 0) - amount
			take = min(room, spill) if room > 0 else 0.0
			amount += take
			spill -= take
		line.paid_amount = round(amount, 2)
		line.status = rules.instalment_status(line.total_amount, line.paid_amount)


def close_if_finished(doc):
	"""Set the completion flag from the figures, unless somebody has said not to."""
	if doc.do_not_auto_complete:
		return
	finished = doc.loan_status == rules.LOAN_CLOSED
	doc.loan_completed = 1 if finished else 0
	if finished and not doc.loan_completed_on:
		doc.loan_completed_on = frappe.utils.today()
	if not finished:
		doc.loan_completed_on = None


def _term_for(doc):
	term = int(doc.get("term_months") or 0)
	if term:
		return term
	return int(frappe.db.get_value("Employee Loan Type", doc.loan_type, "term_months") or 0)


def _rate_for(doc):
	if doc.interest_type == "Interest free":
		return 0
	return float(frappe.db.get_value("Employee Loan Type", doc.loan_type, "rate_of_interest") or 0)
