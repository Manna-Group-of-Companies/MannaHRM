"""Create the people from ERPNext as users on a fingerprint machine.

The bridge only ever reads. This writes, so it is separate, it is run by hand,
and it does as little as it can:

  * it adds a user number that the machine does not have yet,
  * it never deletes a user, never clears the attendance log, never touches the
    clock, and never changes the fingerprints of anybody already enrolled,
  * it prints what it would do and writes nothing until it is given --apply.

**A fingerprint cannot be created from here.** The template only exists inside
the machine, made by a finger on the sensor. What this gives you is the number
and the name already on the machine, so somebody at the gate only has to add the
finger to a user that is already there and spelled right. A card number, where
a machine is used with cards, can be written from here.

Usually reached through MACHINE.bat. By hand, from the install folder, in a
console opened as administrator - the key is in bridge.env, which is locked:

    .venv\\Scripts\\python push_users.py --device BIO-MRP-GATE2            # show only
    .venv\\Scripts\\python push_users.py --device BIO-MRP-GATE2 --apply    # write them
    .venv\\Scripts\\python push_users.py --device BIO-MRP-GATE2 --filters "[[\\"branch\\",\\"=\\",\\"Gate 2\\"]]"
"""

import argparse
import json
import os
import sys

import requests

from machine import HERE, NAME_LIMIT, USER_ID, connect, find_device, next_uid
from mannabridge.config import load_config


def _get_employees(url, key, secret, fields, where):
	response = requests.get(
		url.rstrip("/") + "/api/resource/Employee",
		params={
			# json.dumps, not str().replace: a branch called "St. Mary's" would
			# turn a quote swap into a query the site cannot parse.
			"fields": json.dumps(fields),
			"filters": json.dumps(where),
			"limit_page_length": 0,
		},
		headers={"Authorization": "token {0}:{1}".format(key, secret)},
		timeout=60,
	)
	if response.status_code != 200:
		raise SystemExit("Site said {0}: {1}".format(response.status_code, response.text[:300]))
	return response.json().get("data", [])


def employees(config, filters, card_field=None):
	"""Every active employee with an attendance_device_id, narrowed by --filters."""
	fields = ["name", "employee_name", "attendance_device_id", "status", "branch", "company"]
	if card_field:
		fields.append(card_field)
	where = [["attendance_device_id", "is", "set"], ["status", "=", "Active"]]
	if filters:
		where.extend(filters)
	return _get_employees(config.erp_url, config.api_key, config.api_secret, fields, where)


def number_holders(rows):
	"""Who holds each number."""
	holders = {}
	for row in rows:
		number = str(row.get("attendance_device_id") or "").strip()
		if number:
			holders.setdefault(number, []).append(row["name"])
	return holders


def all_holders(config):
	"""Across every branch and status.

	Not narrowed by --filters or by Active: a clash with somebody outside the
	filter, or with somebody who has left, still sends punches to the wrong row.
	"""
	rows = _get_employees(
		config.erp_url, config.api_key, config.api_secret,
		["name", "attendance_device_id"], [["attendance_device_id", "is", "set"]],
	)
	return number_holders(rows)


def plan(people, existing, holders, card_field=None):
	"""What to write, what to leave alone, and what somebody has to fix.

	`existing` maps the machine's user_id to the name it holds. A number the
	machine already has is never rewritten: that user may have fingerprints
	against it, and a rewrite is how somebody's finger stops working.

	A number held by two employees is written for neither. The machine sends
	only the number, so the site picks whichever employee it finds first and one
	person's attendance quietly lands on the other. That is reported even when
	the number is already on the machine, because the punches are going to the
	wrong person either way.
	"""
	to_add, already, bad = [], [], []

	for person in people:
		number = str(person.get("attendance_device_id") or "").strip()
		name = (person.get("employee_name") or "").strip()

		if not USER_ID.match(number):
			bad.append((person["name"], number, "not a plain number the machine can hold"))
			continue

		others = [n for n in holders.get(number, []) if n != person["name"]]
		if others:
			bad.append((person["name"], number, "same number as {0}".format(", ".join(sorted(others)))))
			continue

		if number in existing:
			already.append((number, name, existing[number]))
			continue

		card = 0
		if card_field:
			try:
				card = int(str(person.get(card_field) or "0").strip() or 0)
			except ValueError:
				bad.append((person["name"], number, "card number is not a number"))
				continue

		to_add.append({"user_id": number, "name": name[:NAME_LIMIT], "card": card, "full": name})

	return to_add, already, bad


def main(argv=None):
	parser = argparse.ArgumentParser(description="Create ERPNext people as users on a machine")
	parser.add_argument("--config", default=os.path.join(HERE, "config.toml"))
	parser.add_argument("--device", required=True, help="the [[device]] name, e.g. BIO-MRP-GATE2")
	parser.add_argument("--filters", help='extra Frappe filters, e.g. [["branch","=","Gate 2"]]')
	parser.add_argument("--card-field", help="Employee field holding the RFID card number")
	parser.add_argument("--apply", action="store_true", help="actually write; without it, nothing is written")
	args = parser.parse_args(argv)

	config = load_config(args.config)
	device = find_device(config, args.device)
	filters = json.loads(args.filters) if args.filters else None

	people = employees(config, filters, args.card_field)
	holders = all_holders(config)
	print("site: {0} active employee(s) with an attendance_device_id".format(len(people)))

	conn = connect(device)
	try:
		users = conn.get_users() or []
		existing = {str(u.user_id).strip(): u.name for u in users}
		print("machine {0}: {1} user(s) enrolled".format(device["name"], len(users)))

		to_add, already, bad = plan(people, existing, holders, args.card_field)

		for emp, number, why in sorted(bad, key=lambda b: b[1]):
			print("  SKIP  {0}: {1} ({2})".format(emp, number or "(blank)", why))
		if any("same number as" in why for _, _, why in bad):
			print("  ^ two employees share a number. Fix it in ERPNext, then run this again.")
		print("  {0} already on the machine, left untouched".format(len(already)))

		if not to_add:
			print("nothing to add.")
			return

		for item in to_add:
			extra = " card {0}".format(item["card"]) if item["card"] else ""
			cut = "  (name cut from '{0}')".format(item["full"]) if item["full"] != item["name"] else ""
			print("  ADD   {0}  {1}{2}{3}".format(item["user_id"], item["name"], extra, cut))

		if not args.apply:
			print("\n{0} user(s) would be added. Nothing was written - pass --apply to do it.".format(len(to_add)))
			return

		uid = next_uid(users)
		for item in to_add:
			conn.set_user(uid=uid, name=item["name"], privilege=0, password="", group_id="", user_id=item["user_id"], card=item["card"])
			uid += 1

		# Read the list back rather than trusting the writes.
		after = {str(u.user_id).strip() for u in (conn.get_users() or [])}
		missing = [i["user_id"] for i in to_add if i["user_id"] not in after]
		print("\nwrote {0} user(s).".format(len(to_add)))
		if missing:
			print("but these are still not on the machine: {0}".format(", ".join(missing)))
			sys.exit(1)
		print("all of them are on the machine now.")
		print("Fingerprints are still missing: somebody at the gate has to add the finger to")
		print("each of these users, or use Enroll a finger. Nothing else was changed.")
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass


if __name__ == "__main__":
	main()
