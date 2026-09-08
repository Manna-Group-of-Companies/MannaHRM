"""Check the live site's schema against what the code assumes.

    python tools/check_schema.py

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## Why this is a tool and not a test

These checks used to be `pytest` tests that read the doctype JSON in this repo.
The schema now lives on `mannarubber.m.frappe.cloud` — the doctypes there are
custom, so the site owns the definitions and this repo has no copy to read.

**That is a real loss and this file is what replaces it.** A pytest run needs
nothing; this needs credentials and a network, so it will not run in CI and
nobody is stopped by it at commit time. Run it after anybody edits a doctype in
Desk, and before a release.

Every check below is one that fails *silently* on a live site: a status the
workflow can set and the field cannot hold, a role a transition offers to
somebody who then cannot open the document, a field the dashboard asks for that
is not there. None of them raise anything at install time. Each one surfaces
weeks later as one person seeing a blank screen and being told to try again.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

MODULE = "Manna HR"

#: What this app expects to be on the site. The list is here because there is
#: no longer a folder of JSON to count.
EXPECTED = [
	"Asset Assignment", "Attendance Device", "Employee Attendance Regularization",
	"Employee Category Type", "Employee Category Value", "Employee Document",
	"Employee Document Type", "Employee Letter", "Employee Loan Application",
	"Employee Loan Repayment", "Employee Loan Repayment Schedule", "Employee Loan Type",
	"Employee Profile Change Item", "Employee Profile Change Request", "Employee Survey",
	"Employee Survey Answer", "Employee Survey Question", "Employee Survey Response",
	"Letter Type", "Manna HR Settings", "Work Location",
]

problems = []
notes = []


def req(path):
	r = urllib.request.Request(
		BASE + path, headers={"Authorization": AUTH, "Accept": "application/json"}
	)
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def doctype(name):
	return req("/api/resource/DocType/" + urllib.parse.quote(name))["data"]


def check_everything_is_there():
	rows = req("/api/resource/DocType?" + urllib.parse.urlencode({
		"fields": json.dumps(["name", "module"]),
		"filters": json.dumps([["name", "in", EXPECTED]]),
		"limit_page_length": 0,
	}))["data"]
	there = {r["name"]: r["module"] for r in rows}

	for name in EXPECTED:
		if name not in there:
			problems.append("{0} is not on the site".format(name))
		elif there[name] != MODULE:
			problems.append("{0} is in module {1!r}, not {2!r}".format(name, there[name], MODULE))


def check_the_short_name_is_not_ours():
	"""`Attendance Regularization` belongs to the sales system next door.

	Keyed to `Sales Person`, with live rows, and using `Initiated` where ours
	uses `Pending Approval`. A doctype of ours under that name would be an HR
	correction written into a sales queue nobody here reads.
	"""
	try:
		doc = doctype("Attendance Regularization")
	except urllib.error.HTTPError:
		notes.append("`Attendance Regularization` is not on this site at all — nothing to collide with")
		return
	if doc.get("module") == MODULE:
		problems.append(
			"`Attendance Regularization` is in the Manna HR module. It is the sales system's — "
			"see docs/SITE_SURVEY.md §5"
		)
	if any(f["fieldname"] == "employee" for f in doc.get("fields", [])):
		problems.append("`Attendance Regularization` has an `employee` field — somebody has edited theirs")


def check_the_workflow_and_the_field_agree():
	"""The five states are written down twice and have to match exactly.

	A workflow that can set a status the field's `options` do not list saves
	perfectly happily. The document then holds a value nothing renders, and the
	first anybody knows of it is an approver looking at a blank status.
	"""
	from manna_hr.workflow import DOCTYPE, STATE_FIELD, STATES, STATUS_DRAFT, roles_used

	doc = doctype(DOCTYPE)
	field = next((f for f in doc["fields"] if f["fieldname"] == STATE_FIELD), None)
	if not field:
		problems.append("{0} has no `{1}` field for the workflow to drive".format(DOCTYPE, STATE_FIELD))
		return

	wanted = [state for state, _style, _edit in STATES]
	found = (field.get("options") or "").split("\n")
	if found != wanted:
		problems.append(
			"{0}.{1} options are {2} — the workflow expects {3}".format(
				DOCTYPE, STATE_FIELD, found, wanted)
		)

	if field.get("default") != STATUS_DRAFT:
		problems.append(
			"{0}.{1} defaults to {2!r}, not {3!r} — a half-typed correction lands in "
			"an approver's queue the moment it is saved".format(
				DOCTYPE, STATE_FIELD, field.get("default"), STATUS_DRAFT)
		)

	permitted = {p["role"] for p in doc.get("permissions", [])}
	missing = sorted(set(roles_used()) - permitted)
	if missing:
		problems.append(
			"{0} offers transitions to {1}, who cannot reach the doctype — Frappe draws the "
			"button and then refuses it, which looks like the person's fault".format(
				DOCTYPE, ", ".join(missing))
		)


def check_the_dashboard_gets_the_fields_it_asks_for():
	"""`ASSIGN_FIELDS` in the client against `Asset Assignment` on the site.

	This is the drift that produced "DocType Asset Assignment not found" once:
	a screen written against a doctype nobody had built. A field dropped in Desk
	fails the same way and just as quietly — Frappe answers 417 to the whole
	read, so one missing column empties the page rather than the column.
	"""
	load_js = HERE / "client" / "src" / "api" / "load.js"
	if not load_js.exists():
		notes.append("no client checked out beside the app — skipped the dashboard field check")
		return

	found = re.search(r"const ASSIGN_FIELDS = \[(.*?)\];", load_js.read_text(encoding="utf-8"), re.S)
	if not found:
		notes.append("client/src/api/load.js no longer declares ASSIGN_FIELDS")
		return

	wanted = set(re.findall(r'"([a-z_]+)"', found.group(1)))
	have = {f["fieldname"] for f in doctype("Asset Assignment")["fields"]} | {"name"}
	gone = sorted(wanted - have)
	if gone:
		problems.append(
			"the dashboard reads {0} off Asset Assignment and the site has not got them".format(gone)
		)


def main():
	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	print("site      {0}".format(BASE))
	print()

	for check in (
		check_everything_is_there,
		check_the_short_name_is_not_ours,
		check_the_workflow_and_the_field_agree,
		check_the_dashboard_gets_the_fields_it_asks_for,
	):
		try:
			check()
		except urllib.error.HTTPError as e:
			problems.append("{0} could not run: HTTP {1}".format(check.__name__, e.code))

	for note in notes:
		print("  note    {0}".format(note))
	for problem in problems:
		print("  PROBLEM {0}".format(problem))

	print()
	if problems:
		print("{0} problem(s). None of these announce themselves on a live site.".format(len(problems)))
		return 1
	print("The site agrees with the code.")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
