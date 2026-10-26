"""ADMS on the site: what the machines say, and what is said back. Pure.

The machines are pointed at the site itself (Comm → Cloud Server Setting →
`mannarubber.m.frappe.cloud`, 443, HTTPS) and push each punch as it happens.
The parts that touch a site are in `adms_site.py`; everything here can be
argued about without one, which is why it holds no `import frappe`.

Ported from `bridge/mannabridge/adms.py`, where the same protocol ran on the
gate PCs. Its docstring is the long argument; the rules that survive the move:

- **`OK` only for what is stored.** Any other answer means "send those again"
  and the machine keeps them. `adms_site` writes the raw punch first and lets
  that write decide the reply — a server that says OK and then fails to store
  has destroyed the last copy.
- **Nothing that clears the machine, ever.** `getrequest` answers `OK` and
  nothing else, because `CLEAR LOG` lives on that same path.
- **No direction unless the machine is known to report one.** A ZK machine
  never set up for in/out sends `0` on every punch, which reads as a day nobody
  left. `Attendance Device` has no such setting, so none is believed here.
"""

#: Where an unregistered machine's punches are parked, as their `device_id`.
#:
#: Never `BIO-` + serial. Anybody can post to `/iclock/cdata` with any serial;
#: a device id that carried the trusted prefix would make their punches skip
#: the geofence, which is the one thing the prefix exists to stop. Under this
#: name they are stored, visible and undelivered, and are delivered the moment
#: HR puts the serial on an `Attendance Device`.
UNKNOWN_PREFIX = "SN:"

#: A first push is everything the machine has ever held — years of it. Older
#: than this is acknowledged and not stored: the machine keeps its own copy,
#: and storing it would make a placeholder Employee for every pin that left
#: long ago. Forty days is a payroll month and the week it is argued over.
STORE_DAYS = 40

#: `Pri=` on a USER line. 14 opens the machine's menu, which includes deleting
#: its punch log.
ADMIN_PRIVILEGE = "14"

#: The ten `TransFlag` positions are attendance, operations, attendance photo,
#: new user, changed user, fingerprint, changed fingerprint, user photo, face,
#: workcode. Punches, and the user list so a pin has a name. No biometrics and
#: no photographs: a server with nowhere to put them has no business taking them.
TRANS_FLAG = "1101100000"


def unknown_device_id(serial):
	return UNKNOWN_PREFIX + serial


# ------------------------------------------------------------------ bodies ---


def decode(raw):
	"""Bytes from the machine, as text.

	Some firmware sends GB2312 for names. Attendance is ASCII, so a decode
	failure must never lose the punches around it.
	"""
	if isinstance(raw, str):
		return raw
	for encoding in ("utf-8", "gb18030", "latin-1"):
		try:
			return raw.decode(encoding)
		except UnicodeDecodeError:
			continue
	return raw.decode("utf-8", "replace")


def _lines(body):
	for line in (body or "").replace("\r\n", "\n").split("\n"):
		if line.strip():
			yield line.strip("\r\n")


def looks_like_a_time(text):
	"""`YYYY-MM-DD HH:MM` at least. Cheap, and it only has to reject rubbish."""
	return (
		len(text) >= 16
		and text[4] == "-"
		and text[7] == "-"
		and text[10] in " T"
		and text[13] == ":"
	)


def parse_attlog(body):
	"""`table=ATTLOG`, as a list of punches.

	    PIN <tab> YYYY-MM-DD HH:MM:SS <tab> status <tab> verify <tab> …

	No `ATTLOG` word at the front — that is the pull SDK's shape, not the
	push one's.

	**A malformed line is skipped, not raised.** One bad record in a post of
	two hundred must not cost the other hundred and ninety-nine: the reply to
	the whole post would be an error, the machine would send them all again,
	and the same line would break it again, forever.
	"""
	punches = []
	for line in _lines(body):
		parts = line.split("\t")
		if len(parts) < 2:
			continue
		pin = parts[0].strip()
		stamp = parts[1].strip().replace("T", " ")
		if not pin or not looks_like_a_time(stamp):
			continue
		punches.append(
			{
				"device_user": pin,
				# Seconds added when the machine leaves them off, so two shapes of
				# one minute are one punch rather than two.
				"punched_at": stamp[:19] if len(stamp) > 16 else stamp + ":00",
				"status": parts[2].strip() if len(parts) > 2 else "",
			}
		)
	return punches


def parse_users(body):
	"""USER lines from `table=OPERLOG` or `table=USERINFO`.

	    USER PIN=104 <tab> Name=Rahul Kumar <tab> Pri=0 <tab> Passwd= <tab> Card= …

	Only the pin, the name and whether they are an admin are kept. `Passwd`
	and `Card` arrive in the clear on the same line and are dropped here, so
	nothing downstream can store them by accident. OPLOG and FP lines in the
	same post are operations and fingerprint templates, and are not users.
	"""
	users = []
	for line in _lines(body):
		head, _, rest = line.partition(" ")
		if head.strip().upper() != "USER":
			continue
		fields = {}
		for part in rest.split("\t"):
			key, sep, value = part.partition("=")
			if sep:
				fields[key.strip().upper()] = value.strip()
		pin = fields.get("PIN", "")
		if not pin:
			continue
		users.append(
			{
				"device_user": pin,
				"name": fields.get("NAME", ""),
				"admin": fields.get("PRI", "") == ADMIN_PRIVILEGE,
			}
		)
	return users


def worth_storing(punched_at, cutoff):
	"""False for what is older than the first-push cutoff. Strings compare."""
	return punched_at >= cutoff


def punch_key(serial, device_user, punched_at):
	"""The stored punch's name, so the second copy of a punch collides.

	The machine re-sends whatever it did not get an OK for, and reconnects
	re-send more. A name made from what the punch *is* turns every repeat into
	a duplicate-key error on insert, which is the cheapest de-duplication
	there is and the only one with no race in it.
	"""
	digits = "".join(ch for ch in punched_at if ch.isdigit())
	return "{0}-{1}-{2}".format(serial, device_user, digits)


# --------------------------------------------------------------- handshake ---


def option_block(serial, stamp, delay=10, error_delay=30, timezone="5.5"):
	"""The handshake answer, which is also how the machine is configured.

	The same block the bridge sent, so a machine moved from the bridge to the
	site is configured exactly as it was. `Stamp` is the machine's own resume
	point, opaque and echoed; losing it costs a re-push, which `punch_key`
	absorbs.
	"""
	lines = [
		"GET OPTION FROM: {0}".format(serial),
		"Stamp={0}".format(stamp),
		"OpStamp={0}".format(stamp),
		"ErrorDelay={0}".format(error_delay),
		"Delay={0}".format(delay),
		# All day. A push window is a window in which attendance is not arriving.
		"TransTimes=00:00;23:59",
		"TransInterval=1",
		"TransFlag={0}".format(TRANS_FLAG),
		"TimeZone={0}".format(timezone),
		"Realtime=1",
		# A fixed scramble with a published key. HTTPS is the protection.
		"Encrypt=0",
	]
	return "\n".join(lines) + "\n"


# ------------------------------------------------------- placeholder people ---

#: Never a real birth date, and what the dashboard looks for to say "needs
#: details" if the flag is lost. Same values as the bridge's `autoenrol.py`.
PLACEHOLDER_BIRTH = "2000-01-01"
PLACEHOLDER_GENDERS = ("Prefer not to say", "Other")
NO_NAME = "Device user"


def split_name(name_on_device, device_user):
	"""`(first_name, last_name)` from the machine's one name box."""
	words = str(name_on_device or "").split()
	if not words:
		return NO_NAME, str(device_user)
	return words[0], " ".join(words[1:])


def pick_gender(available):
	have = set(available or ())
	for g in PLACEHOLDER_GENDERS:
		if g in have:
			return g
	return None


def employee_doc(device_user, name_on_device, company, first_punch, gender):
	"""The Employee for a pin that punches and is on no record.

	Joined on the day of the punch — the earliest date anybody can say they
	were at work — and Active, because hrms refuses a checkin for anybody who
	is not. The gender and birth date are placeholders and say so through
	`custom_needs_details`.
	"""
	first, last = split_name(name_on_device, device_user)
	doc = {
		"doctype": "Employee",
		"first_name": first,
		"gender": gender,
		"date_of_birth": PLACEHOLDER_BIRTH,
		"date_of_joining": str(first_punch)[:10],
		"company": company,
		"status": "Active",
		"attendance_device_id": str(device_user),
		"custom_needs_details": 1,
	}
	if last:
		doc["last_name"] = last
	return doc


def choose_employee(rows, company):
	"""`(employee, reason)` for the Employees carrying one pin.

	`rows` are `{"name", "status", "company"}`. Exactly one of the pair is set:
	an employee to deliver to, or why the punch waits. An empty list is
	`(None, None)` — nobody carries the pin, and a placeholder may be made.

	The same pin on two companies' machines is two people, so an Active match
	at the machine's own company wins. Two Active matches that still cannot be
	told apart wait: paying the punch to either is paying the wrong person.
	"""
	if not rows:
		return None, None
	active = [r for r in rows if r["status"] == "Active"]
	if len(active) == 1:
		return active[0]["name"], None
	if len(active) > 1:
		here = [r for r in active if r.get("company") == company]
		if len(here) == 1:
			return here[0]["name"], None
		return None, "{0} Active employees carry this Attendance Device ID: {1}".format(
			len(active), ", ".join(sorted(r["name"] for r in active))
		)
	# Somebody HR marked gone. Their punches wait rather than reviving them.
	return None, "{0} carries this Attendance Device ID and is {1}".format(
		rows[0]["name"], rows[0]["status"]
	)
