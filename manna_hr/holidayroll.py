"""Next year's Holiday List, made and switched to by itself (asked for 18 Nov 2026).

## What went wrong without it

The site has one list, "Manna Holidays 2026-27", 1 April 2026 to 31 March
2027, and every company, shift and Holiday List Assignment names it. Nothing
made the next one. On 1 April 2027 there would have been no list covering the
day: the calendar would show an empty year, hrms would refuse leave ("No
Holiday List was found for Employee …", see tools/assign_holiday_lists.py), and
Sundays would stop being weekly offs on Daily Detail.

## What this does, once a day

1. **Makes next year's list ahead of time.** From `LEAD_DAYS` before a list in
   use ends, if no list covers the day after it, a new one is made for the
   following year: the same weekly-off weekdays, and the holidays that fall on
   the same date every year (Republic Day, May Day, Independence Day, Gandhi
   Jayanti, Christmas). Festivals that move — Vishu, Onam, Good Friday and
   anything else on the old list — are **not guessed**: a wrong date is a day
   somebody is paid for or not. HR is told which ones to add.
2. **Assigns it ahead of time.** Every company (or employee) with a submitted
   Holiday List Assignment for the old list gets one for the new list from its
   first day. hrms picks the assignment by date, so leave applied for next
   April already sees next year's holidays.
3. **Switches over on the day.** From the new list's first day, every Company
   default, Shift Type and Employee that still names the old list names the new
   one. The dashboard's calendar follows by itself — it shows whichever list
   covers the month (client/src/features/employees/Calendar.jsx calList).

Every step looks before it writes, so running it twice changes nothing, and a
list HR has already made by hand for next year is used rather than duplicated.

The plan is pure — `next_list_plan` and its helpers import nothing from
frappe — so the rule can be tested without a site. `run` is the site half.
"""

import calendar
import re
from datetime import date, timedelta

#: How long before a list ends its successor is made.
LEAD_DAYS = 60

#: Holidays that fall on the same date every year, by (month, day), with the
#: words a description may use for them. A holiday is carried to next year
#: only when both match — "Onam" on 26 August is not "Independence Day".
FIXED = {
	(1, 1): ("new year",),
	(1, 26): ("republic",),
	(5, 1): ("may day", "labour", "labor", "worker"),
	(8, 15): ("independence",),
	(10, 2): ("gandhi",),
	(12, 25): ("christmas", "x'mas", "xmas"),
}


def _d(v):
	return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _year_on(d, years=1):
	"""The same date `years` later; 29 February becomes 28 February."""
	try:
		return d.replace(year=d.year + years)
	except ValueError:
		return d.replace(year=d.year + years, day=28)


def next_name(name, new_from, new_to):
	""""Manna Holidays 2026-27" → "Manna Holidays 2027-28"; "… 2026" → "… 2027".
	A name with no year in it gets the new year's span on the end."""
	m = re.search(r"(\d{4})-(\d{2,4})(?!.*\d{4})", name)
	if m:
		a = int(m.group(1)) + 1
		b = int(m.group(2)) + 1
		b_txt = str(b % 100).zfill(2) if len(m.group(2)) == 2 else str(b)
		return name[:m.start()] + "{0}-{1}".format(a, b_txt) + name[m.end():]
	m = re.search(r"(\d{4})(?!.*\d{4})", name)
	if m:
		return name[:m.start()] + str(int(m.group(1)) + 1) + name[m.end():]
	span = str(new_from.year) if new_from.year == new_to.year else "{0}-{1}".format(new_from.year, str(new_to.year)[2:])
	return "{0} {1}".format(name, span)


def is_fixed(holiday_date, description):
	"""Whether a holiday falls on this date every year (see FIXED)."""
	d = _d(holiday_date)
	words = FIXED.get((d.month, d.day))
	text = (description or "").lower()
	return bool(words) and any(w in text for w in words)


def next_list_plan(cur):
	"""Next year's list from this one.

	`cur` is a Holiday List as the site returns it: `name`, `from_date`,
	`to_date`, and `holidays` rows with `holiday_date`, `description` and
	`weekly_off`. Returns the new list's `name`, `from_date`, `to_date` and
	`holidays`, and `to_add`: the named holidays that move from year to year,
	which HR has to date by hand.
	"""
	old_from, old_to = _d(cur["from_date"]), _d(cur["to_date"])
	new_from = old_to + timedelta(days=1)
	new_to = _year_on(new_from) - timedelta(days=1)
	rows = cur.get("holidays") or []

	off_days = sorted({_d(r["holiday_date"]).weekday() for r in rows if int(r.get("weekly_off") or 0)})
	named = [r for r in rows if not int(r.get("weekly_off") or 0)]

	by_date = {}
	for r in named:
		if not is_fixed(r["holiday_date"], r.get("description")):
			continue
		d = _d(r["holiday_date"])
		nd = date(d.year, d.month, d.day)
		while nd < new_from:
			nd = _year_on(nd)
		if nd <= new_to:
			by_date[nd] = {"holiday_date": nd.isoformat(), "description": r.get("description") or "Holiday", "weekly_off": 0}

	d = new_from
	while d <= new_to:
		# A fixed holiday on a weekly off keeps its name: hrms refuses a date twice.
		if d.weekday() in off_days and d not in by_date:
			by_date[d] = {"holiday_date": d.isoformat(), "description": calendar.day_name[d.weekday()], "weekly_off": 1}
		d += timedelta(days=1)

	to_add = sorted({(r.get("description") or "Holiday") for r in named if not is_fixed(r["holiday_date"], r.get("description"))})
	return {
		"name": next_name(cur["name"], new_from, new_to),
		"from_date": new_from.isoformat(),
		"to_date": new_to.isoformat(),
		"holidays": [by_date[k] for k in sorted(by_date)],
		"to_add": to_add,
		"weekly_off_days": [calendar.day_name[i] for i in off_days],
	}


def due(to_date, today, lead=LEAD_DAYS):
	"""Whether a list ending on `to_date` should have its successor made today."""
	return _d(to_date) - timedelta(days=lead) <= _d(today)


# ------------------------------------------------------------------ the site ---

def run():
	"""The daily job (hooks.py scheduler_events). Steps 1–3 above."""
	import frappe
	from frappe.utils import getdate, nowdate

	today = getdate(nowdate())
	used = _lists_in_use()
	for name in used:
		cur = frappe.get_doc("Holiday List", name)
		if not cur.to_date or not due(cur.to_date, today):
			continue
		nxt = _successor(cur)
		if nxt:
			_assign_ahead(cur.name, nxt)
	_switch_over(today)
	frappe.db.commit()


def _lists_in_use():
	import frappe

	names = set()
	names.update(n for n in frappe.get_all("Company", pluck="default_holiday_list") if n)
	names.update(n for n in frappe.get_all("Shift Type", pluck="holiday_list") if n)
	names.update(n for n in frappe.get_all("Holiday List Assignment", filters={"docstatus": 1}, pluck="holiday_list") if n)
	return sorted(names)


def _successor(cur):
	"""The list covering the day after `cur` ends — HR's own if there is one,
	else a new one made from `next_list_plan`. Returns its name."""
	import frappe
	from frappe.utils import add_days

	start = add_days(cur.to_date, 1)
	have = frappe.get_all("Holiday List", filters={"from_date": ("<=", start), "to_date": (">=", start)}, pluck="name")
	if have:
		return have[0]

	plan = next_list_plan({
		"name": cur.name, "from_date": str(cur.from_date), "to_date": str(cur.to_date),
		"holidays": [{"holiday_date": str(h.holiday_date), "description": h.description, "weekly_off": h.weekly_off}
			for h in cur.holidays],
	})
	name = plan["name"]
	if frappe.db.exists("Holiday List", name):
		# A list with that name that does not cover the day: somebody's, not ours.
		return None
	doc = frappe.get_doc({
		"doctype": "Holiday List",
		"holiday_list_name": name,
		"from_date": plan["from_date"],
		"to_date": plan["to_date"],
		"holidays": plan["holidays"],
	})
	if cur.meta.has_field("weekly_off") and cur.get("weekly_off"):
		doc.weekly_off = cur.weekly_off
	doc.insert(ignore_permissions=True)
	_tell_hr(doc.name, cur.name, plan)
	return doc.name


def _assign_ahead(old, new):
	"""A submitted assignment for `new`, from its first day, for everybody
	assigned `old`."""
	import frappe

	start = frappe.db.get_value("Holiday List", new, "from_date")
	for a in frappe.get_all("Holiday List Assignment", filters={"holiday_list": old, "docstatus": 1},
			fields=["applicable_for", "assigned_to"]):
		if frappe.db.exists("Holiday List Assignment", {"holiday_list": new, "applicable_for": a.applicable_for,
				"assigned_to": a.assigned_to, "docstatus": 1}):
			continue
		doc = frappe.get_doc({
			"doctype": "Holiday List Assignment",
			"applicable_for": a.applicable_for,
			"assigned_to": a.assigned_to,
			"holiday_list": new,
			"from_date": start,
		})
		doc.insert(ignore_permissions=True)
		doc.submit()


def _switch_over(today):
	"""From a list's first day, everything still naming the list before it
	names it instead."""
	import frappe
	from frappe.utils import add_days

	for new in frappe.get_all("Holiday List", filters={"from_date": ("<=", today), "to_date": (">=", today)},
			fields=["name", "from_date"]):
		olds = frappe.get_all("Holiday List", filters={"to_date": add_days(new.from_date, -1)}, pluck="name")
		for old in olds:
			for c in frappe.get_all("Company", filters={"default_holiday_list": old}, pluck="name"):
				frappe.db.set_value("Company", c, "default_holiday_list", new.name)
			for s in frappe.get_all("Shift Type", filters={"holiday_list": old}, pluck="name"):
				frappe.db.set_value("Shift Type", s, "holiday_list", new.name)
			for e in frappe.get_all("Employee", filters={"holiday_list": old}, pluck="name"):
				frappe.db.set_value("Employee", e, "holiday_list", new.name)


def _tell_hr(new, old, plan):
	"""A notification to every HR Manager: the list is made, and which
	festivals it still needs dates for."""
	import frappe

	users = frappe.get_all("Has Role", filters={"role": "HR Manager", "parenttype": "User"}, pluck="parent")
	users = [u for u in set(users) if u not in ("Administrator", "Guest")
		and frappe.db.get_value("User", u, "enabled")]
	missing = ", ".join(plan["to_add"]) or "none"
	subject = "Next year's holiday list {0} is ready — add the festival dates".format(new)
	body = ("{0} was made from {1}: {2} to {3}, with the weekly offs ({4}) and the fixed-date holidays. "
		"Festivals whose date changes every year were not copied: {5}. Add their new dates on the list.").format(
		new, old, plan["from_date"], plan["to_date"], ", ".join(plan["weekly_off_days"]) or "none", missing)
	for u in users:
		frappe.get_doc({
			"doctype": "Notification Log",
			"for_user": u,
			"type": "Alert",
			"subject": subject,
			"email_content": body,
			"document_type": "Holiday List",
			"document_name": new,
		}).insert(ignore_permissions=True)
