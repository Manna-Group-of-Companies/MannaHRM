"""Put `Employee.custom_needs_details` onto a site that already has this app.

Raised 3 October 2026: the bridge makes an Employee for somebody who punches
and is on no record, with a placeholder gender and date of birth, and ticks
this so HR can find the record and correct it. Safe to run twice —
`create_custom_fields` upserts.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = [f for f in CUSTOM_FIELDS["Employee"] if f["fieldname"] == "custom_needs_details"]
	create_custom_fields({"Employee": fields}, ignore_validate=True)
	frappe.db.commit()
