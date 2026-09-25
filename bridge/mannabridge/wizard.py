"""Setting a bridge up on a new PC by answering questions, not by editing TOML.

    python -m mannabridge.wizard

install.ps1 and install.sh run this. It is also safe to run on its own again —
to add a second machine, or to replace a key that was rotated — because it
keeps what it finds and asks before changing it.

What it writes, beside config.toml:

  config.toml   the site and the machines. No secret in it.
  bridge.env    the API key. The installers lock it to the service account.
  the queue     a cursor for each machine this PC has never read, set to the
                start date, so the first run does not post three years of
                history nobody asked for.

It never writes to a fingerprint machine. It connects, asks for the serial
number, the user count and the clock, and disconnects — the gate keeps working
throughout.

Output is ASCII on purpose. It runs in whatever console a Windows PC at a plant
has, and a tick mark that the code page cannot encode is a setup that crashes
halfway with the key typed in and nothing saved.
"""

import argparse
import getpass
import ipaddress
import json
import os
import re
import shutil
import socket
import tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import requests

from mannabridge.config import ENV_FILE, read_env_file
from mannabridge.queue import PunchQueue

DEFAULT_SITE = "https://mannarubber.m.frappe.cloud"

# What Manna HR Settings ships with. Read from the site whenever it answers;
# this is only what is assumed when it cannot be asked.
DEFAULT_PREFIX = "BIO-"

ZK_PORT = 4370

# `Employee Checkin.device_id` is a Data field.
MAX_NAME = 140
NAME_CHARS = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
HOST_CHARS = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]*$")


class SetupError(Exception):
	"""Something the person running setup has to fix. The message says what."""

	def __init__(self, message, unreachable=False):
		super().__init__(message)
		self.unreachable = unreachable


# ------------------------------------------------------------ pure rules ---


def normalise_site(text):
	text = (text or "").strip().rstrip("/")
	if text and "://" not in text:
		text = "https://" + text
	return text


def split_token(text):
	"""A key pasted as `key:secret` — the form ERPNext's own docs print — split in two."""
	text = (text or "").strip()
	if text.lower().startswith("token "):
		text = text[6:].strip()
	if ":" in text:
		key, secret = text.split(":", 1)
		return key.strip(), secret.strip()
	return text, ""


def name_problem(name, prefix, taken=()):
	"""Why `name` cannot be a machine's name, or None when it can."""
	if not name:
		return "a name is needed"
	if prefix and not name.startswith(prefix):
		# checkin.py judges a device_id without the prefix to be a phone, and a
		# phone punch with no coordinate is refused. So this is not a naming
		# convention: it is the difference between a gate that works and one
		# where nobody can clock in.
		return "it has to start with {0}, or ERPNext judges every punch from it as a phone punch and refuses it".format(prefix)
	if not NAME_CHARS.match(name):
		return "use letters, digits, - and _ only"
	if len(name) > MAX_NAME:
		return "keep it under {0} characters".format(MAX_NAME)
	if name in taken:
		# Two machines sharing a name would make the silence alarm useless: one
		# live machine masks the other's death.
		return "another machine on this PC already has that name"
	return None


def suggest_name(prefix, serial=None, host=None):
	tail = re.sub(r"[^A-Za-z0-9]+", "-", str(serial or host or "")).strip("-").upper()
	return (prefix or DEFAULT_PREFIX) + (tail or "GATE1")


def month_start(today):
	return today.replace(day=1)


def parse_start(text, today):
	"""The first day to send. Day-first, as dates are written here.

	Blank or "month" is the first of this month: a PC installed on the 17th
	otherwise leaves the month's first sixteen days on the machine, and the
	month is what gets paid. "today" is still today, for a zip that asks for it.
	"""
	text = (text or "").strip()
	if not text or text.lower() == "month":
		return month_start(today)
	if text.lower() == "today":
		return today
	for pattern in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
		try:
			return datetime.strptime(text, pattern).date()
		except ValueError:
			continue
	return None


def cursor_for(start):
	"""The cursor that makes `start` the first day read.

	The bridge reads only punches strictly after its cursor, so this is the last
	second of the day before — the same convention as `main --from`.
	"""
	return (start - timedelta(days=1)).strftime("%Y-%m-%d") + " 23:59:59"


def seed_cursors(queue, devices, start):
	"""Point each machine this PC has never read at `start`. Returns their names.

	A machine that already has a cursor is left alone, whatever the date said.
	Moving one forward would skip punches it has not read yet — somebody's
	morning, never sent — and moving one back only resends what is already on
	the site.
	"""
	seeded = []
	for device in devices:
		if queue.last_seen(device["name"]):
			continue
		queue.set_last_seen(device["name"], cursor_for(start))
		seeded.append(device["name"])
	return seeded


def private_subnets(addresses):
	"""The /24 around each of this PC's addresses that a machine could share.

	Private ranges only. A PC with a public address would otherwise have setup
	knocking on 254 of somebody else's computers.
	"""
	nets = []
	for text in addresses:
		try:
			ip = ipaddress.ip_address(text)
		except ValueError:
			continue
		if ip.version != 4 or not ip.is_private or ip.is_loopback or ip.is_link_local:
			continue
		net = ".".join(text.split(".")[:3])
		if net not in nets:
			nets.append(net)
	return nets


def toml_string(value):
	# JSON's escaping is a subset of what a TOML basic string accepts, for the
	# plain ASCII these values are held to.
	return json.dumps(str(value))


def render_config(site, devices, bridge=None, adms=None):
	bridge = bridge or {}
	adms = adms or {}
	lines = [
		"# Written by the bridge setup. To add a machine or change the site, run it",
		"# again (INSTALL.bat, or python -m mannabridge.wizard) rather than editing.",
		"#",
		"# The API key is not in here. It is in {0}, beside this file.".format(ENV_FILE),
		"",
		"[erp]",
		"url = " + toml_string(site),
		"",
		"[bridge]",
		"queue_path   = " + toml_string(bridge.get("queue_path", "punches.sqlite3")),
		"poll_seconds = {0}".format(int(bridge.get("poll_seconds", 300))),
		"retain_days  = {0}".format(int(bridge.get("retain_days", 90))),
		"log_level    = " + toml_string(bridge.get("log_level", "INFO")),
	]
	if adms:
		# Carried through whole. A re-run of setup that dropped this section
		# would stop the server every pushing machine delivers to, and nothing
		# on this PC would say so — the machines would simply go quiet.
		lines += ["", "[adms]"]
		for key in ("enabled", "host", "port", "delay_seconds", "timezone", "first_stamp"):
			if key not in adms:
				continue
			value = adms[key]
			if isinstance(value, bool):
				lines.append("{0} = {1}".format(key, "true" if value else "false"))
			elif isinstance(value, int):
				lines.append("{0} = {1}".format(key, value))
			else:
				lines.append("{0} = {1}".format(key, toml_string(value)))
	for device in devices:
		lines += ["", "[[device]]", "name     = " + toml_string(device["name"])]
		# A machine that only pushes has a serial and no address.
		if device.get("host"):
			lines += [
				"host     = " + toml_string(device["host"]),
				"port     = {0}".format(int(device.get("port", ZK_PORT))),
				"password = {0}".format(int(device.get("password", 0))),
			]
		# Written for a machine that is read, too: it is how the same box is
		# recognised if it is later pointed at the ADMS server instead.
		if device.get("serial"):
			lines.append("serial   = " + toml_string(device["serial"]))
		# Only when set, so a hand-tuned value survives a re-run and an untouched
		# one keeps following config.py's default.
		if device.get("timeout"):
			lines.append("timeout  = {0}".format(int(device["timeout"])))
		if device.get("force_udp"):
			lines.append("force_udp = true")
		# **Never dropped on a re-run.** The Manna Rubber Products shifts pair
		# strictly on log type, so a config rewritten without this line would
		# send no IN or OUT from that gate and mark everybody there wrong.
		if device.get("report_direction"):
			lines.append("report_direction = true")
	return "\n".join(lines) + "\n"


def render_env(api_key, api_secret):
	return (
		"# The ERPNext key this bridge posts punches with. It can write attendance for\n"
		"# the whole group: keep this file readable by the service account only.\n"
		"MANNA_API_KEY={0}\n"
		"MANNA_API_SECRET={1}\n"
	).format(api_key.strip(), api_secret.strip())


def describe_drift(seconds):
	minutes = abs(seconds) / 60.0
	if minutes < 1:
		return "right to the minute"
	text = "{0:.1f} minutes {1} this PC".format(minutes, "behind" if seconds > 0 else "ahead of")
	if minutes >= 2:
		# Nothing downstream can tell drift from lateness.
		text += " - set the time on the machine, or everybody there looks early or late"
	return text


def site_message(response):
	"""The sentence Frappe put in an error, not the traceback wrapped round it."""
	try:
		body = response.json()
	except ValueError:
		return (response.text or "HTTP {0}".format(response.status_code))[:200]
	try:
		first = json.loads(json.loads(body["_server_messages"])[0])
		return re.sub(r"<[^>]+>", "", first.get("message", "")).strip()
	except (KeyError, ValueError, TypeError, IndexError, AttributeError):
		pass
	return str(body.get("exception") or body.get("message") or "HTTP {0}".format(response.status_code))[:200]


# ------------------------------------------------------------- the site ---


class Site:
	def __init__(self, url, api_key, api_secret, timeout=20):
		self.url = url
		self.api_key = api_key
		self.api_secret = api_secret
		self._timeout = timeout
		self._session = requests.Session()
		self._session.headers.update(
			{
				"Authorization": "token {0}:{1}".format(api_key, api_secret),
				"Accept": "application/json",
			}
		)

	def _request(self, method, path, **kwargs):
		try:
			return self._session.request(method, self.url + path, timeout=self._timeout, **kwargs)
		except requests.RequestException as exc:
			raise SetupError("cannot reach {0}: {1}".format(self.url, exc), unreachable=True) from exc

	def signed_in_as(self):
		response = self._request("GET", "/api/method/frappe.auth.get_logged_user")
		if response.status_code in (401, 403):
			raise SetupError("ERPNext did not accept that key. Check both halves, and that the user is enabled.")
		if response.status_code != 200:
			raise SetupError("{0} answered HTTP {1}: {2}".format(self.url, response.status_code, site_message(response)))
		return response.json().get("message")

	def trusted_prefix(self):
		try:
			response = self._request(
				"GET",
				"/api/method/frappe.client.get_single_value",
				params={"doctype": "Manna HR Settings", "field": "trusted_device_prefix"},
			)
			if response.status_code == 200:
				return (response.json().get("message") or "").strip() or DEFAULT_PREFIX
		except (SetupError, ValueError):
			pass
		return DEFAULT_PREFIX

	def last_punch_from(self, device_id):
		"""When `device_id` last punched on the site, or None — how a name in use shows."""
		rows = self._list(
			"Employee Checkin",
			filters=[["device_id", "=", device_id]],
			fields=["time"],
			order_by="time desc",
			limit=1,
		)
		return rows[0].get("time") if rows else None

	def machines_sending(self, prefix, today, days=30):
		"""Machine names that have sent punches lately, each with its last punch.

		The site cannot say which machine a name belongs to — a punch carries no
		serial number — so this is shown to the person at the keyboard, who can.
		Without it, a second PC set up against a machine already being read
		gives that one machine two names.
		"""
		rows = self._list(
			"Employee Checkin",
			filters=[["time", ">=", (today - timedelta(days=days)).isoformat()]],
			fields=["device_id"],
			# Grouped, not max(time): this site's API refuses aggregate fields
			# with a 500, so the last punch is one small read per machine.
			group_by="device_id",
			order_by="device_id asc",
			limit=100,
		)
		names = [row["device_id"] for row in rows if (row.get("device_id") or "").startswith(prefix)]
		return [(name, self.last_punch_from(name)) for name in names]

	def registered(self, **match):
		"""Matching `Attendance Device` rows, or None when the list cannot be read."""
		return self._list(
			"Attendance Device",
			filters=[[field, "=", value] for field, value in match.items()],
			fields=["name", "device_id", "ip_address", "port", "serial_number"],
			limit=5,
			missing=None,
		)

	def companies(self):
		return [row["name"] for row in self._list("Company", fields=["name"], limit=100) or []]

	def register(self, device, label, company):
		response = self._request(
			"POST",
			"/api/resource/Attendance Device",
			json={
				"device_name": label,
				"device_id": device["name"],
				"company": company,
				"ip_address": device.get("host") or "",
				"port": int(device.get("port", ZK_PORT)),
				"serial_number": device.get("serial") or "",
				"model": device.get("model") or "",
				"is_active": 1,
			},
		)
		if response.status_code not in (200, 201):
			raise SetupError(site_message(response))

	def update_address(self, docname, device):
		response = self._request(
			"PUT",
			"/api/resource/Attendance Device/" + docname,
			json={"ip_address": device.get("host") or "", "port": int(device.get("port", ZK_PORT))},
		)
		if response.status_code != 200:
			raise SetupError(site_message(response))

	def _list(self, doctype, filters=None, fields=None, order_by=None, group_by=None, limit=20, missing=()):
		params = {"fields": json.dumps(fields or ["name"]), "limit_page_length": limit}
		if filters:
			params["filters"] = json.dumps(filters)
		if order_by:
			params["order_by"] = order_by
		if group_by:
			params["group_by"] = group_by
		try:
			response = self._request("GET", "/api/resource/" + doctype, params=params)
			if response.status_code == 200:
				return response.json().get("data") or []
		except (SetupError, ValueError):
			pass
		# Not allowed, not on the site, or not reachable. Setup carries on either
		# way; the caller decides whether "could not tell" matters.
		return [] if missing == () else missing


# ---------------------------------------------------------- the machines ---


def this_pcs_addresses():
	found = set()
	try:
		for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
			found.add(info[4][0])
	except OSError:
		pass
	try:
		# Picks the interface that would reach the internet. Nothing is sent: a
		# UDP connect only chooses a route.
		probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		probe.connect(("8.8.8.8", 80))
		found.add(probe.getsockname()[0])
		probe.close()
	except OSError:
		pass
	return sorted(found)


def port_open(host, port=ZK_PORT, timeout=0.5):
	try:
		with socket.create_connection((host, port), timeout=timeout):
			return True
	except OSError:
		return False


def subnet_hosts(nets):
	"""Every address in each /24 that `private_subnets` names.

	`scan` wants addresses, and `private_subnets` answers networks. Handing it
	the networks is a search that asks "192.168.1" whether it is a machine and
	reports that there are none, in a fifth of a second - which is what the
	console's search did until this existed.
	"""
	return ["{0}.{1}".format(net, i) for net in nets for i in range(1, 255)]


def scan(hosts, port=ZK_PORT):
	with ThreadPoolExecutor(max_workers=64) as pool:
		answers = list(pool.map(lambda host: (host, port_open(host, port)), hosts))
	return [host for host, answered in answers if answered]


def look_at(host, port=ZK_PORT, password=0, force_udp=False, timeout=8):
	"""Serial, model, enrolled users and clock, off the machine itself. Read-only.

	Deliberately not the attendance log: on a machine holding 80,000 punches that
	is a minute's read, and setup only needs to know it is talking to the right
	box.
	"""
	from zk import ZK

	conn = ZK(host, port=port, timeout=timeout, password=password, force_udp=force_udp, ommit_ping=True).connect()
	try:
		info = {"serial": _quietly(conn.get_serialnumber), "model": _quietly(conn.get_device_name)}
		users = _quietly(conn.get_users)
		info["users"] = len(users) if isinstance(users, list) else None
		clock = _quietly(conn.get_time)
		if isinstance(clock, datetime):
			info["drift_seconds"] = round((datetime.now() - clock).total_seconds())
		return info
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass


def _quietly(call):
	# Firmware varies in what it answers. One unsupported question must not end
	# setup when the rest of the answers are still worth having.
	try:
		return call()
	except Exception:
		return None


# ------------------------------------------------------------ talking ---


def heading(text):
	print()
	print(text)
	print("-" * len(text))


def ask(prompt, default=None):
	suffix = " [{0}]".format(default) if default not in (None, "") else ""
	try:
		answer = input("  {0}{1}: ".format(prompt, suffix)).strip()
	except EOFError:
		raise SystemExit("\nSetup needs somebody at the keyboard. Run it in a console window.")
	return answer or ("" if default is None else str(default))


def yes(prompt, default=True):
	while True:
		answer = ask("{0} ({1})".format(prompt, "Y/n" if default else "y/N")).lower()
		if not answer:
			return default
		if answer in ("y", "yes"):
			return True
		if answer in ("n", "no"):
			return False


def hidden(prompt):
	try:
		return getpass.getpass("  {0}: ".format(prompt)).strip()
	except EOFError:
		raise SystemExit("\nSetup needs somebody at the keyboard. Run it in a console window.")


# -------------------------------------------------------------- the steps ---


def connect_site(existing, env_path):
	heading("1. ERPNext")
	url = normalise_site(ask("Site address", existing.get("erp", {}).get("url") or DEFAULT_SITE))

	saved = read_env_file(env_path)
	key, secret = saved.get("MANNA_API_KEY", ""), saved.get("MANNA_API_SECRET", "")
	if key and secret and not yes("Use the API key already saved on this PC?"):
		key = secret = ""

	while True:
		if not (key and secret):
			print()
			print("  The key comes from ERPNext: open the user the bridge posts as,")
			print("  then Settings > API Access > Generate Keys. It needs to be allowed")
			print("  to create Employee Checkin.")
			key, secret = split_token(ask("API key"))
			if not secret:
				secret = hidden("API secret (hidden while you type or paste; press Enter after)")

		site = Site(url, key, secret)
		try:
			print("  checking ...")
			print("  OK - signed in to {0} as {1}".format(url, site.signed_in_as()))
			return site
		except SetupError as exc:
			print("  x {0}".format(exc))
			if exc.unreachable and yes(
				"Carry on without checking? Punches wait on this PC until the site answers", default=False
			):
				return site
			key = secret = ""
			if not yes("Try again?"):
				raise SystemExit("Setup stopped before anything was written.")


def choose_devices(site, prefix, existing):
	heading("2. Fingerprint machines")
	devices = []
	sending = site.machines_sending(prefix, date.today())

	kept = [dict(d) for d in existing.get("device", []) if d.get("name") and (d.get("host") or d.get("serial"))]
	if kept:
		print("  This PC already reads:")
		for device in kept:
			print("    {0} {1}".format(device["name"], where(device)))
		if yes("Keep reading these?"):
			devices = kept

	if yes("Search this network for fingerprint machines?"):
		nets = private_subnets(this_pcs_addresses())
		if not nets:
			print("  This PC has no local network address to search from.")
		for net in nets:
			print("  searching {0}.1 to {0}.254 on port {1} ...".format(net, ZK_PORT))
			known = {device.get("host") for device in devices}
			found = [host for host in scan(subnet_hosts([net])) if host not in known]
			if not found:
				print("  nothing new answering on {0}.x".format(net))
			for host in found:
				add_device(site, prefix, devices, host, sending)

	while yes("Add a machine by its IP address?", default=not devices):
		print("  On the machine: Menu > Comm > Ethernet shows its IP address.")
		host = ask("IP address")
		if not HOST_CHARS.match(host):
			print("  x that does not look like an address")
			continue
		add_device(site, prefix, devices, host, sending)

	return devices


def add_device(site, prefix, devices, host, sending=()):
	print()
	print("  Machine at {0}".format(host))
	port, password = ZK_PORT, 0
	info = force_udp = None
	while info is None:
		print("  connecting ...")
		error = None
		# TCP first; older firmware answers only UDP, and nobody at a plant
		# knows which theirs is.
		for udp in (False, True):
			try:
				info, force_udp = look_at(host, port, password, force_udp=udp), udp
				break
			except Exception as exc:
				error = exc
		if info is None:
			print("  x could not talk to it: {0}".format(error))
			print("    Usually one of: a wrong address, a machine on another network,")
			print("    or a comm key set on the machine (Menu > Comm > Comm Key).")
			answer = ask("Comm key to try, or Enter to skip this machine")
			if not answer:
				return
			if not answer.isdigit():
				print("  x a comm key is a number")
				continue
			password = int(answer)

	print("    serial        {0}".format(info.get("serial") or "-"))
	print("    calls itself  {0}".format(info.get("model") or "-"))
	if info.get("users") is not None:
		print("    enrolled      {0} people".format(info["users"]))
	if info.get("drift_seconds") is not None:
		print("    clock         {0}".format(describe_drift(info["drift_seconds"])))
	if not yes("Read punches from this machine?"):
		return

	suggestion = suggest_name(prefix, info.get("serial"), host)
	listed = site.registered(serial_number=info["serial"]) if info.get("serial") else None
	if listed:
		suggestion = listed[0]["device_id"]
		print("  ERPNext already knows this machine as {0}.".format(suggestion))
	else:
		if sending:
			print("  Machines already sending punches to ERPNext:")
			for name, last in sending:
				print("    {0}  last punch {1}".format(name, last or "-"))
			print("  If this is one of them - being moved to this PC, or read by a second")
			print("  one - type that same name. One machine, one name.")
		print("  A new machine needs a new name. It goes on every punch in ERPNext, so pick")
		print("  one people recognise, like {0}TREADS-GATE1. No two machines may share it.".format(prefix))

	taken = {device["name"] for device in devices}
	while True:
		name = ask("Name", suggestion)
		if prefix == prefix.upper():
			name = name.upper()
		problem = name_problem(name, prefix, taken)
		if problem:
			print("  x {0}".format(problem))
			continue
		last = None if listed and name == suggestion else site.last_punch_from(name)
		if last and not yes(
			"{0} already has punches in ERPNext, the last at {1}. Is this that same machine?".format(name, last),
			default=False,
		):
			continue
		break

	devices.append(
		{
			"name": name,
			"host": host,
			"port": port,
			"password": password,
			"force_udp": force_udp,
			"serial": info.get("serial"),
			"model": info.get("model"),
		}
	)
	print("  OK - {0} added".format(name))


def choose_start(today):
	heading("3. Where to start")
	print("  A machine holds years of punches. Only punches from this day on are sent;")
	print("  older ones stay on the machine, untouched.")
	while True:
		start = parse_start(ask("First day to send (DD-MM-YYYY)", month_start(today).strftime("%d-%m-%Y")), today)
		if start is None:
			print("  x write it like {0}".format(today.strftime("%d-%m-%Y")))
		elif start > today:
			print("  x that is in the future, and every punch until then would be skipped")
		else:
			if (today - start).days > 31:
				print("  That is {0} days of punches to send. The first run will take a while.".format((today - start).days))
			return start


def register_devices(site, prefix, devices):
	heading("4. ERPNext's list of machines")
	unlisted = []
	for device in devices:
		rows = site.registered(device_id=device["name"])
		if rows is None:
			print("  Could not read Attendance Device from ERPNext - the key may not be allowed")
			print("  to. The bridge works without it; HR can list the machines by hand.")
			return
		if not rows:
			unlisted.append(device)
			continue
		row = rows[0]
		if not device.get("host"):
			print("  {0} pushes; ERPNext keeps whatever address it has".format(device["name"]))
			continue
		if row.get("ip_address") != device["host"] or int(row.get("port") or ZK_PORT) != int(device.get("port", ZK_PORT)):
			if yes("ERPNext lists {0} at {1}. Change that to {2}?".format(device["name"], row.get("ip_address") or "no address", device["host"])):
				try:
					site.update_address(row["name"], device)
					print("  OK - updated")
				except SetupError as exc:
					print("  x not updated: {0}".format(exc))
		else:
			print("  {0} is already listed".format(device["name"]))

	if not unlisted or not yes(
		"Add {0} machine(s) to ERPNext's Attendance Device list? It is how HR is told when a machine goes quiet".format(len(unlisted))
	):
		return

	companies = site.companies()
	company = companies[0] if len(companies) == 1 else ""
	for device in unlisted:
		print()
		label = ask("What do people at the plant call {0}".format(device["name"]), device["name"][len(prefix):].replace("-", " ").title())
		if len(companies) > 1:
			for number, name in enumerate(companies, 1):
				print("    {0}. {1}".format(number, name))
			while True:
				# One machine can serve several companies; this is only where it stands.
				answer = ask("Which company is it at (number)", companies.index(company) + 1 if company else None)
				if answer.isdigit() and 1 <= int(answer) <= len(companies):
					company = companies[int(answer) - 1]
					break
				print("  x pick a number from the list")
		elif not company:
			company = ask("Company it belongs to")
		try:
			site.register(device, label, company)
			print("  OK - {0} is on the list".format(device["name"]))
		except SetupError as exc:
			print("  x not added: {0}".format(exc))
			print("    HR can add it in ERPNext: Attendance Device > Add, with Device ID {0}".format(device["name"]))


def write_private(path, text):
	"""Created readable by its owner only, where the platform has such a thing.

	On Windows, install.ps1 narrows the ACL to SYSTEM and Administrators after.
	"""
	if os.name == "posix":
		fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
		with os.fdopen(fd, "w", encoding="utf-8") as handle:
			handle.write(text)
	else:
		with open(path, "w", encoding="utf-8", newline="\n") as handle:
			handle.write(text)


def read_toml(path):
	if not os.path.exists(path):
		return {}
	try:
		with open(path, "rb") as handle:
			return tomllib.load(handle)
	except tomllib.TOMLDecodeError as exc:
		print("  The existing {0} could not be read ({1}); starting from scratch.".format(path, exc))
		return {}


# ---------------------------------------------------------- no keyboard ---

# Beside INSTALL.bat in an auto-install zip, written by `package.ps1 -Auto`. It
# holds the API key, which is why the installer deletes it once the key is in
# bridge.env and locked.
AUTO_FILE = "autoinstall.toml"

# Tracked, and in every zip: machine serial -> the name its punches already
# carry. A punch holds no serial, so this is the only way a PC installed with
# nobody at it can know that the box in front of it is BIO-MRP-GATE1 and not a
# new machine.
KNOWN_FILE = "known_machines.toml"


def where(device):
	"""How a configured machine is reached, in a few words."""
	if device.get("host"):
		return "at {0}:{1}".format(device["host"], device.get("port", ZK_PORT))
	return "pushing, serial {0}".format(device.get("serial"))


def known_machines(raw):
	"""`({serial: name}, {serial: reports_direction})` from known_machines.toml.

	A line is a name, or a table with the name and `report_direction`. The table
	exists for the Manna Rubber Products gate: its shifts pair strictly on log
	type, and an automatic install that left direction off — the safe default
	for a machine nobody has checked — would mark everybody at that gate wrong.
	"""
	names, directions = {}, {}
	for serial, value in (raw.get("machines") or {}).items():
		if isinstance(value, dict):
			if value.get("name"):
				names[str(serial)] = str(value["name"])
			directions[str(serial)] = bool(value.get("report_direction", False))
		else:
			names[str(serial)] = str(value)
	return names, directions


def auto_name(prefix, serial, host, known, listed, taken):
	"""The name a machine gets when nobody is at the keyboard to choose one.

	A name the group already uses for this serial first — from the file, then
	from the Attendance Device register — so a machine moved to another PC keeps
	its punches under one name. Otherwise the serial itself: unique across every
	site, and unchanged when the machine is given a new IP, so reinstalling
	anywhere arrives at the same name without anybody remembering it.
	"""
	for candidate in (known.get(serial or ""), listed):
		if candidate and not name_problem(candidate, prefix, taken):
			return candidate
	base = suggest_name(prefix, serial, host)
	name, n = base, 2
	while name in taken:
		name, n = "{0}-{1}".format(base, n), n + 1
	return name


def refusal_hint(errors):
	"""What a list of failed connection attempts most likely means, in words.

	pyzk says "Unauthenticated" when the machine wants a comm key it was not
	given. Anything else from a machine whose port is open is usually another
	program — eTimeTrackLite, on eSSL sites — holding the machine at that moment.
	"""
	text = " ".join(str(e) for e in errors).lower()
	if "unauthenticated" in text:
		return "the machine has a comm key set (on the machine: Menu > Comm > Comm Key)"
	return ("another program may be connected to the machine right now (eTimeTrackLite or "
		"similar), or it wants a comm key (Menu > Comm > Comm Key)")


def auto_device(site, prefix, host, known, comm_keys, taken, errors=None, directions=None):
	"""The config entry for the machine at `host`, or None when it will not answer.

	`errors`, when given, collects every attempt's failure, so the caller can say
	why rather than only that.
	"""
	errors = [] if errors is None else errors
	for password in comm_keys:
		# TCP first; older firmware answers only UDP.
		for udp in (False, True):
			try:
				info = look_at(host, ZK_PORT, password, force_udp=udp)
			except Exception as exc:
				errors.append("{0}, comm key {1}: {2}".format("UDP" if udp else "TCP", password, exc))
				continue
			serial = info.get("serial")
			listed = site.registered(serial_number=serial) if serial else None
			name = auto_name(prefix, serial, host, known, listed[0]["device_id"] if listed else None, taken)
			print("  OK - {0} at {1} (serial {2}, {3} people)".format(
				name, host, serial or "-", info.get("users") if info.get("users") is not None else "?"))
			if info.get("drift_seconds") is not None and abs(info["drift_seconds"]) >= 120:
				print("       clock {0}".format(describe_drift(info["drift_seconds"])))
			return {
				"name": name, "host": host, "port": ZK_PORT, "password": password,
				"force_udp": udp, "serial": serial, "model": info.get("model"),
				"report_direction": bool((directions or {}).get(serial or "")),
			}
	# One short line each: a console at a plant is 80 columns, and the reason
	# was once cut off at exactly the word that said what to do.
	print("  x {0} answers on port {1}, but would not let the bridge in.".format(host, ZK_PORT))
	for line in errors[-4:]:
		print("      {0}".format(line))
	print("    Most likely: {0}.".format(refusal_hint(errors)))
	return None


def run_auto(config_path, auto_path, today=None, interactive=None):
	"""Setup with every answer taken from `autoinstall.toml`.

	Reads the keyboard in one case only: a machine answered on its port and
	refused every comm key in the file, and somebody is at the console. Stopping
	there with "no machine found" — what the first eSSL site saw, on 15 Sep 2026
	— sends a person back to edit a file for the one number they could simply
	have typed. With no console (a service, a pipe) it never asks.
	"""
	import sys

	interactive = sys.stdin.isatty() if interactive is None else interactive
	today = today or date.today()
	here = os.path.dirname(config_path)
	env_path = os.path.join(here, ENV_FILE)

	settings = read_toml(auto_path)
	if not settings:
		raise SystemExit("{0} is missing or unreadable, so there is nothing to set up from.".format(auto_path))
	existing = read_toml(config_path)
	saved = read_env_file(env_path)
	erp = settings.get("erp", {})
	machines = settings.get("machines", {})

	print()
	print("Manna attendance bridge - automatic setup")

	heading("1. ERPNext")
	url = normalise_site(erp.get("url") or existing.get("erp", {}).get("url") or DEFAULT_SITE)
	key = erp.get("api_key") or saved.get("MANNA_API_KEY", "")
	secret = erp.get("api_secret") or saved.get("MANNA_API_SECRET", "")
	if not (key and secret):
		raise SystemExit("{0} has no api_key and api_secret.".format(auto_path))
	site = Site(url, key, secret)
	try:
		print("  OK - signed in to {0} as {1}".format(url, site.signed_in_as()))
	except SetupError as exc:
		if not exc.unreachable:
			raise SystemExit("ERPNext refused the key in {0}: {1}".format(os.path.basename(auto_path), exc))
		# Set up anyway. The bridge holds punches until the line comes back, and
		# a plant whose internet is down today still needs its gate read.
		print("  ! {0} - carrying on; punches wait on this PC until it answers".format(exc))
	prefix = site.trusted_prefix()

	heading("2. Fingerprint machines")
	known, directions = known_machines(read_toml(os.path.join(here, KNOWN_FILE)))
	comm_keys = [int(k) for k in machines.get("comm_keys", [0])] or [0]
	devices = [dict(d) for d in existing.get("device", []) if d.get("name") and (d.get("host") or d.get("serial"))]
	for device in devices:
		print("  kept - {0} {1}".format(device["name"], where(device)))

	hosts = []
	for net in private_subnets(this_pcs_addresses()):
		print("  searching {0}.1 to {0}.254 ...".format(net))
		hosts += scan(subnet_hosts([net]))
	# Named in the file: a machine on another subnet of the same plant, which
	# the search cannot see but this PC can still reach.
	hosts += [str(h).strip() for h in machines.get("hosts", []) if str(h).strip()]

	seen = {device.get("host") for device in devices if device.get("host")}
	for host in hosts:
		if host in seen:
			continue
		seen.add(host)
		device = auto_device(site, prefix, host, known, comm_keys, {d["name"] for d in devices}, directions=directions)
		while device is None and interactive:
			answer = ask("Comm key for the machine at {0} (a number), or Enter to skip it".format(host))
			if not answer:
				break
			if not answer.isdigit():
				print("  x a comm key is a number")
				continue
			device = auto_device(site, prefix, host, known, [int(answer)], {d["name"] for d in devices}, directions=directions)
		if device:
			devices.append(device)

	if not devices:
		raise SystemExit(
			"\nNo fingerprint machine answered on this network. Check the machine is switched on and "
			"plugged into the same network as this PC (on the machine: Menu > Comm > Ethernet), then "
			"run INSTALL.bat again."
		)

	start = parse_start(str(machines.get("start", "month")), today)
	if start is None or start > today:
		start = today

	bridge = existing.get("bridge", {})
	queue = PunchQueue(os.path.join(here, bridge.get("queue_path", "punches.sqlite3")))
	if os.path.exists(config_path):
		shutil.copyfile(config_path, config_path + ".bak")
	with open(config_path, "w", encoding="utf-8", newline="\n") as handle:
		handle.write(render_config(site.url, devices, bridge, existing.get("adms")))
	write_private(env_path, render_env(key, secret))
	seeded = seed_cursors(queue, devices, start)

	heading("Done")
	print("  {0} machine(s), sending to {1}".format(len(devices), site.url))
	for name in seeded:
		print("  {0} starts from {1}".format(name, start.strftime("%d-%m-%Y")))
	return devices


def main():
	parser = argparse.ArgumentParser(description="Set this PC up to send its fingerprint machines' punches to ERPNext")
	parser.add_argument("--config", default="config.toml")
	parser.add_argument("--auto", metavar="AUTOINSTALL_TOML", help="take every answer from this file; ask nothing")
	args = parser.parse_args()

	if args.auto:
		run_auto(os.path.abspath(args.config), os.path.abspath(args.auto))
		return

	config_path = os.path.abspath(args.config)
	here = os.path.dirname(config_path)
	env_path = os.path.join(here, ENV_FILE)
	existing = read_toml(config_path)

	print()
	print("Manna attendance bridge - setup")
	print("Reads the fingerprint machines on this network and sends every punch to ERPNext.")
	print("Press Enter to accept the answer in [brackets].")

	site = connect_site(existing, env_path)
	prefix = site.trusted_prefix()

	devices = choose_devices(site, prefix, existing)
	if not devices:
		raise SystemExit("\nNo machine was added, so nothing has been written.")

	bridge = existing.get("bridge", {})
	queue = PunchQueue(os.path.join(here, bridge.get("queue_path", "punches.sqlite3")))
	fresh = [device for device in devices if not queue.last_seen(device["name"])]
	start = choose_start(date.today()) if fresh else None

	# Local files first. If the site misbehaves while registering, the bridge is
	# still set up and still sends punches.
	if os.path.exists(config_path):
		shutil.copyfile(config_path, config_path + ".bak")
	with open(config_path, "w", encoding="utf-8", newline="\n") as handle:
		handle.write(render_config(site.url, devices, bridge, existing.get("adms")))
	write_private(env_path, render_env(site.api_key, site.api_secret))
	seeded = seed_cursors(queue, devices, start) if start else []

	register_devices(site, prefix, devices)

	heading("Done")
	print("  {0}  the site and {1} machine(s)".format(config_path, len(devices)))
	print("  {0}  the key - keep it private".format(env_path))
	for name in seeded:
		print("  {0} starts from {1}".format(name, start.strftime("%d-%m-%Y")))
	print()
	print("  Everybody enrolled on these machines needs their machine number in")
	print("  ERPNext, on Employee > Attendance Device ID. Until then their punches")
	print("  wait on this PC, unsent, and go the moment it is filled in.")


if __name__ == "__main__":
	main()
