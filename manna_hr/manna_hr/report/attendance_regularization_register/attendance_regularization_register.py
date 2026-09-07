"""The correction queue, aged, with who owes each decision.

## What this is for

Two questions get asked about regularizations and neither is answerable from the
list view. **"What is waiting on me?"** — the list can be filtered to Pending
Approval, but not to the ones this person is actually allowed to decide, because
that depends on `approver_type` and on who reports to whom. And **"how long has
it been waiting?"**, which is the one that matters: a correction decided within
a day is a correction; one decided after payroll has run is a dispute.

So the register carries `age_days` and sorts the oldest first, and it colours
nothing — the ageing is a number somebody can sort, filter and export, and a
report that decides for you what is urgent is a report people stop reading.

## Why Approved and Completed are separate lines here

They are separate states for a real reason (`manna_hr/workflow.py`), and this is
the report where the difference is visible: an approved correction has had its
punches written, a completed one has had the day rebuilt from them. A row
sitting in Approved for more than a few hours means the shift job is not
running, and that is a finding about the system rather than about the person.
"""

import frappe
from frappe import _
from frappe.utils import date_diff, getdate, today

#: The states a person is still waiting on an answer in. Not a filter default —
#: the register shows everything unless asked otherwise, because "show me last
#: month's rejections" is a question somebody asks after an argument.
OPEN_STATES = ("Draft", "Pending Approval")


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return columns(), rows(filters)


def columns():
	return [
		{"label": _("Request"), "fieldname": "name", "fieldtype": "Link",
			"options": "Attendance Regularization", "width": 150},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 130},
		{"label": _("Waiting (days)"), "fieldname": "age_days", "fieldtype": "Int", "width": 110},
		{"label": _("Employee"), "fieldname": "employee", "fieldtype": "Link",
			"options": "Employee", "width": 120},
		{"label": _("Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 170},
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Link",
			"options": "Company", "width": 150},
		{"label": _("Day"), "fieldname": "attendance_date", "fieldtype": "Date", "width": 100},
		{"label": _("Decided By"), "fieldname": "approver_type", "fieldtype": "Data", "width": 130},
		{"label": _("Punch In"), "fieldname": "requested_in", "fieldtype": "Datetime", "width": 160},
		{"label": _("Punch Out"), "fieldname": "requested_out", "fieldtype": "Datetime", "width": 160},
		{"label": _("Reason"), "fieldname": "reason", "fieldtype": "Small Text", "width": 240},
		{"label": _("Decided On"), "fieldname": "decided_on", "fieldtype": "Datetime", "width": 160},
		{"label": _("Decided"), "fieldname": "decided_by", "fieldtype": "Link",
			"options": "User", "width": 150},
		{"label": _("Note"), "fieldname": "decision_note", "fieldtype": "Small Text", "width": 240},
	]


def rows(filters):
	where = {}
	if filters.get("company"):
		where["company"] = filters.company
	if filters.get("employee"):
		where["employee"] = filters.employee
	if filters.get("status"):
		where["status"] = filters.status
	elif filters.get("only_open"):
		where["status"] = ("in", OPEN_STATES)
	if filters.get("from_date") and filters.get("to_date"):
		where["attendance_date"] = ("between", [filters.from_date, filters.to_date])

	records = frappe.get_all(
		"Attendance Regularization",
		filters=where,
		fields=[
			"name", "status", "employee", "employee_name", "company", "attendance_date",
			"approver_type", "requested_in", "requested_out", "reason",
			"decided_by", "decided_on", "decision_note", "creation",
		],
		# `get_all` applies the reading user's permissions, which is the whole
		# point of using it here rather than a hand-written SQL SELECT: an
		# `HR User` scoped to one company by a User Permission sees one
		# company's queue, and a report that quietly ignored that would be a
		# way round the scoping rather than a view of it. See CLAUDE.md §5.
		order_by="attendance_date asc, creation asc",
		limit_page_length=0,
	)

	for row in records:
		row["age_days"] = _age(row)
	# Oldest wait first. The undecided ones are what somebody opened this for,
	# and sorting by age puts them at the top without needing a filter set.
	records.sort(key=lambda r: (r["status"] not in OPEN_STATES, -r["age_days"]))
	return records


def _age(row):
	"""How long this has been waiting, in days.

	Measured to the decision where there is one and to today where there is
	not — so a decided request keeps the age it was decided at rather than
	growing forever, which is what makes the column comparable across a month.
	"""
	end = getdate(row.get("decided_on")) if row.get("decided_on") else getdate(today())
	return max(date_diff(end, getdate(row["creation"])), 0)
