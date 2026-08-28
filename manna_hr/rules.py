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
