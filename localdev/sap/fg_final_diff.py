# Management's final item list against the mapping everything so far was built from.
#
#     python -I localdev/sap/fg_final_diff.py "%USERPROFILE%\Downloads\ITEM CATEGORY FINAL.xlsx"
#
# Reads the final sheet the way fg_mapping.py read the first one (same sheets, same columns), without
# touching out/fg-mapping.json, and compares: new codes added, dropped or described differently;
# old codes mapped, unmapped or moved to another new code; the attributes fgitems.mjs copied (quality,
# pattern, belts, roll weight); and the stock lists the final sheet now carries (PCTR SAP as on
# 5 Nov, HOT SAP as on 25 Oct) against which old codes have a new code. Writes
# out/fg-mapping-final.json and out/FINAL-vs-mapping.xlsx.

import json
import os
import re
import sys
from collections import defaultdict

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import OUT, PRE_SRC, load

SHEETS = ("PCTR BROCHURE", "HOT BROCHURE", "BONDING GUM", "SOLUTION")
COLS = {"old": "C. ITEM CODE", "old_name": "ITEMS", "new": "N. ITEMCODE", "product_type": "PRODUCT TYPE",
	"brand": "BRAND", "quality": "QUALITY/PROPERTY", "pattern": "PATTERN", "category": "CATEGORY",
	"belts_per_roll": "BELTS/ROLL", "std_weight": "STD WEIGHT OF BELT", "weight_per_roll": "WEIGHT PER ROLL"}
ATTRS = ("desc", "product_type", "brand", "quality", "pattern", "belts_per_roll", "std_weight", "weight_per_roll")
clean = lambda v: (" ".join(v.split()) or None) if isinstance(v, str) else v

wb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
final = []
for sheet in SHEETS:
	rows = wb[sheet].iter_rows(values_only=True)
	head = [str(h).strip() if h else "" for h in next(rows)]
	at = {k: head.index(v) for k, v in COLS.items() if v in head}
	at["desc"] = next(i for i, h in enumerate(head) if h.endswith("DESCRIPTON"))
	for n, r in enumerate(rows, start=2):
		row = {k: clean(r[i]) if i < len(r) else None for k, i in at.items()}
		if not row.get("new"):
			continue
		row["new"] = str(row["new"]).strip()
		row["old"] = str(row["old"]).strip() if row.get("old") else None
		row.update(sheet=sheet, row=n)
		final.append(row)
# The stock lists the final sheet carries: old codes management counted, with their quantity.
stock_lists = []
for sheet in ("PCTR SAP", "HOT SAP"):
	rows = list(wb[sheet].iter_rows(values_only=True))
	hi = next(i for i, r in enumerate(rows) if r and "C. ITEM CODE" in [str(c).strip() if c else "" for c in r])
	head = [str(c).strip() if c else "" for c in rows[hi]]
	title = next((str(c) for c in rows[0] if c), sheet)
	for r in rows[hi + 1:]:
		code = r[head.index("C. ITEM CODE")]
		if code:
			stock_lists.append({"sheet": sheet, "title": title, "old": str(code).strip(), "name": clean(r[head.index("ITEMS")]), "qty": r[head.index("QTY")]})
with open(os.path.join(OUT, "fg-mapping-final.json"), "w", encoding="utf-8") as f:
	json.dump(final, f, indent=1, default=str)
# The items the file keeps under their old code (PCTR SAP, HOT SAP): never deactivated (7 Nov).
with open(os.path.join(OUT, "fg-mapping-final-keep.json"), "w", encoding="utf-8") as f:
	json.dump(stock_lists, f, indent=1, default=str)

cur = load("fg-mapping.json")
live_items = {i["code"]: i for i in load(f"{PRE_SRC}-items.json")}
verify = load(f"{PRE_SRC}-verify.json")
onhand = defaultdict(float)
for w in verify["whs"]:
	onhand[w["ItemCode"]] += w["OnHand"]
test_items = {i["ItemCode"]: i for i in load("TEST_HITECH_PRETREADS-fg-full.json")}
cur_desc = {r["new"]: r["desc"] for r in cur}
fin_desc = {r["new"]: r["desc"] for r in final}
ours = defaultdict(set)
for r in cur:
	if r["old"]:
		ours[r["old"]].add(r["new"])

# The final sheet's "C. ITEM CODE" column is out of step with its ITEMS column in most PCTR rows (the
# row for I-12303 names "SILVER 172 SR 120", which is I-12302 in SAP), while ITEMS and the new
# description agree with each other. So an old item is found by its name, as fgitems.mjs --by-name does.
norm = lambda v: re.sub(r"[^A-Z0-9]", "", str(v or "").upper().replace("PRECURD", "PRECURED"))
by_name = defaultdict(list)
for c, i in live_items.items():
	by_name[norm(i["name"])].append(c)
kg = lambda c: round(onhand.get(c, 0), 3)
same, diff, newmap, several, unfound, wrongcol = [], [], [], [], [], []
final_old = {}
for r in final:
	if not r["old_name"]:
		continue
	# Bonding gum and solution rows share one generic old name (BONDING GUM on twelve rows), and there
	# the code column agrees with the row: those are taken by code.
	generic = r["sheet"] in ("BONDING GUM", "SOLUTION")
	if generic and not r["old"]:
		continue
	codes = [r["old"]] if generic else by_name.get(norm(r["old_name"]), [])
	if not codes:
		unfound.append(r)
		continue
	if len(codes) > 1:
		several.append((r["new"], r["desc"], r["old_name"], ", ".join(f"{c} ({kg(c):g} kg, ours: {', '.join(sorted(ours.get(c, []))) or '-'})" for c in codes), r["old"] or ""))
		for c in codes:
			final_old.setdefault(c, set()).add(r["new"])
		continue
	o = codes[0]
	final_old.setdefault(o, set()).add(r["new"])
	if r["old"] and r["old"] != o:
		wrongcol.append((r["sheet"], r["row"], r["old"], (live_items.get(r["old"]) or {}).get("name"), r["old_name"], o))
	mine = ours.get(o, set())
	if mine == {r["new"]}:
		same.append(o)
	elif not mine:
		newmap.append((o, r["old_name"], kg(o), r["new"], r["desc"]))
	else:
		m = sorted(mine)
		kind = "same product, new code renumbered" if any((cur_desc.get(x) or "").upper() == (r["desc"] or "").upper() for x in m) else \
			"description differs too"
		diff.append((o, r["old_name"], kg(o), ", ".join(m), " | ".join(cur_desc.get(x) or "" for x in m), r["new"], r["desc"], kind))
# Old codes we map that the final sheet, read by name, does not.
gone = [(o, (live_items.get(o) or {}).get("name"), kg(o), ", ".join(sorted(ns)), " | ".join(cur_desc.get(x) or "" for x in sorted(ns)))
	for o, ns in sorted(ours.items()) if o not in final_old]
added = sorted(set(fin_desc) - set(cur_desc))
dropped = sorted(set(cur_desc) - set(fin_desc))
renamed = [(c, cur_desc[c], fin_desc[c]) for c in sorted(set(cur_desc) & set(fin_desc)) if (cur_desc[c] or "") != (fin_desc[c] or "")]
stock_rows = []
for s in stock_lists:
	o = s["old"]
	stock_rows.append((s["title"], o, s["name"], s["qty"], kg(o), ", ".join(sorted(final_old.get(o, ()))) or "(no new code)",
		", ".join(sorted(ours.get(o, ()))) or "(none)"))

def sheet(wb, title, heads, body, wide=()):
	ws = wb.create_sheet(title)
	ws.append(heads)
	for line in body:
		ws.append(list(line))
	for i, h in enumerate(heads, start=1):
		x = ws.cell(row=1, column=i)
		x.font = Font(color="FFFFFF", bold=True)
		x.fill = PatternFill("solid", fgColor="1F4E78")
		x.alignment = Alignment(wrap_text=True, vertical="top")
		ws.column_dimensions[get_column_letter(i)].width = 46 if h in wide else 16
	ws.freeze_panes = "B2"
	ws.auto_filter.ref = ws.dimensions


out = openpyxl.Workbook()
summary = out.active
summary.title = "Summary"
lines = [
	["Final sheet rows with a new code", len(final)],
	["  rows whose old item is found in SAP by its name (one code)", len(same) + len(diff) + len(newmap)],
	["    same new code as our mapping", len(same)],
	["    a different new code from ours", len(diff)],
	["      of which the same description under a new code (renumbered)", sum(1 for d in diff if d[7].startswith("same"))],
	["    old items we had no mapping for", len(newmap)],
	["  rows whose old name is on several SAP codes (duplicates)", len(several)],
	["  rows whose old name is not in SAP", len(unfound)],
	["Rows whose C. ITEM CODE is not the item their ITEMS names", len(wrongcol)],
	["Old codes in our mapping that the final sheet no longer maps", len(gone)],
	["New codes only in the final sheet", len(added)], ["New codes only in our mapping", len(dropped)],
	["New codes kept, description changed", len(renamed)],
	["Stock-list rows (PCTR SAP 5 Nov, HOT SAP 25 Oct)", len(stock_rows)],
	["  with a new code in the final sheet (by name)", sum(1 for r in stock_rows if r[5] != "(no new code)")],
]
for l in lines:
	summary.append(l)
summary.column_dimensions["A"].width = 70
sheet(out, "Different code", ["Old code (by name)", "Old name", "Stock kg", "Our new code", "Our description", "Final new code", "Final description", "Kind"],
	diff, {"Old name", "Our description", "Final description", "Kind"})
sheet(out, "Newly mapped", ["Old code (by name)", "Old name", "Stock kg", "Final new code", "Final description"], newmap, {"Old name", "Final description"})
sheet(out, "No longer mapped", ["Old code", "Name in SAP", "Stock kg", "Our new code", "Our description"], gone, {"Name in SAP", "Our description"})
sheet(out, "Several SAP codes", ["Final new code", "Final description", "Old name", "SAP codes with that name", "Sheet's code"], several,
	{"Final description", "Old name", "SAP codes with that name"})
sheet(out, "Code column wrong", ["Sheet", "Row", "C. ITEM CODE in sheet", "That code's name in SAP", "ITEMS in the same row", "Code ITEMS really is"], wrongcol,
	{"That code's name in SAP", "ITEMS in the same row"})
sheet(out, "New codes added", ["New code", "Description"], [(c, fin_desc[c]) for c in added], {"Description"})
sheet(out, "New codes dropped", ["New code", "Description", "Created in TEST"], [(c, cur_desc[c], "Y" if c in test_items else "") for c in dropped], {"Description"})
sheet(out, "Description changed", ["New code", "Ours", "Final"], renamed, {"Ours", "Final"})
sheet(out, "Stock lists", ["List", "Old code", "Name in list", "Qty in list", "Stock in live copy", "Final new code (by name)", "Our new code"],
	stock_rows, {"Name in list", "List"})
out.save(os.path.join(OUT, "FINAL-vs-mapping.xlsx"))
for l in lines:
	print(f"{l[0]}: {l[1]}")
