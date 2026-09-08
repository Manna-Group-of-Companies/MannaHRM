"""Rules that need no database, and are therefore testable without a site.

Same shape as the sales repo's `client/src/domain/` — plain functions over plain
data, so "where did this person stand" and "is this punch inside the window" can
be argued about, and tested, without a bench.

Nothing here imports `frappe`. That is the point, and it is worth keeping.
"""

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
