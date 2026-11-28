"""Put `Employee.custom_app_login` onto a site that already has this app.

Raised 28 November 2026: the Manna HR app signs in with the Emp Code and the
date of birth, and every other app with the person's own email and password.
One Frappe login holds one password, so somebody with a login of their own gets
a second one for the app, named here. Safe to run twice —
`create_custom_fields` upserts.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	fields = [f for f in CUSTOM_FIELDS["Employee"] if f["fieldname"] == "custom_app_login"]
	create_custom_fields({"Employee": fields}, ignore_validate=True)
	frappe.db.commit()
