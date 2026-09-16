"""One company-locked login per company, for the three company dashboards.

    python tools/create_company_users.py              # report only, writes nothing
    python tools/create_company_users.py --apply      # create what is missing

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    COMPANY_USER_PASSWORD_SUFFIX (default "@2026") — the password is the
    stem in COMPANY_USERS followed by it, Manna's convention (Rajiv@2026).

Asked for on 16 September 2026: HR / Attendance / Payroll dashboards for four
companies, and a login for each that sees its own company. See
docs/COMPANY_USERS.md.

## What "sees its own company" is made of

A **User Permission on `Company`**, applied to all doctypes. That is the whole
lock, and it is the site's: Employee, Attendance, Employee Checkin, Leave
Application, Salary Slip and Payroll Entry all link Company, so ERPNext filters
every list and refuses every document outside it. The dashboard narrowing its
company strip to one button is a courtesy on top of this, never a substitute —
CLAUDE.md §5: an HR user with no Company permission sees every company, and the
omission is silent.

So this script refuses to report a user as done unless the permission row
exists, and creates the permission even for a user that already existed.

## Passwords are not in this file

They follow a convention anyone can read in the docs, and a repository is the
wrong place to write the result down. Change them on first sign-in.
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
SUFFIX = os.environ.get("COMPANY_USER_PASSWORD_SUFFIX", "@2026")

#: (company, login, first name, password stem). Company-name logins, chosen
#: 16 Sep 2026; the earlier hri.hr / mrppl.hr / mt.hr / mtr.hr and hitech.hr /
#: treads.hr / retreads.hr logins are disabled with their locks removed.
COMPANY_USERS = [
	("Hi-Tech Rubber Industries", "hitechrubber@mannarubber.com", "Hi-Tech Rubber Industries", "Hitechrubber"),
	("Manna Rubber Products Private Limited", "mannarubber.products@mannarubber.com", "Manna Rubber Products", "Mannarubberproducts"),
	("Manna Treads", "mannatreads@mannarubber.com", "Manna Treads", "Mannatreads"),
	("Manna Tyre Retreads", "mannatyreretreads@mannarubber.com", "Manna Tyre Retreads", "Mannatyreretreads"),
]

#: HR User reads employees, attendance and leave; HR Manager adds Salary Slip,
#: Salary Structure Assignment and Payroll Entry, which the Payroll dashboard
#: reads.
ROLES = ["HR Manager", "HR User"]


def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters):
	q = urllib.parse.urlencode({"fields": json.dumps(fields), "filters": json.dumps(filters),
		"limit_page_length": 0})
	return call("GET", "/api/resource/{0}?{1}".format(urllib.parse.quote(doctype), q)).get("data") or []


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--apply", action="store_true")
	args = ap.parse_args()
	if not os.environ.get("ERP_KEY"):
		sys.exit("ERP_KEY / ERP_SECRET are not set.")

	companies = {c["name"] for c in listing("Company", ["name"], [])}
	bad = 0
	for company, email, first, stem in COMPANY_USERS:
		if company not in companies:
			print("✗ {0}: no such Company on the site — nothing created".format(company))
			bad += 1
			continue

		user = listing("User", ["name", "enabled"], [["name", "=", email]])
		if not user:
			print("+ {0}: user {1} missing".format(company, email))
			if args.apply:
				call("POST", "/api/resource/User", {
					"email": email, "first_name": first, "last_name": "HR",
					"user_type": "System User", "enabled": 1, "send_welcome_email": 0,
					"new_password": stem + SUFFIX,
					"roles": [{"role": r} for r in ROLES],
				})
				print("  created")

		perm = listing("User Permission", ["name", "for_value"],
			[["user", "=", email], ["allow", "=", "Company"]])
		wrong = [p for p in perm if p["for_value"] != company]
		if wrong:
			# Two Company permissions widen the lock to both companies.
			print("✗ {0}: {1} also has Company permission on {2} — fix by hand".format(
				company, email, ", ".join(p["for_value"] for p in wrong)))
			bad += 1
		if not any(p["for_value"] == company for p in perm):
			print("+ {0}: Company lock missing for {1}".format(company, email))
			if args.apply:
				call("POST", "/api/resource/User Permission", {
					"user": email, "allow": "Company", "for_value": company,
					"apply_to_all_doctypes": 1, "is_default": 1,
				})
				print("  locked")
		elif not wrong:
			print("✓ {0}: {1} locked to its company".format(company, email))

	if not args.apply:
		print("\nReport only. Run with --apply to create what is missing.")
	sys.exit(1 if bad else 0)


if __name__ == "__main__":
	main()
