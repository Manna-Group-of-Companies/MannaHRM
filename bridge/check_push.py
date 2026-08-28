"""Ask the device whether it can push punches out by itself, and to where.

    python bridge/check_push.py 192.168.1.40

A datasheet says what the model can do; this says what *your unit* does, on its
current firmware, with its current settings. Those are different questions and
only the second one matters.

## What "push" means here

ZK-family firmware calls it **ADMS** (Automatic Data Master Server), or "Cloud
Server" in the device menu. With it configured, the machine POSTs each punch to
an HTTP endpoint as it happens, over `/iclock/cdata`. Nothing has to poll it, so
no always-on PC is needed on the device's own network.

That is the difference between needing a machine at every plant and needing none.

## How this reads it

Device settings are ordinary named parameters, fetched with `CMD_OPTIONS_RRQ` —
the same call `pyzk` uses for the device name. If a parameter comes back at all
the firmware knows about it; if it comes back with a value, it is configured.

Read-only. Nothing here writes a setting.
"""

import argparse
import sys

try:
	from zk import ZK
	from zk import const
except ImportError:
	sys.exit("Needs pyzk:  python -m pip install pyzk")

# Grouped by what an answer would tell us.
PARAMS = [
	# --- does the firmware know about ADMS at all? ---
	("WebServerIP", "ADMS server address", "push"),
	("WebServerPort", "ADMS server port", "push"),
	("EnableDomainName", "use a domain rather than an IP", "push"),
	("ADMSEnable", "ADMS switched on", "push"),
	("SupportADMS", "firmware advertises ADMS", "push"),
	# --- how eagerly would it send? ---
	("TransFlag", "what gets transmitted", "behaviour"),
	("TransTimes", "scheduled upload times", "behaviour"),
	("TransInterval", "upload interval, minutes", "behaviour"),
	("Realtime", "send each punch immediately", "behaviour"),
	("TimeZone", "device timezone offset", "behaviour"),
	# --- proxy, in case the plant network needs one ---
	("ProxyServerIP", "proxy address", "proxy"),
	("ProxyServerPort", "proxy port", "proxy"),
	("EnableProxyServer", "proxy in use", "proxy"),
	# --- context ---
	("~DeviceName", "device name", "info"),
	("~Platform", "platform", "info"),
	("FirmVer", "firmware", "info"),
	("~SerialNumber", "serial", "info"),
	("IPAddress", "device IP", "info"),
	("NetMask", "netmask", "info"),
	("GATEIPAddress", "gateway", "info"),
]


def read_param(conn, name):
	"""Returns (supported, value). `supported` False means the firmware does not
	know this parameter — which for WebServerIP is the whole answer."""
	try:
		cmd_string = ("{0}\x00".format(name)).encode()
		resp = conn._ZK__send_command(const.CMD_OPTIONS_RRQ, cmd_string, 1024)
		if not resp.get("status"):
			return False, None
		raw = conn._ZK__data
		if b"=" not in raw:
			return False, None
		value = raw.split(b"=", 1)[-1].split(b"\x00")[0].decode(errors="replace").strip()
		return True, value
	except Exception:
		return False, None


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("host")
	ap.add_argument("--port", type=int, default=4370)
	ap.add_argument("--password", type=int, default=0)
	ap.add_argument("--timeout", type=int, default=30)
	args = ap.parse_args()

	zk = ZK(args.host, port=args.port, timeout=args.timeout,
	        password=args.password, ommit_ping=True)
	try:
		conn = zk.connect()
	except Exception as e:
		sys.exit("Could not connect to {0}:{1} — {2}\n"
		         "Is the machine powered on and on this network?".format(args.host, args.port, e))

	results = {}
	try:
		for name, label, group in PARAMS:
			results[name] = (read_param(conn, name), label, group)
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass

	for group, title in [("info", "DEVICE"), ("push", "PUSH / ADMS"),
	                     ("behaviour", "UPLOAD BEHAVIOUR"), ("proxy", "PROXY")]:
		print("\n" + title)
		print("-" * 62)
		for name, label, g in PARAMS:
			if g != group:
				continue
			(supported, value), _, _ = results[name][0], results[name][1], results[name][2]
			if not supported:
				print("   {0:22} {1:28} not supported".format(name, label))
			else:
				print("   {0:22} {1:28} {2}".format(name, label, repr(value) if value != "" else "(empty)"))

	# ---- the verdict ----
	ip_ok = results["WebServerIP"][0][0]
	port_ok = results["WebServerPort"][0][0]
	ip_val = results["WebServerIP"][0][1] or ""
	port_val = results["WebServerPort"][0][1] or ""

	print("\n" + "=" * 62)
	if ip_ok or port_ok:
		print("  THIS DEVICE CAN PUSH.")
		if ip_val:
			print("  It is already configured to send to {0}:{1}".format(ip_val, port_val or "?"))
			print("  That is almost certainly Factor HR. Point a second copy of that")
			print("  setting at our own receiver and no local PC is needed at all —")
			print("  though most firmware holds only ONE server, so this would be a")
			print("  cutover rather than something that can run alongside.")
		else:
			print("  The setting exists but is empty, so nothing is being pushed today.")
			print("  Something is therefore POLLING this device for Factor HR — find")
			print("  that machine before buying anything.")
	else:
		print("  NO ADMS SUPPORT on this firmware.")
		print("  Polling is the only way in, so a machine on this network has to do it.")
	print("=" * 62)


if __name__ == "__main__":
	main()
