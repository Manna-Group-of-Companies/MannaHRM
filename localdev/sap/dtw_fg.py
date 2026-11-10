# The finished-good changes made in TEST, as DTW files for both live companies.
#
#     python -I localdev/sap/dtw_fg.py                                  Pretreads against the 2 Nov backup
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/dtw_fg.py  Pretreads against a later one
#
# For each company (PRE = Hi-Tech Pretreads, MT = Manna Treads — Manna only ever from 2 Nov's backup):
#   DTW_FG_<co>_1_items.txt        Items, add: management's 592 new codes, manual series
#   DTW_FG_<co>_2_warehouses.txt   ItemWarehouseInfo, ParentKey = the new item's code
#   DTW_FG_<co>_3_prices.txt       Items_Prices, ParentKey = the new item's code
#   DTW_FG_<co>_4_rename_old.txt   Items, update: the old finished goods' names (single spaces, … OLD)
#   DTW_FG_<co>_5_retire_old.txt   Items, update: Valid N, Frozen Y on the old duplicates retired in TEST
# and DTW_FG_review.xlsx for both.
#
# A new item is its template — the old item fgitems.mjs copied it from — as that template stands in the
# live backup, as the sandered items are their cured twins (decided 6 Nov). From TEST it takes only
# what fgitems.mjs set from management's sheet: name, group where the template sat outside finished
# goods (with the valuation, planning and procurement SAP gave it from that group), and on Pretreads
# U_ProductType, U_Quality, U_Design, U_BeltsPerRoll, U_WeightPerRoll.
# A template borrowed for a code with no old item gives its settings and warehouses but not its prices
# or stock levels: another item's price is not this one's (fgitems.mjs's rule).
# Inactive warehouses are left out: SAP will not add a new item to one. An old item's name or active flag
# is written only where TEST changed it and live has not changed it since 2 Nov (dtw_common.three_way).
# The packing BOMs are not here; they go in the BOM files.
# Refused, nothing written, when a template or TEST item is missing, a code already exists in the live
# backup, a name is unusable, or a database value has no DI name.

import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, ITEM_FIELDS, MT_SRC, OUT, PRE_BASE, PRE_SRC, U_FIELDS, cell, dtw, history, load, new_names, three_way

MANUAL_SERIES = 3
COMPANIES = [
	("PRE", "Hi-Tech Pretreads", PRE_SRC, PRE_BASE, "TEST_HITECH_PRETREADS", True),
	("MT", "Manna Treads", MT_SRC, MT_SRC, "TEST_MANNA_TREADS", False),
]
mapping = load("fg-mapping-final.json" if FG == "FINAL" else "fg-mapping.json")
new_codes = {m["new"] for m in mapping}
sheet_name = {m["new"]: m["desc"] for m in mapping}
FG_GROUP = re.compile(r"^(FG|HOT|Seconds|PRECURED|Tread Gum|VULCANISING SOLUTION)$|^FG\b", re.I)
# Set on the new item from management's sheet (fgitems.mjs), so read from TEST, not the template.
FROM_SHEET = ["U_ProductType", "U_Quality", "U_Design", "U_BeltsPerRoll", "U_WeightPerRoll"]
LEVELS = [("MinInventory", "MinLevel"), ("MaxInventory", "MaxLevel")]

problems, results = [], []
# 8 Nov: the old quality goes on the new name in brackets (dtw_common.new_names), in both companies.
NAMES = new_names() if FG == "FINAL" else {}
# Manna's new items are Hi-Tech's (8 Nov): every setting from the Hi-Tech new item of the same code, except
# what is Manna's own - its item group, its old codes (ForeignName), its HSN table entry (ChapterID is a row
# number in each company's own table), and planning/procurement: Manna buys from Hi-Tech, it makes nothing.
pre_vals = {}
MT_OWN = {"ItemsGroupCode", "ForeignName", "ChapterID", "PlanningSystem", "ProcurementMethod", "ComponentWarehouse"}
digits = lambda s: "".join(ch for ch in str(s or "") if ch.isdigit())
hsn_digits = {co: {str(c["AbsEntry"]): digits(c["ChapterID"]) for c in load(f"{db}-chapters.json")} for co, db in (("PRE", PRE_SRC), ("MT", MT_SRC))}
hsn_entry_mt = {}
for e, d in sorted(hsn_digits["MT"].items(), key=lambda x: int(x[0])):
	hsn_entry_mt.setdefault(d, e)
for co, label, orig_db, base_db, test_db, has_udf in COMPANIES:
	if FG == "FINAL":
		templates = {t["ItemCode"]: t for t in load(f"{orig_db}-items-full.json")}
		plan = {p["code"]: p for p in load(f"FINAL_{co}-plan.json")}
		made = {i["ItemCode"]: i for i in load(f"FINAL_{co}-fg-full.json")}
	else:
		templates = {t["ItemCode"]: t for t in load(f"{orig_db}-fg-templates.json")}
		plan = {p["code"]: p for p in load(f"{test_db}-fg-plan-applied.json")}
		made = {i["ItemCode"]: i for i in load(f"{test_db}-fg-full.json")}
	active_whs = set(load(f"{orig_db}-warehouses-active.json"))
	orig = load(f"{orig_db}-items.json")
	base = {o["code"]: o for o in load(f"{base_db}-items.json")}
	in_live = {o["code"] for o in orig}
	status = load(f"{test_db}-naming-status.json")
	groups = {g["Number"]: g["GroupName"] for g in status["groups"]}
	final = {i["code"]: i for i in status["items"]}
	fields = ITEM_FIELDS + ([f for f in U_FIELDS if f[0] not in FROM_SHEET] if has_udf else [])

	new = []
	for code in sorted(new_codes):
		p, it = plan.get(code), made.get(code)
		tpl = templates.get(p["template"]) if p else None
		if not p or not it or not tpl:
			problems.append(f"{co} {code}: plan, TEST item or template {p and p.get('template')} missing")
			continue
		if code in in_live:
			problems.append(f"{co} {code}: already in the live backup")
		name = NAMES.get(code) or it["ItemName"]
		if it["ItemName"] != sheet_name[code] or not name or len(name) > 100 or re.search(r"[\t\r\n]", name):
			problems.append(f"{co} {code}: name {it['ItemName']!r} unusable or not the sheet's")
		borrowed = any(n.startswith("no old code") for n in p["notes"])
		vals = {}
		for f, col, enum in fields:
			try:
				vals[f] = cell(tpl[col], enum)
			except KeyError as e:
				problems.append(f"{co} {tpl['ItemCode']}: {col} = {e} has no DI value here")
		# A template outside finished goods (SFG, Items, DIES) put the new item in another group, and SAP
		# gave it that group's valuation, planning and procurement: those suit a finished good, so TEST's.
		if it["ItemsGroupCode"] != tpl["ItmsGrpCod"]:
			for f, col, enum in ITEM_FIELDS:
				vals[f] = cell(it.get(f), None)
		vals["ItemsGroupCode"] = str(it["ItemsGroupCode"])
		for f, col in LEVELS:
			vals[f] = "" if borrowed else cell(tpl[col] or None, None)
		if has_udf:
			for f in FROM_SHEET:
				vals[f] = cell(it.get(f), None)
		vals["ForeignName"] = it.get("ForeignName") or ""
		if co == "PRE":
			pre_vals[code] = dict(vals)
		elif FG == "FINAL" and code in pre_vals:
			for f in vals:
				if f not in MT_OWN and f in pre_vals[code]:
					vals[f] = pre_vals[code][f]
			# The HSN is Hi-Tech's, found in Manna's own table by its digits (Manna writes 4008 2940 two ways).
			hsn = hsn_digits["PRE"].get(str(pre_vals[code].get("ChapterID")))
			if hsn:
				own = hsn_entry_mt.get(hsn)
				if own is None:
					problems.append(f"MT {code}: HSN {hsn} (Hi-Tech's) not in Manna's HSN table")
				elif str(vals.get("ChapterID")) != own:
					vals["ChapterID"] = own
		whs = [w for w in tpl.get("WhsLevels", tpl["Warehouses"]) if w["w"] in active_whs]
		new.append({"code": code, "name": name, "tpl": tpl["ItemCode"], "tplName": tpl["ItemName"], "borrowed": borrowed,
			"group": groups.get(it["ItemsGroupCode"], it["ItemsGroupCode"]), "vals": vals,
			"whs": [{"w": w["w"], **({} if borrowed else {k: w[k] for k in ("min", "max", "ord")})} for w in whs],
			"prices": [] if borrowed else tpl["Prices"]})

	# The old finished goods: what squeeze_names.mjs changed in TEST, never over what live changed since.
	old, left = [], []
	used = history(orig_db)
	active = lambda i: i["valid"] == "Y" and i["frozen"] != "Y"
	for o in orig:
		n, b = final.get(o["code"]), base.get(o["code"])
		if not n or not b or o["code"] in new_codes:
			continue
		if not FG_GROUP.search(groups.get(n["group"], "")):
			continue
		wn, cn = three_way(b["name"], o["name"], n["name"])
		wa, ca = three_way(active(b), active(o), n["active"])
		if cn or ca:
			left.append({"code": o["code"], "base": b["name"], "live": o["name"], "ours": n["name"]})
			continue
		if wa and n["active"]:
			problems.append(f"{co} {o['code']}: inactive in live, active in TEST")
		retire = wa and not n["active"]
		if retire and o["code"] in used:
			left.append({"code": o["code"], "base": b["name"], "live": o["name"], "ours": n["name"]})
			continue
		if not wn and not retire:
			continue
		n = {**n, "name": n["name"] if wn else o["name"]}
		if o["name"] != n["name"] and (not n["name"] or len(n["name"]) > 100 or re.search(r"[\t\r\n]", n["name"]) or n["name"] != n["name"].strip()):
			problems.append(f"{co} {o['code']}: final name unusable {n['name']!r}")
		what = []
		if o["name"] != n["name"]:
			what.append("hidden line break" if o["name"].strip() == n["name"] else "spaces only" if re.sub(r"\s+", " ", o["name"]).strip() == n["name"] else "name")
		if retire:
			what.append("retired")
		old.append({"code": o["code"], "group": groups.get(n["group"], n["group"]), "from": o["name"], "to": n["name"], "retire": retire, "what": ", ".join(what)})
	results.append((co, label, fields, new, old, has_udf))
	if left:
		print(f"{label}: left alone, changed in live since 2 Nov: " + "; ".join(f"{x['code']} {x['base']!r} -> {x['live']!r}" for x in left))

if problems:
	raise SystemExit("Nothing written:\n  " + "\n  ".join(problems[:40]))

for co, label, fields, new, old, has_udf in results:
	extra = [f for f, _ in LEVELS] + (FROM_SHEET if has_udf else []) + (["ForeignName"] if FG == "FINAL" else [])
	# The company-specific templates carry the Indian fields (GST, HSN) the generic ones lack; Manna runs the
	# same localisation, and its files name none of Pretreads' user fields.
	sfx = "_pre"
	dtw(f"DTW_FG_{co}_1_items.txt", "items" + sfx, ["ItemCode", "ItemName", "Series"] + [f for f, _, _ in fields] + extra,
		[[r["code"], r["name"], MANUAL_SERIES] + [r["vals"][f] for f, _, _ in fields] + [r["vals"][f] for f in extra] for r in new])
	num = lambda v: "" if not v else cell(float(v), None)
	dtw(f"DTW_FG_{co}_2_warehouses.txt", "whs" + sfx, ["ParentKey", "LineNum", "WarehouseCode", "MinimalStock", "MaximalStock", "MinimalOrder"],
		[[r["code"], i, w["w"], num(w.get("min")), num(w.get("max")), num(w.get("ord"))] for r in new for i, w in enumerate(r["whs"])])
	# ItemPrices is indexed by price list, so its LineNum is the list number less one.
	dtw(f"DTW_FG_{co}_3_prices.txt", "prices" + sfx, ["ParentKey", "LineNum", "PriceList", "Price", "Currency"],
		[[r["code"], x["list"] - 1, x["list"], num(x["price"]), x["cur"]] for r in new for x in r["prices"]])
	dtw(f"DTW_FG_{co}_4_rename_old.txt", "items" + sfx, ["ItemCode", "ItemName"], [[r["code"], r["to"]] for r in old if r["from"] != r["to"]])
	dtw(f"DTW_FG_{co}_5_retire_old.txt", "items" + sfx, ["ItemCode", "Valid", "Frozen"], [[r["code"], "tNO", "tYES"] for r in old if r["retire"]])

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
		ws.column_dimensions[get_column_letter(c)].width = 42 if h in wide else 14
	ws.freeze_panes = "C2"
	ws.auto_filter.ref = ws.dimensions

wb = openpyxl.Workbook()
info = wb.active
info.title = "How to import"
lines = []
for co, label, fields, new, old, has_udf in results:
	rn = [r for r in old if r["from"] != r["to"]]
	lines += [[label, ""],
		[f"  DTW_FG_{co}_1_items.txt", f"{len(new)} new items (Items, add new; ItemCode given, manual series {MANUAL_SERIES}); {sum(r['borrowed'] for r in new)} borrow a template's settings, without its prices"],
		[f"  DTW_FG_{co}_2_warehouses.txt", f"{sum(len(r['whs']) for r in new)} warehouse rows, active warehouses only, with the template's stock levels"],
		[f"  DTW_FG_{co}_3_prices.txt", f"{sum(len(r['prices']) for r in new)} prices, from the template's price lists"],
		[f"  DTW_FG_{co}_4_rename_old.txt", f"{len(rn)} old items renamed (Items, update existing): " + ", ".join(f"{sum(1 for r in rn if w in r['what'])} {w}" for w in ("spaces only", "hidden line break", "name"))],
		[f"  DTW_FG_{co}_5_retire_old.txt", f"{sum(r['retire'] for r in old)} old duplicates made inactive (Items, update existing), after file 4"],
		[]]
lines += [
	["Order", "SFG files and sandered files first. Then files 1–3 together as one Items import (Items + ItemWarehouseInfoCollection + ItemPrices), then 4, then 5."],
	["Try first", "3 rows of file 1 (and their rows in 2 and 3), check them in live, then the rest."],
	["After", "Run the 'Check query' in each company's Query Manager, export it to Excel and send it back: it is compared with the 'New items' sheet."],
	["Source", "each new item = its template in the 2 Nov live backup; from TEST only the name, the group and (Pretreads) the sheet's user fields"],
	["Not here", "the packing BOMs (BOM files), stock moves (parked)"],
	["Caution", "an old item changed in live after 2 Nov is overwritten by files 4 and 5: check before importing"],
]
for line in lines:
	info.append(line)
info.column_dimensions["A"].width = 32
info.column_dimensions["B"].width = 140

for co, label, fields, new, old, has_udf in results:
	sheet(wb, f"{co} new items", ["Row", "New code", "Name", "Template", "Template's name (live)", "Borrowed", "Group", "Batch", "Valuation", "UoM", "HSN", "Warehouses", "Prices"]
		+ (["Quality", "Design"] if has_udf else []),
		[[k, r["code"], r["name"], r["tpl"], r["tplName"], "Y" if r["borrowed"] else "", r["group"], r["vals"]["ManageBatchNumbers"], r["vals"]["CostAccountingMethod"],
			r["vals"]["InventoryUOM"], r["vals"]["ChapterID"], ", ".join(w["w"] for w in r["whs"]), " ".join(f"{x['list']}:{x['price']:g}" for x in r["prices"])]
			+ ([r["vals"]["U_Quality"], r["vals"]["U_Design"]] if has_udf else []) for k, r in enumerate(new, start=1)],
		{"Name", "Template's name (live)"})
	sheet(wb, f"{co} old items", ["Item code", "Group", "Name in live (2 Nov)", "Final name", "Retired", "What changes"],
		[[r["code"], r["group"], r["from"].replace("\r", "⏎").replace("\n", "⏎"), r["to"], "Y" if r["retire"] else "", r["what"]] for r in old],
		{"Name in live (2 Nov)", "Final name"})
q = wb.create_sheet("Check query")
codes = ",".join(f"'{c}'" for c in sorted(new_codes))
for line in [
	"-- Run in each company's Query Manager after the import; export the result to Excel.",
	"SELECT T0.ItemCode, T0.ItemName, T0.ItmsGrpCod, T0.InvntryUom, T0.SalUnitMsr, T0.BuyUnitMsr, T0.ManBtchNum, T0.EvalSystem, T0.IssueMthd,",
	"  T0.MngMethod, T0.ChapterID, T0.GSTRelevnt, T0.GstTaxCtg, T0.validFor, T0.frozenFor, T0.MinLevel, T0.MaxLevel,",
	"  (SELECT COUNT(*) FROM OITW W WHERE W.ItemCode = T0.ItemCode) AS Warehouses,",
	"  (SELECT COUNT(*) FROM ITM1 P WHERE P.ItemCode = T0.ItemCode AND P.Price <> 0) AS Prices",
	f"FROM OITM T0 WHERE T0.ItemCode IN ({codes}) ORDER BY T0.ItemCode",
]:
	q.append([line])
q.column_dimensions["A"].width = 160
wb.save(os.path.join(OUT, "DTW_FG_review.xlsx"))

for co, label, fields, new, old, has_udf in results:
	rn = [r for r in old if r["from"] != r["to"]]
	print(f"{label}: {len(new)} new ({sum(r['borrowed'] for r in new)} borrowed), {sum(len(r['whs']) for r in new)} warehouse rows, "
		f"{sum(len(r['prices']) for r in new)} prices; old: {len(rn)} renamed, {sum(r['retire'] for r in old)} retired")
