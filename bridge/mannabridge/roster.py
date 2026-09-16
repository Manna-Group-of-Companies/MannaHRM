"""Who is enrolled on each machine, sent to ERPNext as `Attendance Device User`.

**The machine keeps no enrolment date.** What it does keep is its user list, and
the bridge reads that list every pass — so a person who was not there on the
last pass and is there now was enrolled in between. That is the time shown, to
within one poll. People already on a machine the first time this bridge reads it
have no such moment, and their Enrolled At stays blank rather than claiming the
day the bridge was installed.

**Kept apart from punches on purpose.** A failure anywhere in here — the doctype
not yet on the site, a key without the permission, a machine that will not list
its users — is logged and costs nothing else. The punch queue drains exactly as
it would if this file did not exist, because that queue is somebody's pay and
this list is a report about it.

Only what changed is sent. The store remembers the last body the site accepted
for each person, and a row whose body is unchanged is not written again — which
is what keeps a 443-person machine from being 443 writes every five minutes.
"""

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from urllib.parse import quote

import requests

log = logging.getLogger(__name__)

DOCTYPE = "Attendance Device User"

# Writes per pass. The first read of a machine holds everybody on it — 443 on
# the Manna Rubber Products gate — and sending them in one pass would hold the
# next punch read back by minutes. The rest go on the passes after.
MAX_WRITES_PER_PASS = 150

SCHEMA = """
CREATE TABLE IF NOT EXISTS device_user (
    device_id    TEXT    NOT NULL,
    device_user  TEXT    NOT NULL,
    name         TEXT    NOT NULL DEFAULT '',
    admin        INTEGER NOT NULL DEFAULT 0,
    on_device    INTEGER NOT NULL DEFAULT 1,
    first_seen   TEXT    NOT NULL,
    enrolled_at  TEXT,
    removed_at   TEXT,
    sent         TEXT,
    PRIMARY KEY (device_id, device_user)
);
"""

COLUMNS = ("device_user", "name", "admin", "on_device", "first_seen", "enrolled_at", "removed_at", "sent")


# ------------------------------------------------------------ pure rules ---


def reconcile(known, read, now):
	"""What the store holds for one machine after reading its users at `now`.

	`known` is `{device_user: row}` as stored; `read` is the machine's answer.
	Nothing is ever dropped: a person removed from the machine keeps their row,
	because their past punches still name that user id.
	"""
	first_read = not known
	rows = {uid: dict(row) for uid, row in known.items()}
	present = set()

	for user in read:
		uid = user["device_user"]
		present.add(uid)
		row = rows.get(uid)
		if row is None:
			rows[uid] = {
				"device_user": uid,
				"name": user.get("name") or "",
				"admin": int(bool(user.get("admin"))),
				"on_device": 1,
				"first_seen": now,
				"enrolled_at": None if first_read else now,
				"removed_at": None,
				"sent": None,
			}
			continue
		row["name"] = user.get("name") or ""
		row["admin"] = int(bool(user.get("admin")))
		if not row["on_device"]:
			# Back after being removed. That is an enrolment, and it has a moment.
			row.update(on_device=1, enrolled_at=now, removed_at=None)

	for uid, row in rows.items():
		if uid not in present and row["on_device"]:
			row.update(on_device=0, removed_at=now)

	return rows


def looks_like_a_failed_read(known, read):
	"""A machine that had people and answers with nobody has not lost everybody.

	Firmware that times out half way through a user list can answer with an empty
	one. Taken at its word, that marks every person on the gate removed — and the
	safe direction is the one that leaves them enrolled until a real list says
	otherwise.
	"""
	return not read and any(row["on_device"] for row in known.values())


def employee_by_device_user(employees):
	"""`{attendance_device_id: Employee}`, leaving out a number nobody owns alone.

	The same rule as the doctype's controller: one Active match wins, a lone
	leaver is still that person, and two candidates are nobody — showing either
	would put a name against punches that may not be theirs.
	"""
	groups = {}
	for employee in employees:
		key = str(employee.get("attendance_device_id") or "").strip()
		if key:
			groups.setdefault(key, []).append(employee)

	found = {}
	for key, people in groups.items():
		active = [p for p in people if p.get("status") == "Active"]
		if len(active) == 1:
			found[key] = active[0]["name"]
		elif not active and len(people) == 1:
			found[key] = people[0]["name"]
	return found


def docname(device_id, device_user):
	# The doctype's own autoname, `format:{device_id}-{device_user_id}`. Named
	# rather than looked up, so a row can be updated without first asking the
	# site what it is called.
	return "{0}-{1}".format(device_id, device_user)


def payload(device_id, row, employees, registered):
	return {
		"device_id": device_id,
		"device_user_id": row["device_user"],
		"name_on_device": row["name"],
		"privilege": "Admin" if row["admin"] else "User",
		"employee": employees.get(row["device_user"]),
		"attendance_device": registered.get(device_id),
		"on_device": int(row["on_device"]),
		"first_seen": row["first_seen"],
		"enrolled_at": row["enrolled_at"],
		"removed_at": row["removed_at"],
	}


def fingerprint(body):
	return json.dumps(body, sort_keys=True)


# ---------------------------------------------------------------- store ---


class EnrolmentStore:
	"""The last user list read off each machine, beside the punch queue."""

	def __init__(self, path):
		self._path = path
		self._lock = threading.Lock()
		with self._connect() as db:
			db.executescript(SCHEMA)

	@contextmanager
	def _connect(self):
		db = sqlite3.connect(self._path, timeout=30)
		db.row_factory = sqlite3.Row
		try:
			yield db
			db.commit()
		finally:
			db.close()

	def known(self, device_id):
		with self._connect() as db:
			found = db.execute(
				"SELECT {0} FROM device_user WHERE device_id = ?".format(", ".join(COLUMNS)), (device_id,)
			).fetchall()
		return {row["device_user"]: dict(row) for row in found}

	def save(self, device_id, rows):
		with self._lock, self._connect() as db:
			db.executemany(
				"""
				INSERT INTO device_user (device_id, device_user, name, admin, on_device, first_seen, enrolled_at, removed_at, sent)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (device_id, device_user) DO UPDATE SET
					name = excluded.name, admin = excluded.admin, on_device = excluded.on_device,
					enrolled_at = excluded.enrolled_at, removed_at = excluded.removed_at
				""",
				[
					(device_id, r["device_user"], r["name"], r["admin"], r["on_device"], r["first_seen"],
					 r["enrolled_at"], r["removed_at"], r["sent"])
					for r in rows.values()
				],
			)

	def rows(self):
		# Somebody enrolled this morning first, the backlog from a machine's
		# first read after: with a per-pass limit, the order is who waits.
		with self._connect() as db:
			found = db.execute(
				"SELECT device_id, {0} FROM device_user ORDER BY device_id, enrolled_at IS NULL, first_seen, device_user".format(
					", ".join(COLUMNS)
				)
			).fetchall()
		return [dict(row) for row in found]

	def mark_sent(self, device_id, device_user, sent):
		with self._lock, self._connect() as db:
			db.execute(
				"UPDATE device_user SET sent = ? WHERE device_id = ? AND device_user = ?",
				(sent, device_id, device_user),
			)


# ----------------------------------------------------------------- site ---


class NotOnSite(Exception):
	"""The doctype is not on the site yet. Nothing to do until it is."""


class Unavailable(Exception):
	"""The site could not be asked. Try again next pass."""


class EnrolmentSite:
	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._base = base_url.rstrip("/")
		self._timeout = timeout
		self._session = requests.Session()
		self._session.headers.update(
			{"Authorization": "token {0}:{1}".format(api_key, api_secret), "Accept": "application/json"}
		)

	def _get_list(self, doctype, fields, filters=None):
		params = {"fields": json.dumps(fields), "limit_page_length": 0}
		if filters:
			params["filters"] = json.dumps(filters)
		try:
			response = self._session.get(self._base + "/api/resource/" + doctype, params=params, timeout=self._timeout)
		except requests.RequestException as exc:
			raise Unavailable(exc) from exc
		if response.status_code != 200:
			raise Unavailable("{0} list answered HTTP {1}".format(doctype, response.status_code))
		return response.json().get("data") or []

	def employees(self):
		return self._get_list(
			"Employee", ["name", "attendance_device_id", "status"], [["attendance_device_id", "is", "set"]]
		)

	def registered(self):
		"""`{device_id: Attendance Device}`. Empty when the list cannot be read.

		Not a reason to stop: a person with no machine record above them is still
		a person on a machine, and the row is still worth having.
		"""
		try:
			return {row["device_id"]: row["name"] for row in self._get_list("Attendance Device", ["name", "device_id"])}
		except Unavailable:
			return {}

	def write(self, name, body, exists):
		"""Create or update one row. Raises NotOnSite, or Unavailable with the site's reason."""
		url = self._base + "/api/resource/" + DOCTYPE
		try:
			if exists:
				response = self._session.put(url + "/" + quote(name, safe=""), json=body, timeout=self._timeout)
				if response.status_code == 200:
					return
				# Deleted on the site since it was sent. Made again rather than lost.
				if response.status_code != 404:
					raise Unavailable(_reason(response))
			response = self._session.post(url, json=body, timeout=self._timeout)
			if response.status_code == 200:
				return
			if _doctype_missing(response):
				raise NotOnSite()
			if response.status_code == 409 or "DuplicateEntryError" in (response.text or ""):
				# Already there: this PC's store is newer than the site knows, or
				# a second bridge reads the same machine.
				response = self._session.put(url + "/" + quote(name, safe=""), json=body, timeout=self._timeout)
				if response.status_code == 200:
					return
			raise Unavailable(_reason(response))
		except requests.RequestException as exc:
			raise Unavailable(exc) from exc


def _doctype_missing(response):
	# Not only a 404. Frappe Cloud answered a POST to a doctype it has never
	# heard of, on 15 Sep 2026, with a 500 and "No module named
	# 'frappe.core.doctype.attendance_device_user'" — it went looking for a
	# standard doctype's controller. Read as an ordinary failure, that was three
	# tracebacks in the log every five minutes about something nobody can fix
	# from this PC.
	if response.status_code == 404:
		return True
	text = response.text or ""
	return "No module named" in text and "attendance_device_user" in text


def _reason(response):
	return "HTTP {0}: {1}".format(response.status_code, (response.text or "")[:200])


# ----------------------------------------------------------------- pass ---


def sync_enrolments(devices, store, site, now=None, limit=MAX_WRITES_PER_PASS):
	"""Read every machine's users, and send ERPNext what changed. Returns (sent, waiting)."""
	now = now or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

	for device in devices:
		try:
			read = device.users()
		except Exception as exc:
			log.warning("%s: could not list its users: %s", device.name, exc)
			continue
		known = store.known(device.name)
		if looks_like_a_failed_read(known, read):
			log.warning("%s: listed no users at all; not taken as everybody leaving", device.name)
			continue
		rows = reconcile(known, read, now)
		for uid in sorted(set(rows) - set(known)):
			if rows[uid]["enrolled_at"]:
				log.info("%s: user %s (%s) enrolled", device.name, uid, rows[uid]["name"] or "no name")
		for uid, row in rows.items():
			if uid in known and known[uid]["on_device"] and not row["on_device"]:
				log.info("%s: user %s (%s) removed", device.name, uid, row["name"] or "no name")
		store.save(device.name, rows)

	try:
		employees = employee_by_device_user(site.employees())
	except Unavailable as exc:
		log.warning("enrolments not sent this pass: %s", exc)
		return 0, None
	registered = site.registered()

	sent = waiting = failures = 0
	for row in store.rows():
		body = payload(row["device_id"], row, employees, registered)
		wanted = fingerprint(body)
		if wanted == row["sent"]:
			continue
		if sent >= limit or failures >= 3:
			waiting += 1
			continue
		try:
			site.write(docname(row["device_id"], row["device_user"]), body, exists=row["sent"] is not None)
		except NotOnSite:
			log.warning(
				"ERPNext has no %s doctype yet; enrolments are kept on this PC and go once it exists", DOCTYPE
			)
			return sent, None
		except Unavailable as exc:
			log.warning("%s user %s not sent: %s", row["device_id"], row["device_user"], exc)
			failures += 1
			waiting += 1
			continue
		store.mark_sent(row["device_id"], row["device_user"], wanted)
		sent += 1

	if sent or waiting:
		log.info("enrolments: %d sent to ERPNext, %d waiting", sent, waiting)
	return sent, waiting
