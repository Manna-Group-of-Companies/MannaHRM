"""Read everything off one fingerprint machine and write it to files.

    python bridge/dump.py 192.168.1.40
    python bridge/dump.py 192.168.1.40 --since 2026-01-01
    python bridge/dump.py 192.168.1.40 --password 1234 --udp
    python bridge/dump.py 192.168.1.40 --templates      # also the fingerprints

Writes three files into `data/devices/` (gitignored, like everything under
`data/` — this is 438 people's movements):

    <serial>-<date>-info.json     what the machine is, and what it thinks
    <serial>-<date>-users.csv     every enrolled user
    <serial>-<date>-punches.csv   every punch it still holds

`probe.py` answers "is it there and what is it". This answers "give me
everything on it" — the thing somebody wants before a device is replaced, when
a month of attendance is being reconciled by hand, or when the question is
whether a punch that never reached ERPNext is still on the machine.

## Read-only, and that is the whole of the safety argument

It does not clear the log, does not write a user, does not set the clock, and
does not disable the device while it reads. `pyzk` offers `clear_attendance()`
and every tutorial calls it; the device's memory is the last copy of a punch
that failed to deliver (bridge/README.md, CLAUDE.md §5). Disabling is nearly as
bad in daylight: a probe that locks the gate while somebody is trying to punch
is a probe that gets run once and never again.

**This is not the bridge and does not replace it.** Nothing here posts to
ERPNext. The bridge is what delivers punches, with a queue behind it so a
failed post is not a lost day's pay; this writes files for a person to read.

## What it deliberately does not write

The users file carries no device password. `pyzk` hands back the numeric PIN
somebody punches in when their finger will not read, in clear, and it is the
one field on the machine that is a secret rather than a fact about a person.
The column is kept — an account *having* a PIN matters when a punch is
disputed — and holds `set` or nothing.

Needs pyzk:  python -m pip install pyzk
"""

import argparse
import base64
import csv
import json
import sys
from datetime import datetime
from pathlib import Path

try:
	from zk import ZK
except ImportError:
	sys.exit("Needs pyzk:  python -m pip install pyzk")

ZK_PORT = 4370

#: Where a dump lands. Under `data/`, which .gitignore keeps out of the repo
#: for exactly this reason: these files are the whole group's movements, and on
#: some machines their card numbers as well.
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "data" / "devices"

#: What the punch codes mean on ZK firmware. Written next to the number rather
#: than instead of it, because the mapping is a convention rather than a
#: promise — a device configured with custom work codes will answer with
#: numbers that are not in this table, and a blank column would hide that.
PUNCH_NAMES = {
	0: "check-in",
	1: "check-out",
	2: "break-out",
	3: "break-in",
	4: "overtime-in",
	5: "overtime-out",
}

#: `status` is how the person identified themselves. Same caveat as above.
STATUS_NAMES = {
	0: "password",
	1: "fingerprint",
	2: "card",
	3: "password",
	4: "card",
	15: "face",
}

PRIVILEGE_NAMES = {0: "user", 2: "enroller", 6: "manager", 14: "admin"}


class DumpFailed(Exception):
	"""A read that must not be turned into an empty file. See `must`."""


def safe(fn, default=None):
	"""For the descriptive fields only — name, serial, firmware, MAC.

	Firmware varies wildly in what it answers, and one unsupported call must not
	lose the rest of the dump. Losing the platform string costs nothing; every
	other read on this page goes through `must` instead.
	"""
	try:
		return fn()
	except Exception:
		return default


def must(what, fn):
	"""A read whose failure is never allowed to look like an empty machine.

	**This is the bug this function exists to prevent, and it was written after
	hitting it.** The users and the punches were read through `safe` with `[]`
	behind them, so a device that refused the call — busy, mid-punch, or simply
	asked twice in a minute — produced a punch file containing its header row
	and nothing else. That file is indistinguishable from a machine somebody
	has just wiped, which is the single most alarming thing this folder could
	contain and the one thing it must never say by accident.

	So these reads fail loudly and nothing is written at all. A dump that did
	not happen is obvious; a dump that quietly happened to be empty is not.
	"""
	try:
		got = fn()
	except Exception as e:
		raise DumpFailed("could not read {0}: {1}".format(what, str(e)[:200]))
	if got is None:
		raise DumpFailed("the device answered nothing at all for {0}".format(what))
	return got


def connect(host, port, password, timeout, force_udp):
	zk = ZK(host, port=port, timeout=timeout, password=password,
	        force_udp=force_udp, ommit_ping=True)
	return zk.connect()


def device_info(conn, host, port):
	when = safe(conn.get_time)
	info = {
		"read_at": datetime.now().isoformat(timespec="seconds"),
		"host": host,
		"port": port,
		"name": safe(conn.get_device_name),
		"serial": safe(conn.get_serialnumber),
		"firmware": safe(conn.get_firmware_version),
		"platform": safe(conn.get_platform),
		"mac": safe(conn.get_mac),
		"device_time": when.isoformat(timespec="seconds") if isinstance(when, datetime) else None,
	}
	if isinstance(when, datetime):
		# Signed, and the sign is the whole point: a machine running behind
		# stamps punches earlier than they happened, which makes latecomers
		# look punctual, and one running ahead does the opposite. Nothing
		# downstream can tell drift from lateness — see CLAUDE.md §7.
		info["drift_seconds"] = round((datetime.now() - when).total_seconds())
	return info


def write_users(users, path):
	with open(path, "w", newline="", encoding="utf-8") as fh:
		w = csv.writer(fh)
		w.writerow(["uid", "user_id", "name", "privilege", "privilege_code", "group_id", "card", "pin"])
		for u in users:
			w.writerow([
				getattr(u, "uid", ""),
				getattr(u, "user_id", ""),
				(getattr(u, "name", "") or "").strip(),
				PRIVILEGE_NAMES.get(getattr(u, "privilege", None), "?"),
				getattr(u, "privilege", ""),
				getattr(u, "group_id", ""),
				getattr(u, "card", "") or "",
				# The PIN itself is never written. See the module docstring.
				"set" if (getattr(u, "password", "") or "").strip() else "",
			])
	return len(users)


def write_punches(rows, path):
	with open(path, "w", newline="", encoding="utf-8") as fh:
		w = csv.writer(fh)
		w.writerow(["user_id", "timestamp", "date", "time", "punch", "punch_code",
		            "verified_by", "status_code", "uid"])
		for r in rows:
			punch = getattr(r, "punch", None)
			status = getattr(r, "status", None)
			w.writerow([
				r.user_id,
				r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
				r.timestamp.strftime("%Y-%m-%d"),
				r.timestamp.strftime("%H:%M:%S"),
				PUNCH_NAMES.get(punch, "?"),
				"" if punch is None else punch,
				STATUS_NAMES.get(status, "?"),
				"" if status is None else status,
				getattr(r, "uid", ""),
			])
	return rows


def read_punches(conn, since=None):
	"""Every punch the machine still holds, oldest first.

	The whole log comes over the wire whatever `--since` says — the protocol has
	no server-side filter, which is also why the bridge polls every five minutes
	rather than every few seconds. The filter is applied here, after the read.
	"""
	rows = sorted(must("the punch log", conn.get_attendance), key=lambda r: r.timestamp)
	if since:
		rows = [r for r in rows if r.timestamp.date() >= since]
	return rows


def write_templates(templates, path):
	"""The fingerprints themselves, base64'd into one JSON file.

	Off by default and asked for explicitly, because this is the one read that
	produces *biometric* data rather than a record of somebody's movements — it
	is what you need to move 438 people onto a replacement machine without
	re-enrolling every finger, and it is not something to leave lying in a
	folder for any other reason.
	"""
	out = []
	for t in templates:
		mark = getattr(t, "template", b"") or b""
		out.append({
			"uid": getattr(t, "uid", None),
			"fid": getattr(t, "fid", None),
			"valid": getattr(t, "valid", None),
			"size": len(mark),
			"template_b64": base64.b64encode(mark).decode("ascii"),
		})
	path.write_text(json.dumps(out, indent=1), encoding="utf-8")
	return len(out)


def main():
	ap = argparse.ArgumentParser(description="Read everything off one ZK fingerprint machine.")
	ap.add_argument("host", help="the device's IP, e.g. 192.168.1.40")
	ap.add_argument("--port", type=int, default=ZK_PORT)
	ap.add_argument("--password", type=int, default=0, help="the device comm key, if one is set")
	ap.add_argument("--udp", action="store_true", help="try UDP; some older firmware needs it")
	ap.add_argument("--timeout", type=int, default=60,
	                help="seconds. The default is generous: a machine holding 80,000 punches "
	                     "takes a while to hand them all over.")
	ap.add_argument("--since", help="only punches on or after this date, YYYY-MM-DD")
	ap.add_argument("--out", default=str(DEFAULT_OUT), help="directory to write into")
	ap.add_argument("--templates", action="store_true", help="also dump the fingerprint templates")
	args = ap.parse_args()

	since = datetime.strptime(args.since, "%Y-%m-%d").date() if args.since else None

	print("connecting to {0}:{1} ...".format(args.host, args.port))
	try:
		conn = connect(args.host, args.port, args.password, args.timeout, args.udp)
	except Exception as e:
		print("  could not connect: {0}".format(str(e)[:200]))
		print("  Three things it could be, in order of likelihood:")
		print("    - wrong address, or the machine is on a different network")
		print("    - a comm key is set on the device   -> --password 1234")
		print("    - older firmware that wants UDP     -> --udp")
		return 1

	try:
		info = device_info(conn, args.host, args.port)
		print("  {0}  serial {1}  firmware {2}".format(
			info.get("name"), info.get("serial"), info.get("firmware")))

		# Everything is read before anything is written. A dump half on disk —
		# the users file written, the punch read then refused — is a folder
		# somebody has to reason about later, and the reasoning happens weeks
		# after the run when nobody remembers which pass produced what.
		users = must("the user list", conn.get_users)
		print("  users    {0:>7}  read".format(len(users)))
		rows = read_punches(conn, since)
		print("  punches  {0:>7}  read{1}".format(
			len(rows), "" if not since else "  (on or after {0})".format(since)))
		templates = must("the fingerprint templates", conn.get_templates) if args.templates else None

		serial = str(info.get("serial") or args.host.replace(".", "-")).strip() or "device"
		stamp = datetime.now().strftime("%Y-%m-%d")
		out = Path(args.out)
		out.mkdir(parents=True, exist_ok=True)
		# `--since` is in the filename, so a narrowed read cannot quietly replace
		# the whole dump taken the same day — the two files are the same machine
		# and are not the same thing, and the one that would be lost is the
		# bigger one.
		stem = "{0}-{1}".format(serial, stamp)
		if since:
			stem += "-from-{0}".format(since.isoformat())

		users_path = out / (stem + "-users.csv")
		write_users(users, users_path)
		print("  users    {0:>7}  ->  {1}".format(len(users), users_path))

		punch_path = out / (stem + "-punches.csv")
		write_punches(rows, punch_path)
		print("  punches  {0:>7}  ->  {1}".format(len(rows), punch_path))

		info["users"] = len(users)
		info["punches_written"] = len(rows)
		info["since"] = since.isoformat() if since else None
		if rows:
			info["oldest"] = rows[0].timestamp.isoformat(sep=" ")
			info["newest"] = rows[-1].timestamp.isoformat(sep=" ")
			info["punch_values"] = sorted({str(getattr(r, "punch", None)) for r in rows})

		if templates is not None:
			t_path = out / (stem + "-templates.json")
			n = write_templates(templates, t_path)
			info["templates"] = n
			print("  fingers  {0:>7}  ->  {1}".format(n, t_path))

		info_path = out / (stem + "-info.json")
		info_path.write_text(json.dumps(info, indent=1), encoding="utf-8")
		print("  info              ->  {0}".format(info_path))

		drift = info.get("drift_seconds")
		if drift is not None and abs(drift) >= 120:
			print("\n  The device clock is {0:.1f} minutes {1} this PC.".format(
				abs(drift) / 60.0, "behind" if drift > 0 else "ahead"))
			print("  Every timestamp in the punch file is the machine's own, so it is out")
			print("  by that much. Nothing downstream can tell drift from lateness.")
	except DumpFailed as e:
		# Nothing has been written at this point, and saying so is half the
		# message: the last dump in the folder is still the last good one.
		print("\n  {0}".format(e))
		print("  Nothing was written. The machine answers one bulk read at a time and")
		print("  can refuse a second while it is busy — wait a moment and run it again.")
		return 1
	finally:
		# Never `clear_attendance`, never `disable_device`. See the docstring.
		try:
			conn.disconnect()
		except Exception:
			pass
	return 0


if __name__ == "__main__":
	sys.exit(main())
