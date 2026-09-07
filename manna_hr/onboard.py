"""The server side of the four Onboard screens.

## Why these are here and not in the client

`CLAUDE.md` §1: a rule enforced only in a client is a suggestion to anyone
holding `curl`. Two of the rules below are the kind that matter — an asset
cannot be issued to a second person while a first still holds it, and it cannot
be received back from somebody who never had it. Both were previously enforced
nowhere at all, because Assets Assignment had no write path: its Save was a link
to the Desk, and the Desk's own validation is the only thing that ever checked.

## What each screen gets

| screen | what it calls |
|---|---|
| Document Entry | `employee_documents`, `save_document`, `delete_document`, `expiring_documents` |
| Assets Assignment | nothing here — that screen writes an `Asset Assignment`, and its rules are in `assets.py` |
| Assets Details | nothing — it writes stock `Asset` fields directly, and stock validation is enough |
| Create Letter / Form | nothing — `letters.py` and the `Employee Letter` controller already serve it |

## The one thing these deliberately do not do

None of them writes an `Employee` field. Document Entry used to, because a
document *was* a field on a person; it is now a row in `Employee Document`, and
the two must not both be authorities on the same passport number. The patch
`manna_hr.patches.backfill_employee_documents` moves what is already on
`Employee` across once, and after that the fields are the historical copy.
"""

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate, today

from manna_hr import rules

# The register the Document Entry screen draws, in the order it draws it.
DOC_FIELDS = [
	"name",
	"employee",
	"employee_name",
	"company",
	"document_type",
	"is_statutory",
	"document_number",
	"date_of_issue",
	"place_of_issue",
	"valid_upto",
	"days_to_expiry",
	"status",
	"attachment",
	"remarks",
]

#: What `save_document` will accept. Everything else on the doctype is either
#: derived (`status`, `days_to_expiry`, `is_statutory`) or copied from the
#: employee (`employee_name`, `company`), and a caller that could set those
#: could file a document that reports itself valid.
DOC_WRITABLE = (
	"document_number",
	"date_of_issue",
	"valid_upto",
	"place_of_issue",
	"remarks",
	"attachment",
)


# ------------------------------------------------------------------ documents ---


@frappe.whitelist()
def employee_documents(employee=None, company=None, status=None, limit=500):
	"""The document register, filtered the way the screen filters it."""
	frappe.has_permission("Employee Document", "read", throw=True)

	filters = {}
	if employee:
		filters["employee"] = employee
	if company:
		filters["company"] = company
	if status:
		filters["status"] = status

	return frappe.get_all(
		"Employee Document",
		filters=filters,
		fields=DOC_FIELDS,
		order_by="days_to_expiry asc, employee_name asc",
		limit_page_length=int(limit or 500),
	)


@frappe.whitelist()
def save_document(employee, document_type, name=None, **values):
	"""Create or update one document. Returns the saved row.

	`employee` and `document_type` are refused as *changes* on an existing
	document: moving a passport from one person to another by editing it leaves
	no trace that it happened, and the two people it concerns are exactly the
	ones who would want one. Delete it and file it again.
	"""
	fields = {k: v for k, v in values.items() if k in DOC_WRITABLE}

	if name:
		doc = frappe.get_doc("Employee Document", name)
		doc.check_permission("write")
		if doc.employee != employee or doc.document_type != document_type:
			frappe.throw(
				_("A document cannot be moved to another person or another type. Delete it and file it again.")
			)
		doc.update(fields)
	else:
		frappe.has_permission("Employee Document", "create", throw=True)
		doc = frappe.get_doc(
			{
				"doctype": "Employee Document",
				"employee": employee,
				"document_type": document_type,
				**fields,
			}
		)

	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def delete_document(name):
	doc = frappe.get_doc("Employee Document", name)
	doc.check_permission("delete")
	doc.delete()
	return {"deleted": name}


@frappe.whitelist()
def expiring_documents(within_days=60, company=None, statutory_only=0):
	"""Whose paperwork runs out next — the screen's Expiry watch.

	Already-expired documents are included and sort first. Leaving them out
	would make the list shrink as the problem got worse, which is the failure
	mode of every expiry report that only looks forward.
	"""
	frappe.has_permission("Employee Document", "read", throw=True)

	filters = {
		"status": ("in", [rules.DOC_EXPIRING, rules.DOC_EXPIRED]),
		"valid_upto": ("<=", add_days(nowdate(), int(within_days or 60))),
	}
	if company:
		filters["company"] = company
	if int(statutory_only or 0):
		filters["is_statutory"] = 1

	rows = frappe.get_all(
		"Employee Document",
		filters=filters,
		fields=DOC_FIELDS,
		order_by="days_to_expiry asc",
		limit_page_length=0,
	)

	# A document against somebody who has left is not a renewal anybody owes.
	active = set(
		r["name"]
		for r in frappe.get_all(
			"Employee",
			filters={"status": "Active", "name": ("in", [r["employee"] for r in rows] or [""])},
			fields=["name"],
		)
	)
	return [r for r in rows if r["employee"] in active]


def refresh_document_status():
	"""Re-date every document that could have changed status overnight.

	Scheduled daily. `status` is stored so the watch can be a list filter, and
	the price of storing it is that a document valid yesterday is still marked
	valid this morning until something re-reads the date.

	Only touches rows whose stored status disagrees with the date, and writes
	with `db_set` rather than `save` — a nightly job that fires `on_update` for
	every document on the site would re-check every attachment for no reason.
	"""
	on = getdate(today())
	specs = {
		s.name: s
		for s in frappe.get_all(
			"Employee Document Type", fields=["name", "has_expiry", "warn_days"]
		)
	}

	changed = 0
	for row in frappe.get_all(
		"Employee Document",
		fields=["name", "document_type", "valid_upto", "status", "days_to_expiry"],
		limit_page_length=0,
	):
		spec = specs.get(row.document_type) or {}
		status, days = rules.document_status(
			getdate(row.valid_upto) if row.valid_upto else None,
			on,
			has_expiry=bool(spec.get("has_expiry", 1)),
			warn_days=spec.get("warn_days") or rules.DEFAULT_WARN_DAYS,
		)
		if status != row.status or days != row.days_to_expiry:
			frappe.db.set_value(
				"Employee Document",
				row.name,
				{"status": status, "days_to_expiry": days},
				update_modified=False,
			)
			changed += 1

	frappe.db.commit()
	return changed
