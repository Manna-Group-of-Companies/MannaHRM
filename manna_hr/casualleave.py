"""Casual Leave for office staff, supervisors and drivers only — on the server.

HR's rule of 2 October 2026; who counts as which is
`leavepolicy.casual_leave_group`, pure and tested without a site. This is the
half that refuses, because the dashboard and `tools/setup_monthly_leave.py`
skipping somebody is only what those two do (CLAUDE.md §1) — Desk and the API
would still hand a plant helper twelve paid days a year.

Two doors, both at submit, because a draft gives nobody anything:

- **Leave Policy Assignment** — the way the monthly leave arrives. hrms makes
  the allocation in the assignment's `on_submit`, so stopping it here stops
  the allocation before it is written.
- **Leave Allocation** — the way round it: an allocation typed in by hand.

**Not Leave Application.** Without an allocation hrms refuses the application
itself, so there is nothing more to stop there — and somebody already given
Casual Leave before this rule keeps what they hold until HR decides otherwise.
The tool lists them; cancelling a balance somebody has built up is not a side
effect to have on a submit.

The monthly credit is not a door either: hrms adds each month's day to an
allocation that already exists with `db_set`, which reaches no hook, and it can
only exist if one of the two above let it through.
"""

import frappe
from frappe import _

from manna_hr import leavepolicy as lp


def _refuse(employee):
	designation, name = frappe.db.get_value("Employee", employee, ["designation", "employee_name"]) or (None, None)
	why = lp.casual_leave_refusal(designation, name or employee)
	if why:
		frappe.throw(_(why), title=_("No {0}").format(lp.LEAVE_TYPE_NAME))


def guard_assignment(doc, method=None):
	"""Refuse a Leave Policy Assignment that would give Casual Leave to
	somebody whose designation does not get it."""
	types = frappe.get_all("Leave Policy Detail", filters={"parent": doc.leave_policy}, pluck="leave_type")
	if lp.LEAVE_TYPE_NAME in types:
		_refuse(doc.employee)


def guard_allocation(doc, method=None):
	"""Refuse a Casual Leave allocation to somebody whose designation does not
	get it."""
	if doc.leave_type == lp.LEAVE_TYPE_NAME:
		_refuse(doc.employee)
