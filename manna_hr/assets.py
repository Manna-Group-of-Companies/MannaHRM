"""Handovers: what an `Asset Assignment` means, and what it does to the asset.

## Why this doctype exists at all

ERPNext already moves assets — `Asset Movement` writes `custodian` and that is a
perfectly good log. It is a log, and Factor HR's Assets Assignment screen is a
little contract: lent until a date, so many units out, so many back, so many
lost, this much agreed in recovery, and a note about the dent it already had.
Seven of that screen's fifteen boxes had nowhere to live in a log, which is why
they were drawn dead for as long as they were.

So this doctype holds the contract, and ERPNext keeps holding the fact.

## The rule that makes it one system and not two

**A saved assignment moves the asset.** `AssignEntry.jsx` lists what somebody
holds by reading `Asset.custodian` — not by reading assignments — so an
assignment that did not move the asset would write a row the screen that wrote
it cannot see. Every open handover therefore issues the asset, and every one
that closes receives it back, through `Asset Movement` exactly as the Desk
would.

That is done here rather than in the doctype controller only so it can be read
without the validation in the way of it.
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, now

from manna_hr import rules


def fill_from_asset(doc):
	"""Copy the asset's own facts onto the handover.

	Copied rather than fetched live, and that is deliberate: a handover is a
	record of what happened. Recategorising an asset next year must not silently
	rewrite what last year's register says went out.
	"""
	if not doc.asset:
		return

	asset = frappe.db.get_value(
		"Asset",
		doc.asset,
		["asset_name", "item_code", "asset_category", "serial_no", "company", "docstatus", "custodian"],
		as_dict=True,
	)
	if not asset:
		frappe.throw(_("{0} is not an asset on this site.").format(doc.asset))

	doc.asset_type = asset.asset_category
	doc.assets_code = asset.item_code or doc.asset
	if not doc.serial_number:
		doc.serial_number = asset.serial_no
	return asset


def check_counts(doc):
	"""The arithmetic, before the status is worked out from it.

	Each of these is a sentence somebody could otherwise write down and nobody
	could act on: three returned out of two issued, a recovery amount with
	nothing lost behind it, a return date with no return.
	"""
	out = int(doc.assign_units or 0)
	back = int(doc.return_unit or 0)
	gone = int(doc.lost_units or 0)

	if out < 1:
		frappe.throw(_("A handover of nothing is not a handover. Assign Units must be at least 1."))
	if back < 0 or gone < 0:
		frappe.throw(_("Returned and lost counts cannot be negative."))
	if back + gone > out:
		frappe.throw(
			_("{0} went out and {1} are accounted for. More cannot come back than went.").format(out, back + gone)
		)

	if flt(doc.recovery_amount) and not gone:
		# The client refuses this too. It is here because a rule enforced only
		# in a browser is a suggestion to anyone holding curl — CLAUDE.md §1.
		frappe.throw(_("A recovery amount needs a loss behind it. Set Lost Units first."))

	if doc.returned_on and not back:
		frappe.throw(_("Returned On is set but nothing is marked returned."))
	if doc.lost_on and not gone:
		frappe.throw(_("Lost On is set but nothing is marked lost."))
	if gone and not doc.lost_on:
		frappe.throw(_("Something is marked lost. Lost On is the day somebody said so."))


def check_status(doc):
	"""The dropdown, held against the arithmetic under it.

	Factor HR's form has an Asset Status dropdown and so does ours, but the
	counts still decide: the only two words a person may impose are Scrapped and
	Damaged Or Not Working, which no count can produce. Anything else that
	disagrees is refused here rather than overwritten, so the row goes back to
	the person who typed it with both numbers on show.

	Refused rather than flagged, which is the opposite of how a doubtful punch
	is treated and deliberately so (CLAUDE.md §4): a handover that does not add
	up costs a recovery deduction off the wrong person's pay, and nobody is paid
	less for a row that had to be typed again.
	"""
	said = rules.assignment_status_problem(
		doc.asset_status, doc.assign_units, doc.return_unit, doc.lost_units
	)
	if said:
		frappe.throw(_(said))


def check_dates(doc):
	if not doc.assign_date:
		frappe.throw(_("A handover needs the day it went out."))

	start = getdate(doc.assign_date)
	for field, label in (("valid_till", "Valid Till"), ("returned_on", "Returned On"), ("lost_on", "Lost On")):
		value = doc.get(field)
		if value and getdate(value) < start:
			frappe.throw(_("{0} is before the day it went out.").format(_(label)))


def check_not_already_out(doc):
	"""Refuse a second open handover of one asset.

	**The rule this file is really for.** ERPNext will happily move an asset
	from one custodian to another, because a transfer is a legitimate thing to
	do. This screen is a handover form, and a handover that quietly takes a
	laptop off one person's name and puts it on another's is how a register
	stops matching the building. Take it back first.
	"""
	if not rules.assignment_is_open(doc.asset_status):
		return

	open_rows = frappe.get_all(
		"Asset Assignment",
		filters={"asset": doc.asset, "name": ("!=", doc.name or "")},
		fields=["name", "employee", "employee_name", "asset_status"],
	)
	for row in open_rows:
		if not rules.assignment_is_open(row.asset_status):
			continue
		if row.employee == doc.employee:
			frappe.throw(
				_("{0} is already out with this person on {1}. Edit that handover rather than writing a second.").format(
					doc.asset, row.name
				)
			)
		frappe.throw(
			_("{0} is with {1} on {2}. Take it back from them first — a handover is not a transfer.").format(
				doc.asset, row.employee_name or row.employee, row.name
			)
		)


def check_employee(doc):
	status = frappe.db.get_value("Employee", doc.employee, "status")
	if status is None:
		frappe.throw(_("{0} is not an employee on this site.").format(doc.employee))
	# A leaver may still have things out, and a handover being *closed* for
	# somebody who has left is exactly the record that has to be writable. Only
	# a new, open one is refused.
	if status != "Active" and rules.assignment_is_open(doc.asset_status) and doc.is_new():
		frappe.throw(_("{0} is not an active employee.").format(doc.employee))


# ------------------------------------------------------------- the movement ---


def move_asset(doc, asset):
	"""Put the asset with the person, or take it back, so `custodian` agrees.

	Called after the row is saved, because a movement that succeeded against an
	assignment that then failed to save is the worse of the two half-states: the
	asset would name somebody no record explains.

	Idempotent by inspection rather than by flag — it asks the asset where it
	is now and does nothing if that is already right. A flag would be a second
	thing to keep true.
	"""
	if asset.docstatus != 1:
		frappe.throw(
			_("{0} has not been submitted on the site, so it cannot be handed to anybody yet.").format(doc.asset)
		)

	wanted = doc.employee if rules.assignment_is_open(doc.asset_status) else None
	current = frappe.db.get_value("Asset", doc.asset, "custodian") or None
	if wanted == current:
		return None

	if wanted:
		row = {"asset": doc.asset, "to_employee": wanted, "source_location": _location(doc.asset)}
		purpose = "Issue"
	else:
		target = _location(doc.asset)
		if not target:
			frappe.throw(
				_("{0} has no location to go back into. Set a location on the asset first.").format(doc.asset)
			)
		row = {"asset": doc.asset, "from_employee": current, "target_location": target}
		purpose = "Receipt"

	movement = frappe.get_doc(
		{
			"doctype": "Asset Movement",
			"company": doc.company or frappe.db.get_value("Asset", doc.asset, "company"),
			"purpose": purpose,
			"transaction_date": doc.get("returned_on") or doc.get("assign_date") or now(),
			"assets": [row],
		}
	)
	movement.insert(ignore_permissions=True)
	# Submitted, not left as a draft: `custodian` is written by ERPNext's own
	# `on_submit`, so a draft moves nothing and the register would still be
	# wrong.
	movement.submit()
	return movement.name


def _location(asset):
	return frappe.db.get_value("Asset", asset, "location")
