"""Put the handover register onto a site that already has this app.

The doctype itself arrives as a file, so `bench migrate` creates it. What this
patch is for is the state that comes with it: `Asset.custom_detail`, and the
handovers implied by every asset that already names a custodian.

## Why the backfill matters more than it looks

`AssignEntry.jsx` lists what somebody holds by reading `Asset.custodian`, and
then looks for the `Asset Assignment` behind it. Without this, the site's
existing custodians would each draw a row on the screen with an empty form
beside it and no way to tell "we never wrote this handover down" from "this
handover has no dates". One is a migration artefact and the other is a mistake.

So every asset already out gets an assignment, marked as what it is.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from manna_hr.install import CUSTOM_FIELDS

BACKFILL_NOTE = (
	"Created by manna_hr.patches.install_asset_assignments from the custodian already "
	"on the asset. The handover itself predates this register, so it has no agreed date."
)


def execute():
	frappe.reload_doc("manna_hr", "doctype", "asset_assignment")
	create_custom_fields({"Asset": CUSTOM_FIELDS["Asset"]}, ignore_validate=True)
	_backfill()
	frappe.db.commit()


def _backfill():
	"""One open assignment per asset that already names a custodian.

	`assign_date` is the movement that put it there, when one can be found, and
	the asset's own `creation` when it cannot — never today. Dating a three-year
	-old handover as this morning would make every one of them look new on a
	screen whose whole job is showing what has been out too long.
	"""
	made = 0
	for asset in frappe.get_all(
		"Asset",
		filters={"custodian": ("is", "set"), "docstatus": 1},
		fields=["name", "custodian", "company", "creation"],
		limit_page_length=0,
	):
		if frappe.db.exists("Asset Assignment", {"asset": asset.name, "employee": asset.custodian}):
			continue

		doc = frappe.get_doc(
			{
				"doctype": "Asset Assignment",
				"employee": asset.custodian,
				"asset": asset.name,
				"assign_units": 1,
				"assign_date": _issued_on(asset),
				"remarks": BACKFILL_NOTE,
			}
		)
		# `on_update` would issue a movement for an asset that is already with
		# this person; `move_asset` sees that and does nothing. Left to run
		# rather than skipped, so the one path that writes custodians stays the
		# only one.
		doc.insert(ignore_permissions=True)
		made += 1

	return made


def _issued_on(asset):
	rows = frappe.get_all(
		"Asset Movement Item",
		parent="Asset Movement",
		filters={"asset": asset.name, "to_employee": asset.custodian, "parenttype": "Asset Movement"},
		fields=["parent"],
		order_by="creation desc",
		limit_page_length=1,
	)
	if rows:
		when = frappe.db.get_value("Asset Movement", rows[0]["parent"], "transaction_date")
		if when:
			return when
	return asset.creation
