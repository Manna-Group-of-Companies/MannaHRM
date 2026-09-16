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

from mannabridge import adms
from mannabridge.config import load_config
from mannabridge.device import Device
from mannabridge.queue import PunchQueue
from mannabridge.roster import EnrolmentSite, EnrolmentStore, sync_enrolments
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


def poll_devices(devices, queue):
	"""Read each device and persist anything new. Returns how many were new."""
	found = 0
	for device in devices:
		try:
			punches = device.read(since=queue.last_seen(device.name))
		except Exception as exc:
			# One dead machine must not stop the others, and must not stop the
			# backlog draining. Logged loudly; the site-side job notices the
			# silence separately.
			log.error("%s: could not be read: %s", device.name, exc)
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


def _waiting_on_employee(row):
	return "matches no Employee" in (row.get("last_error") or "")


def drain(queue, sink, batch=500, by_serial=None):
	"""Deliver everything undelivered. Returns (sent, failed).

	`by_serial` is the ADMS map, serial -> device id. A punch pushed by a
	machine nobody had configured is parked under `SN:<serial>` rather than
	dropped or given an invented id (see `adms.UNKNOWN_PREFIX`), and this is
	where it is let out: the moment the serial appears in `config.toml`, the
	backlog behind it resolves and delivers on the next pass.
	"""
	sent = failed = 0
	by_serial = by_serial or {}

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

		try:
			sink.send(
				device_user=row["device_user"],
				punched_at=row["punched_at"],
				device_id=device_id,
				log_type=row["log_type"],
			)
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

	return sent, failed


def run_once(devices, queue, sink, retain_days, erp_url=None, by_serial=None):
	found = poll_devices(devices, queue)
	sent, failed = drain(queue, sink, by_serial=by_serial)

	if sent and erp_url:
		# Only after something was actually delivered, and only as far as the
		# newest punch that got through. See ErpSink.mark_synced for why this
		# matters more than it looks.
		newest = queue.newest_sent()
		if newest:
			n = sink.mark_synced(erp_url, newest)
			log.info("last_sync_of_checkin advanced to %s on %d shift(s)", newest, n)

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
	args = parser.parse_args()

	config = load_config(args.config)

	logging.basicConfig(
		level=getattr(logging, config.log_level.upper(), logging.INFO),
		format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
	)

	queue = PunchQueue(config.queue_path)
	sink = ErpSink(config.erp_url, config.api_key, config.api_secret)
	enrolments = EnrolmentStore(config.queue_path)
	enrolment_site = EnrolmentSite(config.erp_url, config.api_key, config.api_secret)
	devices = [Device(**d) for d in config.pollable]
	by_serial = {d["serial"]: d["name"] for d in config.devices if d.get("serial")}

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
			run_once(devices, queue, sink, config.retain_days, config.erp_url, by_serial)
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
			return

		# **Woken by a punch, or by the clock.** A pushed punch sets the event and
		# reaches the site in seconds instead of at the next poll — the whole
		# point of push. The timeout stays because machines that are *read* need
		# pacing, and a site that was unreachable has to be retried on a quiet night.
		if wake.wait(config.poll_seconds):
			wake.clear()
			# A machine sends a batch as several posts a moment apart; settling
			# turns a burst into one pass.
			time.sleep(WAKE_SETTLE_SECONDS)


if __name__ == "__main__":
	main()
