"""The ADMS server: punches pushed by the machines, rather than pulled from them.

ZKTeco calls this ADMS, eSSL calls it the *cloud server* or *push SDK*, and the
menu on a K90+ID calls it **Comm → Cloud Server Setting**. Whatever the name, it
is the same arrangement: the device opens an HTTP connection *outwards* to an
address you give it and posts its attendance as it happens, instead of sitting
there waiting to be read.

## Why have both this and the ZK reader

They fail differently, and attendance is payroll.

Polling needs the bridge to reach the machine: same LAN or a VPN, the right
port open, the comm key right, and the machine willing to be interrupted. Push
needs only that the machine can reach *one* address — which is the arrangement
that survives a factory network somebody re-addressed on a Sunday, and the only
one that works at all when the machine is behind a router nobody here controls.

Push is also near-real-time (`Realtime=1`), where a poll is only ever as fresh
as its interval.

What push does **not** give you is a way to ask. If the device has been off, or
the server has, nothing catches up until the device decides to retry. The ZK
reader can be pointed at a date and told to fetch. So the two are kept together
on purpose: the same queue, the same sink, the same de-duplication, and either
one alone is enough to pay people.

## The rule that decides everything else here

**Answer `OK` only for records that are safely in SQLite.** In this protocol an
answer other than `OK` means "I did not take those, send them again", and the
device keeps them. That is the whole safety net: a server that says OK and then
fails to write has destroyed the last copy, exactly as `clear_attendance()`
does on the pull side. So the queue write happens first and its result decides
the answer.

**And never send a command that clears the device.** `CLEAR LOG`, `CLEAR DATA`
and `CLEAR PHOTO` are all reachable through `/iclock/getrequest`, and this
server never issues any of them — see `getrequest` below. Same reason as
`device.py`: the machine's own memory is the last copy of a punch that failed
to deliver.

## What the protocol actually is

Undocumented by the manufacturer and consistent enough in practice. Five paths:

| | |
|---|---|
| `GET  /iclock/cdata?SN=…&options=all` | handshake. The server answers with the options block below |
| `POST /iclock/cdata?SN=…&table=ATTLOG` | punches, one per line, tab separated |
| `POST /iclock/cdata?SN=…&table=OPERLOG` | the device's own operations log — users added, door opened |
| `GET  /iclock/getrequest?SN=…` | "anything for me?" — answered `OK`, always |
| `POST /iclock/devicecmd?SN=…` | the result of a command. Nothing is ever sent, so this only ever logs |

Older firmware also posts `/iclock/fdata` (fingerprint templates) and pings
`/iclock/ping`. Both are answered so the device does not treat the server as
broken; neither is stored — a fingerprint template is biometric data with
nowhere to go here.
"""

import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

log = logging.getLogger(__name__)

#: What a device sends in the third column of an ATTLOG line.
#:
#: 0 and 1 are the two that mean a direction. The rest are the break and
#: overtime keys, which are not attendance and are recorded without one.
STATUS_IN = "0"
STATUS_OUT = "1"

#: Where the punches for a serial nobody has configured are parked.
#:
#: **Not dropped, and not given a real device id.** A punch from an
#: unregistered machine is still a real person who turned up, and refusing
#: somebody who did turn up is the expensive mistake (CLAUDE.md §4). But
#: inventing a `device_id` for it would be worse than losing it: an id that
#: happens to start with the trusted prefix would let an unknown machine's
#: punches skip the geofence, which is the one thing the prefix exists to stop.
#:
#: So they queue under a name that cannot pass any check, stay undelivered and
#: visible, and start delivering the moment the serial is named in the config —
#: `main.drain` resolves this prefix back to a serial on every pass.
UNKNOWN_PREFIX = "SN:"

#: The path the device is pointed at. Fixed by the firmware, not by us.
ROOT = "/iclock"


def unknown_device_id(serial):
	return UNKNOWN_PREFIX + serial


def serial_of_unknown(device_id):
	"""The serial back out of a parked row's device id, or None."""
	if device_id and device_id.startswith(UNKNOWN_PREFIX):
		return device_id[len(UNKNOWN_PREFIX):]
	return None


# ------------------------------------------------------------------ parsing ---


def log_type_for(status, report_direction):
	"""Direction, or None when this machine's is not to be believed.

	**`report_direction` is off by default and that is the important part.** A
	ZK machine that has not been set up for in/out does not say so — it sends
	`0` on every punch, which reads as an unbroken run of check-ins. Trusting
	that turns a day of ordinary work into a day nobody left.

	`device.py` makes the same argument about the pull side and the two share
	this setting: a guessed direction is worse than none, because a shift's
	pairing mode can alternate IN/OUT correctly from nothing and cannot recover
	from being told the wrong thing confidently.
	"""
	if not report_direction:
		return None
	if status == STATUS_IN:
		return "IN"
	if status == STATUS_OUT:
		return "OUT"
	return None


def parse_attlog(body, report_direction=False):
	"""The ATTLOG body, as a list of punches.

	Tab separated, one record per line:

	    PIN  <tab>  YYYY-MM-DD HH:MM:SS  <tab>  status  <tab>  verify  <tab>  …

	Everything past the fourth column is workcode and reserved fields that no
	machine here fills in.

	**A malformed line is skipped and logged, not raised.** One bad record in a
	post of two hundred must not cost the other hundred and ninety-nine: the
	answer to the whole post would be an error, the device would send them all
	again, and the same line would break it again — forever, with the backlog
	growing behind it.

	The time is the *device's own clock*, and nothing here corrects it. A gate
	running eight minutes fast makes everybody there eight minutes late; see
	`docs/DEVICES.md`.
	"""
	punches = []
	for line in (body or "").replace("\r\n", "\n").split("\n"):
		line = line.strip("\r\n")
		if not line.strip():
			continue

		parts = line.split("\t")
		if len(parts) < 2:
			log.warning("ADMS: ignoring a line with no timestamp: %r", line[:120])
			continue

		pin = parts[0].strip()
		stamp = parts[1].strip()
		status = parts[2].strip() if len(parts) > 2 else ""

		if not pin or not _looks_like_a_time(stamp):
			log.warning("ADMS: ignoring a line that is not a punch: %r", line[:120])
			continue

		punches.append(
			{
				"device_user": pin,
				# Seconds are added when the machine leaves them off, because
				# the queue's UNIQUE constraint is on the exact string and two
				# shapes of the same minute would both insert.
				"punched_at": stamp if len(stamp) > 16 else stamp + ":00",
				"log_type": log_type_for(status, report_direction),
				"status": status,
			}
		)
	return punches


def _looks_like_a_time(text):
	"""`YYYY-MM-DD HH:MM` at least. Cheap, and it only has to reject rubbish."""
	return (
		len(text) >= 16
		and text[4] == "-"
		and text[7] == "-"
		and text[10] in " T"
		and text[13] == ":"
	)


def option_block(serial, stamp, delay=10, error_delay=30, timezone="5.5", realtime=True):
	"""The handshake answer, which is also how the device is configured.

	It is a plain-text block of `key=value` lines, and the device applies it and
	keeps it. Two of these lines matter more than they look:

	`TransFlag` says which tables the device may push. The ten positions are
	attendance, operations, attendance photo, new user, changed user,
	fingerprint, changed fingerprint, user photo, face, workcode. **Only the
	first two are on here.** A device pushing face templates and user
	photographs is a device sending biometric data to a server that has nowhere
	to put it and no business holding it.

	`Stamp` is where the device resumes from. It is opaque — firmware disagrees
	about whether it counts seconds, records or nothing at all — so it is
	stored and echoed rather than interpreted. Losing it costs a re-push, which
	the queue de-duplicates; it is not a correctness mechanism.
	"""
	lines = [
		"GET OPTION FROM: {0}".format(serial),
		"Stamp={0}".format(stamp),
		"OpStamp={0}".format(stamp),
		"ErrorDelay={0}".format(error_delay),
		"Delay={0}".format(delay),
		# Push all day. A window here is a window in which attendance is not
		# arriving, and the reason to have a window at all — bandwidth — does
		# not apply to a few hundred bytes a day.
		"TransTimes=00:00;23:59",
		"TransInterval=1",
		"TransFlag=1100000000",
		"TimeZone={0}".format(timezone),
		"Realtime={0}".format(1 if realtime else 0),
		# The device's own "encryption" is a fixed scramble with a published
		# key. It is not a security boundary and turning it on only makes the
		# body harder to read in a packet capture when something is wrong.
		"Encrypt=0",
	]
	return "\n".join(lines) + "\n"


def parse_devicecmd(body):
	"""`ID=1&Return=0&CMD=DATA` — the result of a command. Nothing sends any."""
	out = {}
	for part in (body or "").replace("\n", "&").split("&"):
		if "=" in part:
			key, _, value = part.partition("=")
			out[key.strip()] = value.strip()
	return out


# ------------------------------------------------------------------- server ---


class AdmsServer(ThreadingHTTPServer):
	"""Threaded, because a device that is kept waiting retries the whole post.

	`allow_reuse_address` so a restart does not sit in TIME_WAIT for a minute
	with every machine on site failing to deliver.
	"""

	allow_reuse_address = True
	daemon_threads = True

	def __init__(self, address, handler, *, queue, devices, options, wake=None):
		super().__init__(address, handler)
		self.queue = queue
		# serial -> {"name": device_id, "report_direction": bool}
		self.devices = devices
		self.options = options
		self.seen = {}
		# Set when a punch is queued, so the delivery loop can stop sleeping.
		#
		# **This is what makes push actually mean push.** Without it a punch
		# arrives in milliseconds and then waits up to `poll_seconds` — five
		# minutes by default — for the loop to come round, which throws away the
		# one thing this route has over reading the machine. It matters most on
		# a site with no pollable devices at all, where that sleep is pacing
		# nothing else.
		self.wake = wake or threading.Event()


class AdmsHandler(BaseHTTPRequestHandler):
	# The device sends HTTP/1.1 and expects a length-delimited answer.
	protocol_version = "HTTP/1.1"
	server_version = "MannaADMS/1.0"

	# ------------------------------------------------------------ plumbing ---

	def log_message(self, fmt, *args):
		"""Into the bridge's log, at debug, instead of onto stderr.

		`BaseHTTPRequestHandler` prints a line per request to stderr by default.
		On a box taking a punch every few seconds that is a log nobody reads and
		a disk nobody watches.
		"""
		log.debug("ADMS %s - %s", self.address_string(), fmt % args)

	def _reply(self, text, status=200):
		body = text.encode("utf-8")
		self.send_response(status)
		self.send_header("Content-Type", "text/plain; charset=utf-8")
		self.send_header("Content-Length", str(len(body)))
		self.end_headers()
		self.wfile.write(body)

	def _query(self):
		return {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}

	def _body(self):
		length = int(self.headers.get("Content-Length") or 0)
		if not length:
			return ""
		raw = self.rfile.read(length)
		# Some firmware sends GB2312 for names in OPERLOG. Attendance is ASCII,
		# so a decode failure must never lose the punches around it.
		for encoding in ("utf-8", "gb18030", "latin-1"):
			try:
				return raw.decode(encoding)
			except UnicodeDecodeError:
				continue
		return raw.decode("utf-8", "replace")

	def _device(self, serial):
		return self.server.devices.get(serial)

	# --------------------------------------------------------------- routes ---

	# `do_GET` / `do_POST` are the names `BaseHTTPRequestHandler` dispatches on.
	def do_GET(self):
		path = urlparse(self.path).path.rstrip("/")
		query = self._query()
		serial = (query.get("SN") or "").strip()

		if path == ROOT + "/cdata":
			return self._handshake(serial, query)
		if path == ROOT + "/getrequest":
			return self._getrequest(serial)
		if path in (ROOT + "/ping", ROOT + "/devicecmd"):
			return self._reply("OK")
		return self._reply("Not an ADMS endpoint\n", status=404)

	def do_POST(self):
		path = urlparse(self.path).path.rstrip("/")
		query = self._query()
		serial = (query.get("SN") or "").strip()
		body = self._body()

		if path == ROOT + "/cdata":
			table = (query.get("table") or "").upper()
			if table == "ATTLOG":
				return self._attlog(serial, query, body)
			# OPERLOG, ATTPHOTO, and whatever a firmware invents. Acknowledged so
			# the device does not treat the server as broken, and dropped: none
			# of it is attendance, and an attendance photo is biometric data
			# this box has no business storing.
			log.debug("ADMS %s: %s table ignored (%d bytes)", serial, table or "?", len(body))
			return self._reply("OK")
		if path == ROOT + "/devicecmd":
			result = parse_devicecmd(body)
			log.info("ADMS %s: command result %s", serial, result)
			return self._reply("OK")
		if path == ROOT + "/fdata":
			# Fingerprint templates. Answered, never stored.
			return self._reply("OK")
		return self._reply("Not an ADMS endpoint\n", status=404)

	# -------------------------------------------------------------- handlers ---

	def _handshake(self, serial, query):
		if not serial:
			return self._reply("SN missing\n", status=400)

		known = self._device(serial)
		if known:
			log.info("ADMS: %s (%s) said hello", known["name"], serial)
		else:
			# Said every time, not once: this is the line that tells somebody
			# why a machine they installed this morning is not producing
			# attendance, and it has to be findable in the log.
			log.error(
				"ADMS: serial %s is not in config.toml. Its punches will be queued and NOT "
				"delivered. Add:\n\n  [[device]]\n  name = \"BIO-…\"\n  serial = \"%s\"\n",
				serial, serial,
			)

		stamp = self.server.queue.last_seen(_stamp_key(serial)) or self.server.options["first_stamp"]
		self.server.seen[serial] = time.time()
		return self._reply(option_block(serial, stamp, **self.server.options["block"]))

	def _getrequest(self, serial):
		"""Always `OK`. This server issues no commands, and that is deliberate.

		The commands available here include `CLEAR LOG`, `CLEAR DATA` and
		`CLEAR PHOTO`, and every worked example on the internet reaches for one
		of them to keep the device tidy. The device's memory is the last copy of
		a punch that failed to deliver — the same argument `device.py` makes
		about `clear_attendance()`, one protocol along.

		If commands are ever wanted — enrolling a user from ERPNext, setting the
		clock — they belong behind something that cannot express a clear.
		"""
		self.server.seen[serial] = time.time()
		return self._reply("OK")

	def _attlog(self, serial, query, body):
		"""Punches. Persisted first; the answer says what was actually taken.

		A non-`OK` answer means "send them again", and the device keeps them —
		so the queue write decides the reply rather than the other way round.
		A server that says OK and then fails to write has destroyed the last
		copy.
		"""
		device = self._device(serial)
		device_id = device["name"] if device else unknown_device_id(serial)
		direction = bool(device and device["report_direction"])

		punches = parse_attlog(body, report_direction=direction)
		if not punches:
			# An empty or unreadable post is still a post the device made. `OK`
			# rather than an error: there is nothing here to send again, and
			# refusing it would put the device in a retry loop over nothing.
			return self._reply("OK: 0")

		new = 0
		try:
			for punch in punches:
				if self.server.queue.offer(
					device_id, punch["device_user"], punch["punched_at"], punch["log_type"]
				):
					new += 1
			newest = max(p["punched_at"] for p in punches)
		except Exception:
			# The disk is full, or SQLite is locked by something that should not
			# have it. Say so, and refuse the records so the device keeps them.
			log.exception("ADMS %s: could not queue %d punch(es)", serial, len(punches))
			return self._reply("ERROR: not stored\n", status=500)

		stamp = (query.get("Stamp") or "").strip()
		if stamp:
			self.server.queue.set_last_seen(_stamp_key(serial), stamp)
		self.server.seen[serial] = time.time()

		# Only when something was actually new. A device re-sending a batch it
		# did not get an OK for would otherwise wake the loop for work that is
		# already done.
		if new:
			self.server.wake.set()

		log.info(
			"ADMS %s: %d punch(es), %d new, newest %s%s",
			device_id, len(punches), new, newest,
			"" if device else "  — NOT DELIVERABLE, serial not in config",
		)
		# The count of records accepted, which is what the firmware reads.
		return self._reply("OK: {0}".format(len(punches)))


def _stamp_key(serial):
	"""Where a serial's push cursor lives in the queue's `cursor` table.

	Prefixed so it cannot collide with a device name, which is what the pull
	side stores there.
	"""
	return "ADMS-STAMP:" + serial


def serve(config, queue, wake=None):
	"""Build the server. The caller decides which thread it runs in.

	`wake` is an `Event` the delivery loop waits on, so a pushed punch is
	delivered in seconds rather than at the next poll.
	"""
	devices = {
		d["serial"]: {"name": d["name"], "report_direction": d["report_direction"]}
		for d in config.devices
		if d.get("serial")
	}
	options = {
		"first_stamp": config.adms_first_stamp,
		"block": {
			"delay": config.adms_delay,
			"timezone": config.adms_timezone,
		},
	}
	server = AdmsServer(
		(config.adms_host, config.adms_port), AdmsHandler,
		queue=queue, devices=devices, options=options, wake=wake,
	)
	log.info(
		"ADMS listening on %s:%d for %d registered serial(s) — point the machines at "
		"http://<this box>:%d/iclock/",
		config.adms_host or "0.0.0.0", config.adms_port, len(devices), config.adms_port,
	)
	if not devices:
		log.warning(
			"No [[device]] has a serial, so every machine that connects will be unknown and "
			"its punches will queue undelivered. The serial is on the label and on the "
			"device's own Menu -> System Info."
		)
	return server
