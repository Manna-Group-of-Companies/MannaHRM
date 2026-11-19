"""Which days to rebuild when a person's shift has changed under their punches.

hrms gives an `Employee Checkin` its shift **once, when the checkin is saved**
(`EmployeeCheckin.fetch_shift`). A punch saved before the person had a shift
is `offshift`, with no shift, and stays so: the shift job skips it and marks the
day Absent. On 17 November 2026 87 people were given a `default_shift`, and
about 650 days that had punches on them read Absent as a result.

So a shift change needs its punches looked at again. This is the decision,
pure. `reprocess_site.py` reads the site, asks hrms what shift each punch
falls in now, and does what the plan says:

- **refetch** — punches to give their shift again (`fetch_shift`, then saved);
- **cancel** — Attendance rows to cancel, so the shift job builds them again.

Nothing here writes `Attendance` (CLAUDE.md §5). The rebuilt day is the shift
job's, from the punches, like every other day.

**What is never touched.** A day that came from leave or an Attendance Request,
because the person is not here because of their punches. A frozen day
(`frozen`, from Submit Attendance). And in the default scope a punch already
made into a day: changing `default_shift` today says nothing about what last
month's shift was — hrms has no effective date on it — so last month's
processed days stay as they were built. Only a `Shift Assignment` names dates,
and only it (or HR, asking for it) rebuilds days that were already processed:
scope `all`.

Each punch is a dict with `name`, `attendance` (the Attendance it made, or
None), `shift`, `offshift`, `shift_start`, and what hrms says now:
`new_shift`, `new_start`. Each Attendance row is a dict with `name`,
`attendance_date`, `status`, `leave_application`, `attendance_request`.
"""

from datetime import date, datetime

#: Default: punches no day was built from, and punches that had no shift.
SCOPE_UNASSIGNED = "unassigned"
#: Every punch in the range — for a Shift Assignment, which names its dates.
SCOPE_ALL = "all"
#: Every day the shift job made in the range, whether or not a punch moved —
#: for a day built wrong by the shift's settings rather than by its punches.
#: Hi-Tech's shifts were "Strictly based on Log Type" while its machine sends
#: none, and hrms made each such day a Present of 0 hours (19 Nov 2026); once
#: the setting is right, only a rebuild of every day fixes them.
SCOPE_DAYS = "days"
SCOPES = (SCOPE_UNASSIGNED, SCOPE_ALL, SCOPE_DAYS)

#: The widest range one call may rebuild. Two months is the open month and the
#: one before it; anything older has been paid from.
MAX_DAYS = 62

#: Statuses the shift job makes from punches, or for their absence.
GENERATED = ("Present", "Absent", "Half Day")


def _day(v):
	if v is None or v == "":
		return None
	if isinstance(v, datetime):
		return v.date()
	if isinstance(v, date):
		return v
	return date.fromisoformat(str(v)[:10])


def day_of(punch, new=True):
	"""The day this punch belongs to: its shift's start date. None when it has
	no shift — hrms then builds no day from it at all."""
	if new:
		return _day(punch.get("new_start")) if punch.get("new_shift") else None
	if punch.get("offshift") or not punch.get("shift"):
		return None
	return _day(punch.get("shift_start"))


def changed(punch):
	"""Would giving this punch its shift again change what it is part of?"""
	if (punch.get("shift") or None) != (punch.get("new_shift") or None):
		return True
	if bool(punch.get("offshift")) != (not punch.get("new_shift")):
		return True
	return day_of(punch, new=False) != day_of(punch, new=True)


def is_generated(row):
	"""An Attendance row the shift job made, and may make again."""
	return (
		row.get("status") in GENERATED
		and not row.get("leave_application")
		and not row.get("attendance_request")
	)


def plan(punches, attendance, scope=SCOPE_UNASSIGNED, frozen=(), rebuild=()):
	"""What to refetch and what to cancel. See the module docstring.

	`frozen` is a set of dates no write may touch. `rebuild` is a set of dates
	whose generated rows are cancelled whatever the punches say — the duplicate
	clean-up uses it, when the punches stay where they are but some of them are
	set aside.

	Returns {"refetch": [punch names], "cancel": [attendance names],
	"days": [dates rebuilt], "skipped": [(what, name, why)]}.
	"""
	if scope not in SCOPES:
		raise ValueError("scope must be one of {0}".format(", ".join(SCOPES)))
	frozen = {_day(d) for d in frozen}
	rebuild = {_day(d) for d in rebuild}
	if scope == SCOPE_DAYS:
		rebuild |= {_day(r["attendance_date"]) for r in attendance}
	rows = {r["name"]: r for r in attendance}
	by_day = {}
	for r in attendance:
		by_day.setdefault(_day(r["attendance_date"]), []).append(r)

	def in_scope(p):
		if scope in (SCOPE_ALL, SCOPE_DAYS):
			return True
		return not p.get("attendance") or bool(p.get("offshift")) or not p.get("shift")

	moving = [p for p in punches if in_scope(p) and changed(p)]
	moving_names = {p["name"] for p in moving}

	cancel, skipped = {}, []
	touched_days = set(rebuild)

	def consider(row, why):
		if row["name"] in cancel:
			return
		d = _day(row["attendance_date"])
		if d in frozen:
			skipped.append(("attendance", row["name"], "the month is submitted"))
			return
		if not is_generated(row):
			skipped.append(("attendance", row["name"], "made from leave or a request, not from punches"))
			return
		cancel[row["name"]] = why
		touched_days.add(d)

	for p in moving:
		old, new = day_of(p, new=False), day_of(p, new=True)
		# The day it made is built again without it…
		if p.get("attendance") in rows:
			consider(rows[p["attendance"]], "a punch on it moves to {0}".format(p.get("new_shift") or "no shift"))
		for d in (old, new):
			for row in by_day.get(d, []):
				# …and the day it now belongs to: an Absent there is the
				# wrong one this module exists for; a Present or Half Day is
				# rebuilt with the punch in it.
				consider(row, "a punch now belongs to this day")
		if new is not None:
			touched_days.add(new)

	for d in rebuild:
		for row in by_day.get(d, []):
			consider(row, "rebuilt on request")

	refetch, cancelled = [], set(cancel)
	for p in punches:
		if p.get("attendance") and p["attendance"] not in cancelled:
			# Its day stands, so hrms keeps it as it is: fetch_shift leaves a
			# punch that made a day alone.
			continue
		if {day_of(p, new=False), day_of(p, new=True)} & frozen:
			skipped.append(("checkin", p["name"], "the month is submitted"))
			continue
		if p["name"] in moving_names or p.get("attendance") in cancelled:
			refetch.append(p["name"])

	return {
		"refetch": refetch,
		"cancel": sorted(cancel),
		"days": sorted(d for d in touched_days if d not in frozen),
		"skipped": skipped,
		"why": cancel,
	}


def range_problem(from_date, to_date, today):
	"""A sentence when the range cannot be rebuilt, else None."""
	a, b, t = _day(from_date), _day(to_date), _day(today)
	if not a or not b:
		return "Give both dates."
	if b < a:
		return "The range ends before it starts."
	if b > t:
		return "A day that has not happened yet has nothing to rebuild."
	if (b - a).days + 1 > MAX_DAYS:
		return "At most {0} days at a time.".format(MAX_DAYS)
	return None
