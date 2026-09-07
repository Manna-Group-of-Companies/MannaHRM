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
