"""Payroll on the live site — what it needs, what is there, and what to make.

    python tools/setup_payroll.py            # report only, writes nothing
    python tools/setup_payroll.py --apply    # also set Payroll Settings and make the missing Salary Components

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

The values are in `manna_hr/payrollsetup.py`; this only carries them to the
site, because the app is not installed there yet and `install.py` does not run
(CLAUDE.md §7).

## What it checks, always

    1. The stock hrms payroll doctypes are on the site. If one is not, Frappe HR's
       Payroll module is missing and nothing here can fix that.
    2. The HR Manager and HR User roles exist.
    3. Each Company has a Default Payroll Payable Account, a Default Cost Center
       and a Default Currency. A Payroll Entry cannot be made without them.
       Never filled in here — the payable account is the accountant's.
    4. Who is active and has no Salary Structure Assignment. hrms skips them
       without a word, so they are simply not paid. Listed, never assigned —
       a structure is somebody's wages.
    5. Our loan doctypes (Employee Loan Type / Application / Repayment) — said
       to need the app install, and never made by hand as custom doctypes.

    6. Payroll Settings — based on Attendance, so an Absent day is not paid.

## What --apply writes

Payroll Settings' values from `payrollsetup.PAYROLL_SETTINGS`, where the site
holds something else; and the Salary Components that are missing: Leave
Encashment (an earning), Salary Advance and Loan EMI (deductions). Safe to run
twice: one that exists is left exactly as it is, and one that is switched off is
reported, not switched on.
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

from manna_hr import payrollsetup as ps  # noqa: E402

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


def count(doctype):
	"""How many of a doctype this login can see, or None — a doctype the site does
	not have, and one this login may not read, both answer with an error, and
	the report says which it could not tell."""
	q = urllib.parse.urlencode({"doctype": doctype})
	try:
		return int(call("GET", "/api/method/frappe.client.get_count?" + q).get("message"))
	except urllib.error.HTTPError:
		return None


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
	p.add_argument("--apply", action="store_true", help="make the missing Salary Components; without it nothing is written")
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

	print("site: {0}\n".format(BASE))
	problems = 0

	# ---- 1. the stock doctypes ----
	print("Frappe HR payroll doctypes")
	for dt in ps.PAYROLL_DOCTYPES:
		n = count(dt)
		if n is None:
			print("    MISSING OR NOT READABLE  {0}".format(dt))
			problems += 1
		else:
			print("    ok  {0:<30} {1} on the site".format(dt, n))
	print()

	# ---- 2. the roles ----
	have_roles = {r["name"] for r in listing("Role", ["name"], [["name", "in", list(ps.PAYROLL_ROLES)]])}
	print("Roles")
	for role in ps.PAYROLL_ROLES:
		ok = role in have_roles
		print("    {0}  {1}".format("ok     " if ok else "MISSING", role))
		problems += 0 if ok else 1
	print()

	# ---- 3. each company's payroll accounts ----
	print("Companies — what a Payroll Entry cannot be made without")
	for c in listing("Company", ["name"] + [f for f, _ in ps.COMPANY_FIELDS]):
		gaps = ps.company_gaps(c)
		print("    {0}  {1}{2}".format("ok     " if not gaps else "SET ON THE SITE", c["name"],
			"" if not gaps else " — empty: " + ", ".join(gaps)))
		problems += 1 if gaps else 0
	print()

	# ---- 4. who would not be paid ----
	people = listing("Employee", ["name", "employee_name", "company"], [["status", "=", "Active"]])
	assigned = listing("Salary Structure Assignment", ["employee"], [["docstatus", "=", 1]])
	bare = ps.without_structure(people, assigned)
	print("Salary structures — {0} active, {1} with no submitted assignment".format(len(people), len(bare)))
	for e in bare[:25]:
		print("    {0} · {1} · {2}".format(e["name"], e.get("employee_name"), e.get("company")))
	if len(bare) > 25:
		print("    … and {0} more".format(len(bare) - 25))
	problems += 1 if bare else 0
	print("    (Not assigned here: a salary structure is somebody's wages, and is set in Frappe.)\n")

	# ---- 5. our loan doctypes ----
	print("Loan doctypes (ours — the app install brings them, CLAUDE.md §7)")
	for dt in ps.LOAN_DOCTYPES:
		n = count(dt)
		print("    {0}  {1}".format("ok     " if n is not None else "not on the site", dt))
	print()

	# ---- 6. payroll settings ----
	settings = call("GET", "/api/resource/Payroll%20Settings/Payroll%20Settings")["data"]
	gaps = ps.settings_gaps(settings)
	print("Payroll Settings")
	for field, want in ps.PAYROLL_SETTINGS:
		has = settings.get(field)
		print("    {0}  {1} = {2}{3}".format("ok     " if has == want else "WRONG  ", field, has,
			"" if has == want else "  (wants {0})".format(want)))
	print()

	# ---- 7. the three Salary Components ----
	rows = listing("Salary Component", ["name", "type", "disabled"],
		[["name", "in", [c["name"] for c in ps.REQUIRED_COMPONENTS]]])
	missing = ps.missing_components(rows)
	off = ps.disabled_components(rows)
	print("Salary Components for the Salary Sheet")
	for c in ps.REQUIRED_COMPONENTS:
		state = "will be made" if c in missing else "switched off — enable it in Frappe" if c in off else "ok"
		print("    {0:<18} {1:<10} {2}".format(c["name"], c["type"], state))
	problems += len(off)

	if not args.apply:
		print("\nDry run. Nothing was written. {0} thing(s) need a person; --apply sets {1} Payroll Setting(s) "
			"and makes {2} Salary Component(s).".format(problems, len(gaps), len(missing)))
		return 0

	if gaps:
		try:
			call("PUT", "/api/resource/Payroll%20Settings/Payroll%20Settings", {f: want for f, _, want in gaps})
			for f, has, want in gaps:
				print("  set Payroll Settings {0}: {1} -> {2}".format(f, has, want))
		except urllib.error.HTTPError as exc:
			print("  REFUSED Payroll Settings: {0}".format(refused(exc)))

	made = 0
	for c in missing:
		try:
			call("POST", "/api/resource/Salary%20Component", ps.component_doc(c))
			made += 1
			print("  made Salary Component {0}".format(c["name"]))
		except urllib.error.HTTPError as exc:
			print("  REFUSED {0}: {1}".format(c["name"], refused(exc)))
	print("\nmade {0} of {1}. The rest above is for a person to do in Frappe.".format(made, len(missing)))
	return 0


if __name__ == "__main__":
	sys.exit(main())
