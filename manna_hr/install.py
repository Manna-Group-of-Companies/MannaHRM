"""What `bench install-app manna_hr` does.

Idempotent throughout — `after_install` also runs on a restore, and a migration
between benches will run it again. Nothing here may assume it is the first time.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

CUSTOM_FIELDS = {
	"Employee": [
		{
			"fieldname": "custom_hr_section",
			"label": "Attendance Rules",
			"fieldtype": "Section Break",
			"insert_after": "attendance_device_id",
			"collapsible": 1,
		},
		{
			"fieldname": "custom_work_location",
			"label": "Work Location",
			"fieldtype": "Link",
			"options": "Work Location",
			"insert_after": "custom_hr_section",
			"description": "Where this person is expected to punch from. Blank means their punches are never measured.",
		},
		{
			"fieldname": "custom_allow_remote_punch",
			"label": "May Punch From Anywhere",
			"fieldtype": "Check",
			"insert_after": "custom_work_location",
			"description": "Field staff, drivers and reps. The coordinate is still recorded — it just does not refuse.",
		},
		{
			"fieldname": "custom_factor_hr_id",
			"label": "Factor HR ID",
			"fieldtype": "Data",
			"insert_after": "custom_allow_remote_punch",
			"unique": 1,
			"read_only": 1,
			"description": "The id this person had in Factor HR. Kept for reconciliation during changeover.",
		},
	],
	"Employee Checkin": [
		{
			"fieldname": "custom_source",
			"label": "Source",
			"fieldtype": "Select",
			"options": "\nbiometric\nmobile\nregularization\nmanual",
			"insert_after": "device_id",
			"read_only": 1,
			# Derived from `device_id` on the server. Read-only so a client
			# cannot declare itself a fingerprint machine and skip the geofence.
			"in_standard_filter": 1,
		},
		{
			"fieldname": "custom_geofence_result",
			"label": "Geofence",
			"fieldtype": "Select",
			"options": "\ninside\noutside\nnot_checked\nno_location",
			"insert_after": "custom_source",
			"read_only": 1,
			"in_standard_filter": 1,
		},
		{
			"fieldname": "custom_distance_metres",
			"label": "Distance From Work Location (m)",
			"fieldtype": "Float",
			"precision": "1",
			"insert_after": "custom_geofence_result",
			"read_only": 1,
		},
	],
}

ROLES = [
	{
		"role_name": "Manna Attendance Approver",
		"desc": "Decides regularizations and leave for their own reports only.",
	},
]


def after_install():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True)
	_create_roles()
	_seed_settings()
	frappe.db.commit()


def _create_roles():
	for role in ROLES:
		if frappe.db.exists("Role", role["role_name"]):
			continue
		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": role["role_name"],
				"desk_access": 1,
			}
		).insert(ignore_permissions=True)


def _seed_settings():
	"""Write the shipped defaults once, so HR opens a filled-in form.

	Only on a Single that has never been saved. Re-running must not undo a
	number somebody deliberately changed — the whole point of the doctype is
	that those numbers are theirs to set.
	"""
	from manna_hr.settings import DEFAULTS

	settings = frappe.get_single("Manna HR Settings")
	if settings.get("punch_in_from"):
		return

	for field, value in DEFAULTS.items():
		settings.set(field, value)
	settings.save(ignore_permissions=True)
