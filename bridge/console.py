"""The gate PC's own console: the machines and ERPNext on one screen.

Why this exists as well as the dashboard. A browser on somebody's desk can
reach ERPNext and nothing else — the machines sit on the plant's LAN, and that
is the whole reason `Machine Command` and the bridge exist. **This PC can reach
both.** So the one place where a person can create somebody, put them on the
machine and watch their punch arrive, without waiting on anything, is here.

It is a web page because the bridge already needs Python and nothing else: no
toolkit, no build step, no second thing to install. `CONSOLE.bat` opens it.

**It listens on 127.0.0.1 only.** It reads `bridge.env`, which holds a key that
can write attendance for the whole group, and it drives the fingerprint
machines. A console bound to the network would hand both to whoever is on the
LAN. `_refuse_strangers` is the second half of that rule, for the day somebody
changes the bind address.

What it will not do, the same list as everywhere else in this folder: it never
clears a machine's log, never wipes one, never switches one off, and never
writes a number that already belongs to somebody — see `employee_tools.py` and
`machine.py`, whose rules it calls rather than repeats.
"""

import json
import os
import threading
import webbrowser
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import employee_tools as ET
import machine as M
from mannabridge.config import load_config

HERE = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
PORT = 8765

#: A machine read is a second or two; the page asks for one thing at a time.
LOG_LIMIT = 500

#: The app's own mark: a gate and a fingerprint. Inline rather than a file
#: because the whole console is meant to be two files somebody can copy, and a
#: missing .ico is a window with a generic globe on it in the taskbar.
ICON = (
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
	'<rect width="64" height="64" rx="12" fill="#1668b3"/>'
	'<path d="M32 14c-7 0-12 5-12 12v6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M32 22c-3 0-5 2-5 6v10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M32 30v14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M37 26c0-3-2-5-5-5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M44 32v-6c0-7-5-12-12-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M37 30v12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'<path d="M44 36v8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'
	'</svg>'
)

#: What makes Windows treat this as an installed app rather than a page: Edge
#: reads it, and "Install this site as an app" then gives it a Start menu entry,
#: a taskbar icon of its own and a window with no browser in it.
MANIFEST = {
	"name": "Manna HR Console",
	"short_name": "Manna HR",
	"start_url": "/",
	"scope": "/",
	"display": "standalone",
	"background_color": "#f5f6f8",
	"theme_color": "#1668b3",
	"icons": [{"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}],
}


# --- the work ---------------------------------------------------------------


def _device(config, name):
	# A screen opened before the machine list had loaded used to arrive here with
	# nothing, and the answer on screen was "KeyError: 'device'" — which tells
	# whoever is at the gate nothing at all.
	if not str(name or "").strip():
		raise SystemExit("Pick the machine first.")
	return M.find_device(config, name)


def machines(config, query):
	"""Every machine this PC reads, with what it is doing right now."""
	out = []
	site_now = None
	try:
		from mannabridge.sink import ErpSink

		site_now = ErpSink(config.erp_url, config.api_key, config.api_secret).now(config.erp_url)
	except Exception:
		site_now = None

	for device in config.devices:
		row = {
			"name": device["name"],
			"host": device["host"] or "",
			"port": device["port"],
			"serial": device.get("serial") or "",
			"reads": bool(device["host"]),
			"reachable": False,
		}
		if device["host"]:
			try:
				conn = M.connect(device)
				try:
					row["users"] = len(conn.get_users() or [])
					clock = conn.get_time()
					row["clock"] = clock.strftime("%Y-%m-%d %H:%M:%S")
					row["reachable"] = True
					if site_now:
						row["drift"] = round((clock - site_now).total_seconds())
				finally:
					conn.disconnect()
			except SystemExit as exc:
				row["why"] = str(exc)
			except Exception as exc:
				row["why"] = str(exc)
		else:
			row["why"] = "pushes to this PC (ADMS); there is no address to read"
		out.append(row)
	return {"site": config.erp_url, "site_clock": site_now.strftime("%Y-%m-%d %H:%M:%S") if site_now else None, "machines": out}


def people(config, query):
	"""Everybody on one machine, beside the Employee their number belongs to."""
	device = _device(config, (query.get("device") or [""])[0])
	conn = M.connect(device)
	try:
		users = conn.get_users() or []
		fingers = Counter(f.uid for f in (conn.get_templates() or []))
	finally:
		conn.disconnect()

	staff = ET.everybody_with_a_number(config)
	rows = ET.link_rows(users, fingers, staff)
	missing = ET.not_on_machine(users, staff)
	return {
		"device": device["name"],
		"rows": rows,
		"counts": {
			"users": len(rows),
			"clean": sum(1 for r in rows if not r["problem"]),
			"problems": sum(1 for r in rows if r["problem"]),
			"not_here": len(missing),
		},
		"not_here": [
			{"user_id": p["attendance_device_id"], "employee": p["name"], "employee_name": p.get("employee_name", "")}
			for p in missing[:200]
		],
	}


def punches(config, query):
	"""The machine's own log — what it holds, not what reached the site."""
	device = _device(config, (query.get("device") or [""])[0])
	since = (query.get("since") or [""])[0]
	user_id = (query.get("user_id") or [""])[0].strip()
	start = datetime.strptime(since, "%Y-%m-%d") if since else datetime.now() - timedelta(days=7)

	conn = M.connect(device)
	try:
		records = conn.get_attendance() or []
	finally:
		conn.disconnect()

	rows = [
		{
			"user_id": str(r.user_id).strip(),
			"time": r.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
			"punch": getattr(r, "punch", None),
		}
		for r in records
		if r.timestamp >= start and (not user_id or str(r.user_id).strip() == user_id)
	]
	rows.sort(key=lambda r: r["time"], reverse=True)
	return {"device": device["name"], "total": len(rows), "rows": rows[:LOG_LIMIT], "cut": len(rows) > LOG_LIMIT}


def attendance(config, query):
	"""First in and last out per person per day, off what reached ERPNext.

	Read from `Employee Checkin` rather than `Attendance`, because a day only
	becomes Attendance once the person has a shift — and until HR sets those,
	`Attendance` is empty while people are turning up every morning. This shows
	what is actually known about the day either way, and says which it is.
	"""
	start = (query.get("from") or [datetime.now().strftime("%Y-%m-01")])[0]
	end = (query.get("to") or [datetime.now().strftime("%Y-%m-%d")])[0]
	company = (query.get("company") or [""])[0]

	filters = [["time", ">=", start + " 00:00:00"], ["time", "<=", end + " 23:59:59"]]
	rows = ET.site_list(config, "Employee Checkin", ["employee", "employee_name", "time", "device_id", "log_type"], filters)

	staff = {}
	if company:
		staff = {e["name"]: e for e in ET.site_list(config, "Employee", ["name", "company"], [["company", "=", company]])}

	days = defaultdict(list)
	for r in rows:
		if company and r["employee"] not in staff:
			continue
		days[(r["employee"], r["employee_name"], r["time"][:10])].append(r)

	out = []
	for (emp, name, day), punched in sorted(days.items(), key=lambda kv: (kv[0][2], kv[0][1] or "")):
		times = sorted(p["time"][11:16] for p in punched)
		out.append({
			"employee": emp, "employee_name": name, "day": day,
			"first": times[0], "last": times[-1], "punches": len(times),
			"device": punched[0]["device_id"],
			# Two punches a minute apart is somebody pressing twice, not a day's work.
			"single": len(set(times)) == 1,
		})

	marked = ET.site_list(config, "Attendance", ["name", "employee", "attendance_date", "status"],
	                      [["attendance_date", ">=", start], ["attendance_date", "<=", end]])
	status = {(a["employee"], str(a["attendance_date"])): a["status"] for a in marked}
	for row in out:
		row["status"] = status.get((row["employee"], row["day"]), "")

	return {
		"from": start, "to": end, "days": out,
		"note": "Status is blank where the shift job has generated no Attendance yet — usually because "
		        "the person has no Default Shift." if any(not r["status"] for r in out) else "",
	}


def unlinked(config, query):
	"""The two halves of the gap: numbers with nobody, and people with no number.

	Ordered by how much it costs to leave alone — a number that punched this
	month and reaches nobody is somebody reading as absent every day, and that
	is what should be at the top of the screen.
	"""
	device = _device(config, (query.get("device") or [""])[0])
	conn = M.connect(device)
	try:
		users = conn.get_users() or []
		fingers = Counter(f.uid for f in (conn.get_templates() or []))
		records = conn.get_attendance() or []
	finally:
		conn.disconnect()

	month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
	punched = Counter(str(r.user_id).strip() for r in records if r.timestamp >= month)

	staff = ET.everybody_with_a_number(config)
	rows = [r for r in ET.link_rows(users, fingers, staff) if r["problem"].startswith("NOT IN ERPNEXT")]
	for row in rows:
		row["punches"] = punched.get(row["user_id"], 0)
	rows.sort(key=lambda r: (-r["punches"], int(r["user_id"]) if r["user_id"].isdigit() else 0))

	# Who they could be: everybody the site has no number for. Active first,
	# because a leaver matching a number that punched this month is nearly
	# always the wrong answer.
	free = ET.site_list(
		config, "Employee", ["name", "employee_name", "status", "company", "department"],
		[["attendance_device_id", "in", ["", None]]],
	)
	free.sort(key=lambda e: (e["status"] != "Active", e["employee_name"] or ""))
	return {"device": device["name"], "numbers": rows, "employees": free}


def link(config, body):
	"""Give one Employee the number the machine already knows them by."""
	answer = ET.set_machine_code(
		config,
		str(body.get("employee") or "").strip(),
		body.get("user_id"),
		name_on_device=body.get("name_on_device") or "",
		force=bool(body.get("force")),
	)
	answer["ok"] = True
	return answer


def free_number(config, query):
	"""The first number neither the site nor this machine holds."""
	device = _device(config, (query.get("device") or [""])[0])
	conn = M.connect(device)
	try:
		taken = {str(u.user_id).strip() for u in (conn.get_users() or [])}
	finally:
		conn.disconnect()
	held = {str(e.get("attendance_device_id") or "").strip() for e in ET.everybody_with_a_number(config)}
	# Above everything the gate has ever issued, so it cannot collide with the
	# next number eSSL or the machine itself hands out.
	start = max([1000] + [int(n) for n in taken if n.isdigit()]) + 1
	start = max(start, 9001)
	for n in range(start, start + 500):
		if str(n) not in taken and str(n) not in held:
			return {"number": str(n), "on_machine": len(taken), "on_site": len(held)}
	return {"number": None}


def add_user(config, body):
	"""Put a number and a name on the machine. Never over somebody already there."""
	device = _device(config, body.get("device"))
	number = str(body.get("user_id") or "").strip()
	name = M.machine_name(body.get("name")) if hasattr(M, "machine_name") else str(body.get("name") or "").strip()[:M.NAME_LIMIT]
	M.check_user_id(number)

	conn = M.connect(device)
	try:
		users = conn.get_users() or []
		there = M.find_user(users, number)
		if there:
			return {"ok": False, "why": "{0} is already on {1} as '{2}'. Nothing was written.".format(number, device["name"], there.name)}
		conn.set_user(uid=M.next_uid(users), name=name, privilege=0, password="", group_id="", user_id=number, card=0)
		if not M.find_user(conn.get_users() or [], number):
			return {"ok": False, "why": "Written, but {0} is not there when read back.".format(number)}
	finally:
		conn.disconnect()
	return {"ok": True, "said": "{0} added to {1} as '{2}'. The finger still has to be enrolled at the machine.".format(number, device["name"], name)}


def create_employee(config, body):
	"""An Employee on the site, then the same number on the machine.

	The site first: a record it refuses has changed nothing on the machine. The
	rules — a number nobody else holds, the dates, the mandatory fields — are
	`employee_tools`', called here rather than repeated.
	"""
	args = SimpleNamespace(
		user_id=str(body.get("user_id") or "").strip(),
		first_name=body.get("first_name") or "",
		last_name=body.get("last_name") or "",
		gender=body.get("gender") or "",
		date_of_birth=body.get("date_of_birth") or "",
		date_of_joining=body.get("date_of_joining") or "",
		company=body.get("company") or "",
		shift=body.get("shift") or "",
		employee_number=body.get("employee_number") or "",
		branch=body.get("branch") or "",
		mobile=body.get("mobile") or "",
		email=body.get("email") or "",
		address=body.get("address") or "",
		aadhaar=body.get("aadhaar") or "",
	)
	doc = ET.employee_doc(args)

	holders = ET.by_number(ET.everybody_with_a_number(config))
	device = _device(config, body.get("device"))
	conn = M.connect(device)
	try:
		on_machine = M.find_user(conn.get_users() or [], args.user_id)
		step = ET.machine_step(args.user_id, holders, on_machine)
		warn = ""
		if step == "link" and ET.looks_like_somebody_else(on_machine.name, ET.machine_name(doc)):
			return {
				"ok": False,
				"why": "The machine calls {0} '{1}' and this record is '{2}'. Nothing was created — pick a "
				       "number no machine holds.".format(args.user_id, on_machine.name, ET.machine_name(doc)),
			}

		created = ET.site_insert(config, "Employee", doc)

		if step == "add":
			conn.set_user(uid=M.next_uid(conn.get_users() or []), name=ET.machine_name(doc), privilege=0,
			              password="", group_id="", user_id=args.user_id, card=0)
			if not M.find_user(conn.get_users() or [], args.user_id):
				return {"ok": False, "employee": created["name"],
				        "why": "{0} exists on the site, but the machine write failed. Use Add to machine.".format(created["name"])}
		else:
			warn = "{0} was already on the machine as '{1}'.".format(args.user_id, on_machine.name)
	finally:
		conn.disconnect()

	if not doc.get("default_shift"):
		warn = (warn + " ").strip() + " No shift: punches will arrive and no Attendance will be generated until one is set."
	return {"ok": True, "employee": created["name"], "name": ET.machine_name(doc), "warn": warn.strip(),
	        "said": "{0} created and {1} is on {2}. Enrol the finger at the machine.".format(created["name"], args.user_id, device["name"])}


def device_block(device):
	"""One `[[device]]` for config.toml, as text.

	Appended rather than rewritten. The file on a working PC has a key's worth
	of hand-editing in it — `fix_clocks`, an ADMS port, a comment saying why —
	and a rewrite from a form would take all of it away.
	"""
	lines = [
		"",
		"# Added from the console on {0}.".format(datetime.now().strftime("%d %B %Y")),
		"[[device]]",
		'name     = "{0}"'.format(device["name"]),
		'host     = "{0}"'.format(device["host"]),
		"port     = {0}".format(int(device.get("port") or 4370)),
		"password = {0}".format(int(device.get("password") or 0)),
	]
	if device.get("serial"):
		lines.append('serial   = "{0}"'.format(device["serial"]))
	# Off unless somebody has checked the machine: a ZK never set up for in/out
	# reports 0 on every punch, which reads as a day on which nobody ever left.
	lines.append("report_direction = false")
	return "\n".join(lines) + "\n"


def find(config, query):
	"""Look at one address, or sweep this PC's own networks. Read only.

	The sweep is how a machine at a new plant is found without anybody reading
	an IP off a screen: every private address this PC can see, asked whether
	4370 answers. It touches nothing.
	"""
	from mannabridge import wizard

	host = (query.get("host") or [""])[0].strip()
	hosts = [host] if host else wizard.scan(wizard.private_subnets(wizard.this_pcs_addresses()))
	known = {d["host"]: d["name"] for d in config.devices if d.get("host")}

	out = []
	for address in hosts[:64]:
		row = {"host": address, "already": known.get(address, "")}
		try:
			row.update(wizard.look_at(address, password=int((query.get("password") or ["0"])[0] or 0)))
			row["suggested"] = wizard.suggest_name(wizard.DEFAULT_PREFIX, row.get("serial"), address)
		except Exception as exc:
			row["why"] = str(exc)
		out.append(row)
	return {"scanned": len(hosts), "found": out, "prefix": wizard.DEFAULT_PREFIX}


def add_machine(config, body):
	"""Write a new machine into config.toml, and start it from this month.

	Two things beyond the file. **The name has to carry the trusted prefix** —
	ERPNext judges a device_id without it to be a phone punch and refuses it on
	the geofence, so the wrong name here is a gate where nobody can clock in.
	And **the cursor is seeded**, or the first pass sends the machine's whole
	memory: this one at Manna Rubber holds three years and 79,000 records.
	"""
	from mannabridge import wizard
	from mannabridge.queue import PunchQueue

	host = str(body.get("host") or "").strip()
	name = str(body.get("name") or "").strip()
	problem = wizard.name_problem(name, wizard.DEFAULT_PREFIX, [d["name"] for d in config.devices])
	if problem:
		return {"ok": False, "why": "That name will not do: {0}.".format(problem)}
	if not host:
		return {"ok": False, "why": "An address is needed. The machine shows it under Menu > Comm > Ethernet."}
	for existing in config.devices:
		if existing.get("host") == host:
			return {"ok": False, "why": "{0} is already in this bridge as {1}.".format(host, existing["name"])}

	device = {
		"name": name, "host": host,
		"port": int(body.get("port") or 4370), "password": int(body.get("password") or 0),
		"serial": str(body.get("serial") or "").strip(),
	}

	# Read it once before writing anything: a machine that will not answer is a
	# typo in the address, and a line in config.toml for it would be a bridge
	# logging a failure every five minutes for ever.
	try:
		seen = wizard.look_at(host, password=device["password"], port=device["port"])
	except Exception as exc:
		return {"ok": False, "why": "{0} did not answer ({1}). Check the address, the port and the comm key.".format(host, exc)}
	device["serial"] = device["serial"] or (seen.get("serial") or "")

	path = os.path.join(HERE, "config.toml")
	with open(path, "r", encoding="utf-8") as handle:
		before = handle.read()
	with open(path + ".bak", "w", encoding="utf-8", newline="\n") as handle:
		handle.write(before)
	with open(path, "a", encoding="utf-8", newline="\n") as handle:
		handle.write(device_block(device))

	start = datetime.now().replace(day=1).date()
	queue = PunchQueue(os.path.join(HERE, config.queue_path))
	queue.set_last_seen(name, wizard.cursor_for(start))

	# The console holds the config it started with; re-read so the new machine
	# is on the other screens without anybody restarting anything.
	Console.config = load_config(path)
	return {
		"ok": True,
		"said": "{0} added at {1} ({2}, {3} users). It starts from {4}, and the bridge reads it on its next "
		        "pass — restart the Manna Attendance Bridge task to make that now.".format(
			name, host, seen.get("model") or "unknown model", seen.get("users"), start.strftime("%d-%m-%Y")),
	}


def backups(config, query):
	"""What is in machine-backups, newest first."""
	folder = M.BACKUP_DIR
	if not os.path.isdir(folder):
		return {"folder": folder, "files": []}
	out = []
	for name in sorted(os.listdir(folder), reverse=True):
		if not name.endswith(".json"):
			continue
		path = os.path.join(folder, name)
		try:
			with open(path, encoding="utf-8") as handle:
				data = json.load(handle)
			out.append({
				"file": name, "device": data.get("device"), "taken_at": data.get("taken_at"),
				"reason": data.get("reason"), "users": len(data.get("users", [])),
				"fingers": len(data.get("fingers", [])),
			})
		except Exception as exc:
			out.append({"file": name, "why": str(exc)})
	return {"folder": folder, "files": out[:50]}


def backup(config, body):
	"""Users and fingerprints to a file, by hand."""
	device = _device(config, body.get("device"))
	conn = M.connect(device)
	try:
		path = M.take_backup(conn, device, "from the console")
	finally:
		conn.disconnect()
	return {"ok": True, "said": "Backup written to {0}. It holds fingerprint templates and keypad "
	        "passwords: it stays on this PC.".format(path)}


def delete_user(config, body):
	"""Remove one user from a machine. Backed up first, and typed twice.

	The only thing in this console that takes something away. `confirm` has to
	be the number itself, because a button that deletes on one click is a button
	somebody deletes with by accident — and the finger goes with the user.
	"""
	device = _device(config, body.get("device"))
	number = str(body.get("user_id") or "").strip()
	M.check_user_id(number)

	conn = M.connect(device)
	try:
		users = conn.get_users() or []
		there = M.find_user(users, number)
		if not there:
			return {"ok": False, "why": "{0} is not on {1}.".format(number, device["name"])}
		fingers = sum(1 for f in (conn.get_templates() or []) if f.uid == there.uid)

		if str(body.get("confirm") or "").strip() != number:
			return {
				"ok": False, "confirm": number,
				"why": "{0} on {1} is '{2}' with {3} fingerprint(s). Their finger stops working the moment "
				       "this is done; the punches already in the log stay. Type the number to confirm."
				       .format(number, device["name"], there.name, fingers),
			}

		# Before the delete, always: the templates cannot be made again from here.
		path = M.take_backup(conn, device, "before deleting {0} from the console".format(number))
		conn.delete_user(uid=there.uid)
		if M.find_user(conn.get_users() or [], number):
			return {"ok": False, "why": "Deleted, but {0} is still there when read back.".format(number)}
	finally:
		conn.disconnect()
	return {"ok": True, "said": "{0} ('{1}') removed from {2}. Restore puts them back, fingers and all, "
	        "from {3}.".format(number, there.name, device["name"], os.path.basename(path))}


def restore(config, body):
	"""Put a backup's missing users back, with their fingerprints.

	Without `apply` it only says what it would do — the same dry run the menu
	does, because a restore onto the wrong machine is a gate full of strangers.
	"""
	device = _device(config, body.get("device"))
	path = os.path.join(M.BACKUP_DIR, os.path.basename(str(body.get("file") or "")))
	if not os.path.exists(path):
		return {"ok": False, "why": "No backup called {0} in {1}.".format(body.get("file"), M.BACKUP_DIR)}
	with open(path, encoding="utf-8") as handle:
		saved = json.load(handle)

	conn = M.connect(device)
	try:
		users = conn.get_users() or []
		todo, fingers = M.restore_plan(saved, users, M._quietly(conn.get_fp_version))
		plan = [
			{"user_id": u["user_id"], "name": u["name"], "fingers": len(fingers[u["uid"]]),
			 "admin": u["privilege"] == M.ADMIN}
			for u in todo
		]
		if not body.get("apply"):
			return {
				"ok": True, "dry": True, "plan": plan,
				"said": "{0} of the backup's {1} user(s) are missing from {2}. Nothing has been written."
				        .format(len(todo), len(saved.get("users", [])), device["name"]),
			}

		M.take_backup(conn, device, "before restoring from {0}".format(os.path.basename(path)))
		from zk.finger import Finger
		from zk.user import User

		uid = M.next_uid(users)
		for u in todo:
			templates = [Finger(uid, f["fid"], f["valid"], bytes.fromhex(f["template"])) for f in fingers[u["uid"]]]
			if templates:
				conn.save_user_template(
					User(uid, u["name"], u["privilege"], u["password"], u["group_id"], u["user_id"], u["card"]),
					templates,
				)
			else:
				conn.set_user(uid=uid, name=u["name"], privilege=u["privilege"], password=u["password"],
				              group_id=u["group_id"], user_id=u["user_id"], card=u["card"])
			uid += 1
		after = {str(x.user_id).strip() for x in (conn.get_users() or [])}
		missing = [u["user_id"] for u in todo if u["user_id"] not in after]
	finally:
		conn.disconnect()

	if missing:
		return {"ok": False, "why": "Restored, but these are still missing: {0}".format(", ".join(missing))}
	return {"ok": True, "said": "{0} user(s) restored onto {1}.".format(len(todo), device["name"])}


def choices(config, query):
	"""What the form's selects offer, read off the site rather than guessed."""
	def names(doctype):
		try:
			return [r["name"] for r in ET.site_list(config, doctype, ["name"], [])]
		except SystemExit:
			return []
	return {"companies": names("Company"), "genders": names("Gender"), "shifts": names("Shift Type"), "branches": names("Branch")}


GET = {
	"/api/machines": machines,
	"/api/people": people,
	"/api/punches": punches,
	"/api/attendance": attendance,
	"/api/free-number": free_number,
	"/api/choices": choices,
	"/api/unlinked": unlinked,
	"/api/backups": backups,
	"/api/find": find,
}

POST = {
	"/api/add-user": add_user,
	"/api/create-employee": create_employee,
	"/api/link": link,
	"/api/backup": backup,
	"/api/delete-user": delete_user,
	"/api/restore": restore,
	"/api/add-machine": add_machine,
}


# --- the server -------------------------------------------------------------


def read_or_make_token(path):
	"""The console's key, in a file only administrators can read.

	**This is what replaces the administrator prompt** once the console runs in
	the background. Before, opening it meant elevating, and that was the whole
	guard: it drives the fingerprint machines and holds a key that writes the
	group's attendance. A server left running on 127.0.0.1 is reachable by
	anybody signed in at that PC — a gate PC, where the person signed in may be
	whoever was nearest. So every request has to carry this, the shortcut reads
	it (which needs administrator), and the browser keeps it for that window.
	"""
	import secrets

	if os.path.exists(path):
		with open(path, encoding="utf-8") as handle:
			saved = handle.read().strip()
		if saved:
			return saved
	token = secrets.token_urlsafe(24)
	with open(path, "w", encoding="utf-8") as handle:
		handle.write(token)
	return token


def token_in(headers, query, cookie_header=""):
	"""The token this request carries, from the address, a header or the cookie."""
	from http.cookies import SimpleCookie

	if query.get("k"):
		return query["k"][0]
	if headers.get("X-Console-Token"):
		return headers.get("X-Console-Token")
	try:
		jar = SimpleCookie(cookie_header or "")
		return jar["mannahr"].value if "mannahr" in jar else ""
	except Exception:
		return ""


class Console(BaseHTTPRequestHandler):
	config = None
	#: Empty means no token is asked for — a console started by hand in a
	#: console window, where whoever started it had the rights already.
	token = ""

	def _refuse_strangers(self):
		"""Only this PC, and only whoever opened it from the icon."""
		if self.client_address[0] not in ("127.0.0.1", "::1"):
			self._send(403, {"why": "This console answers only the PC it runs on."})
			return True
		if self.token:
			url = urlparse(self.path)
			carried = token_in(self.headers, parse_qs(url.query), self.headers.get("Cookie", ""))
			# Constant time, because this token is the whole door and a timing
			# difference is a way to guess it a character at a time.
			import hmac

			if not hmac.compare_digest(carried or "", self.token):
				self._send(403, b"<h3>Open this from the Manna HR Console icon.</h3>"
				                b"<p>It runs in the background and answers only that shortcut.</p>", "text/html")
				return True
		return False

	def _send(self, code, body, kind="application/json", cookie=None):
		raw = body if isinstance(body, bytes) else json.dumps(body, default=str).encode("utf-8")
		self.send_response(code)
		self.send_header("Content-Type", kind + "; charset=utf-8")
		self.send_header("Content-Length", str(len(raw)))
		if cookie:
			self.send_header("Set-Cookie", cookie)
		# Nothing here is cached: the whole point is what the machine says now.
		self.send_header("Cache-Control", "no-store")
		self.end_headers()
		self.wfile.write(raw)

	def do_GET(self):
		if self._refuse_strangers():
			return
		url = urlparse(self.path)
		if url.path == "/icon.svg":
			return self._send(200, ICON.encode("utf-8"), "image/svg+xml")
		if url.path == "/manifest.webmanifest":
			return self._send(200, MANIFEST, "application/manifest+json")
		if url.path in ("/", "/index.html"):
			with open(os.path.join(HERE, "console.html"), "rb") as handle:
				page = handle.read()
			# The page is opened once with ?k=…; the cookie is what carries it
			# through every fetch the page makes afterwards, so the token is not
			# sitting in the address bar of a window somebody walks away from.
			cookie = "mannahr={0}; Path=/; SameSite=Strict".format(self.token) if self.token else None
			return self._send(200, page, "text/html", cookie)
		handler = GET.get(url.path)
		if not handler:
			return self._send(404, {"why": "no such page"})
		self._answer(handler, parse_qs(url.query))

	def do_POST(self):
		if self._refuse_strangers():
			return
		handler = POST.get(urlparse(self.path).path)
		if not handler:
			return self._send(404, {"why": "no such page"})
		length = int(self.headers.get("Content-Length") or 0)
		body = json.loads(self.rfile.read(length) or b"{}")
		self._answer(handler, body)

	def _answer(self, handler, payload):
		try:
			self._send(200, handler(self.config, payload))
		except SystemExit as exc:
			# The tools say why in a sentence; that sentence is the answer.
			self._send(200, {"ok": False, "why": str(exc)})
		except Exception as exc:
			self._send(200, {"ok": False, "why": "{0}: {1}".format(type(exc).__name__, exc)})

	def log_message(self, *args):
		pass


#: Where Edge and Chrome live on a Windows that has not been tidied. Either
#: will open a page as its own window with `--app=`, which is what makes this
#: look like a program at the gate rather than a tab somebody can lose.
BROWSERS = (
	r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
	r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
	r"C:\Program Files\Google\Chrome\Application\chrome.exe",
	r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
)


def app_browser(candidates=BROWSERS, exists=os.path.exists):
	"""The first browser on this PC that can open a page as its own window."""
	for path in candidates:
		if exists(path):
			return path
	return None


def open_window(url, candidates=BROWSERS):
	"""Open the console as a window of its own, or fall back to a tab.

	A tab is not wrong — it is the same page — but a window with no address bar
	is what stops somebody at a gate PC from typing over the URL, and from
	wondering which of nine tabs was the attendance one.
	"""
	import subprocess

	browser = app_browser(candidates)
	if browser:
		try:
			subprocess.Popen([browser, "--app=" + url, "--window-size=1280,900"], close_fds=True)
			return browser
		except OSError:
			pass
	webbrowser.open(url)
	return None


def already_serving(host=HOST, port=PORT, timeout=0.4):
	"""Whether a console is already up on this PC.

	Double-clicking the icon twice is what people do when the first window takes
	a second to appear. Without this the second one dies on "address already in
	use" — a crash, for doing the ordinary thing.
	"""
	import socket

	try:
		with socket.create_connection((host, port), timeout=timeout):
			return True
	except OSError:
		return False


def log_to_file(path):
	"""Send the traceback somewhere, for a run with no console to print to.

	Started from the icon there is no black window, which is the point — and it
	is also the reason a crash would otherwise leave nothing at all behind.
	"""
	import sys

	handle = open(path, "a", encoding="utf-8", buffering=1)
	handle.write("\n--- {0} ---\n".format(datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
	sys.stdout = sys.stderr = handle
	return handle


def serve(config, host=HOST, port=PORT, open_browser=True, token=""):
	Console.config = config
	Console.token = token
	server = ThreadingHTTPServer((host, port), Console)
	where = "http://{0}:{1}/".format(host, port)
	if token:
		where += "?k=" + token
	print("Manna HR Console: {0}".format(where))
	print("Site: {0}".format(config.erp_url))
	print("Machines: {0}".format(", ".join(d["name"] for d in config.devices)))
	print("\nLeave this window open. Ctrl+C stops it.")
	if open_browser:
		threading.Timer(1.0, lambda: open_window(where)).start()
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nstopped.")


def main(argv=None):
	import argparse

	parser = argparse.ArgumentParser(description="The gate PC's console: the machines and ERPNext on one screen")
	parser.add_argument("--config", default=os.path.join(HERE, "config.toml"))
	parser.add_argument("--port", type=int, default=PORT)
	parser.add_argument("--no-browser", action="store_true")
	parser.add_argument("--log", help="write output here instead of the screen (the icon does this)")
	parser.add_argument(
		"--token-file",
		help="the file holding this console's key, made if it is not there. With one, every request has to "
		     "carry it - which is what guards a console left running in the background on a PC anybody can "
		     "sign in to. The installer locks the file to administrators.",
	)
	args = parser.parse_args(argv)

	if args.log:
		log_to_file(args.log)

	token = read_or_make_token(args.token_file) if args.token_file else ""
	where = "http://{0}:{1}/".format(HOST, args.port) + ("?k=" + token if token else "")

	if already_serving(port=args.port):
		# Either the icon clicked twice, or the background console is already up
		# and this is the shortcut asking for its window. Both mean the same
		# thing: show what is running rather than starting a second one.
		print("A console is already running; opening its window.")
		if not args.no_browser:
			open_window(where)
		return

	serve(load_config(args.config), port=args.port, open_browser=not args.no_browser, token=token)


if __name__ == "__main__":
	main()
