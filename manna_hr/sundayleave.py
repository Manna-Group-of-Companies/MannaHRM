"""Sunday leave: every Sunday an office employee works adds a day of Casual Leave.

HR's rule of 3 October 2026: an office employee who works on a Sunday has
their Casual Leave raised by one day for each Sunday worked, and the website
does it by itself.

**How the day is added: a Leave Adjustment, not a Compensatory Leave Request.**
hrms's own "worked a holiday, earn a day" is the compensatory request, and it
cannot work on this site as it stands (read 3 October 2026): it refuses
without a Present Attendance on the holiday, and no Shift Type here marks
attendance on holidays, so a worked Sunday is punches and no Attendance; and
it refuses without a Leave Period, of which the site has none.

Nor is it added to the allocation itself (`allocate_leaves_manually`). Casual
Leave is earned leave, and hrms caps an earned-leave allocation at the
policy's twelve a year counting every day added to it — so a Sunday's day
would be quietly taken back out of December's monthly credit. A Leave
Adjustment writes its own ledger entry, which the cap does not count and
which hrms's balance does (`get_leave_allocation_records`).

**One adjustment per allocation, so it carries the total.** hrms refuses a
second submitted Leave Adjustment on the same allocation. So the rule keeps
exactly one of its own per Casual Leave allocation, holding every Sunday
earned in that allocation's period, and when the total changes it cancels
that one and submits an amended one with the new total.

**What counts as worked.** The day's submitted Attendance, when the site has
one (Present a day, Half Day half); otherwise its punches, because that is
all a Sunday has here: an in and an out is a day. No minimum hours — the
office shifts set no threshold, and refusing somebody who did come in is the
expensive mistake (CLAUDE.md §4).

Pure: no `frappe`. `sundayleave_site.py` does what the plan says;
`client/src/lib/sundayleave.js` is the dashboard's copy, pinned to this file
by `client/tests/sundayleave.test.js`.
"""

from datetime import date, timedelta

from manna_hr import leavepolicy as lp

LEAVE_TYPE = lp.LEAVE_TYPE_NAME

#: Who it is for: office staff, HR's word of 3 October 2026. Its own list, not
#: the absence rule's — that one was widened to supervisors and drivers on
#: 6 October, and a Sunday worked by them was not part of the decision.
GROUPS = ("Office",)


def applies_to(designation):
	"""Whether a Sunday worked earns this person a day of Casual Leave."""
	return lp.casual_leave_group(designation) in GROUPS

#: The start of the adjustment's `reason_for_adjustment`. How the rule knows
#: its own adjustment, and the only one it will ever cancel.
AUTO_MARK = "[Sunday leave]"

#: Sundays before this earn nothing. September counts (HR, 3 October 2026,
#: reading Saji Kumar's 20 and 27 September off the calendar): a Sunday's day
#: is leave given, not pay taken, so reaching back into a paid month costs
#: nobody anything. The absence rule also starts in September now (6 October).
EFFECTIVE_FROM = date(2026, 9, 1)

#: Only a first allocation that starts by this day reaches back to
#: EFFECTIVE_FROM. The reach-back exists for one changeover — office staff
#: given Casual Leave from 1 October, with September Sundays already worked —
#: and not for somebody who joins the office later: a machine operator made
#: Stores In-charge in February, whose factory Sundays were overtime, not this.
BACKFILL_UNTIL = date(2026, 10, 1)

#: How long after an allocation ends its Sundays are still looked at — long
#: enough for a late correction to a December Sunday to reach it in January,
#: short enough that each run is not every past year's Sundays again.
GRACE_DAYS = 31

#: What a Sunday's Attendance earns, when the site has marked one.
WORKED = {"Present": 1, "Work From Home": 1, "Half Day": 0.5}

SUNDAY = 6


def counts(allocation):
	"""Whether Sunday leave goes on this Casual Leave allocation: only one the
	Casual Leave policy made, which carries its `leave_policy_assignment`.

	The others are one-month allocations `tools/backfill_casual_leave.py` made
	so an absence in a month before the policy began could be taken as leave
	(September 2026). Counted as somebody's *first*, one would take the Sundays
	before it — and a credit on an allocation that ends that month is a day
	nobody can spend.
	"""
	return bool((allocation or {}).get("leave_policy_assignment"))


def _day(v):
	if isinstance(v, date):
		return v
	return date.fromisoformat(str(v)[:10])


def is_auto(reason):
	"""Whether a Leave Adjustment is one this rule made."""
	return str(reason or "").lstrip().startswith(AUTO_MARK)


def still_open_since(today):
	"""The earliest `to_date` an allocation may have and still be looked at."""
	return max(EFFECTIVE_FROM, _day(today) - timedelta(days=GRACE_DAYS))


def window(allocation_from, allocation_to, today, first=False):
	"""The days of an allocation whose Sundays count, as (first, last), or None.

	**The person's first Casual Leave allocation also takes the Sundays before
	it**, back to EFFECTIVE_FROM. Most office staff were given Casual Leave from
	1 October; a Sunday worked in September belongs to no allocation, and hrms
	will not adjust one for a day outside it. It goes into the first one they
	have, where it can be spent. Only the first: a Sunday in the gap after an
	allocation has ended is one that allocation already counted, or chose not to.
	"""
	reach_back = first and _day(allocation_from) <= BACKFILL_UNTIL
	start = EFFECTIVE_FROM if reach_back else max(_day(allocation_from), EFFECTIVE_FROM)
	end = min(_day(allocation_to), _day(today))
	return (start, end) if start <= end else None


def sundays(start, end, holidays=None):
	"""The Sundays from `start` to `end` that are the person's weekly off.

	`holidays` is the set of dates on their holiday list. None means the list
	could not be read, and then every Sunday is taken as the weekly off — the
	rounding that gives somebody a day rather than loses them one. A Sunday the
	list does not hold is a working Sunday for that person, and earns nothing
	extra.
	"""
	start, end = _day(start), _day(end)
	d = start + timedelta(days=(SUNDAY - start.weekday()) % 7)
	keep = None if holidays is None else {_day(h) for h in holidays}
	out = []
	while d <= end:
		if keep is None or d in keep:
			out.append(d)
		d += timedelta(days=7)
	return out


def list_on(assignments, employee, company, day):
	"""The holiday list in force for somebody on `day`, as hrms decides it.

	`assignments` are submitted Holiday List Assignments as
	`(assigned_to, from_date, holiday_list)`. The employee's own latest one
	starting on or before the day wins, else the company's — hrms 16's
	`get_holiday_list_for_employee`, which reads nothing else (not
	`Employee.holiday_list`, not `Company.default_holiday_list`).

	**Per day, not as of today.** Lists here run April to March and Casual
	Leave runs January to December, so one allocation spans two lists; reading
	today's for all of it would drop January's Sundays the morning the April
	list arrives, and take their days back.
	"""
	day = _day(day)
	for who in (employee, company):
		hits = [(_day(f), name) for to, f, name in assignments if to == who and _day(f) <= day]
		if hits:
			return max(hits)[1]
	return None


def is_off(day, name, lists):
	"""Whether `day` is a holiday on list `name`.

	`lists` is `{name: (from_date, to_date, {holiday dates})}`. A day no list
	can answer for — no list in force, a list not read, or a day outside the
	list's own dates (an April Sunday before next year's list exists) — is
	taken as a weekly off: the rounding that gives somebody a day rather than
	takes one.
	"""
	day = _day(day)
	got = lists.get(name) if name else None
	if not got:
		return True
	start, end, dates = got
	if not (_day(start) <= day <= _day(end)):
		return True
	return day in {_day(d) for d in dates}


def credit(status=None, punches=0):
	"""What one Sunday earns: 1, 0.5 or 0.

	`status` is the day's submitted Attendance, or None when there is none;
	`punches` the number of distinct punch times that day.
	"""
	if status:
		return WORKED.get(status, 0)
	return 1 if punches >= 2 else 0


def earned(days):
	"""The total for an allocation, from {sunday: credit}, and the Sundays in it."""
	worked = sorted(d for d, c in days.items() if c)
	return sum(days[d] for d in worked), worked


def plan(total, live, text=None):
	"""What to do for one allocation.

	`total` is what its Sundays have earned. `live` is every submitted Leave
	Adjustment on it, as `(name, leaves, reason)`. `text` is the reason it
	should carry: one that names the wrong Sundays is re-issued even when the
	total agrees, because the reason is the record of which days earned it.

	Returns `(cancel, create, blocked)`: the adjustment names to cancel, the
	total to submit afresh (or None), and why nothing can be done (or None).

	**An adjustment the rule did not make blocks it.** hrms allows one per
	allocation, so HR's own would have to be amended, and amending HR's
	decision is not this rule's to do. It is said, not overwritten.
	"""
	theirs = [n for n, _, r in live if not is_auto(r)]
	ours = [(n, float(x or 0)) for n, x, r in live if is_auto(r)]
	if theirs:
		return [], None, "{0} already adjusts this allocation, and hrms allows one.".format(", ".join(theirs))
	have = sum(x for _, x in ours)
	same_text = text is None or not ours or str(live_reason(live, ours[0][0])).strip() == text.strip()
	if len(ours) <= 1 and have == total and same_text:
		return [], None, None
	return [n for n, _ in ours], (total if total > 0 else None), None


def live_reason(live, name):
	return next((r for n, _, r in live if n == name), "")


def reason(worked, halves=()):
	"""The adjustment's reason: the mark, then the Sundays, so the desk says
	which — and the dashboard's calendar reads them back off it, so a Sunday
	shows what it earned. A half day is said as one."""
	halves = {_day(d) for d in halves}
	return "{0} Casual Leave for {1} Sunday{2} worked: {3}.".format(
		AUTO_MARK,
		len(worked),
		"" if len(worked) == 1 else "s",
		", ".join(_day(d).strftime("%d-%b-%Y") + (" (half day)" if _day(d) in halves else "") for d in worked),
	)


def adjustment(employee, allocation, total, worked, today, amended_from=None, halves=()):
	"""The Leave Adjustment that gives `total` days on `allocation`.

	`from_date`, `to_date` and `allocated_leaves` are fetched by the site from
	the allocation, so they are not sent.
	"""
	doc = {
		"doctype": "Leave Adjustment",
		"employee": employee,
		"leave_type": LEAVE_TYPE,
		"leave_allocation": allocation,
		"adjustment_type": "Allocate",
		"leaves_to_adjust": total,
		"posting_date": _day(today).isoformat(),
		"reason_for_adjustment": reason(worked, halves),
	}
	if amended_from:
		doc["amended_from"] = amended_from
	return doc
