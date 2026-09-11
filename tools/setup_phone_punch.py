"""Is the site ready for the phone app, and link the people who are.

    python tools/setup_phone_punch.py                  # report only, writes nothing
    python tools/setup_phone_punch.py --apply          # link Employee.user_id
    python tools/setup_phone_punch.py --all            # everybody, not only the seventeen

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

The phone app writes `Employee Checkin` as the person signed in, and four things
have to be true on the site before a single punch can land. This checks all four
and repairs exactly one of them.

## The four, and which one this fixes

    1. Employee.user_id            → LINKED HERE, where the match is unambiguous
    2. Employee.custom_work_location field exists   → reported; it is an install
    3. Work Location rows with a coordinate         → reported; somebody must survey them
    4. manna_hr installed, so checkin.py runs       → reported; it is an install

**Only the first is written.** The others are a `bench install-app` and a person
standing at a gate with a phone reading a coordinate, and a script that invented
either would be inventing the geofence itself.

## Why `user_id` is the one worth automating

It is a join between two records that already exist, on a key both of them
already carry — the email address. There is nothing to decide. The other three
each need a fact nobody has written down yet.

## Matching, and why it refuses rather than guesses

An Employee is matched to a User on **`personal_email`, `company_email` or
`prefered_email`**, exactly, case-insensitively. Anything matching zero or more
than one User is reported and skipped.

A wrong `user_id` is not a cosmetic error: it is one person punching as another,
for as long as nobody notices, and every punch in between is in the wrong
person's pay. Names are deliberately **not** matched on — `docs/APP_USERS.md`
records what name-matching offered against the fingerprint roster ("Sunny M.J"
against "paul sunny") and none of it was the same human being.

## The geofence is not on until the app is installed

`manna_hr/checkin.py` holds the window, the geofence and the server clock, and
it is a controller on doctypes the site currently keeps as `custom: 1` — a
custom doctype is a table and a form, and the `.py` beside it is not part of it
(CLAUDE.md §7).

So a phone punch today is checked by nobody: the app deliberately refuses
nothing on its own judgement, and the server that is supposed to be judging is
not running. This script says so, loudly, every time, until it is.
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

#: The seventeen, as given on 10 September 2026. See docs/APP_USERS.md — the
#: two columns are kept apart there because nobody has said what the split
#: means, and this file does not need to know.
APP_USERS = [
	"Rajiv CS", "Eapen K Mathew", "Abhilash MG", "Pradeep AK", "Shantu Poulose",
	"Sreekumar PS", "Binuja Karunakaran", "Ajmal Imthiyas", "Nikhil Sabu",
	"Sunny M.J", "Ramesh E.N", "Biju Thomas Den", "Ajith Vijayan",
	"Lijo Aliyas", "Sijo George", "Eldhose Kuriakose", "Ebin Joy",
]

EMP_FIELDS = [
	"name", "employee_name", "employee_number", "company", "status", "user_id",
	"default_shift", "attendance_device_id", "personal_email", "company_email",
	"prefered_email",
]


# -------------------------------------------------------------------- site ---

def req(path):
	url = "{0}{1}".format(BASE, path)
	r = urllib.request.Request(
		url, headers={"Authorization": AUTH, "Accept": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters=None):
	q = {
		"doctype": doctype,
		"fields": json.dumps(fields),
		"limit_page_length": 0,
	}
	if filters:
		q["filters"] = json.dumps(filters)
	path = "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)
	return req(path).get("message") or []


def write(doctype, name, patch):
	"""One PUT, with only the fields that change.

	A whole-document write re-sends columns this key may not write, so a
	`user_id` update would be refused over a salary field nobody touched.
	"""
	url = "{0}/api/resource/{1}/{2}".format(
		BASE, urllib.parse.quote(doctype), urllib.parse.quote(name))
	body = json.dumps(patch).encode("utf-8")
	r = urllib.request.Request(url, data=body, method="PUT", headers={
		"Authorization": AUTH,
		"Accept": "application/json",
		"Content-Type": "application/json",
	})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def has_field(doctype, fieldname):
	"""Whether the site's doctype actually carries this column.

	**The check exists because Frappe does not complain.** It accepts a key its
	doctype has not got and drops it silently, so an app reading
	`custom_work_location` off a site without that field gets `None` for
	everybody and geofences nobody — with no error anywhere.
	"""
	try:
		doc = req("/api/resource/DocType/" + urllib.parse.quote(doctype))
		names = [f.get("fieldname") for f in (doc.get("data") or {}).get("fields") or []]
		return fieldname in names
	except urllib.error.HTTPError:
		return False


def app_installed():
	"""Whether `manna_hr` is a real app here rather than a folder of doctypes.

	`frappe.get_installed_apps` is whitelisted for a System Manager. When the
	call is refused the answer is unknown rather than False, and the report says
	so — claiming "not installed" on a permission error would send somebody to
	install a thing that is already there.
	"""
	try:
		apps = req("/api/method/frappe.client.get_installed_apps").get("message")
		if isinstance(apps, list):
			return "manna_hr" in apps
	except Exception:
		pass
	return None


# ------------------------------------------------------------------ people ---

def emails_of(emp):
	out = []
	for key in ("personal_email", "company_email", "prefered_email"):
		v = (emp.get(key) or "").strip().lower()
		if v:
			out.append(v)
	return out


def wanted(emp, only):
	"""Whether this employee is one the report is about."""
	if not only:
		return True
	name = (emp.get("employee_name") or "").lower().replace(".", " ")
	squashed = " ".join(name.split())
	for target in only:
		t = " ".join(target.lower().replace(".", " ").split())
		# Every word of the given name has to appear. Loose enough for
		# "Sunny M.J" against "SUNNY M J", tight enough that it is a candidate
		# rather than a decision — the email is what actually matches.
		if all(w in squashed for w in t.split()):
			return True
	return False


def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="write the user_id links")
	p.add_argument("--all", action="store_true", help="every active employee, not only the seventeen")
	args = p.parse_args()

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2

	print("site: {0}\n".format(BASE))

	# One reachability check before anything else, so an unreachable site is a
	# sentence rather than a traceback. This runs on a laptop at a desk, and a
	# stack trace about `do_open` says nothing about the VPN being off.
	try:
		req("/api/method/frappe.auth.get_logged_user")
	except urllib.error.HTTPError as exc:
		print("The site refused the credentials ({0}). Check ERP_KEY and ERP_SECRET.".format(exc.code))
		return 2
	except Exception as exc:
		print("Could not reach {0} — {1}".format(BASE, exc))
		print("Check ERP_URL, and that this machine has a route to the site.")
		return 2

	# ---- the three that are an install or a survey, not a script ----
	field_ok = has_field("Employee", "custom_work_location")
	places = listing("Work Location",
		["name", "location_name", "latitude", "longitude", "radius_metres", "is_active"])
	fenced = [w for w in places if w.get("latitude") and w.get("longitude")]
	installed = app_installed()

	print("=== the geofence ===")
	print("  Employee.custom_work_location field : {0}".format("yes" if field_ok else "MISSING"))
	print("  Work Location rows                  : {0} ({1} with a coordinate)".format(
		len(places), len(fenced)))
	print("  manna_hr installed                  : {0}".format(
		{True: "yes", False: "NO", None: "could not tell"}[installed]))

	if not field_ok or not fenced or installed is not True:
		print("\n  ** No phone punch is being geofenced right now. **")
		print("  The app refuses nothing on its own judgement — by design, because the")
		print("  server is meant to be judging (CLAUDE.md §1). Until the three lines")
		print("  above all read yes, nobody is judging, and a punch from home is")
		print("  accepted exactly like a punch at the gate.")
	print()

	# ---- the one this fixes ----
	only = None if args.all else APP_USERS
	emps = [e for e in listing("Employee", EMP_FIELDS, [["status", "=", "Active"]])
		if wanted(e, only)]
	users = listing("User", ["name", "full_name", "enabled"], [["user_type", "=", "System User"]])
	by_email = {}
	for u in users:
		by_email.setdefault((u["name"] or "").strip().lower(), []).append(u)

	linked, ready, missing_user, ambiguous, no_email, no_shift = [], [], [], [], [], []

	for e in sorted(emps, key=lambda x: x.get("employee_name") or ""):
		label = "{0} · {1}".format(e.get("employee_number") or e["name"], e.get("employee_name"))
		if e.get("user_id"):
			linked.append("{0} → {1}".format(label, e["user_id"]))
			if not e.get("default_shift"):
				no_shift.append(label)
			continue

		hits = []
		for addr in emails_of(e):
			hits.extend(by_email.get(addr, []))
		uniq = {u["name"]: u for u in hits}

		if not emails_of(e):
			no_email.append(label)
		elif len(uniq) == 1:
			ready.append((e, next(iter(uniq))))
		elif len(uniq) > 1:
			ambiguous.append("{0} → {1}".format(label, ", ".join(sorted(uniq))))
		else:
			missing_user.append("{0} · {1}".format(label, ", ".join(emails_of(e))))
		if not e.get("default_shift"):
			no_shift.append(label)

	print("=== {0} employee(s) in scope ===".format(len(emps)))
	print("  already linked to a user : {0}".format(len(linked)))
	print("  can be linked now        : {0}".format(len(ready)))
	print("  no User with that email  : {0}".format(len(missing_user)))
	print("  more than one User       : {0}".format(len(ambiguous)))
	print("  no email on the record   : {0}".format(len(no_email)))
	print("  no default_shift         : {0}".format(len(no_shift)))
	print()

	for title, rows in (
		("Can be linked", ["{0} → {1}".format(
			"{0} · {1}".format(e.get("employee_number") or e["name"], e.get("employee_name")), u)
			for e, u in ready]),
		("No User exists for this address — HR creates it in Desk", missing_user),
		("Ambiguous, skipped", ambiguous),
		("No email on the Employee record", no_email),
		("No shift — punches will land and never become Attendance", no_shift),
		("Already linked", linked),
	):
		if not rows:
			continue
		print("--- {0} ({1}) ---".format(title, len(rows)))
		for r in rows:
			print("    {0}".format(r))
		print()

	if missing_user:
		print("A User is created in Desk, not here: User → + Add User, then let Frappe")
		print("send the welcome email. **Nobody should type somebody else's password** —")
		print("the reset link is how they set their own.\n")

	if not args.apply:
		print("Dry run. Nothing was written. Re-run with --apply to link {0}.".format(
			"{0} employee(s)".format(len(ready)) if ready else "nothing"))
		return 0

	if not ready:
		print("Nothing to link.")
		return 0

	done = 0
	for e, user in ready:
		try:
			write("Employee", e["name"], {"user_id": user})
			print("  linked {0} → {1}".format(e["name"], user))
			done += 1
		except urllib.error.HTTPError as exc:
			# The site's own words. "User already linked to another Employee" is
			# the common one and it is a finding, not a retry.
			body = exc.read().decode("utf-8", "replace")[:300]
			print("  REFUSED {0} → {1}: {2}".format(e["name"], user, body))

	print("\nlinked {0} of {1}.".format(done, len(ready)))
	return 0


if __name__ == "__main__":
	sys.exit(main())
