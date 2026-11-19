"""Settle the duplicate punches already on the site. The rule is `dedupe.py`.

    bench --site <site> execute manna_hr.dedupe_site.preview --kwargs "{'from_date': '2026-11-01', 'to_date': '2026-11-19'}"
    bench --site <site> execute manna_hr.dedupe_site.apply   --kwargs "{'from_date': '2026-11-01', 'to_date': '2026-11-19'}"

Or the same two from the API as an HR Manager. Preview first, always: on the
live site `apply` is a write, and needs a yes for that exact change.
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, get_datetime, getdate

from manna_hr import dedupe, reprocess_site

ROLES = ("HR Manager", "System Manager")


def _rows(from_date, to_date, employee=None):
	start, end = getdate(from_date), getdate(to_date)
	if (end - start).days > 92:
		frappe.throw(_("At most 92 days at a time."), title=_("Too long"))
	cond, args = "", {"a": get_datetime(start), "b": get_datetime(add_days(end, 1))}
	if employee:
		cond, args["e"] = " AND c.employee = %(e)s", employee
	# Only the keys that repeat: one query over the month, not a row per punch.
	return frappe.db.sql(
		"""
		SELECT c.name, c.employee, c.time, c.creation, c.attendance, c.log_type,
		       c.skip_auto_attendance, c.device_id
		FROM `tabEmployee Checkin` c
		JOIN (
			SELECT employee, time FROM `tabEmployee Checkin`
			WHERE time >= %(a)s AND time < %(b)s {0}
			GROUP BY employee, time HAVING COUNT(*) > 1
		) d ON d.employee = c.employee AND d.time = c.time
		ORDER BY c.employee, c.time, c.creation
		""".format(cond.replace("c.employee", "employee")),
		args,
		as_dict=True,
	)


@frappe.whitelist()
def preview(from_date, to_date, employee=None):
	"""How many copies, of how many punches, and the days they touched."""
	frappe.only_for(ROLES)
	rows = _rows(from_date, to_date, employee)
	p = dedupe.plan(rows)
	return {
		"punches_doubled": len(p["keep"]),
		"copies_to_set_aside": len(p["set_aside"]),
		"days_to_rebuild": len(p["rebuild"]),
		"people": len({r["employee"] for r in rows}),
		"by_device": _count_by(rows, "device_id"),
		"sample": p["set_aside"][:20],
	}


@frappe.whitelist(methods=["POST"])
def apply(from_date, to_date, employee=None):
	"""Set the extra copies aside, then rebuild the days they were counted in."""
	frappe.only_for(ROLES)
	rows = _rows(from_date, to_date, employee)
	p = dedupe.plan(rows)

	# Attendance first, while it still names its punches: which day each was.
	days = defaultdict(set)
	for name in p["rebuild"]:
		row = frappe.db.get_value("Attendance", name, ["employee", "attendance_date", "docstatus"], as_dict=True)
		if row and row.docstatus == 1:
			days[row.employee].add(getdate(row.attendance_date))

	for name, kept in p["set_aside"]:
		frappe.db.set_value("Employee Checkin", name, "skip_auto_attendance", 1, update_modified=False)
		frappe.get_doc("Employee Checkin", name).add_comment(
			"Comment", _("Set aside: a second copy of {0}, the same person at the same second.").format(kept)
		)

	rebuilt = 0
	for employee_name, dates in days.items():
		out = reprocess_site.run(
			[employee_name], min(dates), max(dates), write=True, rebuild=dates,
		)
		rebuilt += out["cancelled"]
	frappe.db.commit()
	return {"set_aside": len(p["set_aside"]), "attendance_rebuilt": rebuilt, "people": len(days)}


def _count_by(rows, field):
	out = defaultdict(int)
	for r in rows:
		out[r.get(field) or "(none)"] += 1
	return dict(out)
