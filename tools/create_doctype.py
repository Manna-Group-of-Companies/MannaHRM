"""Put one of this app's doctypes on the site, as a custom doctype, from its JSON.

    python tools/create_doctype.py "Attendance Device User"            # what it would do
    python tools/create_doctype.py "Attendance Device User" --apply    # do it

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    The key's user needs System Manager: creating a doctype is a schema change.

## When this is the right tool, and when it is not

Until `bench install-app` happens, every doctype in `Manna HR` lives on the site
as a custom one — a table and a form, with the `.py` beside its JSON not running.
That is fine for a doctype whose rules can live elsewhere for now, and it is
wrong for one that is nothing but its rules. So this refuses anything in
`check_schema.INSTALL_ONLY`: a custom `Attendance Submission` saves, submits,
says Submitted, and freezes nothing.

`Attendance Device User` is the first kind. Its controller only fills two links,
and the bridge fills the same two before it sends a row.

## What else it does

The doctype's `links` on the *other* side are what put its rows under a parent
record in Desk — the people on a machine, on that machine's form. A link lives
on the parent's definition, so where a doctype in this repo links *to* the one
being created, that link row is added to the parent on the site too, if it is
not there already.

Creating twice is refused by the site, and this says so rather than overwriting:
a doctype somebody has since edited in Desk is the site's to keep.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DOCTYPES = HERE / "manna_hr" / "manna_hr" / "doctype"
sys.path.insert(0, str(HERE / "tools"))

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

#: What the site stamps itself, and would refuse or ignore if sent.
DROP = {"creation", "modified", "modified_by", "owner", "idx", "docstatus", "name"}


def snake(name):
	return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def definition(name):
	path = DOCTYPES / snake(name) / (snake(name) + ".json")
	if not path.exists():
		sys.exit("No {0} in this repo ({1}).".format(name, path))
	return json.loads(path.read_text(encoding="utf-8"))


def body_for(spec):
	"""The POST body for a custom doctype, from the repo's JSON."""
	body = {key: value for key, value in spec.items() if key not in DROP}
	body["name"] = spec["name"]
	body["custom"] = 1
	# Links pointing out of this doctype are written on the doctype they point
	# at; a child row of ours naming a parent that may not exist yet is refused.
	body["links"] = []
	body.pop("field_order", None)
	return body


def parents_linking_to(name):
	"""`[(parent doctype, link row)]` for every doctype here that lists `name` under it."""
	found = []
	for path in sorted(DOCTYPES.glob("*/*.json")):
		if path.stem != path.parent.name:
			continue
		spec = json.loads(path.read_text(encoding="utf-8"))
		for link in spec.get("links") or []:
			if link.get("link_doctype") == name:
				found.append((spec["name"], link))
	return found


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


def exists(name):
	try:
		call("GET", "/api/resource/DocType/" + urllib.parse.quote(name))
		return True
	except urllib.error.HTTPError as exc:
		if exc.code == 404:
			return False
		raise


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("doctype")
	ap.add_argument("--apply", action="store_true", help="actually change the site")
	args = ap.parse_args()

	from check_schema import INSTALL_ONLY

	if args.doctype in INSTALL_ONLY:
		sys.exit("{0} is install-only: as a custom doctype its rules would not run. Install the app.".format(args.doctype))
	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	spec = definition(args.doctype)
	body = body_for(spec)
	parents = parents_linking_to(args.doctype)

	print("site      {0}".format(BASE))
	print("doctype   {0} ({1} fields, {2} permission rows)".format(
		args.doctype, len(body.get("fields", [])), len(body.get("permissions", []))))
	for parent, link in parents:
		print("link      under {0}, by {1}".format(parent, link["link_fieldname"]))

	if exists(args.doctype):
		print("\nAlready on the site. Nothing created; the site's copy is kept.")
	elif not args.apply:
		print("\nWould create it. Run again with --apply.")
	else:
		call("POST", "/api/resource/DocType", body)
		print("\ncreated   {0}".format(args.doctype))

	for parent, link in parents:
		current = call("GET", "/api/resource/DocType/" + urllib.parse.quote(parent))["data"]
		rows = current.get("links") or []
		if any(r.get("link_doctype") == args.doctype and r.get("link_fieldname") == link["link_fieldname"] for r in rows):
			print("link      {0} already lists it".format(parent))
			continue
		if not args.apply:
			print("link      would add it under {0}".format(parent))
			continue
		kept = [{k: r[k] for k in ("link_doctype", "link_fieldname", "group") if r.get(k)} for r in rows]
		call("PUT", "/api/resource/DocType/" + urllib.parse.quote(parent), {"links": kept + [link]})
		print("link      added under {0}".format(parent))


if __name__ == "__main__":
	main()
