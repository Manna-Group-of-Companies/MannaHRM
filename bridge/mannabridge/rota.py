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

This belongs on the site, in `manna_hr`, beside the rest of the rules (CLAUDE.md
§1). It is here because the app is not installed and tonight's punches are not
waiting for it; `arrival` and `plan` are pure so they move across unchanged.
"""

import json
import logging
from datetime import date, datetime, timedelta

import requests

log = logging.getLogger(__name__)

# Working time → the night shift it alternates with, for every company (HR,
# 1 October 2026). Each day starts in MORNING and its night in EVENING; a pair
# with nobody on it yet costs nothing and is ready the day somebody is.
# Manna Tyre Retreads is not here on purpose: its 24- and 22-hour shifts are
# told apart by the machine, not the hour (client/src/lib/direction.js).
#
# Names are HR's shift sheet of 8 October 2026 (tools/apply_shift_sheet.py),
# which retired each company's Day / Night / General. A key that names no
# shift on the site matches nobody, so a name changed there and not here
# fails safe: those punches go through with no night given, as before this.
NIGHT_OF = {
	# Manna Rubber Products: 08:30–20:30 and 20:30–08:30.
	"Manna Rubber Products Pvt.Ltd-Production12hrshift1": "Manna Rubber Products Pvt.Ltd-Production12hrshift2",
	# The eight-hour pair worked as twelve with four of overtime, 08:30–16:30
	# and 20:30–04:30 — Production8hrshift1 and 2 before the sheet.
	"Manna Rubber Products Pvt.Ltd-Productionshift (08:30-16:30)": "Manna Rubber Products Pvt.Ltd-Production8hrshift (20:30-04:30)",
	# Hi-Tech Pretreads' pair, the same windows under the sheet's same note.
	"Hi-Tech Pretreads-Production shift3 (08:30-16:30)": "Hi-Tech Pretreads-Production shift4 (20:30-04:30)",
}

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


class Rota:
	"""The site half: who the device user is, their assignments, the writes."""

	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._base = base_url.rstrip("/")
		self._timeout = timeout
		self._session = requests.Session()
		self._session.headers.update(
			{"Authorization": "token {0}:{1}".format(api_key, api_secret), "Accept": "application/json"}
		)
		self._people = {}

	def _list(self, doctype, fields, filters):
		r = self._session.get(self._base + "/api/resource/" + doctype, timeout=self._timeout,
		                      params={"fields": json.dumps(fields), "filters": json.dumps(filters), "limit_page_length": 0})
		r.raise_for_status()
		return r.json().get("data") or []

	def employee(self, device_user):
		if device_user not in self._people:
			rows = self._list("Employee", ["name", "employee_name", "company", "department", "default_shift"],
			                  [["attendance_device_id", "=", device_user], ["status", "=", "Active"]])
			# Two people on one number is master data to fix, not a guess to make.
			self._people[device_user] = rows[0] if len(rows) == 1 else None
		return self._people[device_user]

	def assignments(self, employee, on):
		on = _day(on)
		rows = self._list("Shift Assignment", ["name", "shift_type", "start_date", "end_date"],
		                  [["employee", "=", employee], ["docstatus", "=", 1], ["status", "=", "Active"],
		                   ["start_date", "<=", (on + timedelta(days=1)).isoformat()]])
		return [a for a in rows if not a.get("end_date") or _day(a["end_date"]) >= on - timedelta(days=1)]

	def apply(self, emp, action):
		if action[0] == "create":
			body = dict(action[1], employee=emp["name"], employee_name=emp.get("employee_name"),
			            company=emp.get("company"), status="Active", docstatus=1)
			if emp.get("department"):
				body["department"] = emp["department"]
			r = self._session.post(self._base + "/api/resource/Shift Assignment", json=body, timeout=self._timeout)
		else:
			r = self._session.put(self._base + "/api/resource/Shift Assignment/" + action[1], json=action[2], timeout=self._timeout)
		if r.status_code not in (200, 201):
			raise RuntimeError("HTTP {0}: {1}".format(r.status_code, (r.text or "")[:300]))

	def before_send(self, row, previous):
		"""Give the shift this punch starts, if it says. `previous` is the
		person's punch before it, as `(punched_at, log_type)` or None."""
		emp = self.employee(row["device_user"])
		night = emp and NIGHT_OF.get(emp.get("default_shift") or "")
		if not night:
			return []
		before, before_key = previous or (None, None)
		kind = arrival(row["punched_at"], row.get("log_type"), before, before_key)
		if not kind:
			return []
		on = _when(row["punched_at"]).date()
		actions = plan(self.assignments(emp["name"], on), on, kind, night)
		for action in actions:
			self.apply(emp, action)
			log.info("%s (%s): %s shift on %s — %s", emp.get("employee_name"), emp["name"], kind, on, action)
		return actions
