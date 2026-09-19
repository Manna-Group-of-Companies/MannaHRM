"""Doing at a machine what somebody asked for on the dashboard.

A browser cannot reach a fingerprint machine. This box can reach both, so the
dashboard leaves a `Machine Command` on the site, this picks it up within
seconds, does it at the machine and writes the answer back.

**Kept apart from punches, like the enrolment list.** Anything that goes wrong
here — the doctype not on the site, a key without the permission, a machine that
will not answer — is logged and costs nothing else. The punch queue drains
exactly as it would if this file did not exist.

**The action list is closed, twice.** The site refuses an action it does not
know (`manna_hr/machinecmd.py`) and so does this, before a socket is opened.
There is no action here that clears a log, wipes a machine or switches it off,
and adding one would take an edit to both. That is deliberate: what is on the
end of this is a machine that decides whether somebody is paid.
"""

import json
import logging
from datetime import datetime
from urllib.parse import quote

import requests

log = logging.getLogger(__name__)

DOCTYPE = "Machine Command"

#: What this bridge knows how to do. A command naming anything else is failed
#: rather than attempted.
#:
#: **Deliberately a second copy of `manna_hr/machinecmd.py`'s list, not an
#: import of it.** The bridge is installed on a gate PC on its own — the app is
#: not beside it and never will be — so an import would be a crash on the box
#: that matters. `manna_hr/tests/test_machine_command.py` reads this file and
#: fails if the two lists drift apart.
ACTIONS = ("Check User", "Add User", "List Users")

#: Names longer than this are cut off by the machine itself.
NAME_LIMIT = 24

#: A ZK user slot is a 16-bit field.
MAX_UID = 65535

#: Most a bridge takes in one go, so a pile of commands cannot delay the punches.
BATCH = 10

#: Given up on after this many pickups, so a machine that never answers does not
#: hold a command in Running for ever with nobody told.
MAX_ATTEMPTS = 3


class Unavailable(Exception):
	"""The site could not be reached or answered with something unusable."""


class NotOnSite(Exception):
	"""The doctype is not installed. Said once, then left alone."""


class CommandSite:
	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._base = base_url.rstrip("/")
		self._timeout = timeout
		self._session = requests.Session()
		self._session.headers.update(
			{"Authorization": "token {0}:{1}".format(api_key, api_secret), "Accept": "application/json"}
		)

	def pending(self, device_ids, limit=BATCH):
		"""The oldest Pending commands for this bridge's own machines."""
		if not device_ids:
			return []
		params = {
			"fields": json.dumps(
				["name", "device_id", "action", "device_user_id", "name_on_device", "status", "attempts"]
			),
			"filters": json.dumps([["status", "=", "Pending"], ["device_id", "in", list(device_ids)]]),
			"order_by": "creation asc",
			"limit_page_length": limit,
		}
		try:
			response = self._session.get(self._base + "/api/resource/" + quote(DOCTYPE), params=params, timeout=self._timeout)
		except requests.RequestException as exc:
			raise Unavailable(exc) from exc
		if response.status_code == 404:
			raise NotOnSite(DOCTYPE)
		if response.status_code != 200:
			raise Unavailable("command list answered HTTP {0}".format(response.status_code))
		return response.json().get("data") or []

	def write(self, name, body):
		url = self._base + "/api/resource/" + quote(DOCTYPE) + "/" + quote(name)
		try:
			response = self._session.put(url, json=body, timeout=self._timeout)
		except requests.RequestException as exc:
			raise Unavailable(exc) from exc
		if response.status_code == 404:
			raise NotOnSite(DOCTYPE)
		if response.status_code not in (200, 201):
			raise Unavailable("{0} answered HTTP {1}: {2}".format(name, response.status_code, response.text[:200]))
		return response.json().get("data") or {}


def _now():
	return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def claim(site, row):
	"""Mark a command Running before touching the machine.

	Two bridges reading one machine would otherwise both run it. The claim is
	not a lock — Frappe has no compare-and-set here — so the actions are written
	to be safe run twice instead: Check User only reads, and Add User refuses a
	number the machine already holds rather than writing over it.
	"""
	site.write(row["name"], {
		"status": "Running",
		"started_at": _now(),
		"attempts": int(row.get("attempts") or 0) + 1,
	})


def finish(site, name, status, said, found=None):
	body = {"status": status, "result": said[:2000], "finished_at": _now()}
	if found is not None:
		body["found"] = 1 if found else 0
	site.write(name, body)


def users_on(conn):
	"""`[(user_id, name)]` as the machine holds them."""
	return [(str(u.user_id).strip(), u.name) for u in (conn.get_users() or [])]


def next_uid(conn):
	uids = [int(u.uid) for u in (conn.get_users() or []) if str(u.uid).isdigit()]
	uid = (max(uids) if uids else 0) + 1
	if uid > MAX_UID:
		raise RuntimeError("the machine has no free slot number left")
	return uid


def check_answer(users, device_user_id):
	"""`(found, sentence)` for Check User. The same words as the app's copy."""
	number = str(device_user_id).strip()
	for user_id, name in users:
		if str(user_id).strip() == number:
			return True, "Yes. {0} is on the machine as {1}.".format(number, name or "(no name)")
	return False, "No. {0} is not on the machine.".format(number)


def add_answer(users, device_user_id, name_on_device):
	"""`(step, sentence)` for Add User: "add", or "already" when the gate got there first.

	Never "overwrite". That number may carry somebody's fingerprints, and
	rewriting the user is how a finger stops working.
	"""
	number = str(device_user_id).strip()
	for user_id, name in users:
		if str(user_id).strip() == number:
			return "already", "{0} was already on the machine as {1}. Nothing was written.".format(
				number, name or "(no name)"
			)
	return "add", "{0} added as {1}. The finger still has to be enrolled at the machine.".format(
		number, str(name_on_device or "").strip()[:NAME_LIMIT]
	)


def run(conn, row):
	"""Do one command at an open machine. Returns `(status, said, found)`.

	Raises nothing of its own: a machine that fails mid-way is the caller's
	problem to log, because only the caller knows whether to leave the command
	for another attempt.
	"""
	action = row.get("action")
	number = str(row.get("device_user_id") or "").strip()

	if action == "Check User":
		found, said = check_answer(users_on(conn), number)
		return "Done", said, found

	if action == "List Users":
		people = users_on(conn)
		listed = ", ".join("{0} {1}".format(uid, name) for uid, name in people[:50])
		return "Done", "{0} user(s) on the machine. {1}{2}".format(
			len(people), listed, " ..." if len(people) > 50 else ""
		), None

	if action == "Add User":
		step, said = add_answer(users_on(conn), number, row.get("name_on_device"))
		if step == "already":
			# Not a failure: whoever enrolled the finger at the gate first got
			# there, which is the order docs/NEW_EMPLOYEE.md actually expects.
			return "Done", said, True
		conn.set_user(
			uid=next_uid(conn),
			name=str(row.get("name_on_device") or "")[:NAME_LIMIT],
			privilege=0,
			password="",
			group_id="",
			user_id=number,
			card=0,
		)
		# Read back rather than trusting the write.
		if not any(uid == number for uid, _ in users_on(conn)):
			return "Failed", "Written, but {0} is not on the machine when it is read back.".format(number), False
		return "Done", said, True

	return "Failed", "This bridge does not know how to {0!r}.".format(action), None


def work(devices, site, batch=BATCH):
	"""Run what is waiting for this bridge's machines. Returns how many finished.

	`devices` are `Device`s: anything with a `.name` and an `.open()` that
	returns a connection, which is what makes this testable without a machine.
	"""
	by_name = {d.name: d for d in devices}
	if not by_name:
		return 0

	rows = site.pending(by_name, limit=batch)
	if not rows:
		return 0

	done = 0
	for row in rows:
		if row.get("action") not in ACTIONS:
			# Refused before a socket is opened, and said in the record rather
			# than only in this log.
			finish(site, row["name"], "Failed", "This bridge does not know how to {0!r}.".format(row.get("action")))
			done += 1
			continue

		attempts = int(row.get("attempts") or 0)
		try:
			claim(site, row)
		except (Unavailable, NotOnSite):
			raise

		conn = None
		try:
			conn = by_name[row["device_id"]].open()
			status, said, found = run(conn, row)
		except Exception as exc:
			# The machine, not the site. Left for another pass while there are
			# attempts left — a gate PC and a gate machine lose each other for a
			# minute often enough that one bad read must not fail a command.
			if attempts + 1 >= MAX_ATTEMPTS:
				status, said, found = "Failed", "The machine could not be reached: {0}".format(exc), None
			else:
				log.warning("%s: command %s could not run (%s); leaving it for the next pass", row["device_id"], row["name"], exc)
				site.write(row["name"], {"status": "Pending"})
				continue
		finally:
			if conn is not None:
				try:
					conn.disconnect()
				except Exception:
					pass

		finish(site, row["name"], status, said, found)
		log.info("%s: %s %s -> %s", row["device_id"], row.get("action"), row.get("device_user_id") or "", said)
		done += 1

	return done
