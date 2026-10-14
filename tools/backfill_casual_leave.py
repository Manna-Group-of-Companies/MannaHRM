"""One month's Casual Leave for whoever was absent before their Casual Leave began.

    python tools/backfill_casual_leave.py --month 2026-09            # report only
    python tools/backfill_casual_leave.py --month 2026-09 --apply    # make the allocations

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

HR moved the absence rule — the month's first absence is Casual Leave — back to
1 September 2026 on 6 October. Most people's Casual Leave on the site starts 1
October, and hrms will not take a September day from it, so their September
absence would stay Absent whatever the rule decided. This gives each of them
the month's one day, for that month only (`leavepolicy.month_allocation`).

Only people the absence rule covers, with an Absent day that month, and no
Casual Leave allocation covering any of it. It makes allocations and nothing
else: the absence rule turns the absence into leave on its next run, the way it
does every other month. Safe to run twice — somebody given one is covered.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manna_hr import absencerule as ar  # noqa: E402
from manna_hr import leavepolicy as lp  # noqa: E402

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))


def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH,
		"Accept": "application/json",
		"Content-Type": "application/json",
	})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters):
	q = urllib.parse.urlencode({"fields": json.dumps(fields), "filters": json.dumps(filters), "limit_page_length": 0})
	return call("GET", "/api/resource/{0}?{1}".format(urllib.parse.quote(doctype), q))["data"]


def refused(exc):
	"""The site's own words, which name the actual problem far better than a code."""
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--month", required=True, help="YYYY-MM")
	p.add_argument("--apply", action="store_true", help="make the allocations; without it nothing is written")
	p.add_argument("--skip", action="append", default=[], metavar="EMPLOYEE", help="leave this employee out; may repeat")
	args = p.parse_args()

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2
	span = lp.month_allocation("", args.month)
	start, end = span["from_date"], span["to_date"]
	if start < ar.EFFECTIVE_FROM.isoformat():
		print("{0} is before the absence rule begins ({1}); an allocation would pay nothing.".format(
			args.month, ar.EFFECTIVE_FROM))
		return 2

	staff = {e["name"]: e for e in listing("Employee", ["name", "employee_name", "designation"], [["status", "=", "Active"]])
		if ar.applies_to(e["designation"])}
	absent = {}
	for r in listing("Attendance", ["employee", "attendance_date"], [
		["employee", "in", list(staff)], ["status", "=", "Absent"], ["docstatus", "=", 1],
		["attendance_date", "between", [start, end]],
	]):
		absent.setdefault(r["employee"], []).append(r["attendance_date"])
	allocations = listing("Leave Allocation", ["employee", "from_date", "to_date"], [
		["employee", "in", list(staff)], ["leave_type", "=", lp.LEAVE_TYPE_NAME], ["docstatus", "=", 1],
	])
	needs = [e for e in lp.needs_month_allocation(absent, allocations, args.month) if e not in args.skip]

	print("site: {0}\n{1} covered by the absence rule, {2} absent in {3}, {4} with no Casual Leave covering it\n".format(
		BASE, len(staff), len(absent), args.month, len(needs)))
	for e in needs:
		days = sorted(str(d)[:10] for d in absent[e])
		print("    {0}  {1} · {2} · {3} absent day(s), first {4}".format(
			e, staff[e]["employee_name"], staff[e]["designation"], len(days), days[0]))

	if not args.apply:
		print("\nDry run. Nothing was written; --apply makes {0} allocation(s).".format(len(needs)))
		return 0

	made = 0
	for e in needs:
		doc = dict(lp.month_allocation(e, args.month), docstatus=1)
		try:
			r = call("POST", "/api/resource/Leave%20Allocation", doc)["data"]
			made += 1
			print("  made {0} for {1}".format(r["name"], staff[e]["employee_name"]))
		except urllib.error.HTTPError as exc:
			print("  REFUSED {0}: {1}".format(staff[e]["employee_name"], refused(exc)))
	print("\nmade {0} of {1}. The absence rule takes each first absence on its next run.".format(made, len(needs)))
	return 0


if __name__ == "__main__":
	sys.exit(main())
