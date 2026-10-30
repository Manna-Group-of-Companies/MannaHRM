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
#: and storing it would ask HR to make an Employee for every pin that left
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


def endpoint_of(path):
	"""`cdata`, `getrequest`, … from what follows `/iclock/`.

	Some firmware — the Manna Treads face machine, ZAM70 Ver3.3.12, found 30
	October 2026 — asks for `cdata.aspx` and `getrequest.aspx`. Answered as an
	unknown path, its hello got a bare `OK` instead of the options block, and it
	sat with a warning on its screen and never posted a punch.
	"""
	endpoint = (path or "").strip("/")
	return endpoint[: -len(".aspx")] if endpoint.lower().endswith(".aspx") else endpoint


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


#: IST in minutes. Never "5.5": firmware that sets its clock from the server —
#: Manna Treads (ZAM70) and Hi-Tech Gate, 30 October 2026 — reads that as 5 and
#: runs exactly 30 minutes behind, so every arrival is stamped half an hour
#: early, nobody is late, and putting the clock right by hand is undone at the
#: next hello. A machine that keeps its own clock ignores the line either way.
#: The bridge's per-machine `timezone` exists for the same trap.
TIMEZONE = "330"

#: Machines told no time zone at all, so they keep their own clock as MRP Gate
#: 1 does. Their firmware drops the half hour from "5.5" and from "330" alike,
#: so any zone sent sets them exactly 30 minutes behind at every hello, and a
#: clock put right at the machine lasted only until the next one (HR, 30
#: October 2026). The clock is then whatever is set at the machine.
OWN_CLOCK = frozenset({"NYU7262002047", "CGKK211162173"})


def timezone_for(serial):
	"""The `TimeZone` a machine is told, or None for one that keeps its own clock."""
	return None if serial in OWN_CLOCK else TIMEZONE


def option_block(serial, stamp, delay=10, error_delay=30, timezone=TIMEZONE):
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
		*(["TimeZone={0}".format(timezone)] if timezone else []),
		"Realtime=1",
		# A fixed scramble with a published key. HTTPS is the protection.
		"Encrypt=0",
	]
	return "\n".join(lines) + "\n"


# ------------------------------------------------------------ new on machine ---

#: Why a punch waits when no Employee carries its pin. Nobody is made an
#: Employee from a machine any more (HR, 27 October 2026): HR is told once per
#: pin per machine, and makes the person from Onboarding. The dashboard finds
#: these punches by this text, so it is a constant and not a sentence to reword.
NEW_ON_MACHINE = "New on the machine: no Employee has this Attendance Device ID"


def split_name(name_on_device):
	"""`(first_name, last_name)` from the machine's one name box, blank if it is."""
	words = str(name_on_device or "").split()
	if not words:
		return "", ""
	return words[0], " ".join(words[1:])


def new_people(punches):
	"""One row per machine and pin, from the punches waiting on NEW_ON_MACHINE.

	`punches` are `{"attendance_device", "device_user_id", "punched_at"}`. The
	first punch is the earliest date anybody can say the person was at work,
	which is why Create Employee is offered it as the date of joining.
	"""
	rows = {}
	for p in punches:
		key = (p["attendance_device"], str(p["device_user_id"]))
		at = str(p["punched_at"])[:19]
		row = rows.setdefault(key, {"attendance_device": key[0], "pin": key[1],
		                            "punches": 0, "first": at, "last": at})
		row["punches"] += 1
		row["first"] = min(row["first"], at)
		row["last"] = max(row["last"], at)
	return sorted(rows.values(), key=lambda r: r["first"])


def choose_employee(rows, company):
	"""`(employee, reason)` for the Employees carrying one pin.

	`rows` are `{"name", "status", "company"}`. Exactly one of the pair is set:
	an employee to deliver to, or why the punch waits. An empty list is
	`(None, None)` — nobody carries the pin, and HR is asked to make the person.

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


# ------------------------------------------------------------ closing shifts ---

#: How far back a machine counts as serving a shift: it delivered a punch on it
#: within this many days. A machine retired last month holds nothing open.
SERVES_DAYS = 14


def sync_point(current, newest, serving_seen):
	"""How far one shift's `last_sync_of_checkin` may move, or None to leave it.

	**hrms marks no Attendance without this field**, and marks a shift only once
	its end is before it — the bridge moved it (bridge/mannabridge/sink.py) and
	nothing else on the site does. Moved to the shift's newest punch, never to
	now: past now would close a shift while people are still on the floor.

	**Held at the quietest machine that serves the shift** (`serving_seen`, each
	machine's `last_seen`, None for one that has never pushed). A machine posts
	each punch as it happens and is answered only once it is stored, so all it
	held before its last contact is on the site; after that it may hold punches
	nobody has seen. Closing past it marks somebody absent who came in — the
	expensive mistake (CLAUDE.md §4). A machine that has never pushed holds the
	shift altogether. Forward only.
	"""
	if not newest:
		return None
	limit = str(newest)[:19]
	for seen in serving_seen or ():
		if not seen:
			return None
		limit = min(limit, str(seen)[:19])
	if current and str(current)[:19] >= limit:
		return None
	return limit
