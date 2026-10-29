"""ADMS first, the bridge when ADMS goes quiet (asked for 29 October 2026).

A machine pushing to `adms.mannarubber.com` checks in with the site every few
seconds, and the site writes `Attendance Device.last_seen` at most every five
minutes (`adms_site.LAST_SEEN_EVERY_MINUTES`). While that stamp is fresh the
machine is on ADMS and this bridge leaves it alone; once it goes stale the
bridge reads the machine again, from its own cursor.

Reading from its own cursor re-reads what ADMS already delivered. That is the
safe direction: the site refuses a second log at the same second and the sink
counts that as delivered (`sink.ALREADY_THERE`), while a cursor moved forward
on ADMS's word would skip whatever ADMS was still to send.

Pure — no network — so the rule can be argued about without a machine.
"""

from datetime import datetime, timedelta

#: Three missed `last_seen` writes. Shorter would flap a machine between the
#: two routes on one slow minute; longer is a gap in somebody's morning.
QUIET_AFTER_MINUTES = 15


def _parse(stamp):
	if not stamp:
		return None
	try:
		return datetime.strptime(str(stamp)[:19], "%Y-%m-%d %H:%M:%S")
	except ValueError:
		return None


def on_adms(last_seen, now, quiet_after=QUIET_AFTER_MINUTES):
	"""The device ids ADMS is serving now, so this pass skips them.

	`last_seen` maps `device_id` → the site's `last_seen` text (or None). A
	stamp in the future is the site's clock against this PC's and still counts
	as live. Anything unreadable is not live: when in doubt, read the machine.
	"""
	edge = now - timedelta(minutes=quiet_after)
	live = set()
	for device_id, stamp in (last_seen or {}).items():
		seen = _parse(stamp)
		if seen is not None and seen >= edge:
			live.add(device_id)
	return live
