"""Post punches from a device dump to ERPNext, for a window you choose.

    python tools/post_punches.py --since 2026-08-24                 # dry run
    python tools/post_punches.py --since 2026-08-24 --apply
    python tools/post_punches.py --since 2026-08-24 --until 2026-08-31 --apply

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

Reads a dump written by `bridge/dump.py` and delivers the punches in it to the
site. **Dry run unless `--apply`**, and the dry run prints exactly what the real
one would send.

## Why this exists next to the bridge, which does the same job

The bridge is the thing that runs forever: it polls, queues, posts, and never
loses a punch. What it cannot do is *choose a window*. On its first pass it
reads the whole device log — 79,250 punches going back to July 2023 — and posts
every one it can match. Whether three years of history comes across is a
decision somebody has to take deliberately (docs/MIGRATION.md §3), and running
the bridge is not the way to take it by accident.

So: this for the backfill, once, over a window somebody chose. The bridge from
then on.

## What it will not do

**It never writes `Attendance`.** Attendance is generated from checkins by
hrms' shift job; a hand-written row is invisible to the thing that would have
created it and the two disagree the moment anything is reprocessed
(CLAUDE.md §5).

**It posts through hrms' own endpoint**, not by creating `Employee Checkin`
directly — the same endpoint `bridge/mannabridge/sink.py` uses. That endpoint
resolves the device's user number to an employee via `attendance_device_id`,
which is the one thing joining a machine to a person, and applies hrms' own
rules on the way in. Creating the doctype directly would mean reimplementing
both.

**It skips what is already there.** Every checkin already on the site for the
window is read first, and a punch matching one on employee *and* timestamp is
not sent again. hrms de-duplicates too, but a tool that relies on the far end
to be careful is a tool that posts twice the day the far end changes.

**It skips punches it cannot place, and says whose.** A device user nobody on
the site claims cannot be posted — hrms answers `no employee found` — and that
is master data rather than a network problem. `tools/check_device_links.py` is
the report for it.
"""

import argparse
import collections
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_device_links as links  # noqa: E402  — the dump reader and the site auth

BASE = links.BASE
AUTH = links.AUTH

#: hrms' own endpoint, and the same one the bridge posts to. See the docstring.
ENDPOINT = "/api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field"

#: What the device's punch words become. hrms takes IN and OUT and nothing else;
#: an overtime punch is still somebody arriving or leaving, and dropping those
#: rows would put a hole in a day that a person actually worked.
LOG_TYPE = {
	"check-in": "IN",
	"check-out": "OUT",
	"overtime-in": "IN",
	"overtime-out": "OUT",
	"break-in": "IN",
	"break-out": "OUT",
}


def post(path, payload):
	data = json.dumps(payload).encode()
	r = urllib.request.Request(BASE + path, data=data, method="POST",
		headers={"Authorization": AUTH, "Accept": "application/json",
		         "Content-Type": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as x:
		return json.loads(x.read().decode())


def existing(from_iso, to_iso):
	"""Every checkin already on the site in this window, as (employee, time).

	Read in one pass before anything is posted rather than checked per punch:
	1,100 extra reads against a site with a daily compute limit is a cost with
	nothing behind it (docs/OPEN_QUESTIONS.md §0).
	"""
	out, start = set(), 0
	while True:
		q = urllib.parse.urlencode({
			"fields": json.dumps(["employee", "time"]),
			"filters": json.dumps([["time", ">=", from_iso], ["time", "<=", to_iso]]),
			"limit_page_length": 500, "limit_start": start, "order_by": "time asc"})
		page = links.req("/api/resource/Employee%20Checkin?" + q)["data"]
		for row in page:
			out.add((row["employee"], str(row["time"])[:19]))
		if len(page) < 500:
			return out
		start += 500


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument("dump", nargs="?", help="dump path stem, without -punches.csv")
	ap.add_argument("--since", help="YYYY-MM-DD, inclusive. Default: everything in the dump.")
	ap.add_argument("--until", help="YYYY-MM-DD, inclusive")
	ap.add_argument("--device-id", default="",
	                help="what to stamp on each punch. Must match what is already on the "
	                     "site for this machine, and must start with the trusted prefix "
	                     "in Manna HR Settings, or the punches are treated as mobile ones.")
	ap.add_argument("--apply", action="store_true", help="actually post. Without it, nothing is sent.")
	ap.add_argument("--advance-sync", action="store_true",
	                help="afterwards, move last_sync_of_checkin on every auto-attendance shift "
	                     "up to the newest punch posted. Without this the punches land and no "
	                     "Attendance is ever generated from them.")
	ap.add_argument("--pause", type=float, default=0.05, help="seconds between posts")
	args = ap.parse_args()

	if not os.environ.get("ERP_KEY"):
		sys.exit("Set ERP_URL, ERP_KEY and ERP_SECRET in the environment first.")

	stem = args.dump or links.newest_dump()
	users, punches, info = links.read_dump(stem)
	if not args.device_id:
		sys.exit("--device-id is required. It is written onto every punch and cannot be "
		         "changed afterwards without orphaning the ones already posted.")

	rows = punches
	if args.since:
		rows = [r for r in rows if r["date"] >= args.since]
	if args.until:
		rows = [r for r in rows if r["date"] <= args.until]
	if not rows:
		sys.exit("No punches in that window.")

	people = links.fetch_employees()
	by_dev = {}
	for e in people:
		k = str(e.get("attendance_device_id") or "").strip()
		if k:
			by_dev.setdefault(k, []).append(e)

	placed = [r for r in rows if r["user_id"] in by_dev]
	orphan = [r for r in rows if r["user_id"] not in by_dev]

	lo, hi = min(r["timestamp"] for r in rows), max(r["timestamp"] for r in rows)
	already = existing(lo, hi)
	todo = [r for r in placed
	        if (by_dev[r["user_id"]][0]["name"], r["timestamp"]) not in already]

	print("dump      {0}".format(Path(stem).name))
	print("window    {0}  ->  {1}".format(lo, hi))
	print("device_id {0}".format(args.device_id))
	print()
	print("  {0:>6}  punches in the window".format(len(rows)))
	print("  {0:>6}  belong to a linked employee".format(len(placed)))
	print("  {0:>6}  already on the site, skipped".format(len(placed) - len(todo)))
	print("  {0:>6}  to post{1}".format(len(todo), "" if args.apply else "  (dry run — nothing sent)"))
	if orphan:
		who = collections.Counter(r["user_id"] for r in orphan)
		print("  {0:>6}  from {1} device user(s) nobody on the site claims — see "
		      "tools/check_device_links.py".format(len(orphan), len(who)))

	if not args.apply:
		for r in todo[:10]:
			e = by_dev[r["user_id"]][0]
			print("     would post  {0:<12} {1:<24} {2}  {3}".format(
				r["user_id"], e["employee_name"][:24], r["timestamp"], LOG_TYPE.get(r["punch"], "")))
		if len(todo) > 10:
			print("     ... and {0} more".format(len(todo) - 10))
		print("\n  Add --apply to send them.")
		return 0

	sent = failed = 0
	problems = collections.Counter()
	for i, r in enumerate(todo, 1):
		payload = {
			"employee_field_value": r["user_id"],
			"timestamp": r["timestamp"],
			"device_id": args.device_id,
		}
		# Only when the machine actually reported a direction. An empty
		# log_type is not the same as omitting it — hrms treats the blank as a
		# real value and the shift's pairing has nothing to alternate on.
		kind = LOG_TYPE.get(r["punch"])
		if kind:
			payload["log_type"] = kind
		try:
			post(ENDPOINT, payload)
			sent += 1
		except urllib.error.HTTPError as e:
			body = e.read().decode()[:160]
			problems[body.split("\\n")[0][:90]] += 1
			failed += 1
		except Exception as e:  # noqa: BLE001 — a transport failure is worth counting, not raising
			problems[str(e)[:90]] += 1
			failed += 1
		if i % 100 == 0:
			print("    {0}/{1} posted".format(i, len(todo)))
		time.sleep(args.pause)

	print("\n  posted {0}, failed {1}".format(sent, failed))
	for msg, n in problems.most_common(5):
		print("     {0:>5}  {1}".format(n, msg))

	if sent and args.advance_sync:
		up_to = max(r["timestamp"] for r in todo)
		print("\n  advancing last_sync_of_checkin to {0}".format(up_to))
		for s in advance_sync(up_to):
			print("     {0}".format(s))
	elif sent:
		print("\n  Attendance is not written here and must not be — hrms' shift job turns")
		print("  these into Attendance rows on its own schedule (CLAUDE.md §5). It will")
		print("  generate nothing until last_sync_of_checkin reaches these punches:")
		print("  re-run with --advance-sync, or let the bridge do it.")
	return 0 if not failed else 1


def advance_sync(up_to):
	"""Tell every auto-attendance shift how far the checkins now reach.

	**Frappe HR does nothing at all without this.** `process_auto_attendance`
	returns immediately unless `last_sync_of_checkin` is set past the shift's
	end, so punches can arrive perfectly and no Attendance is ever generated,
	with no error anywhere saying why. The same reasoning and the same write as
	`ErpSink.mark_synced` in bridge/mannabridge/sink.py — kept in both because
	a backfill that skips it looks exactly like a backfill that failed.

	Set to the newest punch actually posted, never to `now`: hrms processes
	shifts whose end is before this timestamp, so a value in the future closes
	today's shift while people are still on the floor and marks them on
	whatever hours they had at that moment.
	"""
	q = urllib.parse.urlencode({
		"fields": json.dumps(["name"]),
		"filters": json.dumps([["enable_auto_attendance", "=", 1]]),
		"limit_page_length": 200})
	said = []
	for s in links.req("/api/resource/Shift%20Type?" + q)["data"]:
		data = json.dumps({"last_sync_of_checkin": up_to}).encode()
		r = urllib.request.Request(
			BASE + "/api/resource/Shift%20Type/" + urllib.parse.quote(s["name"]),
			data=data, method="PUT",
			headers={"Authorization": AUTH, "Accept": "application/json",
			         "Content-Type": "application/json"})
		try:
			with urllib.request.urlopen(r, timeout=60):
				said.append("set on {0}".format(s["name"]))
		except Exception as e:  # noqa: BLE001
			said.append("FAILED on {0}: {1}".format(s["name"], str(e)[:90]))
	return said


if __name__ == "__main__":
	sys.exit(main())
