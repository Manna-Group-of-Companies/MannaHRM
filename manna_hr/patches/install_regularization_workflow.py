"""Put the approval workflow onto a site that already has this app.

`after_install` runs once and never again, so an existing install would keep the
old free-for-all where any `PUT status=Approved` was an approval. This is the
same call, re-runnable, and `bench migrate` is what runs it.

Idempotent: `ensure_workflow` upserts. Re-listing this patch under a new name is
how a change to the table in `workflow.py` reaches sites that have already had
it applied.
"""

import frappe

from manna_hr.notifications import ensure_notifications
from manna_hr.workflow import STATUS_DRAFT, STATUS_PENDING, ensure_workflow


def execute():
	frappe.reload_doc("manna_hr", "doctype", "attendance_regularization")
	ensure_workflow()
	ensure_notifications()
	_settle_existing()


def _settle_existing():
	"""Every row that predates the workflow needs a state the workflow knows.

	`status` used to default to `Pending Approval` and there was no `Draft`, so
	nothing existing can be one — every row already in the table was either
	waiting or decided, and all four of those states survive the change under
	the same names. There is nothing to migrate, and this checks that rather
	than assuming it: a row holding a state the workflow has never heard of is
	a row with no action offered on it and no way out but the database.
	"""
	known = {STATUS_DRAFT, STATUS_PENDING, "Approved", "Rejected", "Completed"}
	stray = frappe.get_all(
		"Attendance Regularization",
		filters={"status": ("not in", list(known))},
		fields=["name", "status"],
	)
	for row in stray:
		frappe.log_error(
			title="Regularization in an unknown state",
			message=(
				"{0} holds status {1!r}, which the approval workflow has no state for. "
				"It has been left alone — decide what it should be and set it by hand."
			).format(row.name, row.status),
		)
