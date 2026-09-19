"""Loading and checking `config.toml`.

Every check here fails at startup rather than at 3am on the first punch. A
bridge that starts happily with a missing API secret and then silently queues a
month of attendance is the specific failure this file exists to prevent.
"""

import os
import tomllib
from dataclasses import dataclass, field

# Beside config.toml, and written by the installer. The key lives in its own
# file so it can be locked to SYSTEM (icacls) or to the service user (chmod 600)
# while the config stays readable — and so neither the Windows runner nor the
# systemd unit ever has to carry it.
ENV_FILE = "bridge.env"


@dataclass
class Config:
	erp_url: str
	api_key: str
	api_secret: str
	devices: list = field(default_factory=list)
	queue_path: str = "punches.sqlite3"
	poll_seconds: int = 300
	# How often the site is asked whether somebody left a `Machine Command` —
	# "is 851 on the gate?", asked from the dashboard and waited on by whoever
	# asked. Short, because a person is watching; one small GET each time.
	command_seconds: int = 20
	# **On by default.** These machines drift minutes a month and nothing else
	# notices: BIO-MRP-GATE1 was 7m43s slow when it was first measured, three
	# years in, which wrote everybody's arrival earlier than it happened. Off is
	# for a site whose machines are kept right by something else.
	fix_clocks: bool = True
	clock_tolerance: int = 120
	retain_days: int = 90
	log_level: str = "INFO"
	# --- the ADMS server, for machines that push instead of being read ---
	# Started by `[adms] enabled = true` or by `--adms`. In the config as well
	# as on the command line because the installers write one runner for every
	# PC, and a machine that pushes should not need somebody to edit a .bat.
	adms_enabled: bool = False
	adms_host: str = ""
	adms_port: int = 8081
	adms_delay: int = 10
	adms_timezone: str = "5.5"
	adms_first_stamp: str = "0"

	@property
	def pollable(self):
		"""The devices the ZK reader can actually open a socket to.

		A machine configured for push only has a serial and no address, and
		there is nothing for `Device` to connect to. Kept in the same list
		because it is one machine either way — the same name, the same gate,
		the same row in `Attendance Device` on the site.
		"""
		return [
			{k: v for k, v in d.items() if k != "serial"}
			for d in self.devices
			if d.get("host")
		]

	@property
	def listens(self):
		"""Whether this bridge runs the ADMS server.

		Also on when any machine is push-only: a serial with no host can reach
		this box no other way, and a bridge that silently ignored it would look
		installed while its gate's punches went nowhere.
		"""
		return self.adms_enabled or any(d.get("serial") and not d.get("host") for d in self.devices)


def read_env_file(path):
	"""`KEY=VALUE` lines, as systemd's EnvironmentFile reads them. Missing is empty."""
	values = {}
	if not os.path.exists(path):
		return values
	# utf-8-sig, because Notepad on an older Windows saves a BOM and the first
	# key would otherwise be "\ufeffMANNA_API_KEY" — a key that is present,
	# looks right, and is never found.
	try:
		with open(path, encoding="utf-8-sig") as handle:
			lines = handle.readlines()
	except PermissionError:
		# The installer locks it to SYSTEM and Administrators. Said plainly,
		# because the alternative is a traceback that reads like a broken install.
		raise SystemExit(
			"{0} is locked to administrators. Run this from a console opened as administrator.".format(path)
		)
	for line in lines:
		line = line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, value = line.split("=", 1)
		values[key.strip()] = value.strip().strip('"').strip("'")
	return values


def load_config(path):
	if not os.path.exists(path):
		raise SystemExit(
			"No config at {0}. Run the installer, or copy config.example.toml and fill it in.".format(path)
		)

	with open(path, "rb") as handle:
		raw = tomllib.load(handle)

	erp = raw.get("erp", {})
	# Secrets may come from the environment or bridge.env instead, so the config
	# can be readable by whoever maintains the box without handing them the site.
	saved = read_env_file(os.path.join(os.path.dirname(os.path.abspath(path)), ENV_FILE))
	api_key = os.environ.get("MANNA_API_KEY") or saved.get("MANNA_API_KEY") or erp.get("api_key", "")
	api_secret = (
		os.environ.get("MANNA_API_SECRET") or saved.get("MANNA_API_SECRET") or erp.get("api_secret", "")
	)

	missing = [
		name
		for name, value in (
			("erp.url", erp.get("url")),
			("erp.api_key", api_key),
			("erp.api_secret", api_secret),
		)
		if not value
	]
	if missing:
		# **Refused rather than started.** A bridge that comes up happily with no
		# API secret and quietly queues a month of attendance looks like it is
		# working the whole time, because punches really are arriving.
		raise SystemExit(
			"Config is missing: {0}\n\n"
			"The key and secret come from the site: the bridge's user -> Settings ->\n"
			"API Access -> Generate Keys. Run INSTALL.bat -Reconfigure to put them in\n"
			"{1}, beside config.toml.".format(", ".join(missing), ENV_FILE)
		)

	devices = []
	seen = set()
	serials = set()
	for entry in raw.get("device", []):
		name = entry.get("name")
		host = entry.get("host") or ""
		serial = str(entry.get("serial", "")).strip()
		# One or the other, and either is enough. `host` is how the bridge reads
		# the machine; `serial` is how the machine names itself when it pushes.
		if not name or not (host or serial):
			raise SystemExit(
				"Every [[device]] needs a name, and either a host (to be read) or a "
				"serial (to push to the ADMS server)."
			)
		if serial and serial in serials:
			# Two names for one serial is a punch filed under whichever entry
			# the loader happened to read second.
			raise SystemExit("Two devices both claim serial {0}.".format(serial))
		if serial:
			serials.add(serial)
		if name in seen:
			# `name` becomes `Employee Checkin.device_id`, and two machines
			# sharing one would make the site-side silence alarm useless — one
			# live device would mask the other's death.
			raise SystemExit("Two devices are both called {0}.".format(name))
		seen.add(name)

		devices.append(
			{
				"name": name,
				"host": host,
				"serial": serial,
				"port": int(entry.get("port", 4370)),
				"password": int(entry.get("password", 0)),
				"timeout": int(entry.get("timeout", 15)),
				"force_udp": bool(entry.get("force_udp", False)),
				# **Off unless somebody has checked the machine.** A ZK device
				# never set up for in/out reports 0 on every punch, which reads
				# as a day nobody left. See adms.log_type_for.
				"report_direction": bool(entry.get("report_direction", False)),
			}
		)

	if not devices:
		raise SystemExit("No [[device]] entries — the bridge would do nothing.")

	bridge = raw.get("bridge", {})
	adms = raw.get("adms", {})
	return Config(
		erp_url=erp["url"],
		api_key=api_key,
		api_secret=api_secret,
		devices=devices,
		queue_path=bridge.get("queue_path", "punches.sqlite3"),
		poll_seconds=int(bridge.get("poll_seconds", 300)),
		# Floored at five seconds: a smaller number is thousands of requests a
		# day against a site with a daily compute limit, for no gain a person
		# standing at a gate could notice.
		command_seconds=max(5, int(bridge.get("command_seconds", 20))),
		fix_clocks=bool(bridge.get("fix_clocks", True)),
		# Floored at 30 seconds: a tighter tolerance writes the clock on the
		# ordinary jitter of a network read, every pass, for nothing.
		clock_tolerance=max(30, int(bridge.get("clock_tolerance_seconds", 120))),
		retain_days=int(bridge.get("retain_days", 90)),
		log_level=bridge.get("log_level", "INFO"),
		adms_enabled=bool(adms.get("enabled", False)),
		# Empty means every interface.
		adms_host=adms.get("host", ""),
		# 8081 because that is what the machine at Manna Rubber Products already
		# has on its own screen. Not 80: a privileged port needs root on Linux.
		adms_port=int(adms.get("port", 8081)),
		adms_delay=int(adms.get("delay_seconds", 10)),
		adms_timezone=str(adms.get("timezone", "5.5")),
		adms_first_stamp=str(adms.get("first_stamp", "0")),
	)
