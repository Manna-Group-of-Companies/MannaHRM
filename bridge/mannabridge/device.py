"""Reading punches off a ZK-protocol fingerprint machine.

Covers ZKTeco and the clones sold under other names in India — eSSL, Realtime
and most of the rest speak the same protocol. A device that does not is not
supported here and needs its own reader; that is a decision to take before
buying, not after.

**This module never clears the device's log.** `pyzk` offers
`clear_attendance()` and the sample code in every tutorial calls it. Do not.
The device's memory is the last copy of a punch that failed to deliver, and a
ring buffer that overwrites itself in six months is a better backup than a
program that deletes on purpose.
"""

import logging

from zk import ZK

log = logging.getLogger(__name__)

# ZK devices report direction in `punch`, when configured to at all. 0/1 is the
# common mapping; anything else means the machine was set up for break-in and
# break-out too, and those are not attendance.
PUNCH_IN = 0
PUNCH_OUT = 1


class Device:
	def __init__(self, name, host, port=4370, password=0, timeout=15, force_udp=False):
		self.name = name
		self._host = host
		self._port = port
		self._zk = ZK(
			host,
			port=port,
			timeout=timeout,
			password=password,
			force_udp=force_udp,
			ommit_ping=True,
		)

	def read(self, since=None):
		"""Every attendance record on the device, newest last.

		`since` filters client-side. The protocol has no server-side range
		query, so the whole log comes over the wire either way — on a device
		holding 100k records that is a few seconds, which is why the poll
		interval is minutes and not seconds.
		"""
		conn = None
		try:
			conn = self._zk.connect()
			# Stops the machine accepting punches while we read. Without it a
			# punch landing mid-read can be missed entirely.
			conn.disable_device()
			records = conn.get_attendance() or []
		finally:
			if conn:
				try:
					conn.enable_device()
					conn.disconnect()
				except Exception:
					# A failure re-enabling is worth knowing about but must not
					# lose the records we already read.
					log.exception("%s: failed to release device cleanly", self.name)

		punches = []
		for record in records:
			stamp = record.timestamp.strftime("%Y-%m-%d %H:%M:%S")
			if since and stamp <= since:
				continue
			punches.append(
				{
					"device_user": str(record.user_id).strip(),
					"punched_at": stamp,
					"log_type": _log_type(getattr(record, "punch", None)),
				}
			)

		punches.sort(key=lambda p: p["punched_at"])
		return punches


def _log_type(punch):
	"""Direction, or None when the machine does not report one.

	None is returned rather than guessed. A guessed direction is worse than no
	direction: the shift's pairing mode can alternate IN/OUT correctly from
	nothing, but it cannot recover from being told the wrong thing confidently.
	"""
	if punch == PUNCH_IN:
		return "IN"
	if punch == PUNCH_OUT:
		return "OUT"
	return None
