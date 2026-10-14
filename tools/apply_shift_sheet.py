"""HR's shift sheet of 8 October 2026 onto the live site, and the old shifts off it.

    python tools/apply_shift_sheet.py            # says what it would do, writes nothing
    python tools/apply_shift_sheet.py --apply    # does it

    ERP_URL / ERP_KEY / ERP_SECRET in the environment, as the other tools here.

"MANNA GROUP - SHIFT TIMING SCHEDULE FOR APPLYING HR APPLICATION - 08-10-2026"
lists 35 shifts across five companies. After this runs, those 35 are the site's
Shift Types and nothing else is.

## Why most old shifts are renamed rather than deleted

A Shift Type that an Attendance or Employee Checkin names cannot be deleted —
Frappe refuses, and those rows are September's pay. So an old shift whose
window is one of the sheet's is **renamed** onto the sheet's name: everybody's
default shift, their Shift Assignments and the history behind them follow it,
and nobody's day is measured any differently tomorrow (HR, 9 October 2026).
`Shift Type` is not renamable out of the box; a Property Setter turns that on.

`Hi-Tech Rubber Industries-Cook shift` has no shift on the sheet. Its one
person, HRI-010, is on Manna Rubber Products' roll and was moved to that
company's HK shift, the same 06:00–14:00 (HR, same day) — by renaming, for the
reason above.

## Why some names carry their window

The sheet names some shifts twice — Manna Rubber Products' `Productionshift`
two ways and `Production8hrshift` four, Manna Tyre Retreads' `Production12hr
shift` two — and a Shift Type's name is its id. Those, and only those, carry
the window in brackets, the way Hi-Tech Pretreads' names already do (HR's
choice). Hi-Tech Pretreads' names are the sheet's word for word, brackets
included, even where the bracket disagrees with the times beside it: `Cook
shift (08:00-04:00)` runs 08:00–16:00. The times are what hrms reads; the
dashboard draws the real window in place of a bracket (`shiftLabel`).

## What a new shift is set to

Everything but its name and window is copied off a shift the company already
runs: office and driver shifts off Manna Rubber Products' Office Shift,
production off its eight-hour shift, and Manna Tyre Retreads' new day shift
off its night one — which keeps auto attendance off there, as every Tyre
Retreads shift has been.

Safe to run twice: what is already as the sheet says is left alone.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("ERP_URL", "https://mannarubber.m.frappe.cloud").rstrip("/")
AUTH = "token {0}:{1}".format(os.environ.get("ERP_KEY", ""), os.environ.get("ERP_SECRET", ""))

MRP = "Manna Rubber Products Pvt.Ltd"
MTR = "Manna Tyre Retreads"
HTP = "Hi-Tech Pretreads"
HRI = "Hi-Tech Rubber Industries"

# The shifts a new one copies its settings from, by their names *before* this
# runs — they are read before anything is renamed.
OFFICE = MRP + "-Office Shift"
EIGHT = MRP + "-Production8hrshift1"
MTR_TWELVE = MTR + "-Production12hr shift"

# (name, start, end, copied from — None where the site already has it)
SHEET = [
	(MTR + "-Office shift", "09:30", "18:30", None),
	(MTR + "-Driver shift", "09:00", "19:00", None),
	# The sheet says 09:00 to 09:00. A window that ends where it starts is no
	# length at all to hrms, so it stays a minute short, as the site had it.
	(MTR + "-Production24hr shift", "09:00", "08:59", None),
	(MTR + "-Cook shift", "08:00", "14:00", None),
	(MTR + "-Production22hr shift", "10:00", "08:00", None),
	(MTR + "-Production12hr shift (18:30-06:30)", "18:30", "06:30", None),
	(MTR + "-Production12hr shift (08:00-20:00)", "08:00", "20:00", MTR_TWELVE),

	(HTP + "-Office shift (08:30-17:30)", "08:30", "17:30", OFFICE),
	(HTP + "-Driver shift (08:30-17:00)", "08:30", "17:00", OFFICE),
	(HTP + "-Production shift1 (08:30-17:00)", "08:30", "17:00", EIGHT),
	(HTP + "-Production shift2 (17:00-01:00)", "17:00", "01:00", EIGHT),
	(HTP + "-Production shift3 (08:30-16:30)", "08:30", "16:30", EIGHT),
	(HTP + "-Production shift4 (20:30-04:30)", "20:30", "04:30", EIGHT),
	(HTP + "-Production shift5 (07:00-03:00)", "07:00", "15:00", EIGHT),
	(HTP + "-Production shift6 (1.00-09:00)", "13:00", "21:00", EIGHT),
	(HTP + "-Production shift7 (2.00-10:00)", "14:00", "22:00", EIGHT),
	(HTP + "-Cook shift (08:00-04:00)", "08:00", "16:00", EIGHT),
	(HTP + "-Other location (09:30-18:30)", "09:30", "18:30", None),

	(HRI + "-Office Shift", "08:30", "17:30", OFFICE),
	(HRI + "-Production shift1", "08:30", "17:00", None),
	(HRI + "-Production shift2", "07:00", "15:30", EIGHT),
	(HRI + "-Production shift3", "22:00", "06:00", EIGHT),
	(HRI + "-Production shift4", "08:30", "16:30", EIGHT),

	(MRP + "-Office Shift", "08:30", "17:30", None),
	(MRP + "-Production12hrshift1", "08:30", "20:30", None),
	(MRP + "-Production12hrshift2", "20:30", "08:30", None),
	(MRP + "-Productionshift (08:30-17:00)", "08:30", "17:00", EIGHT),
	(MRP + "-Productionshift (08:30-16:30)", "08:30", "16:30", None),
	(MRP + "-Production8hrshift (20:30-04:30)", "20:30", "04:30", None),
	(MRP + "-Production8hrshift (06:00-14:00)", "06:00", "14:00", EIGHT),
	(MRP + "-Production8hrshift (14:00-22:00)", "14:00", "22:00", EIGHT),
	(MRP + "-Production8hrshift (22:00-06:00)", "22:00", "06:00", EIGHT),
	(MRP + "-HK shift", "06:00", "14:00", None),
	(MRP + "-Maintenance shift", "08:30", "17:00", None),

	("MANNA TREADS PVT.LTD-SHIFT", "09:30", "18:30", None),
]

# (old, new, merge) — each old window is the new one's to the minute.
RENAME = [
	(MRP + "-Production8hrshift1", MRP + "-Productionshift (08:30-16:30)", False),
	(MRP + "-Production8hrshift2", MRP + "-Production8hrshift (20:30-04:30)", False),
	("Manna Treads Pvt.Ltd-Office shift", "MANNA TREADS PVT.LTD-SHIFT", False),
	(HTP + "-Other location", HTP + "-Other location (09:30-18:30)", False),
	(HRI + "-Cook shift", MRP + "-HK shift", False),
	(MTR + "-Production12hr shift", MTR + "-Production12hr shift (18:30-06:30)", False),
	# One Inactive assignment holds it, which blocks a delete. Its 20:30–08:30
	# is the night shift's, so it is folded into that rather than cancelled.
	("HRI-Night Shift", MRP + "-Production12hrshift2", True),
]

# Settings that belong to the shift they were read off, not to a copy of it.
NOT_COPIED = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "last_sync_of_checkin"}


# -------------------------------------------------------------------- site ---

def call(method, path, body=None):
	data = json.dumps(body).encode("utf-8") if body is not None else None
	r = urllib.request.Request(BASE + path, data=data, method=method, headers={
		"Authorization": AUTH,
		"Accept": "application/json",
		"Content-Type": "application/json",
	})
	with urllib.request.urlopen(r, timeout=300) as f:
		return json.loads(f.read().decode("utf-8") or "{}")


def listing(doctype, fields, filters=None):
	q = {"doctype": doctype, "fields": json.dumps(fields), "limit_page_length": 0}
	if filters:
		q["filters"] = json.dumps(filters)
	return call("GET", "/api/method/frappe.client.get_list?" + urllib.parse.urlencode(q)).get("message") or []


def shift(name):
	return call("GET", "/api/resource/Shift%20Type/" + urllib.parse.quote(name, safe=""))["data"]


def refused(exc):
	"""The site's own words, which name the actual problem far better than a code."""
	body = exc.read().decode("utf-8", "replace")
	try:
		msgs = json.loads(json.loads(body).get("_server_messages") or "[]")
		return " ".join(json.loads(m).get("message", "") for m in msgs) or body[:300]
	except Exception:
		return body[:300]


def hhmm(t):
	"""`8:30:00` → `08:30`, which is how this site stores one and the sheet reads."""
	h, m = str(t).split(":")[:2]
	return "{0:02d}:{1}".format(int(h), m)


# --------------------------------------------------------------------- run ---

def main():
	p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	p.add_argument("--apply", action="store_true", help="write to the site; without it nothing is written")
	args = p.parse_args()
	say = (lambda *a: print(" ".join(a))) if args.apply else (lambda *a: print("[dry]", " ".join(a)))

	if not os.environ.get("ERP_KEY"):
		print("ERP_KEY is not set. Set ERP_URL, ERP_KEY and ERP_SECRET first.")
		return 2
	names = {r["name"] for r in listing("Shift Type", ["name"])}
	sources = {s: shift(s) for s in {r[3] for r in SHEET if r[3]} if s in names}

	# ---- rename on ----
	ps = listing("Property Setter", ["name", "value"], [["doc_type", "=", "Shift Type"], ["property", "=", "allow_rename"]])
	if not ps or ps[0]["value"] != "1":
		say("Shift Type: allow rename")
		if args.apply and ps:
			call("PUT", "/api/resource/Property%20Setter/" + urllib.parse.quote(ps[0]["name"], safe=""), {"value": "1"})
		elif args.apply:
			call("POST", "/api/resource/Property%20Setter", {
				"doctype_or_field": "DocType", "doc_type": "Shift Type",
				"property": "allow_rename", "value": "1", "property_type": "Check"})

	# ---- renames ----
	was = {}  # new name -> the name it holds now, so a dry run can read it
	for old, new, merge in RENAME:
		if old not in names:
			continue
		if new in names and not merge:
			print("STOPPED: {0} is already on the site, so {1} cannot take its name.".format(new, old))
			return 1
		say("rename", old, "->", new, "(merged)" if merge else "")
		if args.apply:
			call("POST", "/api/method/frappe.client.rename_doc", {
				"doctype": "Shift Type", "old_name": old, "new_name": new, "merge": 1 if merge else 0})
		names.discard(old)
		if not merge:
			was[new] = old
		names.add(new)

	# ---- times, and the new ones ----
	for name, start, end, source in SHEET:
		if name in names:
			d = shift(name if args.apply else was.get(name, name))
			if (hhmm(d["start_time"]), hhmm(d["end_time"])) != (start, end):
				say("times", name, "{0}-{1} -> {2}-{3}".format(hhmm(d["start_time"]), hhmm(d["end_time"]), start, end))
				if args.apply:
					call("PUT", "/api/resource/Shift%20Type/" + urllib.parse.quote(name, safe=""),
						{"start_time": start + ":00", "end_time": end + ":00"})
			continue
		if source not in sources:
			print("STOPPED: {0} is new and {1}, which it copies, is not on the site.".format(name, source))
			return 1
		doc = {k: v for k, v in sources[source].items() if k not in NOT_COPIED}
		doc.update(name=name, start_time=start + ":00", end_time=end + ":00")
		say("create", name, "{0}-{1}".format(start, end), "like", source)
		if args.apply:
			call("POST", "/api/resource/Shift%20Type", doc)
		names.add(name)

	# ---- what is left is not on the sheet ----
	failed = 0
	for old in sorted(names - {r[0] for r in SHEET}):
		say("delete", old)
		if args.apply:
			try:
				call("DELETE", "/api/resource/Shift%20Type/" + urllib.parse.quote(old, safe=""))
			except urllib.error.HTTPError as exc:
				print("    NOT deleted — {0}".format(refused(exc)))
				failed += 1
	return 1 if failed else 0


if __name__ == "__main__":
	try:
		sys.exit(main())
	except urllib.error.HTTPError as exc:
		print("The site refused: {0}".format(refused(exc)))
		sys.exit(1)
