"""Casual Leave: one day a month, and what is not taken carries on.

The rule, as HR gave it on 24 September 2026: an employee earns one leave a
month, and a month in which they take none adds it to the next. It is also
what Factor HR's own numbers say — 66 people held exactly 8.0 days of Casual
Leave at the end of August, which is one a month from January
(docs/FACTOHR_SCREENS.md §4).

This is hrms's **Earned Leave**, not something built here: a Leave Type with a
monthly frequency, a Leave Policy granting twelve a year, and hrms's daily
scheduler adding one to every open allocation on the first of the month. The
carry within the year is free — an earned-leave allocation only ever grows, and
a day not taken is simply still in it. The carry *across* years is
`is_carry_forward` plus a new assignment each January with `carry_forward` set.

Pure values and date arithmetic, no `frappe` — the same file is read by
`install.py` on a bench and by `tools/setup_monthly_leave.py` against the live
site, so the two cannot describe different leave.
"""

from datetime import date, timedelta

LEAVE_TYPE_NAME = "Casual Leave"

#: Twelve a year is what hrms is given; it divides by the frequency itself, so
#: "one a month" is this number and `earned_leave_frequency`, never a 1 typed
#: anywhere else.
ANNUAL_ALLOCATION = 12

#: The fields that make `Casual Leave` monthly. Only these are compared and
#: written on a site that already has the type, so anything else HR set on it
#: — a colour, `include_holiday`, an approver rule — is left alone.
LEAVE_TYPE = {
	"leave_type_name": LEAVE_TYPE_NAME,
	"is_earned_leave": 1,
	"earned_leave_frequency": "Monthly",
	# On the 1st rather than the last day: a person who has worked a month is
	# owed its leave from the morning after, not from the last evening of it.
	"allocate_on_day": "First Day",
	"is_carry_forward": 1,
	# 0 is hrms for "no cap". Nobody has named a ceiling, and a cap invented
	# here would quietly delete days somebody earned.
	"maximum_carry_forwarded_leaves": 0,
	"max_leaves_allowed": 0,
	"is_lwp": 0,
	"allow_negative": 0,
}

POLICY_TITLE = "Manna Casual Leave — 1 a month"

LEAVE_POLICY = {
	"title": POLICY_TITLE,
	"leave_policy_details": [
		{"leave_type": LEAVE_TYPE_NAME, "annual_allocation": ANNUAL_ALLOCATION},
	],
}

#: The most a month the Create Employee wizard will take. Not a rule HR gave —
#: a ceiling on a typo, so a 10 meant as 1.0 is questioned rather than
#: submitted as 120 days a year.
MAX_PER_MONTH = 5


def policy_title(per_month, leave_type=LEAVE_TYPE_NAME):
	"""The title of the policy that gives `per_month` of `leave_type` a month.

	**One policy per type and rate**, because hrms's earned leave is a property
	of the policy and not of the person: somebody on two a month is somebody on
	a policy of twenty-four a year. The title is how the wizard and this module
	find the same one, so one Casual Leave must come out as POLICY_TITLE
	exactly — the policy already on the site.
	"""
	n = float(per_month)
	return "Manna {0} — {1} a month".format(leave_type, int(n) if n == int(n) else n)


def leave_policy(per_month, leave_type=LEAVE_TYPE_NAME):
	"""The Leave Policy that gives `per_month` of `leave_type` a month."""
	n = float(per_month)
	return {
		"title": policy_title(n, leave_type),
		"leave_policy_details": [
			# Monthly frequency divides this by twelve, so the year is the only
			# number written anywhere — the same as ANNUAL_ALLOCATION above.
			{"leave_type": leave_type, "annual_allocation": ANNUAL_ALLOCATION * n},
		],
	}


def is_monthly(site_row):
	"""Whether a Leave Type on the site is earned a piece each month.

	What makes "N a month" true. A type that is not is handed its whole year's
	allocation the moment a policy is assigned, so a policy of twenty-four for
	two a month would be twenty-four days on the first morning.
	"""
	return (
		int(float(site_row.get("is_earned_leave") or 0)) == 1
		and site_row.get("earned_leave_frequency") == "Monthly"
	)


def per_month_problem(value):
	"""What is wrong with a leaves-a-month answer, or None when it will do.

	Halves are allowed because hrms deals in half days. Zero is allowed and
	means no Casual Leave at all — a real answer for some contracts, and one
	that writes nothing.
	"""
	try:
		n = float(value)
	except (TypeError, ValueError):
		return "Leaves A Month is not a number."
	if n < 0:
		return "Leaves A Month cannot be negative."
	if n * 2 != int(n * 2):
		return "Leaves A Month goes in half days — 1, 1.5, 2."
	if n > MAX_PER_MONTH:
		return "{0} leaves a month is {1} a year — check the number.".format(
			int(n) if n == int(n) else n, int(ANNUAL_ALLOCATION * n))
	return None


def leave_year(year, start_month=1):
	"""The leave year that starts in `year`, as (first day, last day).

	January by default because that is what Factor HR's 8.0-by-August implies;
	`start_month=4` is the financial year, if HR says so.
	"""
	start = date(year, start_month, 1)
	return start, date(year + 1, start_month, 1) - timedelta(days=1)


def effective_from(year_start, today):
	"""The day an assignment made `today` should start earning from.

	**Not the start of the year when that is already past.** hrms credits every
	month between `effective_from` and today the moment the assignment is
	submitted, so a January start written in September hands everybody nine
	days at once — including the days they already took in Factor HR. Rounds
	toward the current month, whose one day hrms credits immediately; opening
	balances from Factor HR are a separate, deliberate load.
	"""
	if today <= year_start:
		return year_start
	return date(today.year, today.month, 1)


def differs(site_row):
	"""The fields of `LEAVE_TYPE` the site's row does not already hold.

	Numbers are compared as numbers: the site returns `0` for an unset check
	and `0.0` for an unset float, and neither is a difference.
	"""
	out = {}
	for key, want in LEAVE_TYPE.items():
		have = site_row.get(key)
		if isinstance(want, (int, float)):
			try:
				same = float(have or 0) == float(want)
			except (TypeError, ValueError):
				same = False
		else:
			same = (have or "") == want
		if not same:
			out[key] = want
	return out
