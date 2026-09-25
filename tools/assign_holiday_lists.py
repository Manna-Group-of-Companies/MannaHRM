"""Give every company a Holiday List Assignment for the holiday list it already names.

    python tools/assign_holiday_lists.py            # dry run
    python tools/assign_holiday_lists.py --apply

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## Why this exists

The hrms on this site no longer reads `Company.default_holiday_list`. It looks
for a submitted `Holiday List Assignment` — for the employee, then for their
company — and refuses without one. On 25 September 2026 that refused the first
leave approval made from the dashboard:

    No Holiday List was found for Employee HR-EMP-00125 or their company
    Manna Rubber Products Private Limited for date 25-09-2026.

Every company named "Manna Holidays 2026-27" as its default, and the site held
no assignment at all, so every employee in the group would have been refused
the same way.

## What it decides, and what it does not

**Nothing new.** Each company gets an assignment for exactly the list its own
`default_holiday_list` already names, from the day that list starts. A company
with no default is reported and skipped: which holidays somebody gets is a
decision about pay, and a tool that guessed one would be making it.

**It never duplicates.** A company that already has a submitted assignment for
that list is left alone, so running it twice is safe, and running it after next
year's list is set as the default adds next year's assignment beside this one.

**Dry run unless `--apply`.** Assignments are created submitted — a draft
assigns nothing, the same reason `Shift Assignment` is.
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


def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters=None):
	q = {"doctype": doctype, "fields": json.dumps(fields), "limit_page_length": 0}
	if filters:
		q["filters"] = json.dumps(filters)
	return call("GET", "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)).get("message") or []


def refused(exc):
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


def plan(companies, lists, existing):
	"""What to create: [(company, holiday list, from date)], and [(company, why not)].

	Pure, so the rule can be argued about without a site."""
	start = {h["name"]: h.get("from_date") for h in lists}
	have = {(a["assigned_to"], a["holiday_list"]) for a in existing}
	todo, skipped = [], []
	for c in companies:
		name, hl = c["name"], c.get("default_holiday_list")
		if not hl:
			skipped.append((name, "names no default holiday list; choose one for it on the Company"))
		elif hl not in start:
			skipped.append((name, "names %s, which is not a Holiday List on the site" % hl))
		elif (name, hl) in have:
			skipped.append((name, "already assigned %s" % hl))
		else:
			todo.append((name, hl, str(start[hl])))
	return todo, skipped


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("--apply", action="store_true", help="create the assignments; without it, a dry run")
	args = ap.parse_args()
	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET.")

	try:
		companies = listing("Company", ["name", "default_holiday_list"])
		lists = listing("Holiday List", ["name", "from_date", "to_date"])
		existing = listing("Holiday List Assignment", ["assigned_to", "holiday_list"],
		                   [["applicable_for", "=", "Company"], ["docstatus", "=", 1]])
	except urllib.error.HTTPError as e:
		sys.exit("The site refused the read: HTTP %d %s" % (e.code, refused(e)))

	todo, skipped = plan(companies, lists, existing)
	for name, why in skipped:
		print("  skip   %s: %s" % (name, why))
	for name, hl, start in todo:
		print("  %s %s -> %s from %s" % ("assign" if args.apply else "would ", name, hl, start))
	if not args.apply:
		print("\nDry run. Nothing was written. Add --apply to write.")
		return

	failed = 0
	for name, hl, start in todo:
		try:
			made = call("POST", "/api/resource/Holiday%20List%20Assignment", {
				"applicable_for": "Company", "assigned_to": name, "holiday_list": hl,
				"from_date": start, "docstatus": 1})["data"]
			print("  made   %s for %s" % (made["name"], name))
		except urllib.error.HTTPError as e:
			failed += 1
			print("  refused for %s: %s" % (name, refused(e)))
	sys.exit(1 if failed else 0)


if __name__ == "__main__":
	main()
