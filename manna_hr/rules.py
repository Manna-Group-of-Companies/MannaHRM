"""Rules that need no database, and are therefore testable without a site.

Same shape as the sales repo's `client/src/domain/` — plain functions over plain
data, so "where did this person stand" and "is this punch inside the window" can
be argued about, and tested, without a bench.

Nothing here imports `frappe`. That is the point, and it is worth keeping.
"""

import calendar
import re
from datetime import date, datetime

# ---------------------------------------------------------------- statuses ---

PRESENT = "present"
ON_FLOOR = "on_floor"
ON_LEAVE = "on_leave"
LEAVE_PENDING = "leave_pending"
HOLIDAY = "holiday"
WEEKLY_OFF = "weekly_off"
UNMARKED = "unmarked"
ABSENT = "absent"

LABELS = {
	PRESENT: "Present",
	ON_FLOOR: "Still in",
	ON_LEAVE: "On leave",
	LEAVE_PENDING: "Leave not yet granted",
	HOLIDAY: "Holiday",
	WEEKLY_OFF: "Weekly off",
	UNMARKED: "Not marked",
	ABSENT: "Absent",
}

# Frappe's Leave Application statuses that mean "nobody has decided yet".
UNDECIDED_LEAVE = ("Open", "Applied")


def resolve_day_status(
	has_punch_in,
	has_punch_out,
	leave_status,
	is_holiday,
	is_past_day,
):
	"""Where one person stood on one day.

	`absent` is deliberately the last resort. Calling somebody absent is a
	payroll consequence and, on a bad day, an accusation. So every innocent
	explanation is checked first, in this order:

	  1. **A punch beats everything.** Somebody who turned up worked, whatever
	     leave record exists. A worker who cancelled their leave and came in
	     must not be marked absent because the request was never withdrawn.
	  2. **Both punches, or they are still in.** A day counts as worked only
	     with a punch in *and* out; an open shift is not a complete day and is
	     not payroll-ready.
	  3. **Granted leave, then requested leave.** These are different facts. A
	     request nobody has decided is not time off, and treating it as such
	     would let unapproved absence disappear into the leave column.
	  4. **A holiday is nobody's absence.**
	  5. **A day still running, or one the shift job has not reached, is
	     unmarked — not absent.** Treating a missing record as an absence would
	     quietly mark the whole group absent at nine in the morning.

	Only what survives all five is absent.
	"""
	if has_punch_in:
		return PRESENT if has_punch_out else ON_FLOOR

	if leave_status == "Approved":
		return ON_LEAVE

	# A rejected request is decided, and the answer was no — so it explains
	# nothing and must not sit in the pending column. It is still worth carrying
	# alongside the row, because "asked, was refused, did not come in" is exactly
	# the context HR wants when they open it.
	if leave_status in UNDECIDED_LEAVE:
		return LEAVE_PENDING

	if is_holiday:
		return HOLIDAY

	if not is_past_day:
		return UNMARKED

	return ABSENT


def is_payroll_ready(statuses):
	"""A period can be signed off only when nothing is still open.

	An `on_floor` day means somebody's hours are unknown, so paying from that
	period is guesswork. Regularize them first.
	"""
	return ON_FLOOR not in set(statuses)


# ------------------------------------------------------------ punch window ---


def minute_of_day(hour, minute):
	return hour * 60 + minute


def is_within_punch_window(minute, opens, closes):
	"""Whether a self-service punch at `minute` is inside the working window.

	Not a fraud check — an honesty check on the shape of the day. A punch at 2am
	either mistyped or is something that needs a human to look at it, and the
	regularization queue is where a human looks.
	"""
	return opens <= minute <= closes


# ------------------------------------------------------- document expiry ---

DOC_VALID = "Valid"
DOC_EXPIRING = "Expiring"
DOC_EXPIRED = "Expired"
DOC_NO_EXPIRY = "No Expiry"

#: What a type that says nothing gets. Thirty days is long enough to book an
#: appointment and short enough that the list is not everybody, all the time.
DEFAULT_WARN_DAYS = 30


def document_status(valid_upto, on, has_expiry=True, warn_days=DEFAULT_WARN_DAYS):
	"""Where one document stands on the day `on`.

	`valid_upto` and `on` are `datetime.date`. Returns `(status, days_to_expiry)`
	with `days_to_expiry` None when there is no date to count to.

	Three decisions worth stating, because they are the ones somebody will
	disagree with later:

	**The expiry day itself is still valid.** A visa valid upto the 30th is
	valid on the 30th. Counting it as expired would send somebody home a day
	early, and the register exists to prevent the opposite mistake.

	**A type with no expiry is `No Expiry`, not `Valid`.** They read the same on
	a screen and behave differently in a report: `Valid` is a claim that
	somebody checked a date, and a PAN card has no date to check. Reporting it
	as valid would put it in the same bucket as a passport somebody has actually
	looked at this year.

	**A missing date on a type that has expiries is `Expiring`, not `Valid`.**
	This is the one that rounds against the file rather than against the person.
	An unfinished record is not evidence of a valid document, and the cost of
	the two mistakes is not symmetric: a document wrongly listed as expiring
	costs somebody a minute to check, and a visa wrongly listed as valid costs a
	person their shift and the company a fine.
	"""
	if not has_expiry:
		return DOC_NO_EXPIRY, None

	if not valid_upto:
		return DOC_EXPIRING, None

	days = (valid_upto - on).days

	if days < 0:
		return DOC_EXPIRED, days
	if days <= (warn_days if warn_days and warn_days > 0 else DEFAULT_WARN_DAYS):
		return DOC_EXPIRING, days
	return DOC_VALID, days


# ---------------------------------------------------- asset handover state ---

ASN_ASSIGNED = "Assigned"
ASN_PART_RETURNED = "Partly Returned"
ASN_RETURNED = "Returned"
ASN_PART_LOST = "Partly Lost"
ASN_LOST = "Lost"

#: The two a person picks, because no count can produce them.
#:
#: Everything above is arithmetic — how many went out, how many came back, how
#: many did not. These two are judgments about the *thing*: a laptop returned
#: with a dead screen came back on every count there is, and is still not
#: something to hand to the next person. The counts cannot say that, which is
#: why Factor HR's Asset Status dropdown carries them and why ours does too.
ASN_SCRAPPED = "Scrapped"
ASN_DAMAGED = "Damaged Or Not Working"
ASN_JUDGED = (ASN_SCRAPPED, ASN_DAMAGED)

#: Every word the field may hold, in the order the dropdown offers them.
ASN_STATUSES = (ASN_ASSIGNED, ASN_PART_RETURNED, ASN_RETURNED, ASN_PART_LOST,
                ASN_LOST, ASN_SCRAPPED, ASN_DAMAGED)


def assignment_status(assign_units, return_unit=0, lost_units=0, chosen=""):
	"""Where one handover stands, from the three counts alone.

	`chosen` is what somebody picked in the dropdown, and it is honoured for
	exactly the two states in `ASN_JUDGED` and ignored for every other. Anything
	else picked there is not silently overruled either — `assignment_status_problem`
	refuses the save and names both words, because somebody who sets Returned on
	a row where nothing came back has either mis-picked or forgotten to fill
	Return Unit, and quietly rewriting the box answers neither question.

	`AssignEntry.jsx` says this is "computed from the counts on every save
	rather than chosen, or the register would disagree with the arithmetic
	printed beside it". This is that arithmetic, and it is here rather than in
	the controller so it can be argued about without a site.

	The order of the tests is the whole content of the rule, because a handover
	can be two of these at once — two returned, one lost, none outstanding — and
	one field has to pick a word. It picks the one somebody has to act on:

	1. nothing is coming back                       -> Lost
	2. everything is accounted for, some of it lost -> Partly Lost
	3. everything is accounted for, none lost       -> Returned
	4. nothing has come back yet                    -> Assigned
	5. something is lost and something is still out -> Partly Lost
	6. otherwise                                    -> Partly Returned

	**Loss outranks return throughout.** A person needs to be told about the
	laptop that is gone before the two that came back, and a status that led
	with the good news would bury it.
	"""
	if chosen in ASN_JUDGED:
		return chosen

	out = int(assign_units or 0)
	back = int(return_unit or 0)
	gone = int(lost_units or 0)

	if out <= 0:
		return ""
	if gone >= out:
		return ASN_LOST
	if back + gone >= out:
		return ASN_RETURNED if gone == 0 else ASN_PART_LOST
	if back + gone == 0:
		return ASN_ASSIGNED
	if gone > 0:
		return ASN_PART_LOST
	return ASN_PART_RETURNED


def assignment_status_problem(chosen, assign_units, return_unit=0, lost_units=0):
	"""What is wrong with the status somebody picked, as a sentence. `""` if fine.

	A sentence rather than a bool because it is shown to the person who picked
	it, and it has to name both words or it is telling them they are wrong
	without saying what right would be.
	"""
	if not chosen or chosen in ASN_JUDGED:
		return ""
	if chosen not in ASN_STATUSES:
		return "{0} is not one of the states a handover can be in.".format(chosen)

	counted = assignment_status(assign_units, return_unit, lost_units)
	if counted and chosen != counted:
		return "Asset Status says {0}, but the counts under it make it {1}.".format(chosen, counted)
	return ""


def assignment_is_open(status):
	"""Is any of this handover still out with the person?

	What decides whether the asset may be issued to somebody else, and what
	`assets.py` checks before it lets a second handover be written.

	`Damaged Or Not Working` is open and `Scrapped` is not, which is the whole
	difference between the two: broken kit is still in somebody's drawer, so it
	cannot be issued to anybody else and a Valid Till that has gone by is still
	overdue. Scrapped kit is gone.
	"""
	return status in (ASN_ASSIGNED, ASN_PART_RETURNED, ASN_PART_LOST, ASN_DAMAGED)


# --------------------------------------------------------------------- loans ---
#
# A staff loan is four figures and a subtraction, and every one of the four is
# recorded rather than inferred: what was sanctioned, what was actually paid
# out, what was already owed the day this system took over, and what has been
# recovered since. Deriving any of them from the others is what makes a register
# that cannot be reconciled with the person's own recollection.

LOAN_APPLIED = "Applied"
LOAN_SANCTIONED = "Sanctioned"
LOAN_DISBURSED = "Disbursed"
LOAN_RUNNING = "Running"
LOAN_CLOSED = "Closed"

#: The two a person imposes. Applied is a loan not yet agreed; Closed is a
#: decision to stop chasing one, which no arithmetic can reach on its own — a
#: written-off loan still has money outstanding.
LOAN_CHOSEN_ONLY = (LOAN_APPLIED, LOAN_CLOSED)


def loan_outstanding(opening_balance=0, disbursed_amount=0, recovered_amount=0):
	"""What is still owed.

	Opening balance and disbursement are added, not chosen between: a loan
	carried over from Factor HR and then topped up is both, and treating them as
	alternatives silently forgives one of them.

	Never negative. Over-recovery is a fact about the repayments — somebody paid
	more than they owed — and it is reported by :func:`loan_overpaid`, not by an
	outstanding figure below zero that then prints as a credit on a register
	nobody reads that way.
	"""
	owed = _money(opening_balance) + _money(disbursed_amount) - _money(recovered_amount)
	return owed if owed > 0 else 0.0


def loan_overpaid(opening_balance=0, disbursed_amount=0, recovered_amount=0):
	"""How much more than was owed has been recovered. Usually zero."""
	over = _money(recovered_amount) - _money(opening_balance) - _money(disbursed_amount)
	return over if over > 0 else 0.0


def loan_status(sanctioned_amount=0, disbursed_amount=0, opening_balance=0,
                recovered_amount=0, chosen=""):
	"""Where a loan stands, from its figures and at most one word of judgment.

	Sanctioned but not paid, paid but nothing recovered, recovering — the three
	middle states are the figures and nothing else, because each of them is a
	different answer to "does this person owe us money today" and getting it
	from a dropdown means getting it wrong on the day somebody forgets.
	"""
	if chosen in LOAN_CHOSEN_ONLY:
		return chosen

	out = _money(disbursed_amount) + _money(opening_balance)
	if not out:
		return LOAN_SANCTIONED if _money(sanctioned_amount) else LOAN_APPLIED
	if _money(recovered_amount) <= 0:
		return LOAN_DISBURSED
	return LOAN_RUNNING if loan_outstanding(opening_balance, disbursed_amount, recovered_amount) > 0 \
		else LOAN_CLOSED


def loan_status_problem(chosen, sanctioned_amount=0, disbursed_amount=0, opening_balance=0,
                        recovered_amount=0):
	"""Why a chosen status disagrees with the figures, or "" when it does not.

	Refused rather than overwritten. Somebody picking `Closed` on a loan with
	money still owed is either wrong or knows something the figures do not say,
	and both of those deserve a sentence rather than a silent correction.
	"""
	if not chosen:
		return ""
	owed = loan_outstanding(opening_balance, disbursed_amount, recovered_amount)
	if chosen == LOAN_APPLIED and (_money(disbursed_amount) or _money(recovered_amount)):
		return "Applied, but money has already moved on this loan."
	if chosen == LOAN_CLOSED and owed > 0:
		return (
			"Closed, but {0:.2f} is still outstanding. Record the last repayment, or say why it is "
			"being written off in Remarks.".format(owed)
		)
	return ""


def repayment_problem(amount, outstanding, allow_overpay=False):
	"""Why one repayment cannot be recorded, or "" when it can."""
	paid = _money(amount)
	if paid <= 0:
		return "A repayment has to be for more than nothing."
	if not allow_overpay and paid > _money(outstanding):
		return "That is more than the {0:.2f} still owed on this loan.".format(_money(outstanding))
	return ""


def instalment_status(total_amount, paid_amount=0):
	"""Where one line of the repayment schedule stands."""
	due = _money(total_amount)
	paid = _money(paid_amount)
	if paid <= 0:
		return "Pending"
	if paid + 0.005 < due:
		return "Partly Paid"
	return "Paid"


def flat_schedule(principal, months, first_month, annual_rate=0):
	"""A flat-rate repayment schedule, as plain dictionaries.

	Flat rather than reducing-balance, because that is what these loans are:
	the interest, when there is any, is agreed as a figure on the whole amount
	at sanction and split evenly. A reducing-balance engine would produce
	different numbers from the ones on the paper the person signed.

	**The rounding goes into the last instalment.** Splitting 10,000 over three
	months gives 3,333.33 twice and 3,333.34 once, and a schedule whose lines do
	not add up to the loan is one payroll and the register argue about forever.

	`first_month` is `YYYY-MM`. Returns [] for a loan with no term yet, which is
	the normal state of a draft.
	"""
	principal = _money(principal)
	months = int(months or 0)
	if principal <= 0 or months <= 0 or not first_month:
		return []

	interest = round(principal * _money(annual_rate) / 100.0 * months / 12.0, 2)
	total = round(principal + interest, 2)

	per = round(total / months, 2)
	principal_per = round(principal / months, 2)
	interest_per = round(interest / months, 2)

	rows = []
	year, month = _split_month(first_month)
	for i in range(months):
		last = i == months - 1
		row_total = round(total - per * (months - 1), 2) if last else per
		row_principal = round(principal - principal_per * (months - 1), 2) if last else principal_per
		rows.append(
			{
				"period": "{0:04d}-{1:02d}".format(year, month),
				"principal_amount": row_principal,
				"interest_amount": round(row_total - row_principal, 2) if last else interest_per,
				"total_amount": row_total,
				"paid_amount": 0.0,
				"status": "Pending",
			}
		)
		year, month = (year + 1, 1) if month == 12 else (year, month + 1)
	return rows


def _split_month(period):
	"""`YYYY-MM`, or a date that starts with one, into two integers."""
	text = str(period)[:7]
	year, _sep, month = text.partition("-")
	return int(year), int(month)


def _money(value):
	"""Currency out of whatever Frappe handed over — None, "", Decimal, str."""
	try:
		return float(value or 0)
	except (TypeError, ValueError):
		return 0.0


# ------------------------------------------------------------------ surveys ---


def survey_is_open(status, on, start_date=None, end_date=None):
	"""Whether a survey accepts an answer today.

	The dates narrow `Open`; they never widen `Closed`. A survey somebody closed
	early is closed, whatever its end date still says.
	"""
	if status != "Open":
		return False
	if start_date and str(on) < str(start_date):
		return False
	if end_date and str(on) > str(end_date):
		return False
	return True


def survey_answer_problems(questions, answers):
	"""Required questions with nothing against them.

	Returns the question numbers, in order, so the message can name them. An
	answer of `0` on a rating counts as answered — it is the lowest score, not a
	blank — which is why this tests for None and empty string rather than
	falsiness.
	"""
	given = {}
	for a in answers or []:
		no = _int(_get(a, "question_no"))
		if _answered(_get(a, "answer")) or _answered(_get(a, "rating")):
			given[no] = True

	missing = []
	for q in questions or []:
		if _int(_get(q, "is_required")) and not given.get(_int(_get(q, "question_no"))):
			missing.append(_int(_get(q, "question_no")))
	return missing


def _answered(value):
	return value is not None and str(value).strip() != ""


def _get(row, key):
	return row.get(key) if isinstance(row, dict) else getattr(row, key, None)


def _int(value):
	try:
		return int(value or 0)
	except (TypeError, ValueError):
		return 0


def _flag(value):
	"""A Frappe Check, however it arrived.

	`0`, `"0"`, `""`, `None` and `False` are all off. **`"0"` is the one that
	matters**: a checkbox read back off a form or out of JSON is a string, and
	`bool("0")` is True — which would publish every draft notice ever saved.
	"""
	if value in (None, "", False, 0):
		return False
	return str(value).strip() not in ("0", "false", "False", "no", "No")


# ------------------------------------------------------- attendance devices ---


def device_is_trusted(device_id, prefix):
	"""Whether a punch from this device skips the geofence.

	The same test `checkin.py` makes, in one place so the device register and
	the punch validator cannot disagree about what a machine is. An empty prefix
	trusts nothing — the failure that matters is a phone punch treated as a
	machine punch, not the other way round.
	"""
	if not prefix:
		return False
	return str(device_id or "").startswith(str(prefix))


def device_is_silent(last_punch_at, now, silent_after_hours):
	"""Whether a registered device has been quiet long enough to alert on.

	Zero or blank hours means never alert on this one — right for a machine at a
	yard that works one shift a week. A device that has never sent anything is
	not silent: it is not commissioned, and alerting on it daily forever is how
	people learn to ignore the alert.
	"""
	hours = _int(silent_after_hours)
	if hours <= 0 or not last_punch_at:
		return False
	return (now - last_punch_at).total_seconds() > hours * 3600


# ---------------------------------------------------------- announcements ---


def announcement_is_live(row, on):
	"""Whether the front page should be showing this notice on the day `on`.

	Both ends inclusive: `to_date` is the last day it shows, not the first day
	it stops. Off by one here takes a notice down the morning of the day it was
	meant for, which is the one day it mattered.

	Dates are compared as strings. `YYYY-MM-DD` sorts correctly as text and
	carries no zone; parsed as an instant it becomes the previous day for
	anybody reading it after half past five in Chennai.
	"""
	if not _flag(row.get("published")):
		return False
	on = str(on or "")[:10]
	start = str(row.get("from_date") or "")[:10]
	end = str(row.get("to_date") or "")[:10]
	if start and on < start:
		return False
	if end and on > end:
		return False
	return True


def announcement_problems(row):
	"""What is wrong with this notice, in the words somebody has to act on.

	**Publishing is the expensive direction here, so this refuses the save.**
	Everything else in this app is opened by somebody who went looking for it; a
	published notice appears in front of every employee who signs in. A wrong
	one cannot be taken back from the people who have already read it, and the
	cost of stopping somebody mid-typing is a minute.
	"""
	out = []
	title = str(row.get("title") or "").strip()
	if not title:
		out.append("A notice needs a title — it is the whole of what most people will read.")

	start = str(row.get("from_date") or "")[:10]
	end = str(row.get("to_date") or "")[:10]
	if start and end and end < start:
		out.append(
			f"The window ends before it begins ({start} to {end}), so this would never show."
		)

	if _flag(row.get("published")) and not str(row.get("body") or "").strip():
		out.append(
			"Published with an empty body. A title on everybody's front page with nothing "
			"behind it reads as a system fault rather than as a notice."
		)

	kind = str(row.get("kind") or "")
	if kind not in ("Announcement", "CEO Speak"):
		out.append(f"{kind or 'Blank'} is not a kind of notice this app draws.")

	return out


def live_announcements(rows, on, kind=None):
	"""The notices to draw today, newest window first.

	Sorted by `from_date` rather than by when the record was made: a notice
	written in March for a window in September belongs in September's order,
	and creation order would bury it under everything written since.
	"""
	live = [r for r in rows or [] if announcement_is_live(r, on)]
	if kind:
		live = [r for r in live if str(r.get("kind") or "") == kind]
	return sorted(live, key=lambda r: str(r.get("from_date") or ""), reverse=True)


# --------------------------------------------------- attendance submission ---
#
# Factor HR's monthly close. HR submits one company's month, payroll is run
# from it, and from then on nothing in that month may change underneath the
# payslips. Frappe HR has no such gate — payroll reads `Attendance` live — so
# the gate is these rules and `manna_hr/freeze.py`, which is where they meet a
# site.
#
# A period is `YYYY-MM`, the spelling the loan schedule already uses, because
# it sorts and compares as a string exactly as it does as a month.

_PERIOD = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

_MON = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

#: hrms's Attendance statuses, each counted under its own figure.
ATT_COUNTED = {
	"Present": "present",
	"Half Day": "half_day",
	"Absent": "absent",
	"On Leave": "on_leave",
	"Work From Home": "work_from_home",
}


def period_bounds(period):
	"""`YYYY-MM` → (first day, last day) as `datetime.date`, or None.

	The real last day, not the 31st. A freeze that ran to the 31st of a
	thirty-day month would claim the 1st of the next one, and the person whose
	punch on that day was refused would be the one to find out.
	"""
	m = _PERIOD.match(str(period or "").strip())
	if not m:
		return None
	year, month = int(m.group(1)), int(m.group(2))
	return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def period_label(period):
	"""`2026-08` → `Aug-26`, which is how Factor HR writes a period."""
	bounds = period_bounds(period)
	if not bounds:
		return str(period or "")
	return "{0}-{1:02d}".format(_MON[bounds[0].month - 1], bounds[0].year % 100)


def period_problem(period, today):
	"""Why this month cannot be submitted on `today`, or "" when it can.

	**Not until its last day is over.** Submitting on the 30th freezes the 30th
	and the 31st before anybody has worked them: nothing punched on those days
	could then become a day of attendance, and they would reach payroll as
	absences. Waiting a day costs HR a day; the other way round costs somebody
	two days' pay. `today` is the server's, never the browser's.
	"""
	bounds = period_bounds(period)
	if not bounds:
		return "The period has to be a month, written YYYY-MM — 2026-08 for August 2026."
	if _as_date(today) <= bounds[1]:
		return (
			"{0} has not ended yet — its last day is {1}. A month is submitted once every day "
			"in it has been worked; submitting it now would freeze the days still to come as "
			"days nobody attended."
		).format(period_label(period), bounds[1].isoformat())
	return ""


def months_touched(from_date, to_date=None):
	"""Every `YYYY-MM` a date range touches, in order.

	A leave from 28 August to 3 September is in two months, and a freeze on
	either of them is a freeze on it.
	"""
	a = _as_date(from_date)
	b = _as_date(to_date or from_date)
	if b < a:
		a, b = b, a
	out = []
	year, month = a.year, a.month
	while (year, month) <= (b.year, b.month):
		out.append("{0:04d}-{1:02d}".format(year, month))
		year, month = (year + 1, 1) if month == 12 else (year, month + 1)
	return out


def attendance_summary(rows):
	"""A month's Attendance, counted — the figures a submission keeps beside itself.

	`rows` are submitted Attendance rows, each with `employee` and `status`.
	Kept on the submission so that anything that later changes the month without
	passing through the freeze — a `db_set`, a console — leaves figures that no
	longer match the rows, which is something a person can see.

	**A status this does not know is counted, under `other`, rather than
	dropped.** A total that silently omits rows is a total that does not add up
	and nobody can find out why.
	"""
	out = {"employees": 0, "rows": 0, "other": 0}
	for key in ATT_COUNTED.values():
		out[key] = 0
	people = set()
	for row in rows or []:
		out["rows"] += 1
		people.add(_get(row, "employee"))
		out[ATT_COUNTED.get(str(_get(row, "status") or ""), "other")] += 1
	people.discard(None)
	people.discard("")
	out["employees"] = len(people)
	return out


def submission_blockers(attendance_rows, open_corrections=0, open_leave=0):
	"""Why a month cannot be frozen yet, as sentences. Empty when it can.

	Each is a thing that would change a day after the month had been paid from.
	The setup advice on the page — Shift Types, who has a shift — is not here,
	deliberately: those are reasons the figures might be poor, and refusing on
	them would leave a company unable to close a month at all until a
	configuration project finished.
	"""
	out = []
	if _int(attendance_rows) <= 0:
		out.append(
			"No attendance has been generated for this month. Submitting it would freeze a "
			"month of nothing and hand it to payroll as fact."
		)
	corrections = _int(open_corrections)
	if corrections:
		out.append(
			"{0} attendance correction{1} for this month {2} still open — waiting for a decision, "
			"or approved and not yet rebuilt. Each one changes a day; settle them first.".format(
				corrections, "" if corrections == 1 else "s", "is" if corrections == 1 else "are"
			)
		)
	leave = _int(open_leave)
	if leave:
		out.append(
			"{0} leave application{1} touching this month {2} still Open. Once the month is "
			"frozen nobody could approve {3}, so decide {3} first.".format(
				leave, "" if leave == 1 else "s", "is" if leave == 1 else "are",
				"it" if leave == 1 else "them",
			)
		)
	return out


def reopen_problem(salary_slips):
	"""Why a submitted month cannot be reopened, or "" when it can.

	Factor HR's own rule: once salary has been processed from a month, the month
	stays shut. Reopening would change the attendance under payslips that have
	already been paid, and nothing would then say which of the two was right.
	"""
	slips = _int(salary_slips)
	if slips:
		return (
			"Salary has already been processed from this month — {0} submitted salary slip{1}. "
			"Reopening it would change the attendance under pay that has gone out. Cancel {2} "
			"first, or put the difference through next month."
		).format(slips, "" if slips == 1 else "s", "that slip" if slips == 1 else "those slips")
	return ""


def frozen_message(period, company, submission, what):
	"""The sentence a write into a submitted month is refused with.

	**It carries the submission's name in brackets, and that is load-bearing.**
	hrms writes this sentence onto every punch it sets aside because of it, and
	reopening the month finds those punches again by searching for exactly that
	bracketed name — see `freeze.release_held_punches`.
	"""
	return (
		"{0} is submitted for {1} ({2}), so {3} is refused. If no salary has been processed "
		"from it, reopen the month by cancelling {2}; otherwise put the change through next month."
	).format(period_label(period), company or "this company", submission, what)


def _as_date(value):
	"""A `date` out of a date, a datetime, or the string Frappe sends."""
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value
	return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


# ------------------------------------------------------------- sandwich leave ---
#
# Factor HR's rule: a weekend or holiday run between two days of leave or
# absence is swept into the leave, so a Friday-and-Monday application costs
# four days, not two. Ours only when both sides say so — a Friday off with
# nothing either side of the weekend is a long weekend, not a sandwich, and the
# rule must never manufacture an absence out of one lonely day of leave.


def sandwich_leave_dates(days):
	"""Which of a run of off days get swept into leave, as their dates.

	`days` is every day in the window under consideration, in date order, each
	one `{"date": ..., "is_off": bool, "is_leave": bool}` — `is_off` for a
	weekend or holiday, `is_leave` for a day already leave, applied-for leave,
	or marked absent. The window has to reach at least one working day past
	each end of a run under test, or that run is judged as if the calendar
	stopped there and never swept.

	**Both ends have to say so.** A run of off days is judged only by the
	working day immediately before it and the working day immediately after —
	one on leave and the other not is exactly the case this must leave alone,
	because sweeping it would turn a Friday off into a Saturday absence nobody
	applied for.

	A run at either edge of the window, with no day beyond it to check, is left
	alone rather than guessed at — the caller's window did not reach far enough
	to answer, and an unanswerable day is not swept.
	"""
	out = []
	n = len(days)
	i = 0
	while i < n:
		if not days[i]["is_off"]:
			i += 1
			continue
		j = i
		while j < n and days[j]["is_off"]:
			j += 1
		before_ok = i > 0 and days[i - 1]["is_leave"]
		after_ok = j < n and days[j]["is_leave"]
		if before_ok and after_ok:
			out.extend(d["date"] for d in days[i:j])
		i = j
	return out


# ------------------------------------------------------- onboarding via form ---
#
# The Google Form an employee fills in themselves. It lands in a Sheet outside
# this app's control, so a row of it is untrusted input in exactly the sense a
# phone punch is (CLAUDE.md §1) — and the mapping below is the only thing that
# decides what an answer is allowed to become on `Employee Onboarding`, so it is
# argued about here rather than inside the Google API call that fetches it.

#: The Google Form's question titles, in the order the Form should ask them,
#: mapped to the field each answer becomes on `Employee Onboarding`. The Form
#: must use these exact titles — Google Sheets names each column after the
#: question it came from, and this is the only place that has to agree with
#: that wording.
ONBOARDING_FORM_FIELDS = {
	"Full Name": "employee_name",
	"Personal Email": "custom_personal_email",
	"Mobile Number": "custom_cell_number",
	"Date of Birth": "custom_date_of_birth",
	"Date of Joining": "date_of_joining",
	"Company": "company",
	"Department": "department",
	"Designation": "designation",
	# The rest of the Form, as it stood on 24 September 2026. Each lands in a
	# Custom Field of ours on Employee Onboarding (install.py).
	"Timestamp": "custom_form_timestamp",
	"Current Address": "custom_current_address",
	"Permanent Address": "custom_permanent_address",
	"Aadhaar Number": "custom_aadhaar_number",
	"Other Identity Proof / ID Number": "custom_other_id_proof",
	"Marital Status": "custom_marital_status",
	"Family Members": "custom_family_members",
	"Family Member Details": "custom_family_details",
	"Is the Employee Covered by Other Insurance?": "custom_other_insurance",
	"Insurance Provider": "custom_insurance_provider",
	"Insurance Policy Number": "custom_insurance_policy_no",
	"Highest Qualification": "custom_highest_qualification",
}

#: The one answer every row is matched on. Typed twice, it is the same person
#: applying twice, not two candidates — an email is the one thing this Form
#: asks for that does not need a machine code to disambiguate, the way
#: `attendance_device_id` does for a punch.
ONBOARDING_MATCH_FIELD = "custom_personal_email"

#: The Sheet column `ONBOARDING_MATCH_FIELD` is read from — derived rather than
#: repeated, so the header and the field it fills can never name two different
#: questions.
ONBOARDING_MATCH_HEADER = next(
	h for h, f in ONBOARDING_FORM_FIELDS.items() if f == ONBOARDING_MATCH_FIELD
)


def map_onboarding_row(row):
	"""One Sheet row, as `{question title: answer}`, into an `Employee
	Onboarding` doc's fields.

	Blank answers are left out rather than sent empty — the same rule
	`employeeFromCandidate` follows on the client: writing "" for a field the
	candidate never reached would overwrite whatever a fuller, later answer
	set, and Google Forms never sends a question the person left blank as
	anything else.
	"""
	doc = {}
	for header, field in ONBOARDING_FORM_FIELDS.items():
		raw = row.get(header, "")
		if field in ONBOARDING_DATE_FIELDS:
			raw = sheet_serial_to_iso(raw)
		elif field == "custom_form_timestamp":
			raw = sheet_serial_to_datetime(raw)
		value = str(raw or "").strip()
		if value:
			doc[field] = value
	return doc


#: The answers that are dates. The Sheet is read with dates as serial numbers
#: (onboard_sync._sheet_rows) because its display format is its locale's — the
#: live one is a US Sheet, and its 9/13/2026 read as India's is a thirteenth
#: month, which is what the first real import sent the site on 24 Sep 2026.
ONBOARDING_DATE_FIELDS = ("custom_date_of_birth", "date_of_joining")


def sheet_serial_to_datetime(value):
	"""The Form's Timestamp column, a serial date with the time as its fraction,
	as `YYYY-MM-DD HH:MM:SS`. Anything else is handed back untouched."""
	import datetime

	if isinstance(value, bool) or not isinstance(value, (int, float)):
		return value
	at = datetime.datetime(1899, 12, 30) + datetime.timedelta(seconds=round(value * 86400))
	return at.strftime("%Y-%m-%d %H:%M:%S")


def sheet_serial_to_iso(value):
	"""A Sheets serial date — days since 30 December 1899 — as `YYYY-MM-DD`.
	Anything that is not a number is handed back untouched, so a date typed as
	text reaches the site as typed and the site's refusal names it."""
	import datetime

	if isinstance(value, bool) or not isinstance(value, (int, float)):
		return value
	return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(value))).isoformat()
