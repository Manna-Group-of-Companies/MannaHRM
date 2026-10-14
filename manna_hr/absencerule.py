"""The office absence rule: the month's first absence is Casual Leave.

HR's rule of 3 October 2026, in their words: an office employee's first
absence is treated as Casual Leave, a second one is a salary deduction, and
once the absent day is regularized the status follows it.

What that means in documents, all of them hrms's own:

- **The first Absent day of a month gets an approved Casual Leave Application**,
  submitted. hrms turns the day's Absent row into On Leave on submit and books
  the day against the person's balance — nothing here writes `Attendance`
  (CLAUDE.md §5).
- **Every later Absent day that month stays Absent**, which is the salary cut:
  the slip counts it in `absent_days` and pays one day fewer. That is true only
  because Payroll Settings are based on Attendance — hrms's default, `Leave`,
  pays every Absent day — so it is a value in `payrollsetup.PAYROLL_SETTINGS`,
  and `tools/setup_payroll.py` says when the site holds anything else.
- **A regularized day gives its leave back.** The application is cancelled, and
  hrms cancels the On Leave row with it, so the shift job can build the day
  again from the corrected punches. The next Absent day that month, if there is
  one, then takes the leave.

Only applications carrying AUTO_MARK are ever cancelled. Leave somebody asked
for is theirs, and this rule never touches it.

**Pure: no `frappe`.** The plan for one person's month is a function of three
lists, so it can be argued about without a site. `absencerule_site.py` reads
the lists and does what the plan says; `client/src/lib/absencerule.js` is the
dashboard's copy, pinned to this file by `client/tests/absencerule.test.js`.
"""

from datetime import date, timedelta

from manna_hr import leavepolicy as lp

LEAVE_TYPE = lp.LEAVE_TYPE_NAME

#: The groups the rule applies to: everybody who earns Casual Leave. HR first
#: said *office* employees (3 October 2026) and widened it to supervisors and
#: drivers on 6 October, when a supervisor's first absence was left a salary
#: cut. The factory floor earns no Casual Leave, so there is nothing to pay
#: their first absence from and every absence of theirs is a salary cut.
GROUPS = lp.CASUAL_LEAVE_GROUPS

#: Put at the start of the application's `description`. It is how the rule
#: finds its own applications again, and the only thing that lets it cancel
#: one — so it must never be shortened to something a person might type, nor
#: renamed now the rule covers more than the office: the applications already
#: made carry this spelling.
AUTO_MARK = "[Office absence rule]"

DESCRIPTION = (
	AUTO_MARK + " The first absence this month, taken as Casual Leave. "
	"It is given back by itself if the day is regularized."
)

#: The rule does not reach back past this day. HR first said 1 October, and on
#: 6 October asked for September as well. September was paid by Factor HR and
#: no slip for it is on this site, so the leave changes the record and nobody's
#: pay. Most people's Casual Leave starts 1 October, so a September absence is
#: taken from a one-month allocation `tools/backfill_casual_leave.py` makes —
#: without one hrms has nothing to take it from and the day stays Absent.
EFFECTIVE_FROM = date(2026, 9, 1)

#: Whether the leave rules run by themselves — the absence rule and Sunday
#: leave, hourly on the site and half-hourly from the dashboard. **Off since
#: 14 October 2026, asked for by HR**: no absence becomes Casual Leave and no
#: Sunday adds a day unless somebody applies for it. The rules are kept, and
#: turning this back on is the whole of bringing them back. Off does not undo
#: what they already wrote: those applications and adjustments stand on the
#: site, and a corrected day still gives its own leave back (`after_regularization`),
#: so an old automatic leave never blocks a correction. The dashboard's copy,
#: `AUTO_LEAVE_RULES` in client/src/lib/absencerule.js, is pinned to this.
AUTO_LEAVE_RULES = False

#: The `device_id` prefix a correction's punch carries — `regularization.apply`
#: and the dashboard's `regDevice` both write it. A day holding one is a
#: regularized day.
REG_PREFIX = "REG-"


def applies_to(designation):
	"""Whether the rule covers somebody with this designation."""
	return lp.casual_leave_group(designation) in GROUPS


def is_auto(description):
	"""Whether a Leave Application is one this rule made."""
	return str(description or "").lstrip().startswith(AUTO_MARK)


def _day(v):
	if isinstance(v, date):
		return v
	return date.fromisoformat(str(v)[:10])


def months_to_check(today):
	"""The months a run looks at, as (first day, last day) — this one and last.

	Last month as well because the shift job marks a day absent after it ends,
	so the 31st is Absent on the 1st; and because a regularization approved in
	the first week is usually for last month. Never a month before
	EFFECTIVE_FROM, and never past today.
	"""
	first = today.replace(day=1)
	prev = (first - timedelta(days=1)).replace(day=1)
	out = []
	for start in (prev, first):
		nxt = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
		end = min(nxt - timedelta(days=1), today)
		start = max(start, EFFECTIVE_FROM)
		if start <= end:
			out.append((start, end))
	return out


def plan(absent, auto, regularized=(), covered=(), excluded=()):
	"""What to do for one person's month.

	- `absent`: the days their submitted Attendance says Absent.
	- `auto`: this rule's live applications that month, as `(name, day)`.
	- `regularized`: the days a correction's punch landed on.
	- `covered`: days under any other leave application not rejected or
	  cancelled — leave somebody asked for, approved or still waiting.
	- `excluded`: days hrms has just refused for a reason of the day itself —
	  a holiday added after the day was marked, a block date. The next absence
	  is offered instead, so one day hrms will not take does not cost the
	  person the month's leave.

	Returns `(cancel, give)`: the application names to cancel, and the day to
	give Casual Leave for, or None.

	**The month keeps the leave it already gave.** If the 12th took it and the
	5th turns Absent later, the 12th keeps it: either way one day is paid as
	leave and one is cut, so moving it would be two writes that change nobody's
	pay.
	"""
	regularized = {_day(d) for d in regularized}
	covered = {_day(d) for d in covered} | {_day(d) for d in excluded}
	live = sorted(((n, _day(d)) for n, d in auto), key=lambda a: (a[1], a[0]))

	cancel = [n for n, d in live if d in regularized]
	kept = [(n, d) for n, d in live if d not in regularized]
	# One a month. A second can only come from two runs racing on different
	# days; it is undone rather than left to cost the person a second leave.
	cancel += [n for n, _ in kept[1:]]
	if kept:
		return cancel, None

	given_back = {d for n, d in live if n in cancel}
	for d in sorted({_day(x) for x in absent}):
		if d in regularized or d in covered or d in given_back:
			continue
		return cancel, d
	return cancel, None


def application(employee, day, company=None, today=None, approver=None):
	"""The Leave Application that makes `day` the month's Casual Leave.

	Approved, so hrms books it and marks the day on submit. `follow_via_email`
	is off: the approver has nothing to approve, and a mail asking them to
	would be noise.

	**`approver` is not optional on this site.** HR Settings has
	`leave_approver_mandatory_in_leave_application` on (read 3 October 2026),
	so an application without one is refused — which would have been every
	application this rule made. See `approver_for`.
	"""
	day = _day(day).isoformat()
	doc = {
		"doctype": "Leave Application",
		"employee": employee,
		"leave_type": LEAVE_TYPE,
		"from_date": day,
		"to_date": day,
		"half_day": 0,
		"status": "Approved",
		"posting_date": _day(today or day).isoformat(),
		"description": DESCRIPTION,
		"follow_via_email": 0,
	}
	if company:
		doc["company"] = company
	if approver:
		doc["leave_approver"] = approver
	return doc


def approver_for(own, manager_user, fallback):
	"""Who the automatic application names as its approver.

	The person's own leave approver, else their reporting manager's login —
	the same order Apply Leave uses — else `fallback`, whoever is applying the
	rule: the HR login on the dashboard, Administrator on the scheduler. The
	rule is HR's decision, so somebody in HR standing behind it is the honest
	last answer rather than no answer and a refusal.
	"""
	return own or manager_user or fallback or None
