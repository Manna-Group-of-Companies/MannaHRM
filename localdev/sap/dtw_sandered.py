# The 612 sandered items made in TEST, as DTW create files for the live company.
#
#     python -I localdev/sap/dtw_sandered.py                                  against the 2 Nov backup
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/dtw_sandered.py  against a later one
#
# Each sandered item is its cured twin as it stands in live (sandered.mjs), with the name,
# U_ProductType (SANDERED) and U_Quality (the final label) its own — and, decided 2 Nov and kept on
# 6 Nov, seven fields from the finished good it is packed into, as stageboms.mjs set them in TEST:
# issue method, sales, packaging and purchase unit, HSN, GST relevance and category. Those seven are
# read from TEST, not the twin. Live's inactive warehouses are left out: SAP refuses them on a new item.
#
# Reads:
#   out/<source>-cured-full.json                   the cured twins as live holds them (export_backup.ps1)
#   out/TEST_HITECH_PRETREADS-sandered.json        cured → sandered code, from sandered.mjs
#   out/TEST_HITECH_PRETREADS-sandered-full.json   the sandered name, quality and finished-good fields in TEST
#   out/TEST_HITECH_PRETREADS-naming-status.json   the cured twins' final names in TEST
# Writes:
#   DTW_SANDERED_1_items.txt        Items, add: ItemCode given and Series 104, in TEST's order
#   DTW_SANDERED_2_warehouses.txt   ItemWarehouseInfo, ParentKey = the item's code
#   DTW_SANDERED_review.xlsx        every item, its twin, its expected code, and the check query
#
# Codes: live's series 104 stood at I-14649 on 2 Nov and still did on 6 Nov, and TEST gave these items
# I-14649…I-15260 with no gap. This DTW keys a record by its code and links warehouse rows to it, so the
# code is given; with Series 104 beside it, SAP either takes it or draws the same number from the series.
# Refused, nothing written, when a twin is missing, a name is unusable, or a DB value has no enum here.

import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, ITEM_FIELDS, OUT as OUT_DIR, PRE_SRC, U_FIELDS, cell, dtw, load, sandered_pairs

SERIES, FIRST = 104, 14649

twins = {o["ItemCode"]: o for o in load(f"{PRE_SRC}-cured-full.json")}
pairs = sandered_pairs()
sandered = {s["ItemCode"]: s for s in load("TEST_HITECH_PRETREADS-sandered-full.json")}
# A sandered item added on the final list (EXTRA_PRE-sandered.json) is not in TEST: it is made here the
# way sandered.mjs and stageboms.mjs made the 612 — its cured twin, its own name and label, and the seven
# finished-good fields from the finished good it is packed into (manual issue kept on a batch item).
if FG == "FINAL":
	full = {i["ItemCode"]: i for i in load(f"{PRE_SRC}-items-full.json")}
	fg = {i["ItemCode"]: i for i in load("FINAL_PRE-fg-full.json")}
	for p in pairs:
		if p["sandered"] in sandered:
			continue
		twins.setdefault(p["cured"], full[p["cured"]])
		f = fg[p["for"]]
		batch = full[p["cured"]]["ManBtchNum"] == "Y"
		sandered[p["sandered"]] = {"ItemName": p["name"], "U_Quality": p["quality"], "SalesPackagingUnit": None,
			**{k: f.get(k) for k in ("SalesUnit", "PurchaseUnit", "GSTRelevnt", "GSTTaxCategory", "ChapterID")},
			"IssueMethod": "im_Manual" if batch and f.get("IssueMethod") == "im_Backflush" else f.get("IssueMethod"), "extra": True}
# SAP refuses an inactive warehouse on a new item (04 PRODUCTION, 05 CALANDERING, ENG in live on 2 Nov).
active_whs = set(load(f"{PRE_SRC}-warehouses-active.json"))
final_name = {i["code"]: i["name"] for i in load("TEST_HITECH_PRETREADS-naming-status.json")["items"]}

FIELDS = ITEM_FIELDS + U_FIELDS
# Set on the sandered item from its finished good by stageboms.mjs (2 Nov), so read from TEST, already
# in DI form. SalesPackagingUnit is not on the twin's list at all, so it is a column of its own.
FROM_FG = ["IssueMethod", "SalesUnit", "SalesPackagingUnit", "PurchaseUnit", "GSTRelevnt", "GSTTaxCategory", "ChapterID"]

problems, rows = [], []
for p in sorted(pairs, key=lambda p: int(p["sandered"][2:])):
	twin, s = twins.get(p["cured"]), sandered.get(p["sandered"])
	if not twin or not s:
		problems.append(f"{p['sandered']}: twin {p['cured']} or the TEST item missing")
		continue
	name = s["ItemName"]
	expect = re.sub(r"\bCURED\b(?!.*\bCURED\b)", "SANDERED", final_name.get(p["cured"], ""), flags=re.I)
	# sandered.mjs keeps the twin's case ("Cured" → "Sandered"), and a twin still waiting in
	# Twins-to-verify.xlsx keeps its double spaces while its sandered item already has one.
	squeeze = lambda t: re.sub(r"\s+", " ", t).strip().upper()
	if squeeze(name) != squeeze(expect) and not s.get("extra"):
		problems.append(f"{p['sandered']}: TEST name {name!r} is not its twin's final name with SANDERED ({expect!r})")
	if not name or len(name) > 100 or re.search(r"[\t\r\n]", name):
		problems.append(f"{p['sandered']}: name unusable {name!r}")
	vals = {}
	for f, col, enum in FIELDS:
		try:
			vals[f] = cell(twin[col], enum)
		except KeyError as e:
			problems.append(f"{p['cured']}: {col} = {e} has no DI value here")
	for f in FROM_FG:
		vals[f] = cell(s.get(f), None)
	rows.append({"expect": p["sandered"], "twin": p["cured"], "twinName": final_name.get(p["cured"], ""), "name": name,
		"quality": s.get("U_Quality") or "", "vals": vals, "wh": [w for w in twin["Warehouses"] if w in active_whs]})
if [int(r["expect"][2:]) for r in rows] != list(range(FIRST, FIRST + len(rows))):
	problems.append(f"the sandered codes are not I-{FIRST}…I-{FIRST + len(rows) - 1} without a gap")
if problems:
	raise SystemExit("Nothing written:\n  " + "\n  ".join(problems[:40]))

heads = ["ItemCode", "ItemName", "Series", "U_ProductType", "U_Quality"] + [f for f, _, _ in FIELDS] + ["SalesPackagingUnit"]
dtw("DTW_SANDERED_1_items.txt", "items_pre", heads,
	[[r["expect"], r["name"], SERIES, "SANDERED", r["quality"]] + [r["vals"][f] for f, _, _ in FIELDS] + [r["vals"]["SalesPackagingUnit"]] for r in rows])
dtw("DTW_SANDERED_2_warehouses.txt", "whs_pre", ["ParentKey", "LineNum", "WarehouseCode"],
	[[r["expect"], n, w] for r in rows for n, w in enumerate(r["wh"])])

# Run in live's Query Manager after the import: a row for every sandered item that is not its twin in
# the fields that are the twin's. The seven finished-good fields differ on purpose and are not compared.
CHECK = """SELECT S.ItemCode, S.ItemName, C.ItemCode AS Twin, C.ItemName AS TwinName
FROM OITM S
JOIN OITM C ON C.ItemName = REPLACE(S.ItemName, ' SANDERED', ' CURED') AND C.ItemCode <> S.ItemCode
WHERE S.U_ProductType = 'SANDERED' AND S.CreateDate >= '20261106' AND (
  S.ItmsGrpCod <> C.ItmsGrpCod OR S.ManBtchNum <> C.ManBtchNum OR S.EvalSystem <> C.EvalSystem
  OR S.MngMethod <> C.MngMethod OR S.GLMethod <> C.GLMethod
  OR S.PlaningSys <> C.PlaningSys OR S.PrcrmntMtd <> C.PrcrmntMtd OR S.MatType <> C.MatType
  OR ISNULL(S.InvntryUom,'') <> ISNULL(C.InvntryUom,'') OR S.EvalSystem <> C.EvalSystem
  OR (SELECT COUNT(*) FROM OITW W JOIN OWHS H ON H.WhsCode = W.WhsCode WHERE W.ItemCode = S.ItemCode AND H.Inactive = 'N')
  <> (SELECT COUNT(*) FROM OITW W JOIN OWHS H ON H.WhsCode = W.WhsCode WHERE W.ItemCode = C.ItemCode AND H.Inactive = 'N'))"""

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Sandered items"
cols = ["Row", "Expected code", "Sandered name", "Quality", "Cured twin", "Twin's final name", "Group", "Batch", "Issue", "Valuation", "Warehouses"]
ws.append(cols)
for k, r in enumerate(rows, start=1):
	v = r["vals"]
	ws.append([k, r["expect"], r["name"], r["quality"], r["twin"], r["twinName"], v["ItemsGroupCode"], v["ManageBatchNumbers"], v["IssueMethod"],
		v["CostAccountingMethod"], ", ".join(r["wh"])])
for c, h in enumerate(cols, start=1):
	x = ws.cell(row=1, column=c)
	x.font = Font(color="FFFFFF", bold=True)
	x.fill = PatternFill("solid", fgColor="1F4E78")
	x.alignment = Alignment(wrap_text=True, vertical="top")
	ws.column_dimensions[get_column_letter(c)].width = 40 if "name" in h else 14
ws.freeze_panes = "C2"
ws.auto_filter.ref = ws.dimensions

info = wb.create_sheet("How to import")
for line in [
	["Items", len(rows)],
	["Warehouse rows", sum(len(r["wh"]) for r in rows)],
	[],
	["Before", "Document Numbering → Item Master Data, series Items (I-): Next No. must be 14649 (it was on 6 Nov). If not, stop and tell Claude."],
	["Before", "Run DTW_SFG_1_rename.txt first: the sandered names follow the cured twins' new names."],
	["Import", "DTW → Items, Add new objects: DTW_SANDERED_1_items.txt as Items, DTW_SANDERED_2_warehouses.txt as ItemWarehouseInfo."],
	["Import", "Try the first 3 items first (both files cut to them), check them, then the rest. Keep the row order: if SAP draws the code from the series, the order decides it."],
	["After", "The codes must be I-14649 … I-15260, matching 'Expected code'. The BOM files name these codes."],
	["After", "Run the query on the 'Check query' sheet in Query Manager. It lists every sandered item that differs from its cured twin outside the seven finished-good fields; it should return nothing."],
	[],
	["Source", f"each item = its cured twin in {PRE_SRC} (live as restored on this PC), with the final name and quality from TEST"],
	["From the FG", "issue method, sales / packaging / purchase unit, HSN, GST relevance and category: from the finished good, as stageboms.mjs set them in TEST on 2 Nov (batch-managed items keep Manual issue)"],
	["Warehouses", "the twin's, less the ones inactive in live (04 PRODUCTION, 05 CALANDERING, ENG): SAP will not add an item to those"],
	["Blank cells", "left for SAP's default: an empty unit, and HSN or UoM group 'none' (-1)"],
]:
	info.append(line)
info.column_dimensions["A"].width = 16
info.column_dimensions["B"].width = 150
q = wb.create_sheet("Check query")
for line in CHECK.split("\n"):
	q.append([line])
q.column_dimensions["A"].width = 130
wb.save(os.path.join(OUT_DIR, "DTW_SANDERED_review.xlsx"))
print(f"{len(rows)} sandered items, {sum(len(r['wh']) for r in rows)} warehouse rows -> DTW_SANDERED_1_items.txt, DTW_SANDERED_2_warehouses.txt, DTW_SANDERED_review.xlsx")
