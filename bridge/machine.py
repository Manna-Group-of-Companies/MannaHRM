"""Everything a ZK fingerprint machine can do, from the bridge PC, run by hand.

The bridge only ever reads. push_users.py puts ERPNext's people on a machine.
This is the rest: look at the machine, read its log, fix its clock, add, edit,
delete and enroll users, back it up, restore that backup onto a replacement,
open the door, restart it.

Every command that changes the machine prints what it would do and writes
nothing until it is given --apply. Anything that changes or removes somebody
already on the machine takes a backup first, fingerprints included.

What this never does, and there is no flag for any of it:

  * clear the attendance log. The machine's memory is the last copy of a punch
    the bridge has not delivered yet - see the traps in CLAUDE.md.
  * clear_data(), which wipes users, fingerprints and the log together.
  * poweroff(). A machine that is off takes nobody's punch, and nobody at the
    gate knows how to turn it back on.
  * disable the machine while writing. A disabled machine refuses fingers, and
    refusing somebody who did turn up is the expensive mistake.

Usually reached through MACHINE.bat, which asks the questions. By hand, from the
install folder, in a console opened as administrator (bridge.env is locked):

    .venv\\Scripts\\python machine.py info        --device BIO-MRP-GATE2
    .venv\\Scripts\\python machine.py time        --device BIO-MRP-GATE2 --set --from-site --apply
    .venv\\Scripts\\python machine.py users       --device BIO-MRP-GATE2
    .venv\\Scripts\\python machine.py logs        --device BIO-MRP-GATE2 --since 2026-09-01 --csv sept.csv
    .venv\\Scripts\\python machine.py backup      --device BIO-MRP-GATE2
    .venv\\Scripts\\python machine.py add-user    --device BIO-MRP-GATE2 --user-id 105 --name "Anil K" --apply
    .venv\\Scripts\\python machine.py edit-user   --device BIO-MRP-GATE2 --user-id 105 --card 1234567 --apply
    .venv\\Scripts\\python machine.py delete-user --device BIO-MRP-GATE2 --user-id 105 --apply
    .venv\\Scripts\\python machine.py enroll      --device BIO-MRP-GATE2 --user-id 105 --finger 0 --apply
    .venv\\Scripts\\python machine.py restore     --device BIO-MRP-GATE3 --file machine-backups\\<file>.json --apply
    .venv\\Scripts\\python machine.py unlock      --device BIO-MRP-GATE2 --apply
    .venv\\Scripts\\python machine.py restart     --device BIO-MRP-GATE2 --apply

Backups hold fingerprint templates and every user's keypad password. They stay
in machine-backups, which the installer locks to administrators, and package.ps1
refuses to put one in a zip.
"""

import argparse
import csv
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime

from mannabridge.config import load_config

HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(HERE, "machine-backups")

# A device user_id is what ERPNext stores in Employee.attendance_device_id, and
# what a punch carries. Digits only, and short: the machines truncate silently.
USER_ID = re.compile(r"^[0-9]{1,9}$")
# Names longer than this are cut off by the machine itself, so cut them here
# instead and say so.
NAME_LIMIT = 24
# The slot number is a 16-bit field in the protocol.
MAX_UID = 65535
ADMIN = 14
PRIVILEGE = {0: "user", ADMIN: "admin"}


# --- machine ----------------------------------------------------------------


def find_device(config, name):
	for device in config.devices:
		if device["name"] != name:
			continue
		if not device["host"]:
			raise SystemExit(
				"{0} pushes to the bridge and has no address to connect to. "
				"Change it at the machine itself.".format(name)
			)
		return device
	names = ", ".join(d["name"] for d in config.devices if d["host"])
	raise SystemExit("No machine called {0}. There are: {1}".format(name, names or "none"))


def connect(device):
	from zk import ZK

	try:
		return ZK(
			device["host"],
			port=device["port"],
			timeout=device["timeout"],
			password=device["password"],
			force_udp=device["force_udp"],
			ommit_ping=True,
		).connect()
	except Exception as error:
		# The bridge reads every machine every few minutes, and some firmware
		# takes one connection at a time. That is the likeliest reason, and the
		# cure is waiting, not anything on the machine.
		raise SystemExit(
			"Could not connect to {0} at {1}:{2} ({3}).\n"
			"If the bridge is in the middle of a pass, wait a minute and try again.".format(
				device["name"], device["host"], device["port"], error
			)
		)


def _quietly(call):
	# Older firmware answers some of these with an error rather than a blank.
	# A missing model name is not a reason to stop reading the rest.
	try:
		return call()
	except Exception:
		return None


# --- pure -------------------------------------------------------------------


def find_user(users, user_id):
	for u in users:
		if str(u.user_id).strip() == user_id:
			return u
	return None


def next_uid(users):
	uid = max((int(u.uid) for u in users), default=0) + 1
	if uid > MAX_UID:
		raise SystemExit("The machine has no free slot number left.")
	return uid


def check_user_id(user_id):
	if not USER_ID.match(user_id or ""):
		raise SystemExit("A user id is a plain number of 1 to 9 digits, not {0!r}.".format(user_id))


def backup_data(device, serial, fp_version, users, templates, taken_at, reason):
	return {
		"device": device["name"],
		"host": device["host"],
		"taken_at": taken_at.isoformat(timespec="seconds"),
		"reason": reason,
		"serial": serial,
		# Templates from one fingerprint algorithm are noise to another; restore
		# checks this before it writes a single one.
		"fp_version": fp_version,
		"users": [
			{
				"uid": u.uid,
				"user_id": str(u.user_id).strip(),
				"name": u.name,
				"privilege": u.privilege,
				"password": u.password,
				"group_id": u.group_id,
				"card": u.card,
			}
			for u in users
		],
		"fingers": [
			{"uid": f.uid, "fid": f.fid, "valid": f.valid, "template": bytes(f.template).hex()}
			for f in templates
		],
	}


def restore_plan(backup, users, fp_version):
	"""Who in a backup this machine lacks, and their fingers keyed by backup slot.

	Only the missing. Somebody already here may have been enrolled again since
	the backup, and overwriting them is how a finger stops working.
	"""
	there = backup.get("fp_version")
	if fp_version and there and str(fp_version) != str(there):
		raise SystemExit(
			"The backup's fingerprints are algorithm {0} and this machine uses {1}. "
			"They would be written and no finger would match.".format(there, fp_version)
		)
	have = {str(u.user_id).strip() for u in users}
	fingers = defaultdict(list)
	for f in backup.get("fingers", []):
		fingers[f["uid"]].append(f)
	todo = [u for u in backup.get("users", []) if u["user_id"] not in have]
	return todo, fingers


def dry_run(args, what):
	"""True when nothing may be written. Says so every time, in words the menu looks for."""
	if args.apply:
		return False
	print("\n{0}. Nothing was written - pass --apply to do it.".format(what))
	return True


# --- backup -----------------------------------------------------------------


def take_backup(conn, device, reason):
	data = backup_data(
		device,
		_quietly(conn.get_serialnumber),
		_quietly(conn.get_fp_version),
		conn.get_users() or [],
		conn.get_templates() or [],
		datetime.now(),
		reason,
	)
	# The installer creates this folder locked to administrators, and a file
	# made in it inherits that. Made here only for a copy nobody installed.
	os.makedirs(BACKUP_DIR, exist_ok=True)
	stem = os.path.join(BACKUP_DIR, "{0}-{1}".format(device["name"], datetime.now().strftime("%Y%m%d-%H%M%S")))
	# Never over another backup. An edit then a delete inside one second would
	# otherwise leave only the later one, and the state before the edit is gone.
	n = 1
	while True:
		path = stem + (".json" if n == 1 else "-{0}.json".format(n))
		try:
			handle = open(path, "x", encoding="utf-8")
			break
		except FileExistsError:
			n += 1
	with handle:
		json.dump(data, handle, indent=1)
	print("backup: {0} ({1} users, {2} fingerprints)".format(path, len(data["users"]), len(data["fingers"])))
	return path


# --- read -------------------------------------------------------------------


def cmd_info(conn, args, config, device):
	sizes = _quietly(conn.read_sizes)
	rows = [
		("name", device["name"]),
		("address", "{0}:{1}".format(device["host"], device["port"])),
		("model", _quietly(conn.get_device_name)),
		("serial", _quietly(conn.get_serialnumber)),
		("platform", _quietly(conn.get_platform)),
		("firmware", _quietly(conn.get_firmware_version)),
		("fingerprint alg", _quietly(conn.get_fp_version)),
		("mac", _quietly(conn.get_mac)),
		("clock", _quietly(conn.get_time)),
	]
	if sizes:
		rows += [
			("users", "{0} of {1}".format(conn.users, conn.users_cap)),
			("fingerprints", "{0} of {1}".format(conn.fingers, conn.fingers_cap)),
			("punches stored", "{0} of {1}".format(conn.records, conn.rec_cap)),
		]
	for label, value in rows:
		print("  {0:<16} {1}".format(label, "-" if value is None else value))

	if sizes and conn.rec_cap and conn.records / conn.rec_cap > 0.9:
		print("\n  The punch memory is over 90% full. A full machine stops taking punches or")
		print("  overwrites the oldest. This tool will not clear it: check the bridge log says")
		print("  everything is delivered, then decide at the machine.")


def cmd_time(conn, args, config, device):
	machine = conn.get_time()
	reference, source = reference_clock(args, config)
	drift = (machine - reference).total_seconds()
	print("  machine  {0}".format(machine))
	print("  {0:<8} {1}".format(source, reference))
	if drift > 0:
		print("  drift    {0:+.0f} s, the machine is fast".format(drift))
	elif drift < 0:
		print("  drift    {0:+.0f} s, the machine is slow".format(drift))
	else:
		print("  drift    none")

	if not args.set:
		return
	if dry_run(args, "The machine clock would be set to {0}".format(reference)):
		return
	# Read again: a slow site and a person reading the screen both cost seconds.
	reference, _ = reference_clock(args, config)
	conn.set_time(reference)
	print("set. The machine now reads {0}".format(conn.get_time()))


def reference_clock(args, config):
	if args.from_site:
		return site_clock(config.erp_url), "site"
	return datetime.now().replace(microsecond=0), "this PC"


def site_clock(url):
	"""The site's clock, off its Date header, in this PC's timezone.

	Attendance is judged on the server's clock, so that is the one a machine
	should agree with. The machine stores a local time with no zone at all, so
	this PC's timezone has to be the site's.
	"""
	from email.utils import parsedate_to_datetime

	import requests

	response = requests.head(url, timeout=15, allow_redirects=True)
	stamp = response.headers.get("Date")
	if not stamp:
		raise SystemExit("The site sent no Date header. Leave out --from-site to use this PC's clock.")
	return parsedate_to_datetime(stamp).astimezone().replace(tzinfo=None)


def cmd_users(conn, args, config, device):
	users = conn.get_users() or []
	fingers = Counter(f.uid for f in (conn.get_templates() or []))
	print("  {0:>5}  {1:>9}  {2:<24}  {3:<5}  {4:>10}  {5}".format("slot", "user id", "name", "role", "card", "fingers"))
	for u in sorted(users, key=lambda u: (len(str(u.user_id)), str(u.user_id))):
		print(
			"  {0:>5}  {1:>9}  {2:<24}  {3:<5}  {4:>10}  {5}".format(
				u.uid, u.user_id, u.name, PRIVILEGE.get(u.privilege, u.privilege), u.card or "", fingers.get(u.uid, 0)
			)
		)
	stuck = sum(1 for u in users if not fingers.get(u.uid) and not u.card)
	print("\n{0} user(s). {1} with neither a finger nor a card, who cannot punch.".format(len(users), stuck))


def cmd_logs(conn, args, config, device):
	records = conn.get_attendance() or []
	since = datetime.strptime(args.since, "%Y-%m-%d") if args.since else None
	rows = sorted(
		(
			r
			for r in records
			if (since is None or r.timestamp >= since)
			and (not args.user_id or str(r.user_id).strip() == args.user_id)
		),
		key=lambda r: r.timestamp,
	)

	if args.csv:
		with open(args.csv, "w", newline="", encoding="utf-8") as handle:
			writer = csv.writer(handle)
			writer.writerow(["user_id", "timestamp", "status", "punch"])
			for r in rows:
				writer.writerow([r.user_id, r.timestamp.isoformat(sep=" "), r.status, r.punch])
		print("{0} punch(es) written to {1}".format(len(rows), os.path.abspath(args.csv)))
	else:
		for r in rows:
			print("  {0}  {1:>9}  status {2}  punch {3}".format(r.timestamp, r.user_id, r.status, r.punch))
		print("\n{0} punch(es) of the {1} on the machine.".format(len(rows), len(records)))
	print("Read only. The log on the machine is untouched.")


def cmd_backup(conn, args, config, device):
	take_backup(conn, device, "by hand")


# --- write ------------------------------------------------------------------


def cmd_add_user(conn, args, config, device):
	check_user_id(args.user_id)
	users = conn.get_users() or []
	if find_user(users, args.user_id):
		raise SystemExit("{0} is already on the machine. Use edit-user to change them.".format(args.user_id))

	name = args.name.strip()[:NAME_LIMIT]
	privilege = ADMIN if args.admin else 0
	uid = next_uid(users)
	print("  ADD  slot {0}  user {1}  {2}  {3}  card {4}".format(uid, args.user_id, name, PRIVILEGE[privilege], args.card or 0))
	if args.admin:
		print("  An admin can change or delete anybody at the machine's own keypad.")
	if dry_run(args, "1 user would be added"):
		return

	conn.set_user(uid=uid, name=name, privilege=privilege, password="", group_id="", user_id=args.user_id, card=args.card or 0)
	if not find_user(conn.get_users() or [], args.user_id):
		raise SystemExit("Written, but {0} is not on the machine when it is read back.".format(args.user_id))
	print("added. Now enroll a finger - at the machine, or with enroll.")


def cmd_edit_user(conn, args, config, device):
	check_user_id(args.user_id)
	u = find_user(conn.get_users() or [], args.user_id)
	if not u:
		raise SystemExit("{0} is not on the machine.".format(args.user_id))

	name = args.name.strip()[:NAME_LIMIT] if args.name else u.name
	card = args.card if args.card is not None else u.card
	privilege = ADMIN if args.admin else 0 if args.not_admin else u.privilege

	print("  was  {0}  {1}  card {2}".format(u.name, PRIVILEGE.get(u.privilege, u.privilege), u.card))
	print("  now  {0}  {1}  card {2}".format(name, PRIVILEGE.get(privilege, privilege), card))
	if (name, card, privilege) == (u.name, u.card, u.privilege):
		print("nothing to change.")
		return
	if dry_run(args, "User {0} would be changed".format(args.user_id)):
		return

	take_backup(conn, device, "before edit-user {0}".format(args.user_id))
	# Same slot, user id, password and group. Fingerprints are stored against the
	# slot, so keeping it is what keeps this person's finger working.
	conn.set_user(uid=u.uid, name=name, privilege=privilege, password=u.password, group_id=u.group_id, user_id=u.user_id, card=card)
	print("changed.")


def cmd_delete_user(conn, args, config, device):
	check_user_id(args.user_id)
	u = find_user(conn.get_users() or [], args.user_id)
	if not u:
		raise SystemExit("{0} is not on the machine.".format(args.user_id))

	fingers = sum(1 for f in (conn.get_templates() or []) if f.uid == u.uid)
	print("  DELETE  slot {0}  user {1}  {2}  ({3} fingerprint(s))".format(u.uid, u.user_id, u.name, fingers))
	print("  Their punches already in the log stay. Their finger stops working at once.")
	if dry_run(args, "1 user would be deleted"):
		return

	take_backup(conn, device, "before delete-user {0}".format(args.user_id))
	conn.delete_user(uid=u.uid)
	if find_user(conn.get_users() or [], args.user_id):
		raise SystemExit("Deleted, but {0} is still there when read back.".format(args.user_id))
	print("deleted. restore puts them back, fingers and all, from the backup above.")


def cmd_enroll(conn, args, config, device):
	check_user_id(args.user_id)
	if not 0 <= args.finger <= 9:
		raise SystemExit("A finger is 0 to 9.")
	u = find_user(conn.get_users() or [], args.user_id)
	if not u:
		raise SystemExit("{0} is not on the machine. add-user first.".format(args.user_id))

	print("  ENROLL  user {0} ({1}), finger {2}".format(u.user_id, u.name, args.finger))
	if dry_run(args, "The machine would wait for a finger"):
		return

	print("Put the finger on the sensor each time the machine asks - three times, within a minute.")
	try:
		ok = conn.enroll_user(uid=u.uid, temp_id=args.finger, user_id=u.user_id)
	except Exception as error:
		# pyzk waits on the socket, and a minute with no finger ends as a timeout.
		raise SystemExit("Not enrolled ({0}). Try again, or enroll at the machine.".format(error))
	if not ok:
		raise SystemExit("Not enrolled - the reads did not match or nobody put a finger on. Try again.")
	print("enrolled.")


def cmd_restore(conn, args, config, device):
	from zk.finger import Finger
	from zk.user import User

	with open(args.file, "r", encoding="utf-8") as handle:
		backup = json.load(handle)

	users = conn.get_users() or []
	todo, fingers = restore_plan(backup, users, _quietly(conn.get_fp_version))
	total = len(backup.get("users", []))
	print("backup: {0}, from {1}, {2} users".format(backup.get("taken_at"), backup.get("device"), total))
	print("  {0} already on this machine, left untouched".format(total - len(todo)))
	for u in todo:
		role = "  ADMIN" if u["privilege"] == ADMIN else ""
		print("  ADD  {0}  {1}  ({2} fingerprint(s)){3}".format(u["user_id"], u["name"], len(fingers[u["uid"]]), role))
	if not todo:
		print("nothing to restore.")
		return
	if dry_run(args, "{0} user(s) would be restored".format(len(todo))):
		return

	take_backup(conn, device, "before restore from {0}".format(os.path.basename(args.file)))
	uid = next_uid(users)
	for u in todo:
		# The slot is this machine's next free one, not the backup's; the
		# templates are renumbered to follow it.
		templates = [Finger(uid, f["fid"], f["valid"], bytes.fromhex(f["template"])) for f in fingers[u["uid"]]]
		if templates:
			# One packet: the user and their fingers together.
			conn.save_user_template(User(uid, u["name"], u["privilege"], u["password"], u["group_id"], u["user_id"], u["card"]), templates)
		else:
			conn.set_user(uid=uid, name=u["name"], privilege=u["privilege"], password=u["password"], group_id=u["group_id"], user_id=u["user_id"], card=u["card"])
		uid += 1

	after = {str(u.user_id).strip() for u in (conn.get_users() or [])}
	missing = [u["user_id"] for u in todo if u["user_id"] not in after]
	if missing:
		raise SystemExit("Restored, but these are still missing: {0}".format(", ".join(missing)))
	print("restored {0} user(s).".format(len(todo)))


def cmd_unlock(conn, args, config, device):
	print("  UNLOCK the door on {0} for {1} s".format(device["name"], args.seconds))
	if dry_run(args, "The door would open"):
		return
	conn.unlock(time=args.seconds)
	print("unlocked.")


def cmd_restart(conn, args, config, device):
	print("  RESTART {0}. It takes no punches for about a minute.".format(device["name"]))
	if dry_run(args, "The machine would restart"):
		return
	conn.restart()
	print("restarting. The bridge picks it up again on its next pass.")


# --- command line -----------------------------------------------------------


def parser():
	common = argparse.ArgumentParser(add_help=False)
	common.add_argument("--config", default=os.path.join(HERE, "config.toml"))
	common.add_argument("--device", required=True, help="the [[device]] name, e.g. BIO-MRP-GATE2")

	writes = argparse.ArgumentParser(add_help=False, parents=[common])
	writes.add_argument("--apply", action="store_true", help="actually write; without it, nothing is written")

	top = argparse.ArgumentParser(description="Everything a ZK fingerprint machine can do, by hand")
	sub = top.add_subparsers(dest="command", required=True)

	p = sub.add_parser("info", parents=[common], help="model, serial, capacity, clock")
	p.set_defaults(func=cmd_info)

	p = sub.add_parser("time", parents=[writes], help="how far off the clock is, and set it")
	p.add_argument("--set", action="store_true")
	p.add_argument("--from-site", action="store_true", help="the ERPNext site's clock, not this PC's")
	p.set_defaults(func=cmd_time)

	p = sub.add_parser("users", parents=[common], help="everybody enrolled, with finger counts")
	p.set_defaults(func=cmd_users)

	p = sub.add_parser("logs", parents=[common], help="the punch log, read only")
	p.add_argument("--since", help="YYYY-MM-DD")
	p.add_argument("--user-id")
	p.add_argument("--csv", help="write to this file instead of the screen")
	p.set_defaults(func=cmd_logs)

	p = sub.add_parser("backup", parents=[common], help="users and fingerprints, to machine-backups")
	p.set_defaults(func=cmd_backup)

	p = sub.add_parser("add-user", parents=[writes])
	p.add_argument("--user-id", required=True)
	p.add_argument("--name", required=True)
	p.add_argument("--card", type=int)
	p.add_argument("--admin", action="store_true")
	p.set_defaults(func=cmd_add_user)

	p = sub.add_parser("edit-user", parents=[writes])
	p.add_argument("--user-id", required=True)
	p.add_argument("--name")
	p.add_argument("--card", type=int)
	role = p.add_mutually_exclusive_group()
	role.add_argument("--admin", action="store_true")
	role.add_argument("--not-admin", action="store_true")
	p.set_defaults(func=cmd_edit_user)

	p = sub.add_parser("delete-user", parents=[writes])
	p.add_argument("--user-id", required=True)
	p.set_defaults(func=cmd_delete_user)

	p = sub.add_parser("enroll", parents=[writes], help="make the machine ask for a finger")
	p.add_argument("--user-id", required=True)
	p.add_argument("--finger", type=int, default=0, help="0 to 9")
	p.set_defaults(func=cmd_enroll)

	p = sub.add_parser("restore", parents=[writes], help="add a backup's missing users, with their fingers")
	p.add_argument("--file", required=True)
	p.set_defaults(func=cmd_restore)

	p = sub.add_parser("unlock", parents=[writes], help="open the door relay")
	p.add_argument("--seconds", type=int, default=3)
	p.set_defaults(func=cmd_unlock)

	p = sub.add_parser("restart", parents=[writes])
	p.set_defaults(func=cmd_restart)

	return top


def main(argv=None):
	args = parser().parse_args(argv)
	config = load_config(args.config)
	device = find_device(config, args.device)
	conn = connect(device)
	try:
		args.func(conn, args, config, device)
	finally:
		try:
			conn.disconnect()
		except Exception:
			pass


if __name__ == "__main__":
	main()
