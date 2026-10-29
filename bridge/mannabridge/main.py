"""The bridge loop.

Read every device, persist what is new, then deliver whatever is undelivered.
Those are two separate passes on purpose: a device that is unreachable must not
stop the backlog from draining, and a site that is unreachable must not stop
devices being read.

Run it as a service — systemd on Linux, a Scheduled Task set to "run whether
logged on or not" on Windows. A bridge that only runs while somebody is logged
in will be found switched off in March.

**Punches arrive two ways and leave one.** The loop below reads the machines
that can be read; the ADMS server (`adms.py`, started by `[adms] enabled` or
`--adms`) runs on a thread for the machines that push instead. Both write into
the same SQLite queue and both are delivered by the same `drain`, so a machine
can be set up either way — or both, on a bad network — and nothing downstream
has to know which.
"""

import argparse
import logging
import threading
import time
from datetime import datetime, timedelta

from mannabridge import adms, clock, commands, failover
from mannabridge.config import load_config
from mannabridge.device import Device
from mannabridge.queue import PunchQueue
from mannabridge.autoenrol import AutoEnrol, EmployeeSite
from mannabridge.roster import EnrolmentSite, EnrolmentStore, sync_enrolments
from mannabridge.rota import Rota
from mannabridge.sink import DeliveryError, ErpSink, UnmappedEmployee

log = logging.getLogger("mannabridge")

# Give up retrying one punch after this many attempts and leave it in the queue,
# unsent and visible. Deliberately not dropped: an undeliverable punch is a
# question for a person, and deleting it destroys the evidence for the answer.
MAX_ATTEMPTS = 20

# How long to let a burst of pushed punches settle before delivering. A machine
# sends a batch as several posts a second or two apart, and waking on the first
# would mean a pass per post.
WAKE_SETTLE_SECONDS = 2


def poll_devices(devices, queue, unread=None):
	"""Read each device and persist anything new. Returns how many were new.

	`unread`, when given, collects the names of the machines that could not be
	read this pass — run_once holds the shift marker back for them.
	"""
	found = 0
	for device in devices:
		try:
			punches = device.read(since=queue.last_seen(device.name))
		except Exception as exc:
			# One dead machine must not stop the others, and must not stop the
			# backlog draining. Logged loudly; the site-side job notices the
			# silence separately.
			log.error("%s: could not be read: %s", device.name, exc)
			if unread is not None:
				unread.append(device.name)
			continue

		newest = None
		for punch in punches:
			if queue.offer(
				device.name, punch["device_user"], punch["punched_at"], punch["log_type"]
			):
				found += 1
			newest = punch["punched_at"]

		if newest:
			# Advanced only after the punches are safely in SQLite. Moving it
			# first would skip everything read in a pass that then crashed.
			queue.set_last_seen(device.name, newest)

		log.info("%s: read %d record(s)", device.name, len(punches))

	return found


def rewind_cursors(devices, queue, start):
	"""Point every readable machine at the start of `start` (`YYYY-MM-DD`), so the
	next pass reads it again. Returns the machines moved.

	**Backwards on purpose, and only from here.** `--from` never moves a cursor
	back, because on an ordinary start that would be a replay nobody asked for.
	This is somebody asking: the bridge was not running for some days — Manna
	Tyre Retreads' was installed on 16 Sep 2026, and the 1st to the 15th were
	still only on the two machines. Re-reading costs nothing it should not:
	`queue.offer` refuses a punch it already holds, so only the missing days are
	queued, and the site answers ALREADY_THERE for any it has.
	"""
	stamp = (datetime.strptime(start, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d") + " 23:59:59"
	moved = []
	for d in devices:
		queue.set_last_seen(d.name, stamp)
		moved.append(d.name)
	return moved


def _waiting_on_employee(row):
	# Both are one thing: a punch that needs a person to change a record, not a
	# line that needs time. Neither is ever retired by the attempt cap, which is
	# what makes "fix the record and they go on the next pass" true.
	error = row.get("last_error") or ""
	return "matches no Employee" in error or "not Active" in error


def drain(queue, sink, batch=500, by_serial=None, reached=None, rota=None, enrol=None):
	"""Deliver everything undelivered. Returns (sent, failed).

	`reached`, when given, is filled with `{shift: newest punch delivered on it}`
	— the shift hrms matched each delivered punch to, off the checkin it hands
	back. That, and only that, is how far this bridge may say a shift's
	checkins have arrived (ErpSink.mark_synced). A punch the site already held
	says nothing about a shift and is not counted.

	`by_serial` is the ADMS map, serial -> device id. A punch pushed by a
	machine nobody had configured is parked under `SN:<serial>` rather than
	dropped or given an invented id (see `adms.UNKNOWN_PREFIX`), and this is
	where it is let out: the moment the serial appears in `config.toml`, the
	backlog behind it resolves and delivers on the next pass.

	`rota`, when given, gives a punch-in its day or night shift before it is
	sent (mannabridge/rota.py), so hrms matches it to the right one. Anything
	it cannot do is logged and the punch goes anyway.

	`enrol`, when given, makes the Employee for a device user nobody carries
	(mannabridge/autoenrol.py) and the punch is sent again at once. Only for
	"no such employee" — never for one who is not Active — and only on a
	machine with a company in config.toml.
	"""
	sent = failed = 0
	by_serial = by_serial or {}
	if enrol is not None:
		enrol.start_pass()

	for row in queue.pending(limit=batch):
		# The cap is for punches the line keeps failing on. One waiting on an
		# employee record is always tried again, including those an older
		# bridge retired by counting them: that is what makes "link the
		# employee and they go on the next pass" true.
		if row["attempts"] >= MAX_ATTEMPTS and not _waiting_on_employee(row):
			continue

		device_id = row["device_id"]
		serial = adms.serial_of_unknown(device_id)
		if serial:
			device_id = by_serial.get(serial)
			if not device_id:
				# Still unconfigured. Left alone rather than attempted: a name
				# that fails the trusted-prefix test would have the site judge a
				# fingerprint punch as a phone punch and refuse it on the geofence.
				continue

		if rota is not None:
			try:
				rota.before_send(row, queue.previous(row["device_user"], row["punched_at"]))
			except Exception as exc:
				# The punch is the pay; its shift can be put right after.
				log.warning("could not settle day or night for device user %s at %s: %s",
				            row["device_user"], row["punched_at"], exc)

		def send():
			return sink.send(
				device_user=row["device_user"],
				punched_at=row["punched_at"],
				device_id=device_id,
				log_type=row["log_type"],
			)

		try:
			try:
				made = send()
			except UnmappedEmployee as exc:
				# Its own try: a failure making the record is the record's, and
				# the punch only waits — the rest of the queue still goes.
				made_one = False
				if enrol is not None and getattr(exc, "missing", False):
					try:
						made_one = enrol.ensure(row["device_user"], device_id, row["punched_at"])
					except Exception:
						log.exception("unexpected failure making an Employee for device user %s", row["device_user"])
				if not made_one:
					raise
				made = send()
		except UnmappedEmployee as exc:
			# Master data, not network. It costs no attempt, so it is released
			# the pass after somebody links the employee.
			queue.mark_unmapped(row["id"], exc)
			log.warning("%s", exc)
			failed += 1
			continue
		except DeliveryError as exc:
			queue.mark_failed(row["id"], exc)
			log.error("delivery failed for punch %s: %s", row["id"], exc)
			failed += 1
			# A failing sink fails for everything. Stopping the pass here beats
			# marking five hundred punches failed against one dead line.
			break

		queue.mark_sent(row["id"], datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
		sent += 1
		shift = (made or {}).get("shift") if isinstance(made, dict) else None
		if reached is not None and shift:
			when = str(row["punched_at"])[:19]
			if when > reached.get(shift, ""):
				reached[shift] = when

	return sent, failed


def run_once(devices, queue, sink, retain_days, erp_url=None, by_serial=None, fix_clocks=True, tolerance=clock.TOLERANCE_SECONDS, rota=None, enrol=None):
	if fix_clocks and erp_url:
		try:
			keep_clocks(devices, queue, sink.now(erp_url), tolerance)
		except Exception:
			# A clock is a report about the punches; the punches are the pay.
			log.exception("unexpected failure checking the clocks")

	# A machine ADMS is serving is not read here; one that has gone quiet is.
	# See failover.py. Skipped machines are not "unread": their punches reach
	# the site by ADMS, and the site moves their shifts itself.
	if erp_url and hasattr(sink, "adms_seen"):
		live = failover.on_adms(sink.adms_seen(erp_url), datetime.now())
		if live:
			log.info("on ADMS, not read this pass: %s", ", ".join(sorted(live)))
		devices = [d for d in devices if d.name not in live]

	unread = []
	found = poll_devices(devices, queue, unread=unread)
	reached = {}
	sent, failed = drain(queue, sink, by_serial=by_serial, reached=reached, rota=rota, enrol=enrol)

	if reached and erp_url:
		# **Only the shifts this pass delivered punches on, each only as far as
		# its own newest punch** — since 30 Sep 2026. It used to move every
		# auto-attendance shift in the group to the newest punch delivered on
		# any of them. On 16 Sep another plant's bridge, delivering its own
		# evening, moved Manna Rubber Products' Office Shift to 19:33 while
		# BIO-MRP-GATE1's bridge was off with the gate's punch-outs still on
		# the machine; hrms closed the day on the morning's punches alone, and
		# the outs that arrived next morning were set aside as late. 43 people,
		# 52 days in September.
		if unread:
			# A machine this bridge could not read holds punches of its own,
			# and nothing here says which shifts they belong to. Closing any
			# shift now could close one of theirs without them — the same
			# failure — so nothing moves until every machine has been read.
			# Loud, because a machine that stays dead holds these shifts open.
			log.warning(
				"last_sync_of_checkin not moved: %s could not be read this pass, and its punches may "
				"belong to the same shifts. It moves again once every machine reads.", ", ".join(unread))
		else:
			n = sink.mark_synced(erp_url, reached)
			log.info("last_sync_of_checkin advanced on %d shift(s): %s", n,
			         ", ".join("{0} to {1}".format(s, t) for s, t in sorted(reached.items())))

	cutoff = (datetime.now() - timedelta(days=retain_days)).strftime("%Y-%m-%d %H:%M:%S")
	pruned = queue.prune_sent(cutoff)

	backlog = queue.backlog_size()
	log.info(
		"pass complete: %d new, %d sent, %d failed, %d pruned, %d waiting",
		found,
		sent,
		failed,
		pruned,
		backlog,
	)
	if backlog > 1000:
		# A backlog this size is not a blip. Either the site has been
		# unreachable for a day or every punch is hitting UnmappedEmployee.
		log.error("backlog is %d punches — something is wrong, not just slow", backlog)

	return backlog


def keep_clocks(devices, queue, site_now, tolerance=clock.TOLERANCE_SECONDS):
	"""Put each machine's clock back on the site's. Returns how many were set.

	Before the punches are read, so a correction and the read cannot disagree
	about what time it was. Its own try per machine: a clock that cannot be
	written is a report, and the punches on that machine still have to come.
	"""
	if site_now is None:
		# No site clock, no correction. This PC's own clock is only as right as
		# whoever set it, and the site's is what judges the punch.
		return 0

	fixed = 0
	for device in devices:
		try:
			machine_time = device.clock()
			if machine_time is None:
				continue
			action, drift = clock.decide(machine_time, site_now, tolerance=tolerance)
			if action == "leave":
				continue
			if action == "refuse":
				log.error(
					"%s: clock is %.0f s out (%s against the site's %s) — too far to correct quietly. "
					"Somebody has to look at the machine.",
					device.name, drift, machine_time, site_now,
				)
				continue

			# Backwards first: the cursor has to move before the machine starts
			# reusing timestamps, or the punches in between are read and judged
			# old. Re-sending is free; losing one is somebody's day.
			if drift > 0:
				cursor = queue.last_seen(device.name)
				rewound = clock.rewound_cursor(cursor, drift)
				if rewound and rewound != cursor:
					queue.set_last_seen(device.name, rewound)
					log.info("%s: cursor moved back to %s so nothing is skipped", device.name, rewound)

			after = device.set_clock(site_now)
			fixed += 1
			log.warning(
				"%s: clock was %.0f s %s; set to the site's %s (machine now reads %s)",
				device.name, abs(drift), "fast" if drift > 0 else "slow", site_now, after,
			)
		except Exception:
			log.exception("%s: could not check or set the clock", device.name)
	return fixed


def run_commands(devices, site, once=False):
	"""What somebody asked for on the dashboard, done at the machine.

	Its own try, like the enrolment list and for the same reason: this is a
	convenience and the punch queue is somebody's pay. Nothing that goes wrong
	in here may cost a pass of the punches.

	A site with no `Machine Command` doctype — which is every site until the app
	is installed — says so once and is not asked again, because the alternative
	is a 404 in the log every twenty seconds for ever.
	"""
	if site is None or _commands_off:
		return 0
	try:
		return commands.work(devices, site)
	except commands.NotOnSite:
		log.info("ERPNext has no Machine Command doctype yet; dashboard requests are off until it exists")
		_commands_off.add(True)
	except commands.Unavailable as exc:
		# The site, not a machine. Quiet: the same line already appears when
		# punches cannot be delivered, and this is the lesser of the two.
		log.debug("could not read Machine Command: %s", exc)
	except Exception:
		log.exception("unexpected failure running dashboard commands")
	return 0


#: Set once a site has answered "no such doctype", so the ask stops.
_commands_off = set()


def status(config, queue, sink, by_serial):
	"""Is anything arriving, and where has it got to.

	Two halves, and keeping them apart is the whole value of this command. The
	queue says what reached *this box*; the site says what reached ERPNext. When
	attendance is missing, which half is empty decides who is called — the
	person at the gate or the person with the API key.
	"""
	today = datetime.now().strftime("%Y-%m-%d")
	rows = queue.stats()

	print("site      {0}".format(config.erp_url))
	print("reachable {0}".format("yes" if sink.heartbeat(config.erp_url) else "NO"))
	print("queue     {0}".format(config.queue_path))
	if config.listens:
		print("ADMS      listening on port {0} for {1} serial(s)".format(config.adms_port, len(by_serial)))
	print()

	if not rows:
		print("  Nothing has ever reached this box.")
		print()
		print("  If a machine is meant to be pushing, check in this order:")
		print("    1. the log of the running bridge - does it say 'said hello'?")
		print("    2. the firewall on this box, on the ADMS port")
		print("    3. Server Address and port on the machine (Comm > Cloud Server Setting)")
		return 0

	wide = max([len(r["device_id"]) + 15 for r in rows] + [30])
	print("{0:{w}} {1:>7} {2:>7}  {3:19}  {4}".format(
		"device", "queued", "waiting", "newest punch", "newest delivered", w=wide))
	for row in rows:
		serial = adms.serial_of_unknown(row["device_id"])
		name = "SN:{0} (unregistered)".format(serial) if serial else row["device_id"]
		print("{0:{w}} {1:>7} {2:>7}  {3:19}  {4}".format(
			name, row["total"], row["unsent"] or 0,
			row["newest"] or "-", row["newest_sent"] or "-", w=wide,
		))
		if row["last_error"]:
			print("    last refusal: {0}".format(row["last_error"][:100]))
		if serial and serial not in by_serial:
			print("    not in config.toml. Add:  name = \"BIO-...\"   serial = \"{0}\"".format(serial))

	print()
	on_site = sink.checkins_since(config.erp_url, today + " 00:00:00")
	if on_site is None:
		print("Employee Checkin today: could not be read - check the API key.")
	else:
		print("Employee Checkin today: {0} on the site.".format(on_site))

	waiting = sum(r["unsent"] or 0 for r in rows)
	if waiting:
		print("{0} punch(es) are here and not on the site yet.".format(waiting))
	return 0


def main():
	parser = argparse.ArgumentParser(description="Manna attendance bridge")
	parser.add_argument("--config", default="config.toml")
	parser.add_argument("--once", action="store_true", help="one pass, then exit")
	parser.add_argument(
		"--status", action="store_true",
		help="say whether punches are arriving and where they have got to, then exit. "
		     "The first command to run when somebody says attendance is missing.")
	parser.add_argument(
		"--adms", action="store_true",
		help="also listen for machines that push their punches instead of being read "
		     "(the same as [adms] enabled = true). Point the machine at this box's "
		     "address and the ADMS port under Comm -> Cloud Server Setting.")
	parser.add_argument(
		"--from", dest="since", metavar="YYYY-MM-DD",
		help="seed each device cursor to this date before the first pass. "
		     "Without it a new install reads the device's entire history - this "
		     "machine holds three years and 79,000 records, and posting all of "
		     "them would take hours and fill the site with attendance nobody "
		     "asked for. Only ever moves a cursor forward.")
	parser.add_argument(
		"--resend-from", dest="resend", metavar="YYYY-MM-DD",
		help="read every machine again from this date, and send whatever the site has not got. "
		     "The one way to move a cursor backwards, and so its own flag: re-sending is free "
		     "(the site recognises a punch it holds and the queue never sends one twice), and "
		     "this is how days a bridge was not running for reach the site. Run it with --once, "
		     "with the bridge's own task stopped - RESEND.bat does both.")
	args = parser.parse_args()

	config = load_config(args.config)

	logging.basicConfig(
		level=getattr(logging, config.log_level.upper(), logging.INFO),
		format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
	)

	queue = PunchQueue(config.queue_path)
	sink = ErpSink(config.erp_url, config.api_key, config.api_secret)
	rota = Rota(config.erp_url, config.api_key, config.api_secret)
	enrolments = EnrolmentStore(config.queue_path)
	enrolment_site = EnrolmentSite(config.erp_url, config.api_key, config.api_secret)
	command_site = commands.CommandSite(config.erp_url, config.api_key, config.api_secret)
	devices = [Device(**d) for d in config.pollable]
	by_serial = {d["serial"]: d["name"] for d in config.devices if d.get("serial")}
	# Only machines with a company in config.toml make Employees; see autoenrol.py.
	companies = {d["name"]: d.get("company", "") for d in config.devices if d.get("company")}
	enrol = AutoEnrol(
		EmployeeSite(config.erp_url, config.api_key, config.api_secret),
		companies,
		name_of=lambda device_id, user: (enrolments.known(device_id).get(user) or {}).get("name", ""),
	) if companies else None

	if args.status:
		# Before the startup line: this command is read, not tailed.
		return status(config, queue, sink, by_serial)

	listening = args.adms or config.listens
	log.info(
		"bridge starting: %d device(s) to read, %d to listen for -> %s",
		len(devices), len(by_serial) if listening else 0, config.erp_url,
	)

	server = None
	# Set by the ADMS server when a punch lands, so the loop below stops
	# sleeping and delivers it. Created either way so the wait is one shape.
	wake = threading.Event()
	if listening:
		try:
			server = adms.serve(config, queue, wake=wake)
		except OSError as exc:
			# Most often the port is taken — a second bridge, or the one this
			# replaced not yet gone. Said in a sentence, because the traceback
			# names a socket and not the setting to change.
			raise SystemExit("ADMS could not listen on port {0}: {1}".format(config.adms_port, exc))
		# A daemon thread, so a service stop ends the process rather than leaving
		# it holding the port. Nothing is lost by stopping mid-request: the
		# machine did not get its OK and sends those records again.
		threading.Thread(target=server.serve_forever, name="adms", daemon=True).start()

	if args.resend:
		for name in rewind_cursors(devices, queue, args.resend):
			log.info("%s: cursor moved back to the start of %s, to read it again", name, args.resend)
		pushed = [d["name"] for d in config.devices if d.get("serial") and not d.get("host")]
		if pushed:
			# A pushed machine sends what it decides to; there is no cursor here
			# that makes it send again. Said, so a day missing from one of these
			# is not taken for a day re-read.
			log.warning("not re-read, they push and have no address to read: %s", ", ".join(pushed))

	if args.since:
		# Seeded as end-of-day so the named date is itself skipped: "--from
		# 2026-08-23" means "start with the 24th". Never moved backwards, so
		# re-running it cannot cause a replay of what has already been sent.
		stamp = args.since + " 23:59:59"
		for d in devices:
			current = queue.last_seen(d.name)
			if current and current >= stamp:
				log.info("%s: cursor already at %s, leaving it", d.name, current)
			else:
				queue.set_last_seen(d.name, stamp)
				log.info("%s: cursor seeded to %s", d.name, stamp)

	if not sink.heartbeat(config.erp_url):
		# Not fatal. The queue is durable, so the right behaviour is to keep
		# reading devices and deliver when the line returns — but this line in
		# the log is what tells somebody why nothing is arriving.
		log.error("cannot reach %s — punches will queue locally until it returns", config.erp_url)

	if not devices and not server:
		log.error("nothing to read and ADMS not enabled — this process would do nothing")

	while True:
		try:
			run_once(devices, queue, sink, config.retain_days, config.erp_url, by_serial,
			         config.fix_clocks, config.clock_tolerance, rota=rota, enrol=enrol)
		except Exception:
			log.exception("unexpected failure in poll cycle")

		# After the punches, and in a try of its own: who is enrolled is a report
		# about attendance, and nothing that goes wrong reading it may cost a pass
		# of the punches themselves.
		try:
			sync_enrolments(devices, enrolments, enrolment_site)
		except Exception:
			log.exception("unexpected failure reading enrolments")

		if args.once:
			run_commands(devices, command_site, once=True)
			return

		# **Woken by a punch, or by the clock.** A pushed punch sets the event and
		# reaches the site in seconds instead of at the next poll — the whole
		# point of push. The timeout stays because machines that are *read* need
		# pacing, and a site that was unreachable has to be retried on a quiet night.
		#
		# The wait is taken in slices so commands left on the site by somebody at
		# the dashboard are picked up in seconds rather than at the next pass:
		# the person who asked "is 851 on the gate?" is watching the answer.
		deadline = time.monotonic() + config.poll_seconds
		while True:
			left = deadline - time.monotonic()
			if left <= 0:
				break
			if wake.wait(min(config.command_seconds, left)):
				wake.clear()
				# A machine sends a batch as several posts a moment apart;
				# settling turns a burst into one pass.
				time.sleep(WAKE_SETTLE_SECONDS)
				break
			run_commands(devices, command_site)


if __name__ == "__main__":
	main()
