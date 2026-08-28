"""Loading and checking `config.toml`.

Every check here fails at startup rather than at 3am on the first punch. A
bridge that starts happily with a missing API secret and then silently queues a
month of attendance is the specific failure this file exists to prevent.
"""

import os
import tomllib
from dataclasses import dataclass, field


@dataclass
class Config:
	erp_url: str
	api_key: str
	api_secret: str
	devices: list = field(default_factory=list)
	queue_path: str = "punches.sqlite3"
	poll_seconds: int = 300
	retain_days: int = 90
	log_level: str = "INFO"


def load_config(path):
	if not os.path.exists(path):
		raise SystemExit(
			"No config at {0}. Copy config.example.toml and fill it in.".format(path)
		)

	with open(path, "rb") as handle:
		raw = tomllib.load(handle)

	erp = raw.get("erp", {})
	# Secrets may come from the environment instead, so the file can be readable
	# by whoever maintains the box without handing them the site.
	api_key = os.environ.get("MANNA_API_KEY") or erp.get("api_key", "")
	api_secret = os.environ.get("MANNA_API_SECRET") or erp.get("api_secret", "")

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
		raise SystemExit("Config is missing: {0}".format(", ".join(missing)))

	devices = []
	seen = set()
	for entry in raw.get("device", []):
		name = entry.get("name")
		host = entry.get("host")
		if not name or not host:
			raise SystemExit("Every [[device]] needs a name and a host.")
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
				"port": int(entry.get("port", 4370)),
				"password": int(entry.get("password", 0)),
				"timeout": int(entry.get("timeout", 15)),
				"force_udp": bool(entry.get("force_udp", False)),
			}
		)

	if not devices:
		raise SystemExit("No [[device]] entries — the bridge would do nothing.")

	bridge = raw.get("bridge", {})
	return Config(
		erp_url=erp["url"],
		api_key=api_key,
		api_secret=api_secret,
		devices=devices,
		queue_path=bridge.get("queue_path", "punches.sqlite3"),
		poll_seconds=int(bridge.get("poll_seconds", 300)),
		retain_days=int(bridge.get("retain_days", 90)),
		log_level=bridge.get("log_level", "INFO"),
	)
