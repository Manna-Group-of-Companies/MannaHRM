"""Rebuild days on the site, after a shift change. The rule is `reprocess.py`.

Three ways in, and all three end in `run`:

- **`Employee.default_shift` set or changed** — the punches nobody had a shift
  for are given one, and the Absents hrms marked on those days are rebuilt.
  Scope `unassigned`: a day already built from punches stays as built.
- **A `Shift Assignment` submitted, changed or cancelled** — it names its
  dates, so every day in them is rebuilt on the shift it now says. Not for the
  night rota's own assignments (`flags.manna_rota`): those are made before the
  punch they are for is saved, and that punch gets the shift by itself.
- **HR, from the dashboard** — `preview` then `apply`, for one person or a
  list, over at most `reprocess.MAX_DAYS` days.

Factor HR calls the last one *Manual Process Attendance*. Here it re-runs the
shift job rather than letting anybody write a day by hand (CLAUDE.md §5).

**What it writes.** It cancels Attendance the shift job made (never a leave's,
never in a submitted month), gives punches their shift again with hrms's own
`fetch_shift`, and asks the shift job to run for the shifts it touched. The
rebuilt days are the shift job's — this decides only which ones to rebuild.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, getdate, today

from manna_hr import freeze
from manna_hr import reprocess as rp

ROLES = ("HR Manager", "HR User", "System Manager")


# ------------------------------------------------------------------ the API ---


@frappe.whitelist()
def preview(employees, from_date, to_date, scope=rp.SCOPE_UNASSIGNED):
	"""What `apply` would do. Writes nothing."""
	frappe.only_for(ROLES)
	return run(_names(employees), from_date, to_date, scope=scope, write=False)


@frappe.whitelist(methods=["POST"])
def apply(employees, from_date, to_date, scope=rp.SCOPE_UNASSIGNED):
	"""Rebuild the days. Same answer as `preview`, done."""
	frappe.only_for(ROLES)
	return run(_names(employees), from_date, to_date, scope=scope, write=True)


def _names(employees):
	if isinstance(employees, str):
		employees = frappe.parse_json(employees) if employees.strip().startswith("[") else [employees]
	names = [e for e in (employees or []) if e]
	if not names:
		frappe.throw(_("Choose at least one employee."), title=_("Nobody chosen"))
	if len(names) > 500:
		frappe.throw(_("At most 500 people at a time."), title=_("Too many"))
	return names


# ------------------------------------------------------------------ the work ---


def run(employees, from_date, to_date, scope=rp.SCOPE_UNASSIGNED, write=False, rebuild=(), enqueue=True):
	"""Plan, and when `write`, do. Returns what it found, per person.

	`enqueue=False` leaves the shift job to the caller, which rebuilds many
	days and starts it once, after the last (`latepunch_site._do`)."""
	start, end = getdate(from_date), getdate(to_date)
	problem = rp.range_problem(start, end, getdate(today()))
	if problem:
		frappe.throw(_(problem), title=_("Cannot rebuild those days"))

	out = {"employees": [], "cancelled": 0, "refetched": 0, "shifts": [], "write": bool(write)}
	shifts = set()
	for employee in employees:
		got = _one(employee, start, end, scope, write, rebuild)
		out["employees"].append(got)
		out["cancelled"] += len(got["cancel"])
		out["refetched"] += len(got["refetch"])
		shifts.update(got["shifts"])

	out["shifts"] = sorted(shifts)
	if write and enqueue:
		enqueue_shifts(shifts)
	return out


def enqueue_shifts(shifts):
	"""The shift job for these shifts: one job per shift, after the commit.

	After the commit, so the job reads the cancelled rows as cancelled.

	**One job per shift, never one per set of shifts.** Two jobs on the same
	shift at once both try to make the same day. The one that loses is refused
	(the day is made) and hrms sets aside the punches of its batch — the very
	punches the winner has just counted. That happened to ERENIUS BECK's 17
	November during the backfill of 27 November 2026, when a job per set of
	shifts let two of them work on Production12hrshift1 together.

	A job already queued for a shift picks up whatever is cancelled before it
	runs, so it is not queued twice. A day cancelled while it is already
	running is made by hrms's hourly run.
	"""
	for shift in sorted({s for s in shifts or () if s}):
		frappe.enqueue(
			"manna_hr.reprocess_site.process_shifts",
			shifts=[shift],
			queue="long",
			job_id="manna-process-shift-{0}".format(shift),
			deduplicate=True,
			enqueue_after_commit=True,
		)


def _one(employee, start, end, scope, write, rebuild):
	company = frappe.db.get_value("Employee", employee, "company")
	punches = _punches(employee, start, end)
	attendance = frappe.get_all(
		"Attendance",
		filters={"employee": employee, "docstatus": 1, "attendance_date": ["between", [start, end]]},
		fields=["name", "attendance_date", "status", "leave_application", "attendance_request", "shift"],
		limit_page_length=0,
	)
	plan = rp.plan(punches, attendance, scope=scope, frozen=_frozen(company, start, end), rebuild=rebuild)

	by_name = {p["name"]: p for p in punches}
	shifts = {by_name[n]["new_shift"] for n in plan["refetch"] if by_name[n].get("new_shift")}
	shifts |= {r["shift"] for r in attendance if r["name"] in plan["cancel"] and r.get("shift")}

	result = {
		"employee": employee,
		"cancel": [{"name": n, "date": str(_row(attendance, n)["attendance_date"]),
		            "status": _row(attendance, n)["status"], "why": plan["why"][n]} for n in plan["cancel"]],
		"refetch": [{"name": n, "time": str(by_name[n]["time"]), "from": by_name[n].get("shift"),
		             "to": by_name[n].get("new_shift")} for n in plan["refetch"]],
		"skipped": [{"what": w, "name": n, "why": y} for w, n, y in plan["skipped"]],
		"days": [str(d) for d in plan["days"]],
		"errors": [],
		"shifts": sorted(shifts),
	}
	if write:
		_write(plan, result)
	return result


def _row(rows, name):
	return next(r for r in rows if r["name"] == name)


def _punches(employee, start, end):
	"""The punches whose day could fall in [start, end], with what hrms says now.

	A night's leaving lands the morning after it started, so the range reaches
	into the next day. Punches set aside (`skip_auto_attendance`) are left
	alone: somebody set them aside on purpose.
	"""
	from hrms.hr.doctype.shift_assignment.shift_assignment import get_actual_start_end_datetime_of_shift

	rows = frappe.get_all(
		"Employee Checkin",
		filters={
			"employee": employee,
			"skip_auto_attendance": 0,
			"time": ["between", [get_datetime(start), get_datetime(add_days(end, 1)) + timedelta(hours=12)]],
		},
		fields=["name", "time", "attendance", "shift", "offshift", "shift_start", "log_type"],
		order_by="time asc",
		limit_page_length=0,
	)
	for p in rows:
		timings = get_actual_start_end_datetime_of_shift(employee, get_datetime(p.time), True)
		p["new_shift"] = timings.shift_type.name if timings else None
		p["new_start"] = timings.start_datetime if timings else None
	return rows


def _frozen(company, start, end):
	"""The days in range that a submitted Attendance Submission holds."""
	days, on = set(), start
	while on <= end:
		hit = freeze.submitted_for(company, on)
		if hit:
			days.update(_month_days(on, end))
			on = _next_month(on)
			continue
		on = _next_month(on)
	return days


def _month_days(on, end):
	first = on.replace(day=1)
	d, out = first, []
	while d.month == first.month and d <= end:
		out.append(d)
		d += timedelta(days=1)
	return out


def _next_month(on):
	return (on.replace(day=28) + timedelta(days=4)).replace(day=1)


def _write(plan, result):
	for name in plan["cancel"]:
		try:
			doc = frappe.get_doc("Attendance", name)
			doc.flags.ignore_permissions = True
			doc.add_comment("Comment", _("Cancelled to be rebuilt from the punches: {0}.").format(plan["why"][name]))
			doc.cancel()
		except freeze.FrozenMonthError as exc:
			result["errors"].append({"name": name, "why": str(exc)})
	for name in plan["refetch"]:
		try:
			doc = frappe.get_doc("Employee Checkin", name)
			# hrms's own decision, then only its fields written: a full save
			# would run the punch rules again (server clock, window, fence)
			# against a punch that was taken long ago.
			doc.fetch_shift()
			doc.db_update()
		except Exception as exc:  # one punch never stops the rest
			result["errors"].append({"name": name, "why": str(exc)[:300]})


def process_shifts(shifts):
	"""The shift job, for the shifts a rebuild touched."""
	for name in shifts:
		if not frappe.db.get_value("Shift Type", name, "enable_auto_attendance"):
			continue
		try:
			frappe.get_doc("Shift Type", name).process_auto_attendance()
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title="Rebuild: shift job for {0}".format(name))


# -------------------------------------------------------------------- hooks ---


def on_employee_update(doc, method=None):
	"""Employee · on_update. A new or changed default shift picks up the punches
	nobody had a shift for, back to the first day of the rebuildable range."""
	if not doc.has_value_changed("default_shift") or not doc.default_shift:
		return
	end = getdate(today())
	start = end - timedelta(days=rp.MAX_DAYS - 1)
	if doc.date_of_joining and getdate(doc.date_of_joining) > start:
		start = getdate(doc.date_of_joining)
	frappe.enqueue(
		"manna_hr.reprocess_site.run_quietly",
		employees=[doc.name], from_date=str(start), to_date=str(end), scope=rp.SCOPE_UNASSIGNED,
		queue="long", enqueue_after_commit=True,
	)


def on_shift_assignment(doc, method=None):
	"""Shift Assignment · on_submit, on_update_after_submit, on_cancel."""
	if doc.flags.get("manna_rota"):
		return
	end = getdate(today())
	start = getdate(doc.start_date)
	if start > end:
		return
	stop = min(getdate(doc.end_date), end) if doc.end_date else end
	if method == "on_update_after_submit":
		before = doc.get_doc_before_save()
		# An end date pulled in leaves days the assignment no longer holds:
		# rebuild from the earlier of the two ends.
		if before and before.end_date and getdate(before.end_date) > stop:
			stop = min(getdate(before.end_date), end)
		if before and before.status == doc.status and before.end_date == doc.end_date and before.start_date == doc.start_date:
			return
	start = max(start, end - timedelta(days=rp.MAX_DAYS - 1))
	if stop < start:
		return
	frappe.enqueue(
		"manna_hr.reprocess_site.run_quietly",
		employees=[doc.employee], from_date=str(start), to_date=str(stop), scope=rp.SCOPE_ALL,
		queue="long", enqueue_after_commit=True,
	)


def run_quietly(employees, from_date, to_date, scope):
	"""For the hooks: a failure is logged, never raised into a save."""
	try:
		out = run(employees, from_date, to_date, scope=scope, write=True)
		frappe.db.commit()
		return out
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title="Rebuild after a shift change: {0}".format(", ".join(employees)))
