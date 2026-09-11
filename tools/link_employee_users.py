"""Put a Frappe login onto the Employee record it belongs to.

    python tools/link_employee_users.py                      # dry run, writes nothing
    python tools/link_employee_users.py --apply
    python tools/link_employee_users.py --employee HR-EMP-00125 --user it@mannarubber.com --apply

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## Why this exists

`Employee.user_id` is the only link between a Frappe user and an employee
record, and nothing else on the site stands in for it. The phone app resolves
who you are by matching the signed-in user against it (`app/lib/services/api.dart`),
so a login with no such record can sign in, has nothing to punch against, and
draws no month. All 161 employees on this site have it empty — see
`docs/OPEN_QUESTIONS.md`.

## Matching, and why it refuses rather than guesses

Rows are matched on **User.full_name against Employee.employee_name**, case- and
space-insensitively. Any user matching zero or more than one employee is
reported and skipped, never resolved by taking the first.

**A wrong link here is worse than no link.** It does not merely show somebody
the wrong screen: it hands one person another person's punch history and lets
them punch as them, and every correction they raise afterwards lands on a day
that is not theirs. So an ambiguous match is left for a human, and an employee
that already carries a different login is never overwritten.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

#: Users that are never an employee. `Administrator` and `Guest` are Frappe's
#: own, and a login nobody is behind must not be tied to somebody's wages.
SKIP_USERS = {"Administrator", "Guest"}


def req(path, method="GET", payload=None, tries=4):
	"""One call, retried. Frappe Cloud resets a connection under a burst of
	these, and a half-finished link run is worse than a slow one."""
	body = json.dumps(payload).encode() if payload is not None else None
	for attempt in range(tries):
		r = urllib.request.Request(BASE + path, data=body, method=method, headers={
			"Authorization": AUTH, "Accept": "application/json",
			"Content-Type": "application/json", "Connection": "close"})
		try:
			with urllib.request.urlopen(r, timeout=90) as x:
				return json.loads(x.read().decode())
		except urllib.error.HTTPError as e:
			raise SystemExit("HTTP {0} on {1}: {2}".format(e.code, path[:70], e.read().decode()[:300]))
		except Exception as e:
			if attempt == tries - 1:
				raise SystemExit("Could not reach {0}: {1}".format(BASE, e))
			time.sleep(2 * (attempt + 1))


def lst(doctype, fields, filters=None, order_by="name asc"):
	qp = {"fields": json.dumps(fields), "limit_page_length": 0, "order_by": order_by}
	if filters:
		qp["filters"] = json.dumps(filters)
	return req("/api/resource/" + urllib.parse.quote(doctype) + "?" + urllib.parse.urlencode(qp))["data"]


def norm(s):
	"""Names for comparison only. Factor HR wrote them shouted and ERPNext
	writes them titled, and both put double spaces in."""
	return re.sub(r"[^a-z]", "", (s or "").lower())


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--apply", action="store_true", help="write; otherwise report only")
	ap.add_argument("--employee", help="link exactly this employee, skipping the name match")
	ap.add_argument("--user", help="to this login")
	args = ap.parse_args()

	if bool(args.employee) != bool(args.user):
		sys.exit("--employee and --user go together.")

	employees = lst("Employee", ["name", "employee_name", "user_id", "company", "status"])
	taken = {e["user_id"]: e["name"] for e in employees if e.get("user_id")}

	if args.employee:
		pairs = [(args.user, args.employee)]
		named = {e["name"]: e for e in employees}
		if args.employee not in named:
			sys.exit("No employee {0} on this site.".format(args.employee))
		if args.user in taken:
			sys.exit("{0} is already on {1}.".format(args.user, taken[args.user]))
		if named[args.employee].get("user_id"):
			sys.exit("{0} already carries {1}.".format(args.employee, named[args.employee]["user_id"]))
		print("  {0:<16} {1:<28} <- {2}".format(
			args.employee, named[args.employee]["employee_name"], args.user))
	else:
		users = [u for u in lst("User", ["name", "full_name", "enabled"]) 
		         if u["name"] not in SKIP_USERS and u.get("enabled")]
		by_name = {}
		for e in employees:
			if e.get("status") == "Active":
				by_name.setdefault(norm(e["employee_name"]), []).append(e)

		pairs, skipped = [], []
		for u in users:
			if u["name"] in taken:
				continue
			hits = by_name.get(norm(u.get("full_name")), [])
			if len(hits) == 1 and not hits[0].get("user_id"):
				pairs.append((u["name"], hits[0]["name"]))
				print("  {0:<16} {1:<28} <- {2}".format(
					hits[0]["name"], hits[0]["employee_name"], u["name"]))
			else:
				skipped.append((u["name"], u.get("full_name"), len(hits)))

		if skipped:
			print("\n  skipped — no single active employee of that name:")
			for login, full, n in skipped:
				print("    {0:<34} {1:<28} {2} match(es)".format(login, full or "", n))

	if not pairs:
		print("\nNothing to link.")
		return
	if not args.apply:
		print("\n{0} to link. Re-run with --apply to write.".format(len(pairs)))
		return

	for login, emp in pairs:
		req("/api/resource/Employee/" + urllib.parse.quote(emp), "PUT", {"user_id": login})
		print("  linked {0} -> {1}".format(emp, login))
	print("\n{0} written.".format(len(pairs)))


if __name__ == "__main__":
	main()
