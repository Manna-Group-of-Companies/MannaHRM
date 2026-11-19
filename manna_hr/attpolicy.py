"""The attendance policy: what a day's punches mean for that day's pay.

factoHR's *Manage Attendance Policy*, the one item on their Attendance menu
that is a rules engine rather than a table of times (docs/FACTOHR.md). Pure:
no `frappe`. `attpolicy_site.py` reads the site and applies it.

**Where it acts.** hrms's shift job still makes every `Attendance` row from the
punches (CLAUDE.md §5). As it does, the row's `validate` hook asks
`evaluate_day` what the policy makes of it and writes the answer onto the
same row — late and early minutes, net hours, overtime, a missed punch, and
the status the policy gives. Nothing writes a day by hand, and a rebuild of
the day (reprocess_site) gives the same answer from the same punches.

**Every rule is off until HR switches it on.** A policy with nothing filled in
gives back exactly the day hrms made. The numbers have to come from factoHR's
own policy screen (docs/OPEN_QUESTIONS.md), not from this file.

**Errors round toward the employee** (CLAUDE.md §4). A day whose shift or times
cannot be read is left as hrms made it. A penalty only ever takes a day down
one step, and never on a day already taken down for being very late.
"""

from datetime import date, datetime, timedelta

PRESENT, HALF_DAY, ABSENT = "Present", "Half Day", "Absent"
JUDGED = (PRESENT, HALF_DAY, ABSENT)

#: What a missed-punch day is, when the policy says. Blank: as hrms decided.
MSP_KEEP = ""

#: Where a late or early penalty is taken from.
DEDUCT_LWP = "Leave Without Pay"
DEDUCT_CL_FIRST = "Casual Leave, then Leave Without Pay"

#: What a day worked on a weekly off or holiday earns.
HOLIDAY_NOTHING = "Nothing"
HOLIDAY_OT = "Overtime"
HOLIDAY_COMP_OFF = "Comp off"

#: How a working day's overtime is measured.
OT_PAST_LENGTH = "Hours past the shift's length"
OT_OUTSIDE_SHIFT = "Before the start and after the end"

# Exceptions written on the day, for the exceptions page and the reports.
EX_LATE = "Late"
EX_EARLY = "Early"
EX_MSP = "Missed punch"
EX_SHORT = "Short hours"
EX_ABSENT = "Absent"
EX_PENALTY = "Penalty"

#: Policy fields and their "off" values. A policy is a dict with any of these;
#: a missing key reads as off.
DEFAULTS = {
	# day
	"full_day_hours": 0.0,
	"half_day_below_hours": 0.0,
	"absent_below_hours": 0.0,
	# The same two as a share of the person's own shift, inclusive: factoHR's
	# own form ("worked up to 12% of the shift: a day; up to 99%: half").
	# When set they replace the hours above, shift by shift.
	"half_day_upto_percent": 0.0,
	"absent_upto_percent": 0.0,
	"break_minutes": 0,
	"break_after_hours": 0.0,
	"msp_status": MSP_KEEP,
	# late arrival
	"late_grace_minutes": 0,
	"late_half_day_after_minutes": 0,
	"late_forgiven_per_month": -1,  # -1: no frequency rule
	"late_penalty_every": 1,
	"late_penalty_days": 0.5,
	# early going
	"early_grace_minutes": 0,
	"early_half_day_after_minutes": 0,
	"early_forgiven_per_month": -1,
	"early_penalty_every": 1,
	"early_penalty_days": 0.5,
	# where penalties come from: lates, early goings, and days short of hours
	"penalty_deduct_from": DEDUCT_LWP,
	"early_deduct_from": DEDUCT_LWP,
	"hours_deduct_from": DEDUCT_LWP,
	# overtime
	"ot_enabled": 0,
	"ot_basis": OT_PAST_LENGTH,
	"ot_min_minutes": 0,
	"ot_round_minutes": 0,
	"ot_max_minutes": 0,
	"holiday_work": HOLIDAY_NOTHING,
}


def with_defaults(policy):
	out = dict(DEFAULTS)
	for k, v in (policy or {}).items():
		if v is not None and v != "":
			out[k] = v
	return out


# ------------------------------------------------------------------- times ---


def _dt(v):
	if v is None or v == "":
		return None
	if isinstance(v, datetime):
		return v
	return datetime.fromisoformat(str(v)[:19])


def _day(v):
	if isinstance(v, datetime):
		return v.date()
	if isinstance(v, date):
		return v
	return date.fromisoformat(str(v)[:10])


def _clock(v):
	"""A Time field: timedelta from Frappe, or 'HH:MM[:SS]'. Minutes past midnight."""
	if v is None or v == "":
		return None
	if isinstance(v, timedelta):
		return int(v.total_seconds() // 60) % (24 * 60)
	parts = str(v).split(":")
	return int(parts[0]) * 60 + int(parts[1])


def shift_window(on, start_time, end_time):
	"""(start, end) datetimes of the shift that starts on `on`. A shift that
	ends at or before it starts crosses midnight and belongs to the day it
	started (CLAUDE.md §5)."""
	s, e = _clock(start_time), _clock(end_time)
	if s is None or e is None:
		return None
	start = datetime.combine(_day(on), datetime.min.time()) + timedelta(minutes=s)
	end = datetime.combine(_day(on), datetime.min.time()) + timedelta(minutes=e)
	if end <= start:
		end += timedelta(days=1)
	return start, end


def _minutes(delta):
	return max(0, int(delta.total_seconds() // 60))


# --------------------------------------------------------------- the day ---


def evaluate_day(policy, shift, day):
	"""What the policy makes of one day.

	`shift`: {"start_time", "end_time"}, or None.
	`day`: {"attendance_date", "status", "working_hours", "in_time", "out_time",
	"punches" (how many), "prior_lates", "prior_earlies" (counted lates and
	earlies earlier in the same month), "is_holiday"}.

	Returns {"status", "half_day_status", "late_minutes", "early_minutes",
	"net_hours", "ot_minutes", "missed_punch", "late_counted",
	"early_counted", "penalty", "exceptions", "notes"}. `status` is hrms's own
	unless a rule changed it, and `notes` says which rule and why.
	"""
	p = with_defaults(policy)
	status = day.get("status")
	punches = int(day.get("punches") or 0)
	out = {
		"status": status,
		"half_day_status": None,
		"late_minutes": 0,
		"early_minutes": 0,
		"net_hours": float(day.get("working_hours") or 0),
		"ot_minutes": 0,
		"missed_punch": 0,
		"late_counted": 0,
		"early_counted": 0,
		"penalty": None,
		"exceptions": [],
		"notes": [],
	}
	if status not in JUDGED:
		return out
	if punches == 0:
		if status == ABSENT:
			out["exceptions"].append(EX_ABSENT)
		return out

	window = shift_window(day["attendance_date"], shift.get("start_time"), shift.get("end_time")) if shift else None
	in_at, out_at = _dt(day.get("in_time")), _dt(day.get("out_time"))
	if punches == 1 or (out_at and in_at and out_at <= in_at):
		out_at = None  # one punch is an arrival or a leaving, never both

	# -- times against the shift
	if window and in_at:
		out["late_minutes"] = _minutes(in_at - window[0])
	if window and out_at:
		out["early_minutes"] = _minutes(window[1] - out_at)

	# -- net hours: the break off a long enough day
	gross = float(day.get("working_hours") or 0)
	net = gross
	if p["break_minutes"] and gross >= float(p["break_after_hours"] or 0) and gross > 0:
		net = max(0.0, gross - int(p["break_minutes"]) / 60.0)
	out["net_hours"] = round(net, 2)

	# -- missed punch
	if punches % 2:
		out["missed_punch"] = 1
		out["exceptions"].append(EX_MSP)
	short = False
	pct_abs, pct_half = float(p["absent_upto_percent"] or 0), float(p["half_day_upto_percent"] or 0)
	if punches == 1 and p["msp_status"] in JUDGED:
		_set(out, p["msp_status"], "one punch: the policy's missed-punch status")
		short = p["msp_status"] != PRESENT
	elif punches >= 2 and window and (pct_abs or pct_half):
		# -- the day as a share of this person's own shift
		length = (window[1] - window[0]).total_seconds() / 3600
		pct = 100.0 * net / length if length else 100.0
		if pct_abs and pct <= pct_abs:
			_set(out, ABSENT, "{0:.0f}% of the shift worked, up to {1:g}%".format(pct, pct_abs))
			short = True
		elif pct_half and pct <= pct_half:
			_set(out, HALF_DAY, "{0:.0f}% of the shift worked, up to {1:g}%".format(pct, pct_half))
			short = True
		elif status != PRESENT:
			_set(out, PRESENT, "{0:.0f}% of the shift worked".format(pct))
	elif punches >= 2:
		# -- the day by net hours, as hrms judged it by gross ones
		if p["absent_below_hours"] and net < float(p["absent_below_hours"]):
			_set(out, ABSENT, "{0:.2f} h worked, under {1} h".format(net, p["absent_below_hours"]))
			short = True
		elif p["half_day_below_hours"] and net < float(p["half_day_below_hours"]):
			_set(out, HALF_DAY, "{0:.2f} h worked, under {1} h".format(net, p["half_day_below_hours"]))
			short = True
		elif (p["half_day_below_hours"] or p["absent_below_hours"]) and status != PRESENT:
			_set(out, PRESENT, "{0:.2f} h worked".format(net))
	if short and out["status"] in (HALF_DAY, ABSENT):
		# Paid for by the hours rule: the day's lateness is part of the same
		# shortfall, and factoHR ignores late and early on such a day.
		out["penalty"] = "hours"
	if p["full_day_hours"] and net < float(p["full_day_hours"]) and punches >= 2:
		out["exceptions"].append(EX_SHORT)

	# -- late and early: counted past the grace; a hard limit is a half day
	hard_late = hard_early = False
	if out["penalty"] == "hours":
		pass
	elif out["late_minutes"] > int(p["late_grace_minutes"] or 0):
		out["exceptions"].append(EX_LATE)
		limit = int(p["late_half_day_after_minutes"] or 0)
		if limit and out["late_minutes"] > limit:
			hard_late = _down(out, "{0} min late, over {1}".format(out["late_minutes"], limit))
			if hard_late:
				out["penalty"] = "late-limit"
		else:
			out["late_counted"] = 1
	if out["penalty"] != "hours" and out["early_minutes"] > int(p["early_grace_minutes"] or 0):
		out["exceptions"].append(EX_EARLY)
		limit = int(p["early_half_day_after_minutes"] or 0)
		if limit and out["early_minutes"] > limit:
			hard_early = _down(out, "left {0} min early, over {1}".format(out["early_minutes"], limit))
			if hard_early:
				out["penalty"] = "early-limit"
		else:
			out["early_counted"] = 1

	# -- frequency: the Nth late past the forgiven ones costs a penalty
	if not (hard_late or hard_early or out["penalty"] == "hours"):
		for kind, prior in (("late", day.get("prior_lates")), ("early", day.get("prior_earlies"))):
			if out[kind + "_counted"] and _penalised(p, kind, int(prior or 0) + 1):
				days = float(p[kind + "_penalty_days"] or 0.5)
				_down(out, "{0} {1} this month, {2} forgiven".format(
					_nth(int(prior or 0) + 1), kind, int(p[kind + "_forgiven_per_month"])), full=days >= 1)
				out["penalty"] = kind
				out["exceptions"].append(EX_PENALTY)
				break  # one penalty a day

	# -- overtime
	out["ot_minutes"] = overtime_minutes(p, window, net, day.get("is_holiday"), out["status"], in_at, out_at)

	if out["status"] == HALF_DAY:
		# No leave behind it: the other half is unpaid. hrms's own default
		# for a Half Day with no leave, and what payroll counts.
		out["half_day_status"] = "Absent"
	return out


def _set(out, status, why):
	if out["status"] != status:
		out["notes"].append("{0} → {1}: {2}".format(out["status"], status, why))
		out["status"] = status


def _down(out, why, full=False):
	"""One step down: Present → Half Day (→ Absent when `full`), Half Day → Absent."""
	if out["status"] == PRESENT:
		_set(out, ABSENT if full else HALF_DAY, why)
		return True
	if out["status"] == HALF_DAY:
		_set(out, ABSENT, why)
		return True
	return False


def _penalised(p, kind, n):
	forgiven = int(p[kind + "_forgiven_per_month"])
	if forgiven < 0 or n <= forgiven:
		return False
	every = max(1, int(p[kind + "_penalty_every"] or 1))
	return (n - forgiven) % every == 0


def _nth(n):
	suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
	return "{0}{1}".format(n, suffix)


def overtime_minutes(policy, window, net_hours, is_holiday=False, status=PRESENT, in_at=None, out_at=None):
	"""Overtime a day earns, after the minimum, the rounding and the cap.

	On a weekly off or holiday every hour is overtime when the policy says so;
	otherwise only what is past the shift's own length. A day that is not a
	full Present earns none: a half day has no hours past its shift."""
	p = with_defaults(policy)
	if not int(p["ot_enabled"] or 0):
		return 0
	worked = int(round(float(net_hours or 0) * 60))
	if is_holiday:
		if p["holiday_work"] != HOLIDAY_OT:
			return 0
		ot = worked
	else:
		if status != PRESENT or not window:
			return 0
		if p["ot_basis"] == OT_OUTSIDE_SHIFT:
			# factoHR's "in before shift, out after shift": time outside the
			# window at either end, whatever the hours in between.
			if not (in_at and out_at):
				return 0
			ot = _minutes(window[0] - in_at) + _minutes(out_at - window[1])
		else:
			ot = worked - _minutes(window[1] - window[0])
	if ot <= 0 or ot < int(p["ot_min_minutes"] or 0):
		return 0
	step = int(p["ot_round_minutes"] or 0)
	if step:
		ot -= ot % step  # rounded down: the half hour not finished is not paid
	cap = int(p["ot_max_minutes"] or 0)
	if cap:
		ot = min(ot, cap)
	return ot


# --------------------------------------------------------- which policy ---

#: How specific each scope is. The most specific one that matches wins; a
#: policy with no scope at all, ticked default, is the fallback.
SPECIFICITY = {"Employee": 5, "Shift Type": 4, "Designation": 3, "Department": 2, "Company": 1}
SCOPES = tuple(SPECIFICITY)
_EMP_FIELD = {"Employee": "name", "Shift Type": "shift", "Designation": "designation",
              "Department": "department", "Company": "company"}


def resolve(policies, employee):
	"""The policy name for `employee`, or None.

	`policies`: [{"name", "priority", "is_default", "company", "scopes":
	[{"applies_on", "value"}]}], active ones only. `employee`: {"name",
	"company", "department", "designation", "shift"}. A policy with a company
	set applies only within it. Ties go to the higher priority, then the name,
	so the answer never depends on the order the site returned them in."""
	best = None
	for pol in policies:
		if pol.get("company") and pol["company"] != employee.get("company"):
			continue
		score = None
		for s in pol.get("scopes") or []:
			field = _EMP_FIELD.get(s.get("applies_on"))
			if field and s.get("value") and employee.get(field) == s["value"]:
				score = max(score or 0, SPECIFICITY[s["applies_on"]])
		if score is None and pol.get("is_default") and not pol.get("scopes"):
			score = 0
		if score is None:
			continue
		key = (score, int(pol.get("priority") or 0), _neg(pol["name"]))
		if best is None or key > best[0]:
			best = (key, pol["name"])
	return best[1] if best else None


def _neg(name):
	# Lower name wins a tie: compare on the negated code points.
	return tuple(-ord(c) for c in name)


# -------------------------------------------------------- the Shift Type ---


def shift_settings(policy, shift_hours=None):
	"""The Shift Type fields this policy decides, so hrms's own first reading
	of the day agrees with it. Only what the policy sets; the rest is the
	shift's own. Percentage thresholds become hours of `shift_hours`."""
	p = with_defaults(policy)
	half, absent = float(p["half_day_below_hours"] or 0), float(p["absent_below_hours"] or 0)
	if shift_hours and (p["half_day_upto_percent"] or p["absent_upto_percent"]):
		half = round(shift_hours * float(p["half_day_upto_percent"] or 0) / 100, 2)
		absent = round(shift_hours * float(p["absent_upto_percent"] or 0) / 100, 2)
	out = {
		"working_hours_threshold_for_half_day": half,
		"working_hours_threshold_for_absent": absent,
		"late_entry_grace_period": int(p["late_grace_minutes"] or 0),
		"enable_late_entry_marking": 1 if int(p["late_grace_minutes"] or 0) or int(p["late_forgiven_per_month"]) >= 0 else 0,
		"early_exit_grace_period": int(p["early_grace_minutes"] or 0),
		"enable_early_exit_marking": 1 if int(p["early_grace_minutes"] or 0) or int(p["early_forgiven_per_month"]) >= 0 else 0,
		"mark_auto_attendance_on_holidays": 1 if p["holiday_work"] != HOLIDAY_NOTHING else 0,
	}
	if policy and policy.get("check_in_out_mode"):
		out["determine_check_in_and_check_out"] = policy["check_in_out_mode"]
	if policy and policy.get("hours_based_on"):
		out["working_hours_calculation_based_on"] = policy["hours_based_on"]
	return out


def policy_problems(policy):
	"""Sentences for numbers that cannot all be true at once."""
	p = with_defaults(policy)
	out = []
	if p["absent_below_hours"] and p["half_day_below_hours"] and float(p["absent_below_hours"]) > float(p["half_day_below_hours"]):
		out.append("Absent below must not be more than half day below.")
	if p["full_day_hours"] and p["half_day_below_hours"] and float(p["half_day_below_hours"]) > float(p["full_day_hours"]):
		out.append("Half day below must not be more than the full day.")
	if p["absent_upto_percent"] and p["half_day_upto_percent"] and float(p["absent_upto_percent"]) > float(p["half_day_upto_percent"]):
		out.append("Absent up to % must not be more than half day up to %.")
	for k in ("absent_upto_percent", "half_day_upto_percent"):
		if not 0 <= float(p[k] or 0) <= 100:
			out.append("A percentage of the shift is between 0 and 100.")
	for kind in ("late", "early"):
		if float(p[kind + "_penalty_days"] or 0.5) not in (0.5, 1.0):
			out.append("A {0} penalty is half a day or a whole day.".format(kind))
		if int(p[kind + "_penalty_every"] or 1) < 1:
			out.append("A {0} penalty comes every 1 or more times.".format(kind))
		grace, limit = int(p[kind + "_grace_minutes"] or 0), int(p[kind + "_half_day_after_minutes"] or 0)
		if limit and limit <= grace:
			out.append("The {0} half-day limit must be past its grace.".format(kind))
	for k in ("ot_min_minutes", "ot_round_minutes", "ot_max_minutes", "break_minutes"):
		if int(p[k] or 0) < 0:
			out.append("{0} cannot be negative.".format(k.replace("_", " ")))
	return out


# ------------------------------------------------------------ the month ---


def month_plan(days, policy):
	"""Which days of a month the policy penalises, in date order.

	`days`: [{"attendance_date", "late_counted", "early_counted", "penalty"}]
	for one person's month, as the days now stand. Returns the counts and the
	days whose recorded penalty is not what the counting says — the days to
	rebuild, because something earlier in the month changed after they were
	made (a correction took a late away, a day came in out of order)."""
	p = with_defaults(policy)
	lates = earlies = 0
	wrong = []
	for d in sorted(days, key=lambda r: str(r["attendance_date"])):
		want = None
		if d.get("late_counted"):
			lates += 1
			if _penalised(p, "late", lates):
				want = "late"
		if want is None and d.get("early_counted"):
			earlies += 1
			if _penalised(p, "early", earlies):
				want = "early"
		elif d.get("early_counted"):
			earlies += 1
		have = d.get("penalty") or None
		if have in ("hours", "late-limit", "early-limit"):
			continue  # decided by the day itself, not by the month's count
		if have != want:
			wrong.append(_day(d["attendance_date"]))
	return {"lates": lates, "earlies": earlies, "rebuild": wrong}


def deduct_from(policy, penalty):
	"""Where one kind of penalty is taken from: a late, an early going, or a
	day short of hours (the half-day limits count with their kind)."""
	p = with_defaults(policy)
	kind = (penalty or "").split("-")[0]
	key = {"late": "penalty_deduct_from", "early": "early_deduct_from", "hours": "hours_deduct_from"}.get(kind)
	return p[key] if key else DEDUCT_LWP
