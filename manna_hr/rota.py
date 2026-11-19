"""Day or night, from the punch-in.

Manna Rubber Products' plant helpers (HR, 1 October 2026) work twelve hours,
a week of days — in 08:30, out 20:30 — then a week of nights — in 20:30, out
08:30 next morning. Which week it is, the supervisor tells the worker at the
gate; **nobody tells the website.** So the punch-in has to.

hrms cannot tell on its own. It matches a punch to a shift by the clock, and a
day worker leaving at 20:32 and a night worker arriving at 20:24 are the same
minute. Left alone, every night is measured against the day shift — in 20:24,
"out" 08:35 the morning before, minus eleven hours worked (VIKRAM ASUR, 28 Sep).
The key pressed is what separates them, checked against the punch before it.

**What this does, before a punch is delivered:**

  · a punch keyed IN between 17:00 and midnight, by somebody whose working time
    has a night partner (`NIGHT_OF`), whose previous punch was not also an IN
    within the same shift — is an arrival for the night. Their night shift is
    given for that date **and the next one**: hrms decides tomorrow morning's
    08:35 by which shift owns 08:35, and with tomorrow still a day shift, the
    day shift does (its window starts where the night's ends). The extra day
    is provisional — the next night's arrival makes it real and adds another;
  · a punch keyed IN between 05:00 and noon is an arrival for the day. A night
    assignment that reaches past the last night they actually arrived for is
    cut back to it — otherwise that provisional night owns this morning's
    08:27 and a day worker reads as last night's.

**A punch the rule cannot judge is delivered exactly as before.** No key, two
INs in a row, an hour that is neither: no shift is given or changed. A guessed
direction is worse than none (CLAUDE.md §5), and the worst a wrong "nothing"
does is what happened before this existed. A failure here never holds up a
punch either — the punch is the pay; its shift can be put right after.

**HR's own assignments win.** Anything on those dates that is not this night
shift — a week of something else entered on the dashboard — is left alone, and
so is the punch.

Moved here from the bridge (bridge/mannabridge/rota.py) on 27 October 2026,
when the machines began pushing to the site over ADMS: `arrival` and `plan`
unchanged, the site half in `rota_site.py`. Pure — no `frappe`.
"""

from datetime import date, datetime, timedelta

# Working time → the night shift it alternates with (HR, 1 October 2026). Each
# day starts in MORNING and its night in EVENING; a pair with nobody on it yet
# costs nothing and is ready the day somebody is. Manna Tyre Retreads is not
# here on purpose: its 24- and 22-hour shifts are told apart by the machine,
# not the hour (client/src/lib/direction.js).
#
# Names are HR's shift sheet of 8 October 2026 (tools/apply_shift_sheet.py).
# **The bridge holds the same map** (bridge/mannabridge/rota.py) and a test
# pins the two together: this copy kept the names the sheet retired for three
# weeks after the machines moved to the site, and no night was given to
# anybody (audit, 19 Nov 2026). A shift not listed here can name its night on
# the Shift Type itself (`custom_night_shift`), which HR can set without a
# release; `night_for` reads that first.
NIGHT_OF = {
	# Manna Rubber Products: 08:30–20:30 and 20:30–08:30.
	"Manna Rubber Products Pvt.Ltd-Production12hrshift1": "Manna Rubber Products Pvt.Ltd-Production12hrshift2",
	# The eight-hour pair worked as twelve with four of overtime, 08:30–16:30
	# and 20:30–04:30 — Production8hrshift1 and 2 before the sheet.
	"Manna Rubber Products Pvt.Ltd-Productionshift (08:30-16:30)": "Manna Rubber Products Pvt.Ltd-Production8hrshift (20:30-04:30)",
	# Hi-Tech Pretreads' pair, the same windows under the sheet's same note.
	"Hi-Tech Pretreads-Production shift3 (08:30-16:30)": "Hi-Tech Pretreads-Production shift4 (20:30-04:30)",
}

#: The machine's status code on a punch, when the machine is set up for in/out
#: (`Attendance Device.report_direction`). Anything else is no direction.
DIRECTION = {"0": "IN", "1": "OUT", "4": "IN", "5": "OUT"}


def log_type_for(status_code, report_direction):
	"""IN, OUT or None. **None unless the machine is known to report direction**:
	one never set up for it sends 0 — IN — on every punch (CLAUDE.md §5)."""
	if not report_direction:
		return None
	return DIRECTION.get(str(status_code).strip())


EVENING = (17, 24)
MORNING = (5, 12)

# Two punches closer than this are one shift's arrival and leaving. A day and a
# night are both twelve hours, so a rest is never shorter than about eleven.
SAME_SHIFT = timedelta(hours=16)


def _when(v):
	return v if isinstance(v, datetime) else datetime.fromisoformat(str(v)[:19])


def _day(v):
	return v if isinstance(v, date) and not isinstance(v, datetime) else date.fromisoformat(str(v)[:10])


def arrival(at, key, before=None, before_key=None):
	"""'night', 'day', or None: what this punch says about the shift being started.

	`before` and `before_key` are the same person's previous punch, if any."""
	at = _when(at)
	if key != "IN":
		return None
	if before is not None and at - _when(before) < SAME_SHIFT and before_key == "IN":
		# An IN straight after an IN: one of the two keys is wrong, and which
		# one is not knowable. Nothing is decided on it.
		return None
	if EVENING[0] <= at.hour < EVENING[1]:
		return "night"
	if MORNING[0] <= at.hour < MORNING[1]:
		return "day"
	return None


def _covers(a, d):
	return _day(a["start_date"]) <= d and (not a.get("end_date") or d <= _day(a["end_date"]))


def plan(assignments, on, kind, night):
	"""The writes that make `on` a night (or a day) for this person.

	`assignments` are their active, submitted Shift Assignments near `on`.
	Returns a list of ("create", doc) and ("update", name, patch)."""
	on = _day(on)
	nights = [a for a in assignments if a["shift_type"] == night]
	others = [a for a in assignments if a["shift_type"] != night]

	if kind == "night":
		tomorrow = on + timedelta(days=1)
		if any(_covers(a, on) for a in others):
			return []
		mine = next((a for a in nights if _covers(a, on) or (a.get("end_date") and _day(a["end_date"]) == on - timedelta(days=1))), None)
		until = tomorrow if not any(_covers(a, tomorrow) for a in others) else on
		if mine:
			if not mine.get("end_date") or _day(mine["end_date"]) >= until:
				return []
			return [("update", mine["name"], {"end_date": until.isoformat()})]
		return [("create", {"shift_type": night, "start_date": on.isoformat(), "end_date": until.isoformat()})]

	if kind == "day":
		out = []
		for a in nights:
			end = a.get("end_date") and _day(a["end_date"])
			# Only the provisional tail: a night that ended yesterday or today
			# with nobody arriving for it. A longer roster HR entered by hand
			# is theirs to change.
			if not end or end < on - timedelta(days=1) or end > on:
				continue
			back = end - timedelta(days=1)
			if back >= _day(a["start_date"]):
				out.append(("update", a["name"], {"end_date": back.isoformat()}))
			else:
				out.append(("update", a["name"], {"status": "Inactive"}))
		return out

	return []


# ------------------------------------------------------- no key on the punch ---

#: Two presses this close together are one punch pressed twice.
SAME_PRESS = timedelta(minutes=3)
#: Within a run of working days, the longest gap between two punches: the
#: rest after an eight-hour shift is sixteen, and an arrival can be late.
IN_RUN = timedelta(hours=20)
#: A rest at least this long starts a new run with an arrival: a weekly off
#: is a day and a half or more. Between IN_RUN and this, a punch is missing
#: (one shift plus one rest is a day), and nothing after it can be judged.
REST = timedelta(hours=30)
#: Never walk further back than this many punches looking for the rest.
LONGEST_RUN = 40


def _window(at):
	if EVENING[0] <= at.hour < EVENING[1]:
		return "night"
	if MORNING[0] <= at.hour < MORNING[1]:
		return "day"
	return None


def arrival_unkeyed(at, earlier):
	"""'night', 'day' or None, for a punch that carries no direction.

	Most machines here send none (CLAUDE.md §5), so the key `arrival` reads is
	never there: Hi-Tech's night workers were measured against the day shift
	all November. A day worker leaving at 20:32 and a night worker arriving at
	20:24 are the same minute, so the hour alone cannot tell them apart. The
	order can: after a real rest (a weekly off) the first punch is an arrival,
	and arrivals and leavings alternate from there. So this walks back to the
	last rest and counts.

	`earlier` are this person's punches before `at` (ten days is plenty),
	in any order. **Undecided is the answer whenever the count is in doubt**:
	no rest found, a gap that says a punch is missing, a run too long, or
	arrivals that do not all fall in one window. Undecided gives no shift,
	which is what happened before this existed — never a confident wrong one.
	"""
	at = _when(at)
	seq = []
	for t in sorted(_when(x) for x in earlier):
		if t >= at:
			continue
		if seq and t - seq[-1] <= SAME_PRESS:
			continue
		seq.append(t)
	if seq and at - seq[-1] <= SAME_PRESS:
		return None  # the same punch, pressed again
	seq.append(at)

	i = len(seq) - 1
	while i > 0:
		gap = seq[i] - seq[i - 1]
		if gap >= REST:
			break
		if gap > IN_RUN:
			return None  # a punch is missing in the run: the count is lost
		i -= 1
	else:
		return None  # no rest in what we were given: cannot count from it

	run = seq[i:]
	if len(run) > LONGEST_RUN or (len(run) - 1) % 2:
		return None  # too long to trust, or this punch is a leaving
	windows = {_window(t) for t in run[0::2]}
	if len(windows) != 1:
		return None
	return windows.pop()


def night_for(default_shift, partner_on_shift_type=None):
	"""The night shift a day shift alternates with: the Shift Type's own
	`custom_night_shift` first, then the map."""
	return partner_on_shift_type or NIGHT_OF.get(default_shift or "")
