"""Put `Employee Checkin.custom_location_accuracy`, `custom_device_info` and
`custom_punch_address` onto a site that already has this app.

Raised 2 October 2026, for App Punches drawn in Factor HR's In / Out report
layout: its Punch Info column says how good the phone's fix was and which
phone sent it, and its Location column the street. Safe to run twice —
`create_custom_fields` upserts.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELDS = ("custom_location_accuracy", "custom_device_info", "custom_punch_address")


def execute():
	fields = [f for f in CUSTOM_FIELDS["Employee Checkin"] if f["fieldname"] in FIELDS]
	create_custom_fields({"Employee Checkin": fields}, ignore_validate=True)
	frappe.db.commit()
