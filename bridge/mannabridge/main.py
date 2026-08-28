"""The bridge loop.

Read every device, persist what is new, then deliver whatever is undelivered.
Those are two separate passes on purpose: a device that is unreachable must not
stop the backlog from draining, and a site that is unreachable must not stop
devices being read.

Run it as a service — systemd on Linux, a Scheduled Task set to "run whether
logged on or not" on Windows. A bridge that only runs while somebody is logged
in will be found switched off in March.
"""

import argparse
import logging
import time
from datetime import datetime, timedelta

from mannabridge.config import load_config
from mannabridge.device import Device
from mannabridge.queue import PunchQueue
from mannabridge.sink import DeliveryError, ErpSink, UnmappedEmployee

log = logging.getLogger("mannabridge")

# Give up retrying one punch after this many attempts and leave it in the queue,
# unsent and visible. Deliberately not dropped: an undeliverable punch is a
# question for a person, and deleting it destroys the evidence for the answer.
MAX_ATTEMPTS = 20


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


def drain(queue, sink, batch=500):
	"""Deliver everything undelivered. Returns (sent, failed)."""
	sent = failed = 0

	for row in queue.pending(limit=batch):
		if row["attempts"] >= MAX_ATTEMPTS:
			continue

		try:
			sink.send(
				device_user=row["device_user"],
				punched_at=row["punched_at"],
				device_id=row["device_id"],
				log_type=row["log_type"],
			)
		except UnmappedEmployee as exc:
			# Master data, not network. Retrying will not fix it, and burning
			# attempts on it hides real failures behind noise.
			queue.mark_failed(row["id"], exc)
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


def run_once(devices, queue, sink, retain_days, erp_url=None):
	found = poll_devices(devices, queue)
	sent, failed = drain(queue, sink)

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


def main():
	parser = argparse.ArgumentParser(description="Manna attendance bridge")
	parser.add_argument("--config", default="config.toml")
	parser.add_argument("--once", action="store_true", help="one pass, then exit")
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
	devices = [Device(**d) for d in config.devices]

	log.info("bridge starting: %d device(s) -> %s", len(devices), config.erp_url)

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

	while True:
		try:
			run_once(devices, queue, sink, config.retain_days, config.erp_url)
		except Exception:
			log.exception("unexpected failure in poll cycle")

		if args.once:
			return
		time.sleep(config.poll_seconds)


if __name__ == "__main__":
	main()
