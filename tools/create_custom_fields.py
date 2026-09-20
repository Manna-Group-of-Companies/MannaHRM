"""Put this app's Employee Custom Fields on the site, from `manna_hr/install.py`.

    python tools/create_custom_fields.py                 # what it would do
    python tools/create_custom_fields.py --apply          # do it

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    The key's user needs System Manager: creating a Custom Field is a schema change.

## Why this exists beside `create_doctype.py`

That one puts a whole doctype on the site as a custom one. This puts a *field*
on a doctype the site already has stock — `Employee`, above all, which is
hrms's and will never be ours to install. `bench install-app` runs
`create_custom_fields(CUSTOM_FIELDS)` for real, with `frappe` importing the
site's own field validation; this is the same source of truth, read without a
bench, POSTed by hand.

`CUSTOM_FIELDS` itself is not imported — `install.py` imports `frappe` at
module scope, which is not installed where this runs — it is parsed the same
way `manna_hr/tests/test_onboard.py` reads it, with `ast.literal_eval`.

Refuses a field that is already there rather than overwriting it: a field
somebody has since edited in Desk is the site's to keep, the same rule
`create_doctype.py` follows for a whole doctype.
"""

import argparse
import ast
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
INSTALL_PY = HERE / "manna_hr" / "install.py"

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))


def custom_fields():
	"""`install.py`'s `CUSTOM_FIELDS`, without importing a module that needs `frappe`."""
	tree = ast.parse(io.open(INSTALL_PY, encoding="utf-8").read())
	for node in tree.body:
		if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "CUSTOM_FIELDS":
			return ast.literal_eval(node.value)
	sys.exit("CUSTOM_FIELDS not found in {0}".format(INSTALL_PY))


def call(method, path, body=None):
	data = json.dumps(body).encode() if body is not None else None
	r = urllib.request.Request(
		BASE + path,
		data=data,
		method=method,
		headers={"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"},
	)
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def exists(dt, fieldname):
	try:
		call("GET", "/api/resource/" + urllib.parse.quote("Custom Field") + "/"
			+ urllib.parse.quote("{0}-{1}".format(dt, fieldname)))
		return True
	except urllib.error.HTTPError as exc:
		if exc.code == 404:
			return False
		raise


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("doctype", nargs="?", help="only this doctype's fields; default is every doctype in CUSTOM_FIELDS")
	ap.add_argument("--apply", action="store_true", help="actually change the site")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	fields = custom_fields()
	if args.doctype:
		if args.doctype not in fields:
			sys.exit("{0} has no entry in CUSTOM_FIELDS.".format(args.doctype))
		fields = {args.doctype: fields[args.doctype]}

	print("site      {0}".format(BASE))

	for dt, rows in fields.items():
		for spec in rows:
			name = spec["fieldname"]
			label = spec.get("label", name)
			if exists(dt, name):
				print("skip      {0}.{1} — already on the site".format(dt, name))
				continue
			body = dict(spec)
			body["dt"] = dt
			body["doctype"] = "Custom Field"
			if not args.apply:
				print("would create {0}.{1} ({2}, {3})".format(dt, name, label, spec["fieldtype"]))
				continue
			call("POST", "/api/resource/" + urllib.parse.quote("Custom Field"), body)
			print("created   {0}.{1} ({2}, {3})".format(dt, name, label, spec["fieldtype"]))

	if not args.apply:
		print("\nRun again with --apply to write these.")


if __name__ == "__main__":
	main()
