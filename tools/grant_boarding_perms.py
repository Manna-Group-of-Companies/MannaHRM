"""Let HR start an onboarding or an offboarding from the dashboard.

    python tools/grant_boarding_perms.py                  # dry run, writes nothing
    python tools/grant_boarding_perms.py --apply

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    The key must be an Administrator's or a System Manager's: nobody else may
    change who may do what.

Checklist → Start offboarding writes an `Employee Separation`, submitted, and
hrms makes a `Task` for each line of its checklist. On 29 October 2026 the site
refused it for hr@mannarubber.com: "does not have doctype access via role
permission for document Employee Separation". The company logins carry
`HR User` and nothing else (tools/create_company_logins.py), so that role is
the one given the rights here.

## Why through the permission manager, never a Custom DocPerm row

Frappe replaces rather than merges permissions: the moment one Custom DocPerm
row exists for a doctype, the standard rows stop applying (CLAUDE.md §5). A row
written by hand would quietly take HR Manager's and System Manager's rights
away. `permission_manager.add` is what the Role Permissions Manager screen
calls, and it copies the standard rows across first, so this does exactly what
a person clicking there would do and nothing else.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

ROLE = "HR User"
PM = "/api/method/frappe.core.page.permission_manager.permission_manager."

#: What starting a checklist writes, and the rights each needs. Submit only
#: where the dashboard submits: a separation or onboarding left as a draft
#: makes no Tasks. Delete is never given.
NEEDS = {
	"Employee Separation": ["read", "write", "create", "submit", "report", "print", "email"],
	"Employee Onboarding": ["read", "write", "create", "submit", "report", "print", "email"],
	"Employee Separation Template": ["read", "write", "create", "report"],
	"Employee Onboarding Template": ["read", "write", "create", "report"],
	"Task": ["read", "write", "create", "report"],
}


# -------------------------------------------------------------------- site ---

def call(method, body=None):
	data = None if body is None else urllib.parse.urlencode(body).encode("utf-8")
	r = urllib.request.Request(
		BASE + PM + method, data=data,
		headers={"Authorization": AUTH, "Accept": "application/json"})
	try:
		with urllib.request.urlopen(r, timeout=60) as f:
			return json.loads(f.read().decode("utf-8")).get("message")
	except urllib.error.HTTPError as e:
		raise SystemExit("{0} refused ({1}): {2}".format(method, e.code, e.read().decode("utf-8", "replace")[:400]))


def rules(doctype):
	"""The rules the site applies to a doctype now — custom ones if any exist,
	else the standard ones, which is what the manager screen shows."""
	return call("get_permissions?" + urllib.parse.urlencode({"doctype": doctype})) or []


# -------------------------------------------------------------------- plan ---

def missing(doctype):
	"""Rights HR User lacks on a doctype at permlevel 0, and whether it has a row at all."""
	row = next((r for r in rules(doctype) if r.get("role") == ROLE and int(r.get("permlevel") or 0) == 0), None)
	if not row:
		return None, list(NEEDS[doctype])
	return row, [p for p in NEEDS[doctype] if not int(row.get(p) or 0)]


def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="give the rights")
	a = p.parse_args()
	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_KEY and ERP_SECRET (an Administrator's key) first.")

	todo = []
	for dt in NEEDS:
		row, lack = missing(dt)
		if not lack:
			print("  ok      {0}: {1} has what it needs".format(dt, ROLE))
			continue
		print("  {0} {1}: {2} lacks {3}{4}".format(
			"give   " if a.apply else "would  ", dt, ROLE, ", ".join(lack), "" if row else " (no rule yet)"))
		todo.append((dt, row, lack))

	if not todo:
		print("\nNothing to do.")
		return
	if not a.apply:
		print("\nDry run. Run again with --apply to give these.")
		return

	for dt, row, lack in todo:
		if not row:
			# Copies the standard rows to custom ones first, then adds the role.
			call("add", {"parent": dt, "role": ROLE, "permlevel": 0})
		for ptype in lack:
			call("update", {"doctype": dt, "role": ROLE, "permlevel": 0, "ptype": ptype, "value": 1})

	# Read back: a write the site dropped is a login that still cannot start one.
	short = [(dt, lack) for dt in NEEDS for _, lack in [missing(dt)] if lack]
	if short:
		for dt, lack in short:
			print("  STILL MISSING  {0}: {1}".format(dt, ", ".join(lack)))
		sys.exit(1)
	print("\nDone. Every HR User may now start an onboarding or an offboarding; "
		"they must sign out and in again to pick it up.")


if __name__ == "__main__":
	main()
