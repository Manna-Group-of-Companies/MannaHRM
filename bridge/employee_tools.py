"""Employees and the machine, side by side - and a new one on both at once.

  list    everybody on the machine, with the Employee their number belongs to,
          and what is wrong where something is
  create  an Employee on the site and the same number on the machine

**The number is the only link.** The machine stores a user id, never a person,
and a punch reaches somebody only through Employee.attendance_device_id. A user
on the machine with no Employee behind that number has every punch refused, and
nobody notices until the month's pay - docs/NEW_EMPLOYEE.md is that story, and
`list` is the check for it.

`create` writes the site first and the machine second. A site that refuses the
record has changed nothing on the machine; a machine that fails after the record
exists is reported by name, and add-user finishes the job.

Usually reached through MACHINE.bat. By hand, from the install folder, in a
console opened as administrator:

    .venv\\Scripts\\python employee_tools.py list   --device BIO-MRP-GATE2
    .venv\\Scripts\\python employee_tools.py list   --device BIO-MRP-GATE2 --problems
    .venv\\Scripts\\python employee_tools.py create --device BIO-MRP-GATE2 --user-id 851 ^
        --first-name Anil --last-name K --gender Male --date-of-birth 12-04-1994 ^
        --date-of-joining 01-10-2026 --company "Manna Rubber Products" --shift "General" --apply
"""

import argparse
import csv
import json
import os
from collections import Counter
from datetime import date, datetime

import requests

from machine import HERE, NAME_LIMIT, check_user_id, connect, dry_run, find_device, find_user, next_uid
from mannabridge.config import load_config

# Nobody is taken on younger than this, so a birth date that says otherwise is a
# typo - usually this year's date typed into the wrong box.
MIN_AGE_AT_JOINING = 14


# --- site -------------------------------------------------------------------


def _headers(config):
	return {"Authorization": "token {0}:{1}".format(config.api_key, config.api_secret), "Accept": "application/json"}


def site_error(response):
	"""The sentence the site meant, out of Frappe's error envelope."""
	try:
		body = response.json()
	except ValueError:
		return response.text[:300]
	messages = []
	for raw in json.loads(body.get("_server_messages") or "[]"):
		try:
			messages.append(json.loads(raw).get("message", ""))
		except (ValueError, AttributeError):
			messages.append(str(raw))
	text = " ".join(m for m in messages if m) or str(body.get("exception") or body)[:300]
	return text.replace("<b>", "").replace("</b>", "")


def site_list(config, doctype, fields, filters):
	response = requests.get(
		config.erp_url.rstrip("/") + "/api/resource/" + doctype,
		params={"fields": json.dumps(fields), "filters": json.dumps(filters), "limit_page_length": 0},
		headers=_headers(config),
		timeout=60,
	)
	if response.status_code != 200:
		raise SystemExit("The site would not list {0} ({1}): {2}".format(doctype, response.status_code, site_error(response)))
	return response.json().get("data", [])


def site_insert(config, doctype, doc):
	response = requests.post(
		config.erp_url.rstrip("/") + "/api/resource/" + doctype,
		json=doc,
		headers=_headers(config),
		timeout=60,
	)
	if response.status_code in (401, 403):
		# Not "give the bridge more roles": its key sits on a shop-floor PC, and
		# a key that can create Employees is a bigger thing to lose.
		raise SystemExit(
			"The site refused: this PC's key may not create {0}.\n"
			"Create the record in Desk (Employee -> + New) and then use Add one user.".format(doctype)
		)
	if response.status_code not in (200, 201):
		raise SystemExit("The site refused the {0}: {1}".format(doctype, site_error(response)))
	return response.json()["data"]


def everybody_with_a_number(config):
	# Every status. A Left employee still holding a number still catches its punches.
	return site_list(
		config,
		"Employee",
		["name", "employee_name", "attendance_device_id", "status", "company", "branch"],
		[["attendance_device_id", "is", "set"]],
	)


# --- pure -------------------------------------------------------------------


def by_number(people):
	found = {}
	for p in people:
		number = str(p.get("attendance_device_id") or "").strip()
		if number:
			found.setdefault(number, []).append(p)
	return found


def link_rows(users, fingers, people):
	"""One row per user on the machine, with the Employee behind the number.

	Problems are worded as their consequence, because that is what decides
	whether somebody acts on the row today.
	"""
	holders = by_number(people)
	rows = []
	for u in sorted(users, key=lambda u: (len(str(u.user_id).strip()), str(u.user_id).strip())):
		number = str(u.user_id).strip()
		matches = holders.get(number, [])
		count = fingers.get(u.uid, 0)
		if not matches:
			problem = "NOT IN ERPNEXT - every punch is refused"
		elif len(matches) > 1:
			problem = "SHARED by {0} - punches go to whichever the site finds first".format(
				", ".join(sorted(m["name"] for m in matches))
			)
		elif matches[0].get("status") != "Active":
			problem = "{0} in ERPNext but still on the machine".format(matches[0].get("status"))
		elif not count and not u.card:
			problem = "no finger and no card - cannot punch"
		else:
			problem = ""
		rows.append(
			{
				"user_id": number,
				"machine_name": u.name,
				"fingers": count,
				"card": u.card or "",
				"employee": ", ".join(m["name"] for m in matches),
				"employee_name": matches[0].get("employee_name", "") if len(matches) == 1 else "",
				"status": matches[0].get("status", "") if len(matches) == 1 else "",
				"company": matches[0].get("company", "") if len(matches) == 1 else "",
				"problem": problem,
			}
		)
	return rows


def not_on_machine(users, people):
	"""Active employees whose number this machine does not hold.

	Not necessarily wrong: they may punch at another gate. Listed on request
	rather than as a problem for that reason.
	"""
	here = {str(u.user_id).strip() for u in users}
	return sorted(
		(p for p in people if p.get("status") == "Active" and str(p.get("attendance_device_id") or "").strip() not in here),
		key=lambda p: p["name"],
	)


def parse_date(text, label):
	for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
		try:
			return datetime.strptime((text or "").strip(), fmt).date()
		except ValueError:
			pass
	raise SystemExit("{0} {1!r} is not a date. Use DD-MM-YYYY, e.g. 01-10-2026.".format(label, text))


def employee_doc(args):
	check_user_id(args.user_id)
	born = parse_date(args.date_of_birth, "Date of birth")
	joined = parse_date(args.date_of_joining, "Date of joining")
	age = joined.year - born.year - ((joined.month, joined.day) < (born.month, born.day))
	if age < MIN_AGE_AT_JOINING:
		raise SystemExit(
			"Born {0} and joining {1} makes them {2} at joining. Check the two dates.".format(
				born.strftime("%d-%m-%Y"), joined.strftime("%d-%m-%Y"), age
			)
		)
	if not args.first_name.strip():
		raise SystemExit("A first name is needed.")

	doc = {
		"first_name": args.first_name.strip(),
		"gender": args.gender.strip(),
		"date_of_birth": born.isoformat(),
		"date_of_joining": joined.isoformat(),
		"status": "Active",
		"company": args.company.strip(),
		"attendance_device_id": args.user_id,
	}
	for field, value in (
		("last_name", args.last_name),
		("default_shift", args.shift),
		("employee_number", args.employee_number),
		("branch", args.branch),
	):
		if value and value.strip():
			doc[field] = value.strip()
	return doc


def looks_like_somebody_else(name_on_device, name):
	"""Whether the machine's name for a number is plainly a different person.

	The trap this exists for: a number free on the site is not a number free on
	the machine. 359 of one gate's 444 users are on no Employee record, so a
	number picked by hand is *likely* to be one of theirs - and linking to it
	quietly pays their attendance to somebody else. Compared on words rather
	than exactly, because the keypad spells names badly and a middle initial or
	a swapped order is not a different person.
	"""
	mine = {w for w in str(name or "").lower().replace(".", " ").split() if len(w) > 2}
	theirs = {w for w in str(name_on_device or "").lower().replace(".", " ").split() if len(w) > 2}
	if not mine or not theirs:
		return False
	return not (mine & theirs)


def machine_step(user_id, holders, machine_user):
	"""What the machine needs: "add", or "link" when the gate enrolled them first.

	Refused outright when any Employee already holds the number, whatever their
	status - two holders is one person's attendance landing on the other.
	"""
	held = holders.get(user_id, [])
	if held:
		raise SystemExit(
			"Number {0} already belongs to {1}. Give the new employee a number nobody holds.".format(
				user_id, ", ".join("{0} ({1}, {2})".format(p["name"], p.get("employee_name", ""), p.get("status", "")) for p in held)
			)
		)
	return "link" if machine_user else "add"


def machine_name(doc):
	return " ".join(part for part in (doc["first_name"], doc.get("last_name", "")) if part)[:NAME_LIMIT]


# --- commands ---------------------------------------------------------------


def cmd_list(conn, args, config, device):
	users = conn.get_users() or []
	fingers = Counter(f.uid for f in (conn.get_templates() or []))
	people = everybody_with_a_number(config)
	rows = link_rows(users, fingers, people)
	shown = [r for r in rows if r["problem"]] if args.problems else rows

	if args.csv:
		with open(args.csv, "w", newline="", encoding="utf-8") as handle:
			writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else ["user_id"])
			writer.writeheader()
			writer.writerows(shown)
		print("{0} row(s) written to {1}".format(len(shown), os.path.abspath(args.csv)))
	else:
		print("  {0:>9}  {1:<24}  {2:>3}  {3:<14}  {4:<24}  {5:<8}  {6}".format("user id", "on the machine", "fp", "employee", "in ERPNext", "status", "problem"))
		for r in shown:
			print(
				"  {0:>9}  {1:<24}  {2:>3}  {3:<14}  {4:<24}  {5:<8}  {6}".format(
					r["user_id"], r["machine_name"][:24], r["fingers"], r["employee"][:14] or "-",
					r["employee_name"][:24], r["status"], r["problem"],
				)
			)

	problems = Counter(r["problem"].split(" ")[0] for r in rows if r["problem"])
	print("\n{0} user(s) on {1}; {2} linked to an Active employee with nothing wrong.".format(
		len(rows), device["name"], sum(1 for r in rows if not r["problem"])
	))
	for word, label in (
		("NOT", "not in ERPNext - their punches are refused. Create them, or fill Attendance Device ID"),
		("SHARED", "on a number two employees hold"),
		("Left", "Left in ERPNext but still on the machine"),
		("no", "with no finger and no card"),
	):
		if problems.get(word):
			print("  {0:>4}  {1}".format(problems[word], label))
	other = sum(n for w, n in problems.items() if w not in ("NOT", "SHARED", "Left", "no"))
	if other:
		print("  {0:>4}  with another status in ERPNext".format(other))

	missing = not_on_machine(users, people)
	print("\n{0} Active employee(s) have a number this machine does not hold - they may punch at another gate.".format(len(missing)))
	if args.not_here:
		for p in missing:
			print("  {0:>9}  {1:<14}  {2:<24}  {3}".format(p["attendance_device_id"], p["name"], p.get("employee_name", "")[:24], p.get("branch") or p.get("company") or ""))
	elif missing:
		print("  --not-here lists them.")


def cmd_create(conn, args, config, device):
	doc = employee_doc(args)

	# Every check before any write: a refusal here has changed nothing anywhere.
	holders = by_number(everybody_with_a_number(config))
	checks = [("Company", doc["company"]), ("Gender", doc["gender"])]
	if doc.get("default_shift"):
		checks.append(("Shift Type", doc["default_shift"]))
	if doc.get("branch"):
		checks.append(("Branch", doc["branch"]))
	for doctype, value in checks:
		names = [r["name"] for r in site_list(config, doctype, ["name"], [])]
		if value not in names:
			raise SystemExit("No {0} called {1!r}. The site has: {2}".format(doctype, value, ", ".join(sorted(names)) or "none"))

	users = conn.get_users() or []
	on_machine = find_user(users, args.user_id)
	step = machine_step(args.user_id, holders, on_machine)
	same_name = site_list(config, "Employee", ["name", "status"], [["employee_name", "=", machine_name(doc)]])

	print("  CREATE Employee  {0}".format(machine_name(doc)))
	for field in ("gender", "date_of_birth", "date_of_joining", "company", "branch", "default_shift", "employee_number", "attendance_device_id"):
		if doc.get(field):
			print("    {0:<21} {1}".format(field, doc[field]))
	if not doc.get("default_shift"):
		print("  No shift: their punches will land and never become Attendance until one is set.")
	for p in same_name:
		print("  Note: {0} ({1}) already has this name. Make sure this is somebody else.".format(p["name"], p["status"]))
	if step == "link":
		print("  MACHINE  {0} is already on {1} as '{2}' - enrolled at the gate first. Nothing to write there.".format(args.user_id, device["name"], on_machine.name))
		if looks_like_somebody_else(on_machine.name, machine_name(doc)):
			print("  ^ STOP if that is not the same person. The machine calls {0} '{1}' and this record is".format(
				args.user_id, on_machine.name
			))
			print("    '{0}'. Every punch that finger makes would be paid to this record instead.".format(machine_name(doc)))
			print("    Pick a number no machine holds - employee_tools.py list shows what is taken.")
	else:
		print("  MACHINE  ADD user {0} '{1}' on {2}, slot {3}".format(args.user_id, machine_name(doc), device["name"], next_uid(users)))

	if dry_run(args, "The employee would be created"):
		return

	created = site_insert(config, "Employee", doc)
	print("\ncreated {0} on the site.".format(created["name"]))

	if step == "add":
		try:
			conn.set_user(uid=next_uid(conn.get_users() or []), name=machine_name(doc), privilege=0, password="", group_id="", user_id=args.user_id, card=0)
			ok = find_user(conn.get_users() or [], args.user_id) is not None
		except Exception as error:
			ok, why = False, error
		else:
			why = "not there when read back"
		if not ok:
			raise SystemExit(
				"{0} exists on the site, but the machine write failed ({1}).\n"
				"Finish it with Add one user: user id {2}, name {3}.".format(created["name"], why, args.user_id, machine_name(doc))
			)
		print("added user {0} to {1}.".format(args.user_id, device["name"]))

	print("\nNext: enroll a finger (Enroll a finger, or at the machine), then have them punch once")
	print("and check it arrives under Employee Checkin within five minutes.")


# --- command line -----------------------------------------------------------


def parser():
	common = argparse.ArgumentParser(add_help=False)
	common.add_argument("--config", default=os.path.join(HERE, "config.toml"))
	common.add_argument("--device", required=True, help="the [[device]] name, e.g. BIO-MRP-GATE2")

	top = argparse.ArgumentParser(description="Employees and the machine, side by side")
	sub = top.add_subparsers(dest="command", required=True)

	p = sub.add_parser("list", parents=[common], help="everybody on the machine, with their Employee")
	p.add_argument("--problems", action="store_true", help="only the rows with something wrong")
	p.add_argument("--not-here", action="store_true", help="also list Active employees this machine lacks")
	p.add_argument("--csv", help="write to this file instead of the screen")
	p.set_defaults(func=cmd_list)

	p = sub.add_parser("create", parents=[common], help="an Employee on the site, and their number on the machine")
	p.add_argument("--apply", action="store_true", help="actually write; without it, nothing is written")
	p.add_argument("--user-id", required=True, help="the machine number, becomes Attendance Device ID")
	p.add_argument("--first-name", required=True)
	p.add_argument("--last-name")
	p.add_argument("--gender", required=True)
	p.add_argument("--date-of-birth", required=True, help="DD-MM-YYYY")
	p.add_argument("--date-of-joining", required=True, help="DD-MM-YYYY")
	p.add_argument("--company", required=True)
	p.add_argument("--shift", help="Default Shift - without one no Attendance is ever generated")
	p.add_argument("--employee-number", help="the company's own code, e.g. MRP-307")
	p.add_argument("--branch")
	p.set_defaults(func=cmd_create)
	return top


def main(argv=None):
	args = parser().parse_args(argv)
	config = load_config(args.config)
	device = find_device(config, args.device)
	conn = connect(device)
	try:
		args.func(conn, args, config, device)
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass


if __name__ == "__main__":
	main()
