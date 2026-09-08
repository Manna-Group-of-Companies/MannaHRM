"""Put **every** doctype in this app onto the site, in the order they link in.

    python tools/install_all.py                    # dry run — says what it would do
    python tools/install_all.py --apply            # create what is missing
    python tools/install_all.py --apply --update   # and rewrite what is already there

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

`install_doctype.py` does one; this does all of them and works out the order
itself. Read that file first — every caveat in its docstring applies here, and
the important one is that these arrive as **custom** doctypes, so the site owns
the definition and the controller beside the JSON does not run. It is the way in
until there is a bench, not the destination.

## Why the order is computed rather than listed

A `Link` or `Table` field naming a doctype that is not there yet is refused, and
the message names the field rather than the missing doctype. A hand-kept list
gets that wrong the first time somebody adds a field, and the error reads as a
bug in the JSON. So the order comes out of the JSON: every doctype this one
points at, before it.

A cycle would hang the sort, and there is one waiting to happen the moment two
doctypes link to each other. So a cycle is broken by name and reported —
Frappe accepts a link to a doctype that does not exist yet as long as it exists
by the time somebody saves a document, so a broken cycle is a warning rather
than a wall.

## What it will not do

**Nothing is deleted, ever.** `--update` adds and changes fields; a field
removed from the JSON keeps its column and its data on the site. Dropping data
is a decision for a person at a console.

**A doctype that is already there is left alone** unless `--update` is passed,
because overwriting a definition somebody edited on the site loses whatever they
changed.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DOCTYPES = HERE / "manna_hr" / "manna_hr" / "doctype"

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

#: Keys that describe the *file* rather than the doctype. Frappe either sets
#: these itself or refuses them on the way in.
DROP = {"doctype", "creation", "modified", "modified_by", "owner", "idx", "docstatus"}

#: Fieldtypes whose `options` names another doctype.
LINKING = {"Link", "Table", "Table MultiSelect"}


def req(path, method="GET", payload=None):
	data = json.dumps(payload).encode() if payload is not None else None
	r = urllib.request.Request(
		BASE + path, data=data, method=method,
		headers={"Authorization": AUTH, "Accept": "application/json",
		         "Content-Type": "application/json"},
	)
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def load_specs():
	specs = {}
	for path in sorted(DOCTYPES.glob("*/*.json")):
		if path.stem != path.parent.name:
			continue
		spec = json.loads(path.read_text(encoding="utf-8"))
		specs[spec["name"]] = spec
	return specs


def dependencies(spec, known):
	"""The doctypes in this app that this one links to."""
	out = set()
	for field in spec.get("fields", []):
		if field.get("fieldtype") in LINKING:
			target = (field.get("options") or "").strip()
			if target in known and target != spec["name"]:
				out.add(target)
	return out


def in_link_order(specs):
	"""Topological sort, cycles broken by name and reported."""
	known = set(specs)
	pending = {n: dependencies(s, known) for n, s in specs.items()}
	ordered, broken = [], []

	while pending:
		ready = sorted(n for n, deps in pending.items() if not deps)
		if not ready:
			# A cycle. Break it at the alphabetically first name — Frappe will
			# accept the dangling link and resolve it when the other arrives.
			ready = [sorted(pending)[0]]
			broken.append(ready[0])
		for name in ready:
			ordered.append(name)
			pending.pop(name)
		for deps in pending.values():
			deps.difference_update(ready)

	return ordered, broken


def payload_from(spec, module, roles_on_site):
	doc = {k: v for k, v in spec.items() if k not in DROP}
	doc["doctype"] = "DocType"
	# The one difference from the file: the site owns the definition.
	doc["custom"] = 1
	doc["module"] = module
	# Frappe rebuilds this from `fields`; sending the file's copy is how a field
	# ends up in the order twice.
	doc.pop("field_order", None)
	for field in doc.get("fields", []):
		for key in ("name", "parent", "parentfield", "parenttype", "idx", "creation", "modified"):
			field.pop(key, None)

	kept = [p for p in doc.get("permissions", []) if p["role"] in roles_on_site]
	dropped = [p["role"] for p in doc.get("permissions", []) if p["role"] not in roles_on_site]
	if kept or dropped:
		# A table nobody can write reads to HR as the save button being broken,
		# so if dropping a missing role leaves nothing that can create a row,
		# `System Manager` stands in. It widens nothing — anybody holding it
		# could have made the doctype by hand.
		if not any(p.get("create") for p in kept) and not doc.get("istable"):
			kept.append({"role": "System Manager", "read": 1, "write": 1, "create": 1,
			             "delete": 1, "report": 1, "export": 1, "print": 1, "email": 1, "share": 1})
		doc["permissions"] = kept
	return doc, dropped


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--apply", action="store_true", help="actually write to the site")
	ap.add_argument("--update", action="store_true",
	                help="rewrite doctypes already on the site. Loses anything edited there.")
	ap.add_argument("--module", default="", help="override the module named in the JSON")
	ap.add_argument("--only", default="", help="comma-separated doctype names, for one at a time")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	specs = load_specs()
	if args.only:
		want = {n.strip() for n in args.only.split(",") if n.strip()}
		missing = want - set(specs)
		if missing:
			sys.exit("No such doctype in this app: {0}".format(", ".join(sorted(missing))))
		specs = {n: s for n, s in specs.items() if n in want}

	order, broken = in_link_order(specs)
	if broken:
		print("cycle     broken at: {0} — its links resolve once the rest are in"
		      .format(", ".join(broken)))

	modules = {m["name"] for m in req(
		"/api/resource/Module%20Def?" + urllib.parse.urlencode(
			{"fields": json.dumps(["name"]), "limit_page_length": 500}))["data"]}
	roles = {r["name"] for r in req(
		"/api/resource/Role?" + urllib.parse.urlencode(
			{"fields": json.dumps(["name"]), "limit_page_length": 0}))["data"]}
	on_site = {d["name"] for d in req(
		"/api/resource/DocType?" + urllib.parse.urlencode({
			"fields": json.dumps(["name"]),
			"filters": json.dumps([["name", "in", list(specs)]]),
			"limit_page_length": 0}))["data"]}

	module = args.module or "Manna HR"
	if module not in modules:
		if "Custom" not in modules:
			sys.exit("The site has no module called {0!r}. Pass --module with one it has.".format(module))
		print("module    {0!r} is not on the site — using 'Custom'".format(module))
		module = "Custom"

	print("site      {0}".format(BASE))
	print("module    {0}".format(module))
	print("doctypes  {0} in this app, {1} already on the site".format(len(specs), len(on_site)))
	print()

	made = skipped = updated = 0
	for name in order:
		doc, dropped = payload_from(specs[name], module, roles)
		there = name in on_site
		note = "already there" if there else "missing"
		if dropped:
			note += "; roles not on this site dropped: " + ", ".join(sorted(set(dropped)))

		if there and not args.update:
			print("  skip    {0:42} {1}".format(name, note))
			skipped += 1
			continue
		if not args.apply:
			print("  would   {0:42} {1}".format(name, "update" if there else "create"))
			continue

		try:
			if there:
				req("/api/resource/DocType/" + urllib.parse.quote(name), "PUT", doc)
				print("  updated {0}".format(name))
				updated += 1
			else:
				req("/api/resource/DocType", "POST", doc)
				print("  created {0}".format(name))
				made += 1
		except urllib.error.HTTPError as e:
			body = e.read().decode()
			print("  FAILED  {0}\n          HTTP {1}: {2}".format(name, e.code, body[:400]))

	print()
	if not args.apply:
		print("Dry run. Add --apply to write to the site.")
	else:
		print("created {0}, updated {1}, left alone {2}".format(made, updated, skipped))
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
