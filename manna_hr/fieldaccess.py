"""Settings → Security → Employee fields, on the server.

The dashboard takes a locked field off its two forms; this is what refuses the
same change from anywhere else — Desk, `curl`, a script. The rule itself is
`rules.employee_access_refusals`, which needs no site.
"""

import json

import frappe
from frappe import _

from manna_hr import rules


def _access():
	# A site without the field yet is a site with no rules, not a broken save
	# of every Employee in the group.
	try:
		text = frappe.db.get_single_value("Manna HR Settings", "employee_field_access")
	except Exception:
		return {}
	try:
		return json.loads(text) if text else {}
	except ValueError:
		return {}


def validate_employee(doc, method=None):
	"""Employee `validate`: refuse a change to a field HR has locked for this login."""
	flags = frappe.flags
	if flags.in_install or flags.in_migrate or flags.in_patch or flags.in_import:
		return
	access = _access()
	is_new = doc.is_new()
	fields = list((access.get("new" if is_new else "edit") or {}).keys())
	if not fields:
		return
	prev = None if is_new else doc.get_doc_before_save()
	if not is_new and prev is None:
		# Nothing to compare against is not evidence of a change.
		return
	before = {f: prev.get(f) for f in fields} if prev else {}
	after = {f: doc.get(f) for f in fields}
	defaults = {f: (doc.meta.get_field(f) or frappe._dict()).get("default") for f in fields}
	refused = rules.employee_access_refusals(access, frappe.session.user, is_new, before, after, defaults)
	if refused:
		labels = [doc.meta.get_label(f) or f for f in refused]
		frappe.throw(
			_("HR has locked {0} in Settings → Security, so this login may not set it.").format(", ".join(labels)),
			frappe.PermissionError,
		)
