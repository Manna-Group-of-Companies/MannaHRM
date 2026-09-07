"""Put one of this app's doctypes onto the site, over the REST API.

    python tools/install_doctype.py asset_assignment            # dry run
    python tools/install_doctype.py asset_assignment --apply
    python tools/install_doctype.py asset_assignment --apply --update

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## Why this exists, and when to stop using it

The proper way to install a doctype is `bench get-app` and `bench migrate`,
which is what `manna_hr` is built for — the JSON in the repo *is* the source of
truth, and a bench applies it. This is the way in until there is a bench:
Frappe Cloud will not run one on a site whose apps are managed for it, and the
dashboard cannot write a handover to a table that does not exist.

So this reads the same JSON a migration would, and creates it as a **custom**
doctype. `custom: 1` is what lets it be made at all without developer mode; the
practical difference is that the site owns the definition rather than the repo,
so the two can drift. **When the app is properly installed, delete the custom
doctype first** — a standard doctype and a custom one of the same name is a
site that fails to migrate, and the error names neither.

## What it will not do

**It never touches a doctype it did not make.** Without `--update` an existing
name is left alone and reported, because overwriting a definition somebody
edited on the site loses whatever they changed — including, on a doctype with
rows behind it, columns that still hold data.

**It does not drop anything.** Removing a field from the JSON and re-running
with `--update` adds nothing and removes nothing from the table; Frappe keeps
the column. Dropping data is a decision for a person at a console.

**It carries no code.** A custom doctype is a table and a form; the controller
beside the JSON is not part of it. For `Asset Assignment` that means
`validate` does not run, so nothing on the server derives `asset_status` or
refuses a row whose returned and lost units come to more than went out — the
dashboard checks both before it saves, and a person with `curl` is not checked
at all. Assets are not payroll, so this is a report somebody has to read rather
than a wage paid wrongly (CLAUDE.md §1), but it is the reason this is a way in
and not the destination.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

HERE = Path(__file__).resolve().parent.parent
DOCTYPES = HERE / "manna_hr" / "manna_hr" / "doctype"

#: Keys in the repo's JSON that describe the *file*, not the doctype, and that
#: Frappe either sets itself or refuses on the way in.
DROP = {"doctype", "creation", "modified", "modified_by", "owner", "idx", "docstatus"}


def req(path, method="GET", payload=None):
	data = json.dumps(payload).encode() if payload is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH, "Accept": "application/json",
		"Content-Type": "application/json"})
	try:
		with urllib.request.urlopen(r, timeout=60) as x:
			return json.loads(x.read().decode())
	except urllib.error.HTTPError as e:
		body = e.read().decode()
		raise SystemExit("HTTP {0} on {1}\n{2}".format(e.code, path, body[:1200]))


def exists(name):
	try:
		req("/api/resource/DocType/" + urllib.parse.quote(name))
		return True
	except SystemExit:
		return False


def payload_from(spec):
	"""The repo's doctype JSON, as the API wants it."""
	doc = {k: v for k, v in spec.items() if k not in DROP}
	doc["doctype"] = "DocType"
	# The one difference from the file. See the module docstring.
	doc["custom"] = 1
	# Frappe fills these from `fields`; sending the file's copy of them is how a
	# field ends up in the order twice.
	doc.pop("field_order", None)
	for f in doc.get("fields", []):
		for k in ("name", "parent", "parentfield", "parenttype", "idx", "creation", "modified"):
			f.pop(k, None)
	return doc


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("folder", help="the doctype folder under manna_hr/manna_hr/doctype/")
	ap.add_argument("--apply", action="store_true", help="actually create it")
	ap.add_argument("--update", action="store_true",
	                help="write over a doctype that is already there. Loses anything edited on the site.")
	ap.add_argument("--module", default="", help="override the module named in the JSON")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	path = DOCTYPES / args.folder / (args.folder + ".json")
	if not path.exists():
		sys.exit("No such doctype JSON: {0}".format(path))

	spec = json.loads(path.read_text(encoding="utf-8"))
	name = spec["name"]
	doc = payload_from(spec)
	if args.module:
		doc["module"] = args.module

	there = exists(name)
	print("doctype   {0}".format(name))
	print("module    {0}".format(doc.get("module")))
	print("fields    {0}".format(len(doc.get("fields", []))))
	print("on site   {0}".format("yes" if there else "no"))

	# The module has to exist on the site or the insert is refused with a
	# message about a link, which reads as a bug in this script rather than as
	# an app that was never installed.
	#
	# `Manna HR` is a Module Def the app creates when a bench installs it, so on
	# the site this tool exists for it is never there. Falling back to `Custom`
	# rather than exiting is the honest default: a custom doctype belongs to the
	# site, and `Custom` is the module Frappe itself puts one in. The name is
	# printed, because which module a doctype is in decides where it appears on
	# the desk and it must not change silently under somebody.
	mods = {m["name"] for m in req("/api/resource/Module%20Def?" + urllib.parse.urlencode({
		"fields": json.dumps(["name"]), "limit_page_length": 500}))["data"]}
	if doc.get("module") not in mods:
		if args.module or "Custom" not in mods:
			sys.exit("The site has no module called {0!r}. Pass --module with one it has."
			         .format(doc.get("module")))
		print("module    {0!r} is not on the site — using 'Custom'".format(doc["module"]))
		doc["module"] = "Custom"

	# So do the roles named in the permission rows, and this one bites here in
	# particular: the JSON names `HR Manager` and `HR User`, which arrive with
	# Frappe HR, and Frappe HR is not installed (docs/OPEN_QUESTIONS.md §3).
	#
	# A missing role is dropped rather than refused, and loudly. Refusing would
	# leave the dashboard with no table at all, which is the failure we are
	# here to fix; dropping the row leaves a doctype only System Manager can
	# reach, which is a permission to add later rather than a wall. Silence is
	# the one thing that would be wrong — a table nobody but Administrator can
	# write reads to HR as the save button being broken.
	want = [p["role"] for p in doc.get("permissions", [])]
	if want:
		have = {r["name"] for r in req("/api/resource/Role?" + urllib.parse.urlencode({
			"fields": json.dumps(["name"]),
			"filters": json.dumps([["name", "in", want]]),
			"limit_page_length": 0}))["data"]}
		gone = [r for r in want if r not in have]
		if gone:
			print("roles     dropped, not on this site: {0}".format(", ".join(gone)))
			doc["permissions"] = [p for p in doc["permissions"] if p["role"] in have]

		# Dropping the two HR roles takes every `create` with them and leaves
		# `Employee`, which is read-only — a table nobody can write, which is
		# the same dead end as no table at all wearing a different error.
		#
		# So one full row for `System Manager`, which is on every Frappe site by
		# definition. It widens nothing: anybody holding it could already have
		# made this doctype by hand. It is a stand-in until Frappe HR brings the
		# real roles, and it is printed because "who may write a handover" is
		# not a thing to discover later from a refusal.
		if not any(p.get("create") for p in doc["permissions"]):
			doc["permissions"].append({
				"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1,
				"report": 1, "export": 1, "print": 1, "email": 1, "share": 1})
			print("roles     added System Manager — nothing left could create a row")
		print("roles     kept: {0}".format(", ".join(p["role"] for p in doc["permissions"]) or "none"))

	if there and not args.update:
		print("\n  Already there. Left alone — overwriting a definition somebody edited on")
		print("  the site loses whatever they changed. Pass --update to write over it.")
		return 0

	if not args.apply:
		print("\n  Dry run. Add --apply to {0} it.".format("update" if there else "create"))
		return 0

	if there:
		req("/api/resource/DocType/" + urllib.parse.quote(name), "PUT", doc)
		print("\n  updated")
	else:
		req("/api/resource/DocType", "POST", doc)
		print("\n  created")

	got = req("/api/resource/DocType/" + urllib.parse.quote(name))["data"]
	print("  {0} field(s) on the site, custom={1}".format(len(got.get("fields", [])), got.get("custom")))
	print("\n  This is a *custom* doctype: the site owns the definition now, and the")
	print("  JSON in the repo is no longer what applies. Delete it here before the")
	print("  app is properly installed, or the migration fails on the collision.")
	return 0


if __name__ == "__main__":
	sys.exit(main())
