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

try:
	from zk import ZK
except ImportError:
	# A box that only runs the ADMS listener has no machine to read and need not
	# install a ZK library. Said at the moment one is needed, not at import.
	ZK = None

log = logging.getLogger(__name__)

# ZK devices report direction in `punch`, when configured to at all. 0/1 is the
# common mapping; anything else means the machine was set up for break-in and
# break-out too, and those are not attendance.
PUNCH_IN = 0
PUNCH_OUT = 1

# pyzk's `const.USER_ADMIN`. Every other privilege value is an ordinary user.
USER_ADMIN = 14


class Device:
	def __init__(self, name, host, port=4370, password=0, timeout=15, force_udp=False,
	             report_direction=False):
		if ZK is None:
			raise SystemExit("Reading {0} needs pyzk: pip install -r requirements.txt".format(name))

		self.name = name
		# **Off unless somebody has checked the machine.** See `_log_type`.
		self.report_direction = report_direction
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
			# The machine is NOT disabled while it is read. Disabling it is what
			# every sample does, and it cost two hours on 11 Sep 2026: a bridge
			# killed mid-read never reached its enable_device(), and the gate
			# refused every finger across a shift change until somebody noticed.
			# A read of ~80,000 records takes over a minute, so even a clean
			# pass locked the gate for a minute in every five. Nothing is lost
			# by not locking: records are appended with a later timestamp than
			# anything already read, so a punch landing mid-read is simply the
			# first record of the next pass. dump.py reads the same way.
			records = conn.get_attendance() or []
		finally:
			if conn:
				try:
					conn.disconnect()
				except Exception:
					log.exception("%s: failed to disconnect cleanly", self.name)

		punches = []
		for record in records:
			stamp = record.timestamp.strftime("%Y-%m-%d %H:%M:%S")
			if since and stamp <= since:
				continue
			punches.append(
				{
					"device_user": str(record.user_id).strip(),
					"punched_at": stamp,
					"log_type": _log_type(getattr(record, "punch", None), self.report_direction),
				}
			)

		punches.sort(key=lambda p: p["punched_at"])
		return punches

	def users(self):
		"""Everybody enrolled on the machine: user id, name, and whether an admin.

		A connection of its own rather than a second question inside `read`. The
		user list is a second or two; tying it to the punch read would mean a
		machine that times out listing users also delivers no punches that pass.
		"""
		conn = None
		try:
			conn = self._zk.connect()
			found = conn.get_users() or []
		finally:
			if conn:
				try:
					conn.disconnect()
				except Exception:
					log.exception("%s: failed to disconnect cleanly", self.name)

		users = []
		for user in found:
			uid = str(user.user_id).strip()
			if not uid:
				continue
			users.append(
				{"device_user": uid, "name": (user.name or "").strip(), "admin": user.privilege == USER_ADMIN}
			)
		return users


def _log_type(punch, report_direction=False):
	"""Direction, or None when the machine's is not to be believed.

	None is returned rather than guessed. A guessed direction is worse than no
	direction: the shift's pairing mode can alternate IN/OUT correctly from
	nothing, but it cannot recover from being told the wrong thing confidently.

	**`report_direction` is off by default, and that is the whole point.** A ZK
	machine that was never set up for in/out does not say so. It reports `0` on
	every punch — the same value as a genuine check-in, and a day on which nobody
	ever left. `adms.log_type_for` makes the same decision on the push side and
	shares the setting: one machine must not report direction one way and not
	the other.
	"""
	if not report_direction:
		return None
	if punch == PUNCH_IN:
		return "IN"
	if punch == PUNCH_OUT:
		return "OUT"
	return None
