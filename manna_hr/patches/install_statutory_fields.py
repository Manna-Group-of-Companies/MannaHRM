"""Put the Aadhaar / UAN / ESIC / Insurance fields onto a site that already
has this app.

Raised 19 September 2026: Employee Profile's Identity pane and PF & ESIC pane
carried Aadhaar, UAN and ESIC Number as `null` rows with a reason, and the
Document register carried Insurance Card as a "build" type with nowhere to
land a number — none of the four had a field on `Employee` under any name.
`CUSTOM_FIELDS` in `install.py` now declares them; this is what gets them onto
a site that installed before they existed. `bench migrate` runs it, and it is
safe to run twice — `create_custom_fields` upserts and this patch touches
nothing else.
"""

import frappe

from manna_hr.install import CUSTOM_FIELDS
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

#: Only the seven fields this patch is about, not the whole Employee list —
#: re-running everything is harmless but a patch that touches fields unrelated
#: to its own name is a patch nobody can review at a glance.
NEW_FIELDNAMES = {
	"custom_statutory_section",
	"custom_aadhaar_number",
	"custom_uan",
	"custom_esic_number",
	"custom_column_break_statutory",
	"custom_insurance_card_no",
	"custom_insurance_expiry_date",
}


def execute():
	fields = [f for f in CUSTOM_FIELDS["Employee"] if f["fieldname"] in NEW_FIELDNAMES]
	create_custom_fields({"Employee": fields}, ignore_validate=True)
	frappe.db.commit()
