"""One non-admin HR login per company, scoped to that company and nothing else.

    python tools/create_company_logins.py                    # dry run, writes nothing
    python tools/create_company_logins.py --apply
    python tools/create_company_logins.py --company "Manna Treads" --apply
    python tools/create_company_logins.py --apply --welcome-email

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

## What it makes, per company

    User                 a System User, `HR User` role, no admin role at all
    User Permission      allow=Company, for_value=<that company>, all doctypes

That pair is the whole thing. The dashboard has no per-company screens and does
not need any: `client/src/api/load.js` asks the site for `Company` and for
`Employee` like any other reader, and Frappe narrows both to what the signed-in
user's User Permissions allow. So a login made here opens the same `/hr` at the
same URL as everybody else and finds one company in the picker and one company's
people behind it. The scoping is on the site, which is the only place it counts
-- a company filter in a client is a suggestion to anyone holding `curl`
(CLAUDE.md section 1).

## Why the User Permission is the part that matters

`HR User` on its own sees **every company in the group**. The role is not the
scope; the User Permission is (CLAUDE.md section 5, docs/SCHEMA.md section 5).
Frappe reads a missing permission as "no restriction", so the failure mode here
is not a person locked out and ringing somebody -- it is a person at one company
quietly reading the whole group's payroll, and nothing announces it.

That is why this script creates every user **disabled**, writes the permission,
and only then enables the login. A run that dies midway -- a reset connection, a
403 on the second call, somebody's Ctrl-C -- then leaves a disabled account that
can sign in to nothing, rather than a live unscoped seat. It is the one order
that is safe to interrupt.

This is also the one script in `tools/` that rounds towards refusing. Everywhere
else in this project a doubtful case is let through, because refusing somebody
who did turn up costs them a day's pay (CLAUDE.md section 4). Here a doubtful
case is a leak, so anything it cannot place it leaves alone -- the same reasoning
as the row-level rules in docs/SCHEMA.md section 5.

## The table is explicit, and unknown names stop the run

`LOGINS` below maps a Company name on the site to the address that reads it.
Nothing is derived from the company name or its abbreviation, because the three
systems in this group spell the same company three ways and none of them join on
a string match (docs/COMPANIES.md). A company not in the table is refused, not
guessed -- a guessed mapping is one company's HR reading another's.

`Hi-Tech Rubber Industries` is in the table and, as of 22 August 2026, is **not
on the site**: docs/COMPANIES.md still has it as one of the two to create, with
`HRI` proposed and unconfirmed. So it is reported as missing and skipped until
somebody creates the Company. That is the right order -- a User Permission naming
a Company that does not exist is refused by Frappe anyway, and one made just
before the Company is renamed silently stops matching.

## Passwords

A password is generated per login and printed **once**, to this terminal, and
never stored anywhere. It is deliberately not written to a file: a file of HR
passwords on somebody's laptop outlives every person in it.

`--welcome-email` instead lets Frappe send its own set-your-password mail and
prints nothing, which is better where the mailbox already exists. The default is
the printed password, because several of these are role addresses that nobody
reads yet.
"""

import argparse
import json
import os
import secrets
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

#: Company on the site -> (login, first name, last name). Explicit, never
#: derived. See the docstring: a guessed mapping is one company's HR reading
#: another's. The local parts follow docs/COMPANIES.md's abbreviations.
LOGINS = {
	"Hi-Tech Rubber Industries": ("hri.hr@mannarubber.com", "Hi-Tech Rubber Industries", "HR"),
	"Manna Rubber Products Private Limited": ("mrppl.hr@mannarubber.com", "Manna Rubber Products", "HR"),
	"Manna Treads": ("mt.hr@mannarubber.com", "Manna Treads", "HR"),
	"Manna Tyre Retreads": ("mtr.hr@mannarubber.com", "Manna Tyre Retreads", "HR"),
}

#: The seat. One role, and deliberately only one -- this login is not an admin.
#: `HR Manager` is the group-wide seat and would undo the point of the User
#: Permission below; `System Manager` can edit that permission off itself.
ROLE = "HR User"

#: Roles that make the scoping meaningless, or that mean the address belongs to
#: a real person rather than a company seat. Found on a target user, it is left
#: alone: scoping it would either do nothing or lock somebody out of their job.
ADMIN_ROLES = {"System Manager", "Administrator", "HR Manager"}


def req(path, method="GET", payload=None, tries=4):
	"""One call, retried. Frappe Cloud resets a connection under a burst of
	these, and a half-finished run is worse than a slow one."""
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


def doc(doctype, name):
	"""One document, or None where the site does not have it."""
	try:
		return req("/api/resource/{0}/{1}".format(
			urllib.parse.quote(doctype), urllib.parse.quote(name)))["data"]
	except SystemExit as e:
		if "HTTP 404" in str(e):
			return None
		raise


def password():
	"""A password nobody has to remember, generated where it is used.

	The ambiguous glyphs are left out because this line is read off a screen and
	typed once, and an `l` read as a `1` is a support call. The entropy lost is
	nothing beside twenty characters. The suffix is there so the result always
	satisfies a site with Frappe's password policy switched on."""
	pool = (string.ascii_letters + string.digits).translate(str.maketrans("", "", "lI1O0"))
	return "".join(secrets.choice(pool) for _ in range(20)) + "!aA9"


def company_perms(user):
	"""The Company User Permissions this login already carries."""
	return lst("User Permission", ["name", "for_value"],
		[["user", "=", user], ["allow", "=", "Company"]])


def plan(companies_on_site, users_by_name, only):
	"""What each named company needs, decided before anything is written.

	Every company is reported, including the ones that need nothing -- a run that
	prints only its writes cannot be read as an answer to "is this set up?",
	which is the question somebody actually has."""
	rows = []
	for company, (login, first, last) in sorted(LOGINS.items()):
		if only and company != only:
			continue
		row = {"company": company, "login": login, "first": first, "last": last,
			"make_user": False, "add_role": False, "make_perm": False, "skip": ""}

		if company not in companies_on_site:
			# docs/COMPANIES.md: Hi-Tech Rubber Industries is still to be created.
			row["skip"] = "no such Company on the site -- create it first (docs/COMPANIES.md)"
			rows.append(row)
			continue

		user = users_by_name.get(login)
		if user is None:
			row["make_user"] = True
			row["add_role"] = True
		else:
			roles = {r.get("role") for r in (user.get("roles") or [])}
			admin = roles & ADMIN_ROLES
			if admin:
				row["skip"] = "existing user holds {0} -- left alone".format(", ".join(sorted(admin)))
				rows.append(row)
				continue
			row["add_role"] = ROLE not in roles

		have = company_perms(login) if user is not None else []
		wrong = [p for p in have if p["for_value"] != company]
		if wrong:
			# Two Company permissions is not "both companies narrowed". Frappe
			# reads the set as a union, so adding ours would *widen* this login
			# rather than scope it. A human decides which of the two is wrong.
			row["skip"] = "already scoped to {0} -- remove that permission first".format(
				", ".join(sorted(p["for_value"] for p in wrong)))
			rows.append(row)
			continue
		row["make_perm"] = not any(p["for_value"] == company for p in have)
		rows.append(row)
	return rows


def describe(row):
	if row["skip"]:
		return "skip"
	todo = []
	if row["make_user"]:
		todo.append("create user (disabled)")
	if row["add_role"] and not row["make_user"]:
		todo.append("add " + ROLE)
	if row["make_perm"]:
		todo.append("scope to company")
	return ", ".join(todo) or "ready"


def apply_row(row, welcome_email):
	"""Create, scope, then enable -- in that order, and never another.

	The enable is last because it is the only step that makes the login usable.
	Interrupt this anywhere and what is left behind is an account that cannot
	sign in, which is the failure this project can afford. The other order leaves
	a live HR seat reading every company in the group."""
	company, login = row["company"], row["login"]
	pwd = None

	if row["make_user"]:
		pwd = None if welcome_email else password()
		payload = {
			"doctype": "User", "email": login, "first_name": row["first"], "last_name": row["last"],
			# A System User is what may read doctypes at all; a Website User signs
			# in and sees nothing. It is also what Frappe Cloud counts as a seat.
			"user_type": "System User",
			"enabled": 0,
			"send_welcome_email": 1 if welcome_email else 0,
			"roles": [{"role": ROLE}],
		}
		if pwd:
			payload["new_password"] = pwd
		req("/api/resource/User", "POST", payload)
		print("    created {0} (disabled)".format(login))
	elif row["add_role"]:
		# Frappe replaces a child table rather than merging it, so the role goes
		# on beside whatever is already there. Same trap as Custom DocPerm in
		# CLAUDE.md section 5, one doctype along.
		existing = (doc("User", login) or {}).get("roles") or []
		roles = [{"role": r["role"]} for r in existing] + [{"role": ROLE}]
		req("/api/resource/User/" + urllib.parse.quote(login), "PUT", {"roles": roles})
		print("    added {0} to {1}".format(ROLE, login))

	if row["make_perm"]:
		# Quoted, because the doctype has a space in it and urllib refuses a URL
		# holding one outright — `lst` and `doc` quote for the same reason. It
		# would have failed here, on the first --apply, one call after the user
		# was created: exactly the half-finished state the disabled-first order
		# above exists to make survivable.
		req("/api/resource/" + urllib.parse.quote("User Permission"), "POST", {
			"doctype": "User Permission", "user": login, "allow": "Company",
			"for_value": company,
			# Everything carrying a Company link, which is the point. Narrowing
			# this to a named list leaves every doctype off the list unscoped, and
			# the next doctype anybody adds is off it by definition.
			"apply_to_all_doctypes": 1,
			"is_default": 1,
		})
		print("    scoped {0} -> {1}".format(login, company))

	# Only now. See this function's docstring.
	if (doc("User", login) or {}).get("enabled") != 1:
		req("/api/resource/User/" + urllib.parse.quote(login), "PUT", {"enabled": 1})
		print("    enabled {0}".format(login))

	return pwd


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("--apply", action="store_true", help="write; otherwise report only")
	ap.add_argument("--company", help="just this one company, by its name on the site")
	ap.add_argument("--welcome-email", action="store_true",
		help="let Frappe mail a set-password link instead of printing a password")
	args = ap.parse_args()

	if args.company and args.company not in LOGINS:
		sys.exit("{0} is not in LOGINS. Add it to the table rather than passing it in --\n"
			"see the docstring on why nothing here is derived from a company name.".format(args.company))

	print("Site: {0}\n".format(BASE))
	companies_on_site = {c["name"] for c in lst("Company", ["name"])}
	wanted = sorted({v[0] for v in LOGINS.values()})
	users_by_name = {}
	for u in lst("User", ["name"], [["name", "in", wanted]]):
		users_by_name[u["name"]] = doc("User", u["name"])

	rows = plan(companies_on_site, users_by_name, args.company)

	print("  {0:<38} {1:<28} {2}".format("Company", "Login", "Action"))
	print("  " + "-" * 92)
	for row in rows:
		print("  {0:<38} {1:<28} {2}".format(row["company"][:37], row["login"][:27], describe(row)))

	blocked = [r for r in rows if r["skip"]]
	if blocked:
		print("\n  skipped:")
		for r in blocked:
			print("    {0:<38} {1}".format(r["company"][:37], r["skip"]))

	todo = [r for r in rows if not r["skip"] and (r["make_user"] or r["add_role"] or r["make_perm"])]
	if not todo:
		print("\nNothing to do.")
		return
	if not args.apply:
		print("\n{0} to set up. Re-run with --apply to write.".format(len(todo)))
		return

	print()
	made = []
	for row in todo:
		print("  {0}".format(row["company"]))
		pwd = apply_row(row, args.welcome_email)
		if pwd:
			made.append((row["login"], pwd))

	print("\n{0} login(s) set up.".format(len(todo)))
	if made:
		print("\n  Passwords -- shown once, stored nowhere. Hand them over and have each\n"
			"  person change theirs at first sign-in.\n")
		for login, pwd in made:
			print("    {0:<30} {1}".format(login, pwd))
	print("\n  Each of these signs in at {0}/hr and sees one company.\n"
		"  Check one before handing any of them out: sign in, and confirm the\n"
		"  company picker in the top bar offers exactly that company. A picker\n"
		"  offering the whole group means the User Permission did not take, and\n"
		"  that reads as scoped without being scoped.".format(BASE))


if __name__ == "__main__":
	main()
