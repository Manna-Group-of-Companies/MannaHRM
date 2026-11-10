# The semi-finished changes made in TEST, as DTW files for the live company.
#
#     python -I localdev/sap/dtw_sfg.py                                  against the 2 Nov backup
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/dtw_sfg.py  against a later one
#
# Three versions of every item: 2 Nov (ORIG_HITECH_PRETREADS, the copy TEST was made from), live as the
# source backup holds it, and TEST's final state. A name, quality or active flag is written only where
# this conversion changed it, and never over a change live made since 2 Nov — on 6 Nov live had reused
# I-10432…I-10439, five "210 … MEDIUM EXTRUDED" codes, for finished goods and compounds, which a plain
# copy of TEST would have renamed back. Those are listed as conflicts and left alone.
#
#   DTW_SFG_1_rename.txt   Items, update: ItemCode, ItemName, U_Quality
#   DTW_SFG_2_retire.txt   Items, update: ItemCode, Valid N, Frozen Y — the duplicates retired in TEST
#   DTW_SFG_review.xlsx    every row, the conflicts, and the checks below
#
# Two files, not one, because a blank Valid/Frozen cell on a rename row must never be read as a value.
# Rename runs first: a retired twin is renamed "… OLD" in file 1 before file 2 makes it inactive.
# Sandered items are new items, not changes, so they are not here — they get their own create file.
# Refused, nothing written, when a final name is empty, over 100 characters, carries a tab or line
# break, or is another active item's name; or a quality is over 30 characters.

import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import OUT, PRE_BASE, PRE_SRC, dtw, history, load, three_way

base = {i["code"]: i for i in load(f"{PRE_BASE}-items.json")}
live = {i["code"]: i for i in load(f"{PRE_SRC}-items.json")}
test = load("TEST_HITECH_PRETREADS-naming-status.json")
groups = {g["Number"]: g["GroupName"] for g in test["groups"]}
final = {i["code"]: i for i in test["items"]}
new_codes = {m["new"] for m in load("fg-mapping.json")}

# The same scope squeeze_names.mjs used, so the two cannot disagree about what is an SFG.
FG_GROUP = re.compile(r"^(FG|HOT|Seconds|PRECURED|Tread Gum|VULCANISING SOLUTION)$|^FG\b", re.I)
is_fg = lambda code, g: code in new_codes or bool(FG_GROUP.search(groups.get(g, "")))
def is_semi(code, g, typ, name):
	if is_fg(code, g):
		return False
	return bool(re.fullmatch(r"CURED|EXTRUDED|SANDERED", typ or "", re.I) or re.search(r"\b(CURED|EXTRUDED|SANDERED)\b", name or "", re.I)
		or (re.search(r"\bCURING\b", name or "", re.I) and groups.get(g, "").upper() == "SFG"))
# Two REPAIR items carry no SFG word but were relabelled on 4 Nov (Items_sfg_rename2.txt): they belong here.
REPAIR = {"I-13580", "I-13585"}
active = lambda i: i["valid"] == "Y" and i["frozen"] != "Y"
# Retired only with no history (4 Nov) — judged again against live as the source backup holds it, since a
# duplicate unused on 2 Nov may be in use now (I-11408 went onto a BOM in live by 6 Nov).
used = history(PRE_SRC)

rows, conflicts, missing = [], [], []
for code, o in base.items():
	n, l = final.get(code), live.get(code)
	if not n or not l:
		missing.append(code)
		continue
	if is_fg(code, n["group"]) or not (is_semi(code, o["group"], o["type"], o["name"]) or is_semi(code, n["group"], n["type"], n["name"]) or code in REPAIR):
		continue
	wn, cn = three_way(o["name"], l["name"], n["name"])
	wq, cq = three_way(o["quality"] or None, l["quality"] or None, n["quality"] or None)
	wa, ca = three_way(active(o), active(l), n["active"])
	if cn or cq or ca:
		conflicts.append({"code": code, "base": o, "live": l, "ours": n, "why": "changed in live since 2 Nov"})
		continue
	if wa and not n["active"] and code in used:
		conflicts.append({"code": code, "base": o, "live": l, "ours": n, "why": "a duplicate to retire, but it has history in live now: " + used[code]})
		continue
	if not (wn or wq or wa):
		continue
	what = []
	if wn:
		what.append("spaces only" if re.sub(r"\s+", " ", l["name"]).strip() == n["name"] else "name")
	if wq:
		what.append("quality")
	if wa:
		what.append("retired" if not n["active"] else "REACTIVATED")
	# A column this row does not change carries live's own value, so the update is a no-op there.
	rows.append({"code": code, "group": groups.get(n["group"], n["group"]), "from": l["name"], "to": n["name"] if wn else l["name"],
		"qfrom": l["quality"], "qto": n["quality"] if wq else l["quality"], "retire": wa and not n["active"], "what": ", ".join(what),
		"since": "live changed since 2 Nov" if (l["name"], l["quality"], active(l)) != (o["name"], o["quality"], active(o)) else ""})

problems = []
active_names = {}
for i in test["items"]:
	if i["active"]:
		active_names.setdefault(re.sub(r"\s+", " ", i["name"] or "").strip().upper(), []).append(i["code"])
for r in rows:
	if not r["to"] or len(r["to"]) > 100 or re.search(r"[\t\r\n]", r["to"]) or r["to"] != r["to"].strip():
		problems.append(f"{r['code']}: final name unusable: {r['to']!r}")
	if r["qto"] and len(r["qto"]) > 30:
		problems.append(f"{r['code']}: quality over 30 characters")
	if r["qfrom"] and not r["qto"]:
		problems.append(f"{r['code']}: quality would be cleared")
	if "REACTIVATED" in r["what"]:
		problems.append(f"{r['code']}: inactive in live, active in TEST")
	twins = [c for c in active_names.get(r["to"].upper(), []) if c != r["code"]]
	if not r["retire"] and twins:
		problems.append(f"{r['code']}: final name also on active {', '.join(twins)}")
if missing:
	problems.append(f"{len(missing)} items of 2 Nov missing from TEST or from {PRE_SRC}: {', '.join(missing[:10])}")
if problems:
	raise SystemExit("Nothing written:\n  " + "\n  ".join(problems))

rows.sort(key=lambda r: r["code"])
renamed = [r for r in rows if r["what"] != "retired"]
retired = [r for r in rows if r["retire"]]
dtw("DTW_SFG_1_rename.txt", "items_pre", ["ItemCode", "ItemName", "U_Quality"], [(r["code"], r["to"], r["qto"] or "") for r in renamed])
dtw("DTW_SFG_2_retire.txt", "items_pre", ["ItemCode", "Valid", "Frozen"], [(r["code"], "tNO", "tYES") for r in retired])

def sheet(wb, title, heads, body, wide):
	ws = wb.create_sheet(title)
	ws.append(heads)
	for line in body:
		ws.append(line)
	for c, h in enumerate(heads, start=1):
		x = ws.cell(row=1, column=c)
		x.font = Font(color="FFFFFF", bold=True)
		x.fill = PatternFill("solid", fgColor="1F4E78")
		x.alignment = Alignment(wrap_text=True, vertical="top")
		ws.column_dimensions[get_column_letter(c)].width = 42 if h in wide else 16
	ws.freeze_panes = "B2"
	ws.auto_filter.ref = ws.dimensions

show = lambda v: (v or "").replace("\r", "⏎").replace("\n", "⏎")
count = lambda pred: sum(1 for r in rows if pred(r))
wb = openpyxl.Workbook()
info = wb.active
info.title = "Summary"
for line in [
	["Semi-finished items that change in live", len(rows)],
	["  spaces only", count(lambda r: r["what"] == "spaces only")],
	["  name (new label)", count(lambda r: "name" in r["what"].split(", "))],
	["  quality (U_Quality)", count(lambda r: "quality" in r["what"])],
	["  retired (renamed … OLD, made inactive)", len(retired)],
	["Left alone: changed in live since 2 Nov in a way this conversion would undo", len(conflicts)],
	[],
	["Import order", ""],
	["1. DTW_SFG_1_rename.txt", "Items, update existing: ItemName and U_Quality"],
	["2. DTW_SFG_2_retire.txt", "Items, update existing: Valid N, Frozen Y"],
	["Then", "the sandered create file, then the FG files, then the BOM files"],
	[],
	["Built against", f"{PRE_SRC} (live as restored on this PC), with 2 Nov's copy ({PRE_BASE}) to tell live's changes from ours"],
	["Not here", "sandered items (new, own file), FG changes (FG file), Manna Treads (no semi-finished items)"],
]:
	info.append(line)
info.column_dimensions["A"].width = 60
info.column_dimensions["B"].width = 110
sheet(wb, "SFG changes", ["Item code", "Group", "Name in live now", "Final name", "Quality in live now", "Final quality", "Retired", "What changes", "Note"],
	[[r["code"], r["group"], show(r["from"]), r["to"], r["qfrom"], r["qto"], "Y" if r["retire"] else "", r["what"], r["since"]] for r in rows],
	{"Name in live now", "Final name"})
sheet(wb, "Left alone", ["Item code", "Why", "Name on 2 Nov", "Name in live now", "Our name", "Quality 2 Nov / live / ours", "Group 2 Nov / live"],
	[[c["code"], c["why"], show(c["base"]["name"]), show(c["live"]["name"]), c["ours"]["name"],
		f"{c['base']['quality']} / {c['live']['quality']} / {c['ours']['quality']}", f"{groups.get(c['base']['group'])} / {groups.get(c['live']['group'])}"] for c in conflicts],
	{"Why", "Name on 2 Nov", "Name in live now", "Our name"})
wb.save(os.path.join(OUT, "DTW_SFG_review.xlsx"))

print(f"{PRE_SRC}: {len(renamed)} renamed, {len(retired)} retired, {len(conflicts)} left alone ({', '.join(c['code'] for c in conflicts)})")
