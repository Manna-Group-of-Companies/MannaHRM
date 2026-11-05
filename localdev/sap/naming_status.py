# Where the item naming stands → two workbooks for the people deciding the rest.
#
#     python -I localdev/sap/naming_status.py "%USERPROFILE%\Downloads\ITEM CATEGORY.xlsx"
#
# Reads out/<DB>-naming-status.json (naming_status.mjs) for both test companies,
# out/fg-mapping.json and management's sheet, and writes:
#
#   out/FG-codes-not-created.xlsx    finished goods still under an old code with no new code
#   out/SFG-names-not-updated.xlsx   semi-finished items whose name is not on the new labels
#
# The suggestions in them are only a starting point: codes are management's to
# give, so the decision columns (yellow) are left for a person to fill.

import json
import os
import re
import sys
from collections import Counter, defaultdict

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
SHEET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Downloads", "ITEM CATEGORY.xlsx")

# semirename.mjs's rules, longest first.
RULES = [
	(r"\bBLACK\s+PEARL\s+B\b", "DOUBLE BLUE B"),
	(r"\bBLACK\s*PEA?RA?L\b|\bBACKPEARL\b|\bB\s?P\b", "DOUBLE BLUE"),
	(r"\bPLATINUM\b|\bPL\b", "BLUE"),
	(r"\bPOLY\s*GOLD\b|\bPOLGOLD\b", "ORANGE/VERDO"),
	(r"\bSILVER\b|\bSIVER\b|\bSLVER\b", "YELLOW/ROX"),
	(r"\bDIAMOND\b|\bDAIMOND\b|\bDIAMAND\b", "SINGLE WHITE"),
]
NEW_LABEL = r"DOUBLE BLUE|\bBLUE\b|ORANGE/VERDO|YELLOW/ROX|SINGLE WHITE"
UNDECIDED = r"\bMEDIUM\b|\bEXCELLENT\b|\bRUBCO\b|(?<!POLY)\bGOLD\b|\bMSP\b"
FG_GROUP = re.compile(r"^(FG|HOT$|Seconds$)", re.I)
# Manna Treads' own finished-good groups: what it buys from Pretreads and sells.
MANNA_FG_GROUP = re.compile(r"^(PRECURED|HOT|Tread Gum|VULCANISING SOLUTION)$", re.I)


def relabel(name):
	out = name
	for pat, label in RULES:
		out = re.sub(pat, label, out, flags=re.I)
	return out if out != name else None


def norm(v):
	return re.sub(r"[^A-Z0-9]", "", str(v or "").upper().replace("PRECURD", "PRECURED"))


def tokens(v):
	"""The same product however its old name was typed: label, sizes and pattern, no filler words."""
	s = str(v or "").upper().replace("PRECURD", "PRECURED")
	s = relabel(s) or s
	s = re.sub(r"[\"'*()\-]", " ", s)
	words = [w for w in re.findall(r"[A-Z0-9/]+", s) if w not in ("TREAD", "RUBBER", "PRECURED", "PCTR")]
	return tuple(sorted(words))


def load(db):
	with open(os.path.join(OUT, f"{db}-naming-status.json"), encoding="utf-8") as f:
		d = json.load(f)
	groups = {g["Number"]: g["GroupName"] for g in d["groups"]}
	for i in d["items"]:
		i["name"] = i["name"] or ""
		i["groupName"] = groups.get(i["group"], "")
	return d


with open(os.path.join(OUT, "fg-mapping.json"), encoding="utf-8") as f:
	mapping = json.load(f)
new_codes = {m["new"] for m in mapping}
mapped_old = {m["old"] for m in mapping if m["old"]}
by_tokens = defaultdict(set)
for m in mapping:
	by_tokens[tokens(m["old_name"])].add((m["new"], m["desc"]))

# Management's full lists carry a new description for most old names but no new code yet.
wb_src = openpyxl.load_workbook(SHEET, data_only=True, read_only=True)
proposed = {}
listed = {}
for title in ("PCTR SAP", "HOT SAP", "SAP DATA"):
	ws = wb_src[title]
	rows = ws.iter_rows(values_only=True)
	head = [str(h).strip() if h else "" for h in next(rows)]
	at = {h: i for i, h in enumerate(head)}
	for r in rows:
		name, desc = r[at["ITEMS"]], r[at["ITEM DESCRIPTON"]]
		if name:
			listed.setdefault(norm(name), title)
		if name and desc and norm(name) not in proposed:
			proposed[norm(name)] = (" ".join(str(desc).split()), title)

HEAD_FILL = PatternFill("solid", fgColor="1F4E78")
DECIDE_FILL = PatternFill("solid", fgColor="FFF2CC")
DECIDE_HEAD = PatternFill("solid", fgColor="BF8F00")
WHITE = Font(color="FFFFFF", bold=True)


def write_sheet(wb, title, columns, rows, decide=()):
	ws = wb.create_sheet(title)
	heads = [c for c, _ in columns] + list(decide)
	ws.append(heads)
	for r in rows:
		ws.append([get(r) for _, get in columns] + [None] * len(decide))
	for n, h in enumerate(heads, start=1):
		c = ws.cell(row=1, column=n)
		c.font = WHITE
		c.fill = DECIDE_HEAD if h in decide else HEAD_FILL
		c.alignment = Alignment(wrap_text=True, vertical="top")
		width = max([len(str(h))] + [len(str(ws.cell(row=k, column=n).value or "")) for k in range(2, min(ws.max_row, 400) + 1)])
		ws.column_dimensions[get_column_letter(n)].width = min(max(width + 2, 10), 60)
		if h in decide:
			ws.column_dimensions[get_column_letter(n)].width = 22
			for k in range(2, ws.max_row + 1):
				ws.cell(row=k, column=n).fill = DECIDE_FILL
	ws.freeze_panes = "C2"
	ws.auto_filter.ref = ws.dimensions
	return ws


def summary(wb, lines):
	ws = wb.active
	ws.title = "Summary"
	for ln in lines:
		ws.append(ln if isinstance(ln, list) else [ln])
	ws["A1"].font = Font(bold=True, size=14)
	ws.column_dimensions["A"].width = 70
	ws.column_dimensions["B"].width = 14
	ws.column_dimensions["C"].width = 14
	ws.column_dimensions["D"].width = 18
	return ws


def r2(v):
	return round(v or 0, 3)


# ---------- finished goods ----------

STATUSES = ("Same product as an item that has a new code", "In management's list: description given, no code",
	"In management's list: no description, no code", "Not in management's list")


def fg_rows(db, items, is_fg, already):
	rows = []
	for i in items:
		if not is_fg(i) or i["code"] in new_codes or i["code"] in already:
			continue
		prop = proposed.get(norm(i["name"]))
		same = sorted(by_tokens.get(tokens(i["name"]), ()))
		if same:
			status = "Same product as an item that has a new code"
		elif prop:
			status = "In management's list: description given, no code"
		elif norm(i["name"]) in listed:
			status = "In management's list: no description, no code"
		else:
			status = "Not in management's list"
		i.update(
			status=status,
			propDesc=prop[0] if prop else None,
			propFrom=prop[1] if prop else listed.get(norm(i["name"])),
			sugCode=", ".join(c for c, _ in same) or None,
			sugDesc=" | ".join(d for _, d in same) or None,
			live=i["onHand"] > 0 or i["committed"] > 0,
		)
		rows.append(i)
	order = {s: n for n, s in enumerate(STATUSES)}
	rows.sort(key=lambda i: (not i["live"], order[i["status"]], -i["onHand"], i["code"]))
	return rows


FG_COLS = [
	("Old code", lambda i: i["code"]),
	("Old name", lambda i: i["name"]),
	("Item group", lambda i: i["groupName"]),
	("Product type", lambda i: i.get("type")),
	("Active", lambda i: "Y" if i["active"] else "N"),
	("On hand (kg)", lambda i: r2(i["onHand"])),
	("On open sales orders", lambda i: r2(i["committed"])),
	("Stock value (Rs)", lambda i: round(i["value"] or 0)),
	("Has own BOM", lambda i: "Y" if i["hasBom"] else ""),
	("Status", lambda i: i["status"]),
	("Management's new description (SAP sheets)", lambda i: i["propDesc"]),
	("From sheet", lambda i: i["propFrom"]),
	("Suggested new code (same product)", lambda i: i["sugCode"]),
	("Suggested code's description", lambda i: i["sugDesc"]),
]
FG_DECIDE = ("New code", "New description", "Action (Create / Use suggested / Retire / Ignore)", "Notes")

pt = load("TEST_HITECH_PRETREADS")
mn = load("TEST_MANNA_TREADS")
with open(os.path.join(OUT, "TEST_MANNA_TREADS-old-by-name.json"), encoding="utf-8") as f:
	manna_pairs = {p["old"] for p in json.load(f)}

pt_fg = fg_rows("TEST_HITECH_PRETREADS", pt["items"], lambda i: FG_GROUP.match(i["groupName"]), mapped_old)
mn_fg = fg_rows("TEST_MANNA_TREADS", mn["items"], lambda i: MANNA_FG_GROUP.match(i["groupName"]), manna_pairs)
missing_pt = sorted(new_codes - {i["code"] for i in pt["items"]})
missing_mn = sorted(new_codes - {i["code"] for i in mn["items"]})


def counts(rows):
	c = Counter(i["status"] for i in rows)
	live = [i for i in rows if i["live"]]
	return c, live


wb = openpyxl.Workbook()
lines = [
	"Finished goods with no new item code",
	f"Snapshot of the TEST companies: {pt['at'][:16].replace('T', ' ')} UTC. Old items are untouched; nothing here has been written to SAP.",
	"",
	["New codes from management's brochure sheets", len(new_codes)],
	["  of which not yet created in TEST_HITECH_PRETREADS", len(missing_pt)],
	["  of which not yet created in TEST_MANNA_TREADS", len(missing_mn)],
	"",
	["Old finished goods still with no new code", "Items", "With stock or open orders", "Stock (kg)"],
]
for label, rows in (("Hi-Tech Pretreads", pt_fg), ("Manna Treads", mn_fg)):
	c, live = counts(rows)
	lines.append([label, len(rows), len(live), round(sum(i["onHand"] for i in rows), 1)])
	for st in STATUSES:
		sub = [i for i in rows if i["status"] == st]
		lines.append([f"  {st}", len(sub), sum(1 for i in sub if i["live"]), round(sum(i["onHand"] for i in sub), 1)])
lines += [
	"",
	"How to use",
	"Rows with stock or open sales orders are at the top: those block the stock move and must get a code (or be retired) first.",
	"'Same product as an item that has a new code': the name matches a brochure row under a different old code (a duplicate). Usually 'Use suggested'.",
	"'In management's list': management's SAP sheets already give the new description; only the code is missing.",
	"'No description': the old name is on management's SAP sheets but its new description is blank.",
	"'Not in management's list': management has not covered it yet (non-tread items in FG group, odd sizes, Seconds, etc.).",
	"Fill the yellow columns. Codes are management's to give; the suggestions are only a starting point.",
	"Manna Treads: its finished goods are the PRECURED, HOT, Tread Gum and VULCANISING SOLUTION groups, matched to new codes by name.",
]
summary(wb, lines)
write_sheet(wb, "Hi-Tech Pretreads", FG_COLS, pt_fg, FG_DECIDE)
write_sheet(wb, "Manna Treads", FG_COLS, mn_fg, FG_DECIDE)
fg_file = os.path.join(OUT, "FG-codes-not-created.xlsx")
wb.save(fg_file)

# ---------- semi-finished ----------

def is_semi(i):
	return not FG_GROUP.match(i["groupName"]) and (
		re.match(r"^(CURED|EXTRUDED|SANDERED)$", i.get("type") or "", re.I)
		or re.search(r"\b(CURED|EXTRUDED|SANDERED)\b", i["name"], re.I))


semi = [i for i in pt["items"] if is_semi(i)]
buckets = defaultdict(list)
for i in semi:
	n = i["name"]
	if relabel(n):
		i["proposed"] = relabel(n)
		buckets["old"].append(i)
	elif re.search(UNDECIDED, n, re.I):
		i["label"] = ", ".join(sorted({m.upper() for m in re.findall(UNDECIDED, n, re.I)}))
		buckets["undecided"].append(i)
	elif re.search(NEW_LABEL, n, re.I):
		buckets["done"].append(i)
	else:
		buckets["none"].append(i)
# Same name after spacing is squeezed: why the 235 B582 pairs were held back.
names = defaultdict(list)
for i in pt["items"]:
	names[norm(i["name"])].append(i["code"])
for i in buckets["old"]:
	twin = [c for c in names.get(norm(i["proposed"]), []) if c != i["code"]]
	twin += [o["code"] for o in buckets["old"] if o is not i and norm(o["proposed"]) == norm(i["proposed"])]
	i["clash"] = ", ".join(sorted(set(twin))) or None
for k in ("old", "undecided", "none"):
	buckets[k].sort(key=lambda i: (i.get("label") or "", -i["onHand"], i["name"]))

SEMI_COLS = [
	("Item code", lambda i: i["code"]),
	("Current name", lambda i: i["name"]),
	("Stage (U_ProductType)", lambda i: i.get("type")),
	("Item group", lambda i: i["groupName"]),
	("U_Quality", lambda i: i.get("quality")),
	("Active", lambda i: "Y" if i["active"] else "N"),
	("On hand (kg)", lambda i: r2(i["onHand"])),
	("Has own BOM", lambda i: "Y" if i["hasBom"] else ""),
	("Used in BOMs", lambda i: i["usedIn"] or ""),
]
SEMI_DECIDE = ("New name", "New quality (U_Quality)", "Import Y/N", "Notes")

wb = openpyxl.Workbook()
summary(wb, [
	"Semi-finished names not on the new labels (TEST_HITECH_PRETREADS)",
	f"Snapshot: {pt['at'][:16].replace('T', ' ')} UTC. Semi-finished = EXTRUDED, CURED and SANDERED items outside the finished-goods groups.",
	"",
	["Semi-finished items", len(semi)],
	["  Renamed to the new labels (done)", len(buckets["done"])],
	["  Still an old label (held back)", len(buckets["old"])],
	["  Label not decided yet (MEDIUM, MSP, RUBCO, EXCELLENT, GOLD)", len(buckets["undecided"])],
	["  No quality word in the name", len(buckets["none"])],
	"",
	["Undecided labels", "Items", "With stock"],
	*[[f"  {lab}", n, sum(1 for i in buckets["undecided"] if i["label"] == lab and i["onHand"] > 0)]
		for lab, n in Counter(i["label"] for i in buckets["undecided"]).most_common()],
	"",
	"How to use",
	"Fill the yellow columns, one row per item. Import Y = apply it. A new name must not be one another item already has.",
	"The finished workbook goes through the same route as yesterday's: dtw_semi.py → Items_semi_rename.txt → apply_semi.mjs (or DTW), then semirename.mjs --bom-names.",
	"Manna Treads makes nothing, so it holds no semi-finished items: nothing to rename there.",
	"Live: none of yesterday's 2,161 renames is on HITECH_PRETREADS_LIVE yet. The same workbook is replayed there at cut-over.",
])
write_sheet(wb, "Old label (held back)", SEMI_COLS + [
	("Rule would make it", lambda i: i["proposed"]),
	("Same name as", lambda i: i["clash"]),
], buckets["old"], SEMI_DECIDE)
write_sheet(wb, "Label undecided", SEMI_COLS[:2] + [("Label", lambda i: i["label"])] + SEMI_COLS[2:], buckets["undecided"], SEMI_DECIDE)
write_sheet(wb, "No quality word", SEMI_COLS, buckets["none"], SEMI_DECIDE)
semi_file = os.path.join(OUT, "SFG-names-not-updated.xlsx")
wb.save(semi_file)

print(f"FG: Pretreads {len(pt_fg)} ({sum(i['live'] for i in pt_fg)} live), Manna {len(mn_fg)} ({sum(i['live'] for i in mn_fg)} live); "
	f"new codes missing: Pretreads {len(missing_pt)}, Manna {len(missing_mn)} -> {fg_file}")
for label, rows in (("Pretreads", pt_fg), ("Manna", mn_fg)):
	print(f"  {label}:", dict(Counter(i["status"] for i in rows)), "live:", dict(Counter(i["status"] for i in rows if i["live"])))
print(f"SFG: {len(semi)} semi-finished; done {len(buckets['done'])}, old {len(buckets['old'])}, undecided {len(buckets['undecided'])}, none {len(buckets['none'])} -> {semi_file}")
