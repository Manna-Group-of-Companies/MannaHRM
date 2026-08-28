"""Find a fingerprint machine on the network and read everything we need off it.

    python bridge/probe.py                    # scan this PC's own subnet
    python bridge/probe.py 192.168.1.0/24     # scan a specific range
    python bridge/probe.py 192.168.1.201      # one machine you already know
    python bridge/probe.py 192.168.1.201 --password 1234

Prints a ready-to-paste `[[device]]` block for `config.toml`, plus the two
things that decide how the shift has to be configured:

  - **Does the device report a punch direction (IN/OUT)?** Many are set up not
    to. If it does not, the shift must alternate punches, and one extra punch —
    somebody stepping out for tea and back — silently reverses the pairing for
    the rest of that day.
  - **How far is the device's own clock from this PC's?** These machines keep
    their own time and drift by minutes a month. A gate running eight minutes
    fast makes everybody there late, and nothing downstream can tell the
    difference between drift and lateness.

Read-only throughout. It does not write to the device, does not clear its log,
and does not enable or disable it.

Needs pyzk:  python -m pip install pyzk
"""

import argparse
import socket
import sys
import threading
from datetime import datetime

try:
	from zk import ZK
except ImportError:
	sys.exit("Needs pyzk:  python -m pip install pyzk")

ZK_PORT = 4370


# ------------------------------------------------------------------ scan ---

def local_subnets():
	"""This PC's own /24s, so the common case needs no arguments.

	Uses a UDP connect to work out which interface would be used to reach the
	outside world — no packet is actually sent, and it does not need the
	internet to be up.
	"""
	found = []
	try:
		s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		s.connect(("8.8.8.8", 80))
		ip = s.getsockname()[0]
		s.close()
		found.append(".".join(ip.split(".")[:3]) + ".0/24")
	except Exception:
		pass
	return found


def expand(target):
	if "/" in target:
		base = target.split("/")[0]
		head = ".".join(base.split(".")[:3])
		return ["{0}.{1}".format(head, i) for i in range(1, 255)]
	return [target]


def port_open(host, port, timeout=0.4):
	s = socket.socket()
	s.settimeout(timeout)
	try:
		return s.connect_ex((host, port)) == 0
	finally:
		s.close()


def scan(hosts, port=ZK_PORT, workers=64):
	hits, lock = [], threading.Lock()
	queue = list(hosts)
	qlock = threading.Lock()

	def work():
		while True:
			with qlock:
				if not queue:
					return
				h = queue.pop()
			if port_open(h, port):
				with lock:
					hits.append(h)

	threads = [threading.Thread(target=work, daemon=True) for _ in range(workers)]
	[t.start() for t in threads]
	[t.join() for t in threads]
	return sorted(hits, key=lambda h: [int(x) for x in h.split(".")])


# ----------------------------------------------------------------- probe ---

def safe(fn, default="—"):
	"""Firmware varies wildly in what it answers. One unsupported call must not
	end the probe — half the details are still worth having."""
	try:
		v = fn()
		return default if v in (None, "") else v
	except Exception:
		return default


def probe(host, port=ZK_PORT, password=0, timeout=12, force_udp=False):
	zk = ZK(host, port=port, timeout=timeout, password=password,
	        force_udp=force_udp, ommit_ping=True)
	conn = None
	try:
		conn = zk.connect()
	except Exception as e:
		return {"host": host, "ok": False, "error": str(e)[:160]}

	out = {"host": host, "ok": True, "port": port, "password": password}
	try:
		out["name"] = safe(conn.get_device_name)
		out["serial"] = safe(conn.get_serialnumber)
		out["firmware"] = safe(conn.get_firmware_version)
		out["platform"] = safe(conn.get_platform)
		out["mac"] = safe(conn.get_mac)

		device_time = safe(conn.get_time, None)
		out["device_time"] = device_time
		if isinstance(device_time, datetime):
			out["drift_seconds"] = round((datetime.now() - device_time).total_seconds())

		users = safe(conn.get_users, [])
		out["users"] = len(users) if isinstance(users, list) else "—"
		out["sample_user_ids"] = [str(u.user_id) for u in users[:8]] if isinstance(users, list) else []

		# Deliberately not disabling the device: this is a read-only look, and
		# a probe that locks the gate while somebody is trying to punch is a
		# probe that gets run once and never again.
		logs = safe(conn.get_attendance, [])
		out["records"] = len(logs) if isinstance(logs, list) else "—"
		if isinstance(logs, list) and logs:
			logs = sorted(logs, key=lambda r: r.timestamp)
			out["oldest"] = logs[0].timestamp
			out["newest"] = logs[-1].timestamp
			punches = {getattr(r, "punch", None) for r in logs}
			out["punch_values"] = sorted(str(p) for p in punches)
			# 0/1 means IN and OUT are reported. A single value, or all None,
			# means the machine sends no direction at all.
			out["reports_direction"] = len(punches - {None}) > 1
			out["samples"] = [(str(r.user_id), r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
			                   getattr(r, "punch", None)) for r in logs[-5:]]
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass
	return out


# ---------------------------------------------------------------- report ---

def report(d):
	if not d.get("ok"):
		print("  {0}  did not answer the ZK protocol".format(d["host"]))
		print("      {0}".format(d.get("error")))
		print("      Three things it could be, in order of likelihood:")
		print("        - wrong address, or the machine is on a different network")
		print("        - a comm key is set on the device        -> try --password 1234")
		print("        - older firmware that wants UDP           -> try --udp")
		print("      If none of those help, it may not be a ZK-family device at all,")
		print("      which is worth knowing now rather than after the bridge is built.")
		return

	print("=" * 70)
	print("  DEVICE FOUND at {0}:{1}".format(d["host"], d["port"]))
	print("=" * 70)
	for label, key in [("Name", "name"), ("Serial", "serial"), ("Firmware", "firmware"),
	                   ("Platform", "platform"), ("MAC", "mac")]:
		print("   {0:22} {1}".format(label, d.get(key, "—")))

	print("   {0:22} {1}".format("Enrolled users", d.get("users")))
	if d.get("sample_user_ids"):
		print("   {0:22} {1}".format("Sample user IDs", ", ".join(d["sample_user_ids"])))
		print("        ^ these must match Employee.attendance_device_id in ERPNext")

	print("   {0:22} {1}".format("Punch records held", d.get("records")))
	if d.get("oldest"):
		print("   {0:22} {1}  ->  {2}".format("Records span", d["oldest"], d["newest"]))

	drift = d.get("drift_seconds")
	if drift is not None:
		mins = drift / 60.0
		flag = "  <-- FIX THIS" if abs(mins) >= 2 else ""
		print("   {0:22} {1}   (device is {2:.1f} min {3} this PC){4}".format(
			"Device clock", d.get("device_time"), abs(mins),
			"behind" if drift > 0 else "ahead", flag))

	rd = d.get("reports_direction")
	if rd is not None:
		print("   {0:22} {1}   (punch values seen: {2})".format(
			"Reports IN/OUT?", "YES" if rd else "NO — alternating pairing required",
			", ".join(d.get("punch_values", []))))

	if d.get("samples"):
		print("\n   Last 5 punches (user, time, direction):")
		for u, t, p in d["samples"]:
			print("      {0:10} {1}   {2}".format(u, t, p))

	print("\n   ---- paste into bridge/config.toml ----")
	print("   [[device]]")
	print('   name     = "BIO-{0}"   # must start with BIO- and be unique across all sites'.format(
		str(d.get("serial") or d["host"].replace(".", "-"))[:16]))
	print('   host     = "{0}"'.format(d["host"]))
	print("   port     = {0}".format(d["port"]))
	print("   password = {0}".format(d["password"]))
	print()


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("target", nargs="?", help="IP, or CIDR like 192.168.1.0/24. Omit to scan this PC's subnet.")
	ap.add_argument("--port", type=int, default=ZK_PORT)
	ap.add_argument("--password", type=int, default=0, help="the device comm key, if one is set")
	ap.add_argument("--udp", action="store_true", help="try UDP; some older firmware needs it")
	args = ap.parse_args()

	targets = [args.target] if args.target else local_subnets()
	if not targets:
		sys.exit("Could not work out this PC's subnet. Pass one, e.g. 192.168.1.0/24")

	hosts = []
	for t in targets:
		hosts.extend(expand(t))

	if len(hosts) > 1:
		print("scanning {0} address(es) on port {1} ...".format(len(hosts), args.port))
		hits = scan(hosts, args.port)
		if not hits:
			print("\nNothing answering on port {0}.".format(args.port))
			print("Check the machine is on the same network as this PC, and that its")
			print("IP is what you think: on the device, Menu -> Comm -> Ethernet.")
			return
		print("open on port {0}: {1}\n".format(args.port, ", ".join(hits)))
	else:
		hits = hosts

	for h in hits:
		report(probe(h, args.port, args.password, force_udp=args.udp))


if __name__ == "__main__":
	main()
