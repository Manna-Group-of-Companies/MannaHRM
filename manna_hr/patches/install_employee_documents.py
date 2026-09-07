"""Put the document register onto a site that already has this app.

`after_install` runs once and never again, so an existing install would get the
two new doctypes (files in the app create those) and none of the things that
make them useful: the type master would be empty, the new custom fields would
not exist, and the register would open on nothing while every passport number on
the site sat where it always has — on `Employee`.

Three steps, each idempotent, because `bench migrate` runs this again on the
next deploy and a patch that only works once is a patch somebody has to remember
not to re-run.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

#: The eight types Factor HR's Document Entry screen shows, six of which this
#: dashboard drew dead because nothing on `Employee` could hold them.
#:
#: `warn_days` is not one number for all of them, and that is the point. A
#: passport is renewed in weeks and a visa is not: giving both thirty days would
#: make the visa warning arrive after the appointment that could have used it.
#: The three marked statutory are the ones where an expiry means somebody may
#: not lawfully be on site tomorrow — see the reason strings in
#: `client/src/data/onboard.js`.
TYPES = [
	{
		"document_type_name": "Passport",
		"category": "Identity",
		"warn_days": 90,
		"has_place": 1,
	},
	{
		"document_type_name": "National Id",
		"category": "Identity",
		"warn_days": 60,
		"has_place": 1,
	},
	{
		"document_type_name": "Visa",
		"category": "Statutory",
		"warn_days": 120,
		"is_statutory": 1,
		"description": "A visa that has expired is a person who cannot be on site tomorrow. Warned earliest of the eight for that reason.",
	},
	{
		"document_type_name": "Resident Card",
		"category": "Statutory",
		"warn_days": 120,
		"is_statutory": 1,
		"description": "The UAE residence card. Issued against the visa and expiring with it, so the two are chased together or neither is.",
	},
	{
		"document_type_name": "Man Power Id",
		"category": "Statutory",
		"warn_days": 90,
		"is_statutory": 1,
		"description": "The labour card or work permit, issued per worker per employer. The one an inspector asks for.",
	},
	{
		"document_type_name": "Insurance Card",
		"category": "Benefits",
		"warn_days": 45,
	},
	{
		"document_type_name": "Contract",
		"category": "Employment",
		"warn_days": 60,
		"description": "The employment contract. `Employee.contract_end_date` holds the renewal date already; this holds the number, which had nowhere to live.",
	},
	{
		"document_type_name": "PAN",
		"category": "Statutory",
		"has_expiry": 0,
		"description": "No expiry, so it is reported as No Expiry rather than as valid forever.",
	},
]

#: What moves across from `Employee`, and under which type.
#: `(type, number field, expiry field, issue field, place field)`.
#: Only the two that were ever actually backed — the other six had no field to
#: read, which is the whole reason this doctype exists.
BACKFILL = [
	("Passport", "passport_number", "valid_upto", "date_of_issue", "place_of_issue"),
	("PAN", "custom_pan_no", None, None, None),
]


def execute():
	frappe.reload_doc("manna_hr", "doctype", "employee_document_type")
	frappe.reload_doc("manna_hr", "doctype", "employee_document")

	# Only the two doctypes this patch is about. Re-running the whole set is
	# harmless but slow, and a patch that touches Employee Checkin while
	# installing a document register is a patch nobody can review.
	create_custom_fields(
		{k: v for k, v in CUSTOM_FIELDS.items() if k in ("Employee", "Asset", "Asset Movement")},
		ignore_validate=True,
	)

	_seed_types()
	_backfill()
	frappe.db.commit()


def _seed_types():
	"""Create the eight types, and leave alone any that already exist.

	Never updates. Somebody who has lengthened the visa warning to 150 days has
	made a decision about their own site, and a migration that quietly puts it
	back to 120 is a migration that undoes people's work.
	"""
	made = 0
	for spec in TYPES:
		if frappe.db.exists("Employee Document Type", spec["document_type_name"]):
			continue
		doc = frappe.get_doc({"doctype": "Employee Document Type", **spec})
		doc.insert(ignore_permissions=True)
		made += 1
	return made


def _backfill():
	"""Move what is already on `Employee` into rows, once.

	Without this the register opens empty on a site that has 139 passports in
	it, and the first thing anybody would do is start typing them in again.

	The `Employee` fields are **not** cleared. Two reasons, and the second is
	the real one: `employee_letter.py` merges `{PassportNumber}` from the
	Employee record, so clearing it would blank a token in every letter issued
	afterwards — and a backfill that destroys its own source cannot be checked
	against anything if it turns out to have been wrong.
	"""
	made = 0
	for dt, num_f, exp_f, iss_f, place_f in BACKFILL:
		if not frappe.db.exists("Employee Document Type", dt):
			continue

		fields = ["name"] + [f for f in (num_f, exp_f, iss_f, place_f) if f]
		try:
			rows = frappe.get_all(
				"Employee",
				filters={num_f: ("is", "set")},
				fields=fields,
				limit_page_length=0,
			)
		except Exception:
			# The field is not on this site — `custom_pan_no` on a bench that
			# has never run `after_install`. Nothing to move.
			continue

		for row in rows:
			number = (row.get(num_f) or "").strip()
			if not number:
				continue
			if frappe.db.exists(
				"Employee Document",
				{"employee": row["name"], "document_type": dt, "document_number": number},
			):
				continue

			doc = frappe.get_doc(
				{
					"doctype": "Employee Document",
					"employee": row["name"],
					"document_type": dt,
					"document_number": number,
					"valid_upto": row.get(exp_f) if exp_f else None,
					"date_of_issue": row.get(iss_f) if iss_f else None,
					"place_of_issue": row.get(place_f) if place_f else None,
					"remarks": "Moved from the Employee record by manna_hr.patches.install_employee_documents.",
				}
			)
			doc.insert(ignore_permissions=True)
			made += 1

	return made
