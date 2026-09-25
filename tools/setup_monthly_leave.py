"""Casual Leave, one a month and carried forward — put it on the live site.

    python tools/setup_monthly_leave.py                         # report only, writes nothing
    python tools/setup_monthly_leave.py --employee HR-EMP-00012 # one person, to try it
    python tools/setup_monthly_leave.py --apply                 # everybody active
    python tools/setup_monthly_leave.py --apply --year 2027     # next January, carrying forward

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

The rule and the values are in `manna_hr/leavepolicy.py`; this only carries
them to the site, because the app is not installed there yet and `install.py`
does not run (CLAUDE.md §7).

## What it writes, in order

    1. Leave Type  `Casual Leave` → made Earned, Monthly, carry-forward.
       Only the fields that differ, so nothing else HR set on it moves.
    2. Leave Policy  → twelve a year of it, submitted.
    3. Leave Policy Assignment, one per active employee without one for the
       year → submitted, which is what makes hrms create the allocation.

From then on hrms's daily scheduler adds one day on the 1st of every month.
A month not taken is still in the balance the month after; that part needs
nothing from anybody.

## From this month, not from January

hrms credits every month between an assignment's start and today the moment
it is submitted. Starting 2026's in January would give everybody nine days at
once — on top of whatever they already took in Factor HR. So a mid-year run
starts **this month** (see `leavepolicy.effective_from`), and the Factor HR
balances, which are the real ones, are a separate load (docs/MIGRATION.md).

## Next January

A leave year is one assignment. Run it again with `--year 2027` before the 1st:
it assigns from 1 January with `carry_forward` ticked, and hrms brings the
unused days across from 2026's allocation.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manna_hr import leavepolicy as lp  # noqa: E402

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))


# -------------------------------------------------------------------- site ---

def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH,
		"Accept": "application/json",
		"Content-Type": "application/json",
	})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters=None):
	q = {"doctype": doctype, "fields": json.dumps(fields), "limit_page_length": 0}
	if filters:
		q["filters"] = json.dumps(filters)
	return call("GET", "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)).get("message") or []


def resource(doctype, name=""):
	path = "/api/resource/" + urllib.parse.quote(doctype)
	return path + ("/" + urllib.parse.quote(name) if name else "")


def refused(exc):
	"""The site's own words, which name the actual problem far better than a code."""
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


# --------------------------------------------------------------------- run ---

def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="write; without it nothing is")
	p.add_argument("--year", type=int, default=date.today().year, help="the leave year (default: this one)")
	p.add_argument("--start-month", type=int, default=1, help="1 = January (default), 4 = April")
	p.add_argument("--employee", action="append", help="only this Employee ID; repeatable")
	args = p.parse_args()

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2
	try:
		call("GET", "/api/method/frappe.auth.get_logged_user")
	except urllib.error.HTTPError as exc:
		print("The site refused the credentials ({0}). Check ERP_KEY and ERP_SECRET.".format(exc.code))
		return 2
	except Exception as exc:
		print("Could not reach {0} — {1}".format(BASE, exc))
		return 2

	today = date.today()
	year_from, year_to = lp.leave_year(args.year, args.start_month)
	start = lp.effective_from(year_from, today)
	carry = 1 if start == year_from else 0
	print("site: {0}".format(BASE))
	print("leave year {0} → {1}; assignments earn from {2}{3}\n".format(
		year_from, year_to, start, ", carrying last year's balance forward" if carry else ""))

	# ---- 1. the leave type ----
	patch, create_type = {}, False
	try:
		row = call("GET", resource("Leave Type", lp.LEAVE_TYPE_NAME))["data"]
		patch = lp.differs(row)
		print("Leave Type {0}: {1}".format(lp.LEAVE_TYPE_NAME,
			"already monthly" if not patch else "will change " + json.dumps(patch)))
	except urllib.error.HTTPError as exc:
		if exc.code != 404:
			raise
		create_type = True
		print("Leave Type {0}: missing, will be created".format(lp.LEAVE_TYPE_NAME))

	# ---- 2. the policy ----
	policies = listing("Leave Policy", ["name"], [["title", "=", lp.POLICY_TITLE], ["docstatus", "=", 1]])
	policy = policies[0]["name"] if policies else None
	print("Leave Policy '{0}': {1}".format(lp.POLICY_TITLE, policy or "missing, will be created and submitted"))

	# ---- 3. who gets it ----
	filters = [["status", "=", "Active"]]
	if args.employee:
		filters.append(["name", "in", args.employee])
	emps = listing("Employee", ["name", "employee_name", "company", "date_of_joining"], filters)
	held = {a["employee"] for a in listing("Leave Policy Assignment", ["employee"], [
		["docstatus", "=", 1],
		["effective_to", ">=", str(start)],
		["effective_from", "<=", str(year_to)],
	])}
	todo = [e for e in emps if e["name"] not in held]
	print("Employees: {0} active in scope, {1} already assigned for this year, {2} to assign\n".format(
		len(emps), len(emps) - len(todo), len(todo)))

	if not args.apply:
		for e in todo[:20]:
			print("    {0} · {1} · {2}".format(e["name"], e.get("employee_name"), e.get("company")))
		if len(todo) > 20:
			print("    … and {0} more".format(len(todo) - 20))
		print("\nDry run. Nothing was written. Try one person with --employee <ID> --apply first.")
		return 0

	# ---- writes, in the order the site needs them ----
	try:
		if create_type:
			call("POST", resource("Leave Type"), dict(lp.LEAVE_TYPE))
			print("created Leave Type")
		elif patch:
			call("PUT", resource("Leave Type", lp.LEAVE_TYPE_NAME), patch)
			print("updated Leave Type")
		if not policy:
			policy = call("POST", resource("Leave Policy"), dict(lp.LEAVE_POLICY, docstatus=1))["data"]["name"]
			print("created Leave Policy {0}".format(policy))
	except urllib.error.HTTPError as exc:
		# Nothing after this can succeed without the type and the policy.
		print("REFUSED: {0}".format(refused(exc)))
		return 1

	done = 0
	for e in todo:
		# Someone who joins after the year's start earns from the month they joined.
		joined = e.get("date_of_joining")
		frm = max(start, date.fromisoformat(joined).replace(day=1)) if joined else start
		try:
			call("POST", resource("Leave Policy Assignment"), {
				"employee": e["name"],
				"leave_policy": policy,
				"effective_from": str(frm),
				"effective_to": str(year_to),
				"carry_forward": carry,
				"docstatus": 1,
			})
			done += 1
			print("  assigned {0} · {1} from {2}".format(e["name"], e.get("employee_name"), frm))
		except urllib.error.HTTPError as exc:
			print("  REFUSED {0} · {1}: {2}".format(e["name"], e.get("employee_name"), refused(exc)))

	print("\nassigned {0} of {1}.".format(done, len(todo)))
	return 0


if __name__ == "__main__":
	sys.exit(main())
