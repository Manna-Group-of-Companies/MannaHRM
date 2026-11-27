"""A punch that arrives after its day was made: the day is made again with it.

The rule is `latepunch.py`. Three ways in, all ending in `_rebuild`:

- **A punch is saved** (`on_checkin_insert`, Employee Checkin · after_insert)
  for a day the shift job has already made: the day is rebuilt, a few seconds
  later, so hrms never sets the punch aside.
- **Every ten minutes** (`sweep`): punches hrms set aside in the last two days
  because their day was already made — the race where the shift job reached
  the punch before the rebuild did — are released and their days rebuilt.
  Punches hrms set aside although their day had counted them (two shift jobs
  on one day) just have the flag taken off.
- **HR, for what is already on the site** (`preview`, then `apply`): the same,
  over a range of dates. Preview first, always: on the live site `apply` is a
  write, and needs a yes for that exact change.

    bench --site <site> execute manna_hr.latepunch_site.preview --kwargs "{'from_date': '2026-10-26', 'to_date': '2026-11-26'}"
    bench --site <site> execute manna_hr.latepunch_site.apply   --kwargs "{'from_date': '2026-10-26', 'to_date': '2026-11-26'}"

**Never raises into a punch.** The punch is the pay; a rebuild that fails is
logged, and the sweep tries the punch again.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, get_datetime, getdate, now_datetime, today

from manna_hr import freeze, latepunch, reprocess_site
from manna_hr import reprocess as rp

#: How far back the ten-minute sweep looks for punches hrms set aside. Two
#: days covers a site that was down overnight; older ones are HR's `apply`.
SWEEP_HOURS = 48

#: Days one sweep rebuilds at most, so a backlog is a few runs and not one long one.
SWEEP_DAYS = 200

ROLES_READ = ("HR Manager", "HR User", "System Manager")
ROLES_WRITE = ("HR Manager", "System Manager")


# --------------------------------------------------------------- on arrival ---


def on_checkin_insert(doc, method=None):
	"""Employee Checkin · after_insert. A punch for a day already made rebuilds it."""
	try:
		if not doc.employee or int(doc.get("skip_auto_attendance") or 0):
			return
		start = doc.get("shift_start")
		if not start or not doc.get("shift"):
			return
		day = getdate(start)
		rows = frappe.get_all(
			"Attendance",
			filters={"employee": doc.employee, "attendance_date": day, "docstatus": 1},
			fields=["name", "attendance_date", "status", "leave_application", "attendance_request", "docstatus"],
		)
		punch = {
			"shift": doc.get("shift"), "shift_start": start, "offshift": doc.get("offshift"),
			"skip_auto_attendance": doc.get("skip_auto_attendance"),
		}
		day = latepunch.rebuild_on_arrival(punch, rows)
		if not day:
			return
		frappe.enqueue(
			"manna_hr.latepunch_site.rebuild_day",
			employee=doc.employee,
			day=str(day),
			queue="short",
			job_id="manna-late-punch-{0}-{1}".format(doc.employee, day),
			deduplicate=True,
			enqueue_after_commit=True,
		)
	except Exception:
		frappe.log_error(title="Late punch: day not queued for rebuilding ({0})".format(doc.name))


def rebuild_day(employee, day):
	"""Release this person's punches hrms set aside on `day`, and make the day again."""
	# The system's act, not the puncher's: a phone punch queues this as the
	# employee's own login, which has no business cancelling Attendance.
	frappe.set_user("Administrator")
	day = getdate(day)
	start = get_datetime(day)
	found = _set_aside(time_from=start, time_to=get_datetime(add_days(day, 1)) + timedelta(hours=12), employee=employee)
	plan = _plan(found)
	days = {(employee, day)}
	days.update((r["employee"], r["day"]) for r in plan["release"])
	return _do(plan, days)


# -------------------------------------------------------------- the sweep ---


def sweep():
	"""Every ten minutes: punches hrms set aside as late in the last two days."""
	since = add_to_date(now_datetime(), hours=-SWEEP_HOURS)
	plan = _plan(_set_aside(commented_since=since))
	if not plan["release"] and not plan["unflag"]:
		return None
	days = sorted({(r["employee"], r["day"]) for r in plan["release"]})[:SWEEP_DAYS]
	keep = set(days)
	plan["release"] = [r for r in plan["release"] if (r["employee"], r["day"]) in keep]
	return _do(plan, days)


# --------------------------------------------------------------- the API ---


@frappe.whitelist()
def preview(from_date, to_date, employee=None):
	"""What `apply` would release and rebuild, and what it would leave and why. Writes nothing."""
	frappe.only_for(ROLES_READ)
	plan = _plan(_range(from_date, to_date, employee))
	return _report(plan)


@frappe.whitelist(methods=["POST"])
def apply(from_date, to_date, employee=None):
	"""Release the punches `preview` lists and make their days again."""
	frappe.only_for(ROLES_WRITE)
	plan = _plan(_range(from_date, to_date, employee))
	out = _do(plan, {(r["employee"], r["day"]) for r in plan["release"]})
	out.update(_report(plan))
	return out


def _range(from_date, to_date, employee):
	start, end = getdate(from_date), getdate(to_date)
	if end < start:
		frappe.throw(_("The range ends before it starts."), title=_("Check the dates"))
	if (end - start).days + 1 > rp.MAX_DAYS:
		frappe.throw(_("At most {0} days at a time.").format(rp.MAX_DAYS), title=_("Too long"))
	return _set_aside(time_from=get_datetime(start), time_to=get_datetime(add_days(end, 1)), employee=employee)


def _report(plan):
	return {
		"release": [_said(r) for r in plan["release"]],
		"unflag": [_said(r) for r in plan["unflag"]],
		"kept": [dict(_said(r), why=r["why"]) for r in plan["kept"]],
		"days": len({(r["employee"], r["day"]) for r in plan["release"]}),
		"people": len({r["employee"] for r in plan["release"]}),
	}


def _said(r):
	return {"checkin": r["name"], "employee": r["employee"], "time": str(r["time"])[:19], "day": str(r["day"])}


# --------------------------------------------------------------- the work ---


def _set_aside(commented_since=None, time_from=None, time_to=None, employee=None):
	"""Punches set aside, with no day, that hrms commented on as already made."""
	cond = {
		"reference_doctype": "Employee Checkin",
		"content": ["like", "%{0}%".format(latepunch.HRMS_SET_ASIDE)],
	}
	if commented_since:
		cond["creation"] = [">=", commented_since]
	names = frappe.get_all("Comment", filters=cond, pluck="reference_name", distinct=True, limit_page_length=0)
	if not names:
		return []
	filters = {"name": ["in", sorted(set(names))], "skip_auto_attendance": 1}
	if time_from is not None:
		filters["time"] = ["between", [time_from, time_to]]
	if employee:
		filters["employee"] = employee
	return frappe.get_all(
		"Employee Checkin",
		filters=filters,
		fields=["name", "employee", "time", "skip_auto_attendance", "attendance", "shift", "shift_start",
		        "creation", "log_type"],
		order_by="employee asc, time asc",
		limit_page_length=0,
	)


def _plan(punches):
	"""{"release": [...], "unflag": [...], "kept": [...]} — each `{name, employee, time, day, why}`.

	`unflag`: punches hrms set aside although their day counts them
	(`latepunch.counted_but_set_aside`). Their flag comes off; no day is rebuilt."""
	release, unflag, kept = [], [], []
	for p in punches:
		comments = frappe.get_all(
			"Comment",
			filters={"reference_doctype": "Employee Checkin", "reference_name": p.name},
			fields=["content", "creation"],
			limit_page_length=0,
		)
		twin = frappe.db.exists(
			"Employee Checkin",
			{"employee": p.employee, "time": p.time, "skip_auto_attendance": 0, "name": ["!=", p.name]},
		)
		company = frappe.db.get_value("Employee", p.employee, "company")
		if p.attendance:
			counted = frappe.db.get_value("Attendance", p.attendance, ["attendance_date", "docstatus"], as_dict=True)
			day = getdate((counted or {}).get("attendance_date") or p.shift_start or p.time)
			if latepunch.counted_but_set_aside(
				p, comments, day=counted, has_live_twin=bool(twin), frozen=bool(freeze.submitted_for(company, day)),
			):
				unflag.append({"name": p.name, "employee": p.employee, "time": p.time, "day": day, "why": None,
				               "creation": p.creation, "log_type": p.log_type, "attendance": p.attendance})
			continue
		late = latepunch.latest_late_comment(comments)
		blocker = None
		name = latepunch.blocking_attendance(late["content"]) if late else None
		if name:
			blocker = frappe.db.get_value(
				"Attendance", name,
				["attendance_date", "status", "leave_application", "attendance_request", "docstatus"],
				as_dict=True,
			)
		# The day hrms tried to make: the one it says it found made, else the
		# day the punch's shift began.
		day = getdate((blocker or {}).get("attendance_date") or p.shift_start or p.time)
		ok, why = latepunch.releasable(
			p, comments, has_live_twin=bool(twin), frozen=bool(freeze.submitted_for(company, day)), blocker=blocker,
		)
		row = {"name": p.name, "employee": p.employee, "time": p.time, "day": day, "why": why,
		       "creation": p.creation, "log_type": p.log_type, "attendance": p.attendance}
		if ok:
			release.append(row)
		elif why:
			kept.append(row)
	release, twins = latepunch.one_per_second(release)
	kept.extend(dict(r, why=latepunch.KEPT_DUPLICATE) for r in twins)
	# Both copies of one punch can be counted and set aside together: the
	# second copy stays set aside, as `dedupe` would leave it.
	unflag, twins = latepunch.one_per_second(unflag)
	kept.extend(dict(r, why=latepunch.KEPT_DUPLICATE) for r in twins)
	# A copy beside a punch whose flag comes off is that punch a second time.
	release, twins = latepunch.beside_counted(release, unflag)
	kept.extend(dict(r, why=latepunch.KEPT_DUPLICATE) for r in twins)
	return {"release": release, "unflag": unflag, "kept": kept}


def _do(plan, days):
	"""Release, then rebuild each (employee, day); then start the shift job, once.

	One day failing never stops the rest. The shift job starts only after the
	last day: started after each, as it was until 27 November 2026, a job was
	already making days while the next were still being cancelled, and two
	jobs on one shift set aside the punches each other had counted
	(`reprocess_site.enqueue_shifts`)."""
	out = {"released": 0, "unflagged": 0, "cancelled": 0, "errors": []}
	for r in plan.get("unflag", ()):
		try:
			frappe.db.set_value("Employee Checkin", r["name"], "skip_auto_attendance", 0, update_modified=False)
			frappe.get_doc("Employee Checkin", r["name"]).add_comment("Comment", latepunch.UNFLAGGED)
			frappe.db.commit()
			out["unflagged"] += 1
		except Exception as exc:
			frappe.db.rollback()
			out["errors"].append({"employee": r["employee"], "day": str(r["day"]), "why": str(exc)[:300]})
			frappe.log_error(title="Late punch: {0} not counted again".format(r["name"]))

	by_day = {}
	for r in plan["release"]:
		by_day.setdefault((r["employee"], r["day"]), []).append(r["name"])
	shifts = set()
	for employee, day in sorted(days):
		if getdate(day) > getdate(today()):
			continue
		frappe.db.savepoint("manna_late_punch")
		try:
			for name in by_day.get((employee, day), []):
				frappe.db.set_value("Employee Checkin", name, "skip_auto_attendance", 0, update_modified=False)
				frappe.get_doc("Employee Checkin", name).add_comment("Comment", latepunch.RELEASED)
				out["released"] += 1
			got = reprocess_site.run(
				[employee], day, day, scope=rp.SCOPE_ALL, write=True, rebuild={getdate(day)}, enqueue=False,
			)
			out["cancelled"] += got["cancelled"]
			frappe.db.commit()
			shifts.update(got["shifts"])
		except Exception as exc:
			frappe.db.rollback(save_point="manna_late_punch")
			out["errors"].append({"employee": employee, "day": str(day), "why": str(exc)[:300]})
			frappe.log_error(title="Late punch: {0} on {1} not rebuilt".format(employee, day))
	if shifts:
		reprocess_site.enqueue_shifts(shifts)
		frappe.db.commit()
	return out
