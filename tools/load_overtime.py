"""Load Factor HR's Over Time Report into `Employee Overtime`, one row per person per day.

    python tools/load_overtime.py "Over Time Report.pdf"                 # dry run
    python tools/load_overtime.py "Over Time Report.pdf" --apply
    python tools/load_overtime.py report.pdf --save-csv data/factohr/overtime-2026-09.csv
    python tools/load_overtime.py data/factohr/overtime-2026-09.csv --apply

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.
    Reading the PDF needs pypdf (python -m pip install pypdf); a CSV this tool
    saved does not.

**Dry run unless `--apply`**, and the dry run prints exactly what the real one
would write.

## Why the PDF, when data/factohr/README.md says "not PDF"

Factor HR's Over Time Report offers nothing else. So the reader checks itself
against the report before anything is sent: the serial numbers must run 1..N
with none missing, and every per-employee subtotal the report prints must equal
the sum of that employee's rows. A page the text extraction mangled fails one of
those two checks, and the run stops.

## Hours come from the duration, and the site decides how many places survive

"10 Hrs 20 Mins" is 10.333333 hours; the report's own column says 10.33. The
duration is what gets sent, checked against the column to within a hundredth.
The repo's doctype keeps six places, but the site's custom copy is set to two
(read 25 Sep 2026), so today 10.33 is what is stored and monthly totals equal
Factor HR's to the paisa. "Already loaded" is therefore judged at two places:
comparing six against a site that keeps two would call every rounded day a
conflict.

## Matching a code to a person, and why it refuses instead of guessing

The code is `Employee.employee_number` (tools/backfill_employee_links.py). A
code that no employee holds, or that more than one holds, is reported and
skipped. So is a code whose employee's name shares no word with the report's:
a code on the wrong record writes one person's overtime onto another's wages,
and nothing downstream would notice.

## What it will not do

**It never overwrites.** A day that already has overtime is left alone. Same
hours means it is already loaded. Different hours is printed as a conflict for
HR to settle by hand. employee_overtime.py refuses a second row for a day, but
only once the app is installed; until then this check is the only one.
"""

import argparse
import collections
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

DOCTYPE = "Employee Overtime"
CSV_FIELDS = ["sno", "code", "name", "date", "time_in", "time_out", "duration",
              "shift", "report_hours", "status", "approved_by", "approved_on"]

# ------------------------------------------------------------ the report ---

_FOOTER = re.compile(r"Report Time:.*?HI-TECH RUBBER INDUSTRIES", re.S)
_HEADER = re.compile(
	r"^(S#|Emp|Code|Emp Name|Date|Time In|Time Out|Over Time|Duration|Shift|Remarks|"
	r"Total Over-|Time Hours|Approval|Status|Last Action By|Last Action On|"
	r"Over Time Report|Date From:.*|HI-TECH RUBBER INDUSTRIES|Company|LOGO)$")
_DATE = re.compile(r"^\d\d-[A-Z][a-z]{2}-\d\d$")
_TIME = re.compile(r"^\d\d:\d\d [AP]M$")
_HOURS = re.compile(r"^\d+\.\d\d$")
_STAMP = re.compile(r"^\d\d-\d\d-\d{4} \d\d:\d\d:\d\d$")
_CODE = re.compile(r"^[A-Z]{2,5}-\d+$")


def duration_hours(text):
	"""'2 Hrs 30 Mins' → 2.5, '59 Mins' → 0.983333, '1 Hr' → 1.0."""
	m = re.fullmatch(r"\s*(?:(\d+)\s*Hrs?)?\s*(?:(\d+)\s*Mins?)?\s*", text or "")
	if not m or not (m.group(1) or m.group(2)):
		raise ValueError("not a duration: %r" % text)
	return round(int(m.group(1) or 0) + int(m.group(2) or 0) / 60.0, 6)


def parse_report_text(text):
	"""The report's text, as pypdf extracts it, into rows and the printed subtotals.

	Raises ValueError on anything it cannot place: a line it does not recognise
	is a row it would otherwise silently drop.
	"""
	text = _FOOTER.sub("", text)
	lines = [s.strip() for s in text.splitlines() if s.strip() and not _HEADER.match(s.strip())]
	rows, subtotals, i = [], [], 0

	def at(k):
		if k >= len(lines):
			raise ValueError("report ends mid-row after S# %s" % (rows[-1]["sno"] if rows else "?"))
		return lines[k]

	while i < len(lines):
		if lines[i].isdigit() and i + 1 < len(lines) and _CODE.match(lines[i + 1]):
			r = {"sno": int(lines[i]), "code": lines[i + 1]}
			i += 2
			if re.fullmatch(r"\([A-Z]+\)", at(i)):  # "MRP-251" / "(BMS)" wraps onto two lines
				r["code"] += " " + at(i)
				i += 1
			name = []
			while not _DATE.match(at(i)):
				name.append(at(i))
				i += 1
			r["name"], r["date"] = " ".join(name), at(i)
			i += 1
			for key in ("time_in", "time_out"):
				if not _TIME.match(at(i)):
					raise ValueError("S# %d: expected a time, found %r" % (r["sno"], at(i)))
				r[key] = at(i)
				i += 1
			dur = [at(i)]
			i += 1
			if at(i) == "Mins":
				dur.append(at(i))
				i += 1
			r["duration"] = " ".join(dur)
			shift = []
			while not _HOURS.match(at(i)):
				shift.append(at(i))
				i += 1
			r["shift"] = " ".join(shift).replace("- ", "-")
			r["report_hours"] = float(at(i))
			r["status"] = at(i + 1)
			i += 2
			by = []
			while not _STAMP.match(at(i)):
				by.append(at(i))
				i += 1
			r["approved_by"], r["approved_on"] = " ".join(by), at(i)
			i += 1
			rows.append(r)
		elif _HOURS.match(lines[i]) and rows:
			subtotals.append((rows[-1]["code"], float(lines[i])))
			i += 1
		else:
			raise ValueError("unrecognised line %r after S# %s" % (lines[i], rows[-1]["sno"] if rows else "-"))
	return rows, subtotals


def check_rows(rows, subtotals):
	"""Everything that must be true of the report before a single row is sent."""
	problems = []
	if [r["sno"] for r in rows] != list(range(1, len(rows) + 1)):
		problems.append("serial numbers do not run 1..%d — a row was lost in extraction" % len(rows))
	sums = collections.defaultdict(float)
	for r in rows:
		sums[r["code"]] += r["report_hours"]
		try:
			h = duration_hours(r["duration"])
		except ValueError as e:
			problems.append("S# %d: %s" % (r["sno"], e))
			continue
		if abs(h - r["report_hours"]) > 0.01:
			problems.append("S# %d: duration %r is %.4f h but the report says %.2f" % (
				r["sno"], r["duration"], h, r["report_hours"]))
		if r["status"] != "Approved":
			problems.append("S# %d: status %r — only approved overtime is loaded" % (r["sno"], r["status"]))
	for code, total in subtotals:
		if abs(sums[code] - total) > 0.011:
			problems.append("%s: rows sum to %.2f, the report's subtotal is %.2f" % (code, sums[code], total))
	if subtotals and len(subtotals) != len(sums):
		problems.append("%d subtotals for %d employees" % (len(subtotals), len(sums)))
	seen = collections.Counter((r["code"], r["date"]) for r in rows)
	for (code, date), n in seen.items():
		if n > 1:
			problems.append("%s has %d rows for %s" % (code, n, date))
	return problems


def same_hours(a, b):
	"""Equal at the site's two places. Anything finer is the site's rounding, not HR's decision."""
	return round(float(a), 2) == round(float(b), 2)


def iso_date(report_date):
	return datetime.strptime(report_date, "%d-%b-%y").strftime("%Y-%m-%d")


def reason_for(r):
	return "Factor HR Over Time Report: in {0}, out {1}, {2}. Shift {3}. Approved by {4} on {5}.".format(
		r["time_in"], r["time_out"], r["duration"], r["shift"], r["approved_by"], r["approved_on"])


# -------------------------------------------------------------- matching ---

def code_candidates(code):
	"""'MRP-251 (BMS)' may be held as that, as 'MRP-251(BMS)', or as plain 'MRP-251'."""
	out = [code]
	m = re.fullmatch(r"(\S+)\s*(\([A-Z]+\))", code)
	if m:
		out += [m.group(1) + m.group(2), m.group(1)]
	return out


def _words(name):
	return {w for w in re.split(r"[^a-z]+", (name or "").lower()) if len(w) > 1}


def names_agree(a, b):
	"""Share one real word. Loose on purpose: 'SOUJATH P.I' and 'Soujath P I' are one person."""
	return bool(_words(a) & _words(b))


def match(rows, employees):
	"""{code: employee row} for what can be placed, and {code: why not} for the rest."""
	by_number = collections.defaultdict(list)
	for e in employees:
		if e.get("employee_number"):
			by_number[e["employee_number"].strip().upper()].append(e)
	found, refused = {}, {}
	for code, name in sorted({(r["code"], r["name"]) for r in rows}):
		hits = []
		for c in code_candidates(code):
			hits = by_number.get(c.upper(), [])
			if hits:
				break
		if not hits:
			refused[code] = "no employee has employee_number %s (%s)" % (code, name)
		elif len(hits) > 1:
			refused[code] = "%d employees hold %s: %s" % (len(hits), code, ", ".join(h["name"] for h in hits))
		elif not names_agree(name, hits[0].get("employee_name")):
			refused[code] = "%s is %s on the site but %s in the report" % (
				hits[0]["name"], hits[0].get("employee_name"), name)
		else:
			found[code] = hits[0]
	return found, refused


# ------------------------------------------------------------------ site ---

def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"})
	with urllib.request.urlopen(r, timeout=60) as f:
		return json.loads(f.read().decode("utf-8"))


def listing(doctype, fields, filters=None):
	q = {"doctype": doctype, "fields": json.dumps(fields), "limit_page_length": 0}
	if filters:
		q["filters"] = json.dumps(filters)
	return call("GET", "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)).get("message") or []


def refused_by_site(exc):
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


# ------------------------------------------------------------------- run ---

def read_input(path):
	if path.suffix.lower() == ".csv":
		with open(path, newline="", encoding="utf-8") as f:
			rows = list(csv.DictReader(f))
		for r in rows:
			r["sno"], r["report_hours"] = int(r["sno"]), float(r["report_hours"])
		return rows, []  # the subtotals were checked when this CSV was saved
	try:
		from pypdf import PdfReader
	except ImportError:
		sys.exit("Reading a PDF needs pypdf: python -m pip install pypdf")
	text = "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)
	return parse_report_text(text)


def main():
	ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
	ap.add_argument("source", type=Path, help="the Over Time Report PDF, or a CSV this tool saved")
	ap.add_argument("--apply", action="store_true", help="write to the site; without it, a dry run")
	ap.add_argument("--save-csv", type=Path, help="write the checked rows here (keep it under data/factohr/)")
	args = ap.parse_args()

	try:
		rows, subtotals = read_input(args.source)
	except ValueError as e:
		sys.exit("Could not read the report: %s" % e)
	problems = check_rows(rows, subtotals)
	print("Report: %d rows, %d employees, %.2f hours" % (
		len(rows), len({r["code"] for r in rows}), sum(r["report_hours"] for r in rows)))
	if problems:
		print("\nThe report does not check out, so nothing is loaded:")
		for p in problems:
			print("  " + p)
		sys.exit(1)
	print("Checked: serial numbers complete, every subtotal matches, every row approved.")

	if args.save_csv:
		args.save_csv.parent.mkdir(parents=True, exist_ok=True)
		with open(args.save_csv, "w", newline="", encoding="utf-8") as f:
			w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
			w.writeheader()
			w.writerows({k: r[k] for k in CSV_FIELDS} for r in rows)
		print("Saved %s" % args.save_csv)

	if not os.environ.get("ERP_KEY"):
		print("\nERP_KEY is not set, so the site was not read. Set ERP_URL, ERP_KEY and ERP_SECRET.")
		return

	try:
		employees = listing("Employee", ["name", "employee_name", "employee_number", "company", "status"])
		dates = sorted(iso_date(r["date"]) for r in rows)
		existing = listing(DOCTYPE, ["name", "employee", "ot_date", "hours"],
		                   [["ot_date", "between", [dates[0], dates[-1]]]])
	except urllib.error.HTTPError as e:
		sys.exit("The site refused the read: HTTP %d %s" % (e.code, refused_by_site(e)))

	found, refused = match(rows, employees)
	have = {(x["employee"], str(x["ot_date"])): x for x in existing}

	todo, same, conflict, unplaced = [], [], [], []
	for r in rows:
		e = found.get(r["code"])
		if not e:
			unplaced.append(r)
			continue
		day, hours = iso_date(r["date"]), duration_hours(r["duration"])
		old = have.get((e["name"], day))
		if old is None:
			todo.append((r, e, day, hours))
		elif same_hours(old["hours"], hours):
			same.append(r)
		else:
			conflict.append((r, e, day, hours, old))

	if refused:
		print("\nNot placed — fix the Employee record, then run again (%d rows):" % len(unplaced))
		for code, why in sorted(refused.items()):
			print("  %s: %s" % (code, why))
	if conflict:
		print("\nAlready on the site with different hours — left alone, settle by hand:")
		for r, e, day, hours, old in conflict:
			print("  %s %s %s: site %s h (%s), report %.4f h" % (
				e["name"], r["name"], day, old["hours"], old["name"], hours))
	print("\n%d to write, %d already loaded, %d conflicting, %d not placed." % (
		len(todo), len(same), len(conflict), len(unplaced)))
	inactive = sorted({e["name"] + " " + e["employee_name"] for _, e, _, _ in todo if e.get("status") != "Active"})
	if inactive:
		print("Note: overtime for employees not Active on the site: " + "; ".join(inactive))

	if not args.apply:
		for r, e, day, hours in todo[:10]:
			print("  would write %s %-24s %s %.4f h" % (e["name"], (e["employee_name"] or "")[:24], day, hours))
		if len(todo) > 10:
			print("  … and %d more" % (len(todo) - 10))
		print("\nDry run. Nothing was written. Add --apply to write.")
		return

	# The controller that fills this is not running while the site holds the
	# doctype as custom (CLAUDE.md §7), so say who entered the rows here.
	me = call("GET", "/api/method/frappe.auth.get_logged_user")["message"]
	ok, failed = 0, []
	for r, e, day, hours in todo:
		try:
			call("POST", "/api/resource/" + urllib.parse.quote(DOCTYPE), {
				"employee": e["name"], "ot_date": day, "hours": hours, "reason": reason_for(r),
				"entered_by": me})
			ok += 1
		except urllib.error.HTTPError as ex:
			failed.append("%s %s %s: %s" % (e["name"], r["name"], day, refused_by_site(ex)))
	print("\nWrote %d of %d." % (ok, len(todo)))
	for f in failed:
		print("  refused: " + f)
	if failed:
		sys.exit(1)


if __name__ == "__main__":
	main()
