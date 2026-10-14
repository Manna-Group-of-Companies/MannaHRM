"""The seven hierarchy levels on the live site, as Employee Grade rows.

    python tools/setup_hierarchy.py            # report only, writes nothing
    python tools/setup_hierarchy.py --apply    # make the levels that are missing

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

The levels are `manna_hr/hierarchy.py`'s `LEVELS`; this only carries them to
the site. An Employee Grade is a name and nothing this needs, so one that
exists is left exactly as it is, and the report says which of the seven are
there. It also says who holds a grade that is none of the seven, because
`Employee.grade` is free to point at any grade and a stray one is a person the
chart cannot place.

Nobody's grade is set here. Employees → Hierarchy Chart suggests one from
the designation and HR saves it; a grade is a line on an org chart and a pay
default, and the one who sets it should be looking at the name.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manna_hr import hierarchy as h  # noqa: E402

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))


def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH,
		"Accept": "application/json",
		"Content-Type": "application/json",
	})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8") or "{}")


def listing(doctype, fields, filters=None):
	q = {"doctype": doctype, "fields": json.dumps(fields), "limit_page_length": 0}
	if filters:
		q["filters"] = json.dumps(filters)
	return call("GET", "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)).get("message") or []


def refused(exc):
	"""The site's own words, which name the actual problem far better than a code."""
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="make the missing Employee Grades; without it nothing is written")
	args = p.parse_args()

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2
	try:
		call("GET", "/api/method/frappe.auth.get_logged_user")
	except urllib.error.HTTPError as exc:
		print("The site refused the credentials ({0}). Check ERP_KEY and ERP_SECRET.".format(exc.code))
		return 2

	have = {g["name"] for g in listing("Employee Grade", ["name"])}
	print("Employee Grade on {0}: {1}\n".format(BASE, len(have)))
	for level in h.LEVELS:
		if level in have:
			print("    ok       {0}".format(level))
		elif args.apply:
			try:
				call("POST", "/api/resource/Employee%20Grade", {"__newname": level})
				print("    made     {0}".format(level))
			except urllib.error.HTTPError as exc:
				print("    REFUSED  {0} — {1}".format(level, refused(exc)))
				return 1
		else:
			print("    missing  {0}".format(level))

	stray = sorted(have - set(h.LEVELS))
	if stray:
		print("\nGrades on the site that are not a level: {0}".format(", ".join(stray)))
	held = listing("Employee", ["employee_number", "employee_name", "grade"], [["status", "=", "Active"], ["grade", "is", "set"]])
	off = [e for e in held if e["grade"] not in h.LEVELS]
	print("\nActive employees with a grade: {0}; with one that is not a level: {1}".format(len(held), len(off)))
	for e in off:
		print("    {0:<10} {1:<30} {2}".format(e["employee_number"] or "", e["employee_name"], e["grade"]))
	return 0


if __name__ == "__main__":
	sys.exit(main())
