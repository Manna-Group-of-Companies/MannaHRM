"""Does every punch on a machine know which person it belongs to?

    python tools/check_device_links.py                       # newest dump found
    python tools/check_device_links.py data/devices/CGKK211561350-2026-09-07
    python tools/check_device_links.py --offline              # device side only

Reads a dump written by `bridge/dump.py` and the `Employee` records on the
site, and answers the one question that decides whether the bridge will work:
**is `Employee.attendance_device_id` the same number the machine calls that
person?**

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    Without them, pass --offline and the device half is still reported.

## Why this is the check to run before anything posts

The machine knows user `845`. ERPNext knows `HR-EMP-00042`. The *only* thing
joining them is `attendance_device_id`, and when it is unset the bridge reports
`no employee found` for every punch that person ever makes. It treats that as
permanent rather than transient — retrying cannot fix master data — so the
punches sit in the queue, undelivered and visible, until somebody fills the
field. See bridge/README.md.

That failure is quiet in exactly the wrong way. Nobody notices a person whose
punches never arrive; they notice at the end of the month, when that person is
absent every day and their pay is wrong. This script is how you find them
before the first payroll rather than after it.

## Four findings, and they are different problems

    unlinked device users   the machine knows them, ERPNext does not. Their
                            punches will be refused. This is the expensive one.
    unlinked employees      no attendance_device_id at all. Invisible to every
                            machine; they will read as absent every day.
    dangling links          an employee points at a user id no machine in this
                            dump has. Either the wrong number was typed, or
                            they punch at a gate that has not been read yet.
    ghosts in the log       punches from a user id the machine no longer has
                            enrolled. History that can still be matched to a
                            person only if somebody remembers who that was.

## It never writes

Not to the device, not to the site. The obvious next step — matching device
names to employee names and writing the field — is deliberately not taken here:
a wrong link silently pays one person for another's attendance, and name
matching across 438 rows of `SIJU NP` and `Sunny MJ` will produce wrong links.
What it does instead is write a review CSV with its *suggestions* beside the
evidence, for somebody to read and correct before any of it is applied.
"""

import argparse
import csv
import difflib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEVICES = ROOT / "data" / "devices"

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

EMPLOYEE_FIELDS = ["name", "employee_name", "employee_number", "company", "status",
                   "attendance_device_id", "default_shift"]


# -------------------------------------------------------------------- site ---

def req(path):
	r = urllib.request.Request(BASE + path, method="GET",
		headers={"Authorization": AUTH, "Accept": "application/json"})
	try:
		with urllib.request.urlopen(r, timeout=120) as x:
			return json.loads(x.read().decode())
	except urllib.error.HTTPError as e:
		raise SystemExit("HTTP {0} on {1}: {2}".format(e.code, path[:70], e.read().decode()[:250]))


def fetch_employees():
	"""Everybody, including leavers.

	Leavers deliberately included: a device user that matches somebody who left
	is not an unlinked user needing a new record, it is an enrolment nobody
	removed from the machine — and those are two different jobs.
	"""
	out, start = [], 0
	while True:
		q = urllib.parse.urlencode({
			"fields": json.dumps(EMPLOYEE_FIELDS),
			"limit_page_length": 100, "limit_start": start, "order_by": "creation asc"})
		page = req("/api/resource/Employee?" + q)["data"]
		out.extend(page)
		if len(page) < 100:
			return out
		start += 100


# ------------------------------------------------------------------ device ---

def newest_dump():
	"""The most recent full dump in data/devices.

	`--since` dumps are skipped: they carry a partial punch log, and a report
	that quietly measured "who has punched" against one month would call
	everybody who was on holiday a ghost.
	"""
	found = sorted(p for p in DEVICES.glob("*-users.csv") if "-from-" not in p.name)
	if not found:
		sys.exit("No dump in {0}. Run:  python bridge/dump.py <ip>".format(DEVICES))
	return str(found[-1])[: -len("-users.csv")]


def read_dump(stem):
	stem = Path(stem)
	users_path = Path(str(stem) + "-users.csv")
	punch_path = Path(str(stem) + "-punches.csv")
	if not users_path.exists():
		sys.exit("No such dump: {0}".format(users_path))

	users = list(csv.DictReader(users_path.open(encoding="utf-8")))
	punches = list(csv.DictReader(punch_path.open(encoding="utf-8"))) if punch_path.exists() else []

	info = {}
	info_path = Path(str(stem) + "-info.json")
	if info_path.exists():
		info = json.loads(info_path.read_text(encoding="utf-8"))
	return users, punches, info


def punch_summary(punches):
	"""Per device user: how many punches, and when they were last seen.

	The last-seen date is what separates "unlinked and it does not matter" from
	"unlinked and somebody is losing days right now".
	"""
	out = {}
	for r in punches:
		uid = r["user_id"]
		hit = out.setdefault(uid, {"n": 0, "first": r["date"], "last": r["date"]})
		hit["n"] += 1
		if r["date"] < hit["first"]:
			hit["first"] = r["date"]
		if r["date"] > hit["last"]:
			hit["last"] = r["date"]
	return out


# ------------------------------------------------------------------ naming ---

def tidy(name):
	"""A name reduced to what two spellings of it have in common.

	`SANTHOSH KUMAR CG` and `Santhosh Kumar C G` are one person; punctuation and
	case are noise. Initials are kept — they are often the only thing telling
	two people called Sunny apart.
	"""
	return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


def suggest(name, pool, cutoff=0.72):
	"""The closest employee names, as a hint and never as an answer.

	Returned with their score so a reviewer can see how weak a suggestion is.
	`difflib` on tidied names, three at most: a list of eight guesses is a list
	nobody reads.
	"""
	key = tidy(name)
	if not key or key.isdigit():
		return []
	scored = []
	for emp in pool:
		score = difflib.SequenceMatcher(None, key, tidy(emp["employee_name"])).ratio()
		if score >= cutoff:
			scored.append((round(score, 2), emp))
	scored.sort(key=lambda x: -x[0])
	return scored[:3]


# ------------------------------------------------------------------ report ---

def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("dump", nargs="?", help="path stem of a dump, without -users.csv")
	ap.add_argument("--offline", action="store_true",
	                help="skip the site; report only what the device holds")
	ap.add_argument("--out", help="write the review CSV here (default: beside the dump)")
	args = ap.parse_args()

	stem = args.dump or newest_dump()
	users, punches, info = read_dump(stem)
	seen = punch_summary(punches)

	print("dump      {0}".format(Path(stem).name))
	if info:
		print("device    {0}  serial {1}  at {2}".format(
			info.get("name"), info.get("serial"), info.get("host")))
	print("users     {0:>6} enrolled, {1} of them with punches".format(
		len(users), sum(1 for u in users if u["user_id"] in seen)))
	print("punches   {0:>6}".format(len(punches)))

	enrolled = {u["user_id"] for u in users}
	ghosts = sorted(set(seen) - enrolled, key=lambda k: -seen[k]["n"])
	if ghosts:
		print("\n  {0} user id(s) in the punch log are no longer enrolled on the machine:".format(len(ghosts)))
		for g in ghosts[:10]:
			print("     {0:>8}  {1:>6} punches  {2} .. {3}".format(
				g, seen[g]["n"], seen[g]["first"], seen[g]["last"]))
		if len(ghosts) > 10:
			print("     ... and {0} more".format(len(ghosts) - 10))
		print("     Their history is still on the machine and nothing on it says who they were.")

	if args.offline or not os.environ.get("ERP_KEY"):
		if not args.offline:
			print("\nERP_KEY is not set, so the site half was skipped. Set ERP_URL, ERP_KEY")
			print("and ERP_SECRET — or pass --offline to say you meant only this half.")
		return 0

	# ------------------------------------------------------------ the join ---
	people = fetch_employees()
	by_device = {}
	for e in people:
		key = str(e.get("attendance_device_id") or "").strip()
		if key:
			by_device.setdefault(key, []).append(e)

	linked = [u for u in users if u["user_id"] in by_device]
	unlinked = [u for u in users if u["user_id"] not in by_device]
	no_id = [e for e in people if not str(e.get("attendance_device_id") or "").strip()]
	dangling = [e for k, v in by_device.items() if k not in enrolled for e in v]
	# Two people carrying one machine id: both would receive the other's punches.
	clashes = {k: v for k, v in by_device.items() if len(v) > 1}

	print("\nsite      {0:>6} employees, {1} with a machine id".format(
		len(people), len(people) - len(no_id)))
	print("linked    {0:>6} of {1} device users reach a person".format(len(linked), len(users)))

	def line(label, n, why):
		print("\n  {0}  {1}".format(str(n).rjust(4), label))
		print("        {0}".format(why))

	if unlinked:
		line("device users nobody on the site claims", len(unlinked),
		     "every punch these make is refused with `no employee found`")
		hot = [u for u in unlinked if u["user_id"] in seen]
		hot.sort(key=lambda u: seen[u["user_id"]]["last"], reverse=True)
		for u in hot[:15]:
			s = seen[u["user_id"]]
			print("         {0:>8}  {1:<24} {2:>5} punches  last {3}".format(
				u["user_id"], u["name"][:24], s["n"], s["last"]))
		if len(hot) > 15:
			print("         ... and {0} more that have punched".format(len(hot) - 15))
		cold = len(unlinked) - len(hot)
		if cold:
			print("         {0} more are enrolled but have never punched.".format(cold))

	if no_id:
		line("employees with no machine id at all", len(no_id),
		     "invisible to every machine — they read as absent every day")
		for e in no_id[:10]:
			print("         {0:<12} {1:<26} {2}".format(
				e.get("employee_number") or e["name"], e["employee_name"][:26], e.get("company", "")))
		if len(no_id) > 10:
			print("         ... and {0} more".format(len(no_id) - 10))

	if dangling:
		line("employees pointing at a user id this machine does not have", len(dangling),
		     "a mistyped number, or they punch at a gate not yet read")
		for e in dangling[:10]:
			print("         {0:<12} {1:<26} -> {2}".format(
				e.get("employee_number") or e["name"], e["employee_name"][:26],
				e.get("attendance_device_id")))

	if clashes:
		line("machine ids held by more than one employee", len(clashes),
		     "each punch would land on whichever the site returns first — fix before posting")
		for k, v in clashes.items():
			print("         {0:>8}  {1}".format(k, ", ".join(x["employee_name"] for x in v)))

	# ------------------------------------------------------------- review ---
	out = Path(args.out) if args.out else Path(str(stem) + "-links-to-review.csv")
	pool = [e for e in people if not str(e.get("attendance_device_id") or "").strip()]
	with out.open("w", newline="", encoding="utf-8") as fh:
		w = csv.writer(fh)
		w.writerow(["device_user_id", "device_name", "punches", "first_seen", "last_seen",
		            "suggested_employee", "suggested_name", "confidence", "also_maybe"])
		for u in unlinked:
			s = seen.get(u["user_id"], {})
			hits = suggest(u["name"], pool)
			best = hits[0] if hits else None
			w.writerow([
				u["user_id"], u["name"], s.get("n", 0), s.get("first", ""), s.get("last", ""),
				best[1]["name"] if best else "",
				best[1]["employee_name"] if best else "",
				best[0] if best else "",
				"; ".join("{0} ({1})".format(e["employee_name"], sc) for sc, e in hits[1:]),
			])
	print("\n  review    {0}".format(out))
	print("            Suggestions only. Nothing was written to the site or the device:")
	print("            a wrong link pays one person for another's attendance, and name")
	print("            matching across 438 rows will produce wrong links.")
	return 0


if __name__ == "__main__":
	sys.exit(main())
