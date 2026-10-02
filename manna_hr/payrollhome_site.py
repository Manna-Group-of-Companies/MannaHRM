"""The Payroll Home workspace, as the documents that make it on the ERPNext site.

Pure, like `payrollsetup.py`: `tools/deploy_payroll_home.py` sends these to the
site, and `tests/test_payrollhome_site.py` says what they must contain without one.

## Why a Workspace and not a Page

A desk **Page** needs developer mode (Frappe refuses a new one without it) and
the System Manager role, and the HR login this runs under has neither. A
**Workspace** with a **Custom HTML Block** is the same thing to the person using
it — its own tile in the desk's sidebar, with a screen of their own — and it can
be made and changed by an HR Manager, on a site with developer mode off, with no
app installed.

## What is on the site afterwards

* Custom HTML Block `Payroll Home` — the screen. Its script is
  `erpnext/payroll_home/payroll_home.js`, with `payroll_home.css` folded in
  (the block replaces its own contents on every draw, so a style element Frappe
  put beside it would be wiped).
* Workspace `Payroll Home` — that block, and shortcuts to the documents and
  reports a payroll month uses. Visible to HR Manager and HR User only.
"""

import json

BLOCK_NAME = "Payroll Home"
WORKSPACE_LABEL = "Payroll Home"
ROLES = ("HR Manager", "HR User")
STYLE_PLACEHOLDER = '"__STYLE__"'

#: (label, doctype) — the lists a month's payroll is made from.
DOCTYPE_SHORTCUTS = (
	("Salary Slip", "Salary Slip"),
	("Payroll Entry", "Payroll Entry"),
	("Additional Salary", "Additional Salary"),
	("Salary Structure Assignment", "Salary Structure Assignment"),
	("Bulk Salary Structure Assignment", "Bulk Salary Structure Assignment"),
	("Salary Component", "Salary Component"),
)

#: (label, report, the doctype it reads)
REPORT_SHORTCUTS = (
	("Salary Register", "Salary Register", "Salary Slip"),
	("Bank Remittance", "Bank Remittance", "Salary Slip"),
)


def script_with_style(script, css):
	"""The block's script with its stylesheet folded in as one JS string."""
	if STYLE_PLACEHOLDER not in script:
		raise ValueError("the script has no %s placeholder for its stylesheet" % STYLE_PLACEHOLDER)
	return script.replace(STYLE_PLACEHOLDER, json.dumps(css))


def block_doc(script, css):
	"""The Custom HTML Block. Named by prompt, so `__newname` as well as `name`."""
	return {
		"doctype": "Custom HTML Block",
		"__newname": BLOCK_NAME,
		"name": BLOCK_NAME,
		"private": 0,
		"html": '<div id="payroll-home"></div>',
		"script": script_with_style(script, css),
		"roles": [{"role": r} for r in ROLES],
	}


def _id(seed):
	"""A stable block id, so a second deploy does not reshuffle the page."""
	import hashlib

	return hashlib.sha1(seed.encode()).hexdigest()[:10]


def workspace_doc():
	content = [
		{"id": _id("h1"), "type": "header", "data": {"text": '<span class="h4"><b>Payroll — get the month paid</b></span>', "col": 12}},
		{"id": _id("block"), "type": "custom_block", "data": {"custom_block_name": BLOCK_NAME, "col": 12}},
		{"id": _id("sp"), "type": "spacer", "data": {"col": 12}},
		{"id": _id("h2"), "type": "header", "data": {"text": '<span class="h4"><b>Open directly</b></span>', "col": 12}},
	]
	shortcuts = []
	for label, doctype in DOCTYPE_SHORTCUTS:
		shortcuts.append({"label": label, "type": "DocType", "link_to": doctype, "doc_view": "List"})
	for label, report, ref in REPORT_SHORTCUTS:
		shortcuts.append({"label": label, "type": "Report", "link_to": report, "report_ref_doctype": ref})
	for s in shortcuts:
		content.append({"id": _id("sc" + s["label"]), "type": "shortcut", "data": {"shortcut_name": s["label"], "col": 3}})
	return {
		"doctype": "Workspace",
		"label": WORKSPACE_LABEL,
		"title": WORKSPACE_LABEL,
		"type": "Workspace",
		"module": "Payroll",
		"public": 1,
		"is_hidden": 0,
		"icon": "accounting",
		"sequence_id": 9,
		"content": json.dumps(content),
		"custom_blocks": [{"custom_block_name": BLOCK_NAME, "label": BLOCK_NAME}],
		"shortcuts": shortcuts,
		"roles": [{"role": r} for r in ROLES],
	}
