"""Put `Employee Checkin.custom_photo` onto a site that already has this app.

Raised 25 September 2026: the phone app takes a photo at every punch and the
dashboard's App Punches page shows it beside the punch. `CUSTOM_FIELDS` in
`install.py` declares the field; this is what gets it onto a site that
installed before it existed. Safe to run twice — `create_custom_fields` upserts.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = [f for f in CUSTOM_FIELDS["Employee Checkin"] if f["fieldname"] == "custom_photo"]
	create_custom_fields({"Employee Checkin": fields}, ignore_validate=True)
	frappe.db.commit()
