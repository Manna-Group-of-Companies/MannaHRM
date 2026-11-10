# The pieces around the import that are not items or BOMs (7 Nov 2026):
#
#     DTW_SOURCE=... DTW_FG=FINAL python -I localdev/sap/dtw_extras.py
#
#   DTW_FG_<co>_6_deactivate.txt      Items, update: Valid N, Frozen Y on mapped old codes left empty, and on
#                                     unmapped FG with no stock and no history (Deactivation-review.xlsx: kept + why)
#   SAP-code-changes.xlsx             old code → new code for both companies, for the sales app and
#                                     ERPNext (custom_sap_item_code), with the weight per roll the
#                                     rolls-to-kg rule reads.
#   Open-sales-orders-old-codes.xlsx  Pretreads' open sales order lines on an old code that moves, with the
#                                     new code: closed and re-entered before the old code is made inactive.

import os
import sys
from collections import defaultdict

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, MT_SRC, OUT, PRE_SRC, dtw, load, new_names

if FG != "FINAL":
	raise SystemExit("run with DTW_FG=FINAL")
final = {r["new"]: r for r in load("fg-mapping-final.json")}
live = {i["code"]: i for i in load(f"{PRE_SRC}-items.json")}
pre_map = load("FINAL_PRE-mapping.json")
active = lambda i: i["valid"] == "Y" and i["frozen"] != "Y"

# Deactivation (8 Nov, the user's rule):
#   mapped old code (it has a new code) - made inactive whatever its history, unless stock is left on it in any
#     warehouse after the 01 STORE move (07, 10 stay), or it has an open quantity, or is a BOM component;
#   not mapped - made inactive only with no stock in any warehouse AND no transaction history at all.
# PCTR SAP / HOT SAP items stay active as the file says. Every item kept is listed with the reason.
import re
norm = lambda v: re.sub(r"[^A-Z0-9]", "", str(v or "").upper().replace("PRECURD", "PRECURED"))
keep_rows = load("fg-mapping-final-keep.json")
FG_GROUPS = {"PRE": re.compile(r"^(FG\b.*|HOT|Seconds)$", re.I), "MT": re.compile(r"^(PRECURED|HOT|Tread Gum|VULCANISING SOLUTION)$", re.I)}
deact, held = {}, {}
for co, src in (("PRE", PRE_SRC), ("MT", MT_SRC)):
	v = load(f"{src}-verify.json")
	items = {i["ItemCode"]: i for i in v["items"]}
	mapped = {m["old"] for m in load(f"FINAL_{co}-mapping.json")}
	by_name = defaultdict(list)
	for c, i in items.items():
		by_name[norm(i["ItemName"])].append(c)
	kept = set()
	for r in keep_rows:
		kept |= set(by_name.get(norm(r["name"]), []))
		if co == "PRE" and r["old"] in items:
			kept.add(r["old"])
	whs = defaultdict(list)
	for w in v["whs"]:
		whs[w["ItemCode"]].append(w)
	history = {m["ItemCode"] for m in v["moves"] if m["N"]} | {m["ItemCode"] for m in v["docs"] if m["N"]}
	on_bom = {b["ItemCode"] for b in v["bomUse"] if b["N"]}
	# Stock the conversion moves counts as gone: Hi-Tech's 01 STORE by production order; Manna's every
	# warehouse by goods issue (DTW_STOCK_MT_1_GI_lines, 8 Nov).
	if co == "PRE":
		gone = {(c["old"], "01") for p in load("PROD_plan.json")["orders"] for c in p["comps"]}
	else:
		gi = os.path.join(OUT, "DTW_STOCK_MT_1_GI_lines.txt")
		gone = {(r.split(chr(9))[2], r.split(chr(9))[4]) for r in open(gi, encoding="utf-8").read().splitlines()[2:] if r} if os.path.exists(gi) else set()
	deact[co], held[co] = [], []
	for c, i in sorted(items.items()):
		if not FG_GROUPS[co].match(i["ItmsGrpNam"] or "") or i["validFor"] != "Y" or i["frozenFor"] == "Y":
			continue
		left = [(w["WhsCode"], w["OnHand"]) for w in whs[c] if w["OnHand"] and (c, w["WhsCode"]) not in gone]
		stock = round(sum(q for _, q in left), 3)
		why = ("in PCTR SAP / HOT SAP: kept by the file" if c in kept and c not in mapped
			else f"stock left: {', '.join(f'{wc} {q:g}' for wc, q in left)}" if left
			else "open quantity (sales / production / purchase)" if any(w["IsCommited"] or w["OnOrder"] for w in whs[c])
			else "component on a BOM" if c in on_bom
			else "transaction history (not mapped)" if c in history and c not in mapped else None)
		if why:
			held[co].append((c, i["ItemName"], i["ItmsGrpNam"], "mapped" if c in mapped else "not in file", stock, why))
		else:
			deact[co].append(c)
	dtw(f"DTW_FG_{co}_6_deactivate.txt", "items_pre", ["ItemCode", "Valid", "Frozen"], [[c, "tNO", "tYES"] for c in deact[co]])
olds = deact["PRE"]


def sheet(wb, title, heads, rows, wide):
	ws = wb.create_sheet(title)
	ws.append(heads)
	for r in rows:
		ws.append(list(r))
	for i, h in enumerate(heads, 1):
		c = ws.cell(row=1, column=i)
		c.font = Font(color="FFFFFF", bold=True)
		c.fill = PatternFill("solid", fgColor="1F4E78")
		c.alignment = Alignment(wrap_text=True)
		ws.column_dimensions[get_column_letter(i)].width = 46 if h in wide else 15
	ws.freeze_panes = "B2"
	ws.auto_filter.ref = ws.dimensions


SAP_NAME = new_names()  # the new item's name as SAP holds it: description + (old quality), 8 Nov
wb = openpyxl.Workbook()
wb.active.title = "Read me"
for l in [["Old → new item codes, from management's final list (6 Nov 2026), old items matched by name."],
	["For the sales app and ERPNext: point each item's SAP code (custom_sap_item_code) at the new code before go-live."],
	["Weight per roll is what the rolls-to-kg rule reads (U_WeightPerRoll on the new Pretreads item)."],
	["A new code with no old code is new to SAP: nothing to repoint."]]:
	wb.active.append(l)
wb.active.column_dimensions["A"].width = 120
for co, src in (("PRE", PRE_SRC), ("MT", MT_SRC)):
	names = {i["code"]: i["name"] for i in load(f"{src}-items.json")}
	rows = [(m["old"], names.get(m["old"], m["old_name"]), m["new"], SAP_NAME.get(m["new"], m["desc"]), final[m["new"]].get("weight_per_roll") or "", final[m["new"]].get("quality") or "")
		for m in sorted(load(f"FINAL_{co}-mapping.json"), key=lambda m: (m["new"], m["old"]))]
	sheet(wb, "Hi-Tech Pretreads" if co == "PRE" else "Manna Treads", ["Old code", "Old name", "New code", "New description", "Weight per roll", "Quality"],
		rows, {"Old name", "New description"})
wb.save(os.path.join(OUT, "SAP-code-changes.xlsx"))

orders = load(f"{PRE_SRC}-open-orders.json")
new_of = {m["old"]: m for m in pre_map}
so = [s for s in orders["so"] if s["ItemCode"] in new_of]
wb = openpyxl.Workbook()
wb.active.title = "Read me"
for l in [[f"Open sales order lines in Hi-Tech Pretreads on an old code that moves to a new code: {len(so)} lines, "
		f"{len({s['DocNum'] for s in so})} orders. Close each line and enter it again under the new code before the old code is made inactive."],
		["Stock leaves the old code in the production-order move, so these lines cannot be delivered from it afterwards."],
		["Source: the backup the files were built from; the list is rebuilt with them."]]:
	wb.active.append(l)
wb.active.column_dimensions["A"].width = 140
sheet(wb, "Lines", ["SO number", "Date", "Due", "Customer", "Customer name", "Old code", "Old name", "Open qty", "New code", "New description", "Done (Y)"],
	[(s["DocNum"], s["DocDate"], s["DueDate"], s["CardCode"], s["CardName"], s["ItemCode"], live.get(s["ItemCode"], {}).get("name"), float(s["OpenQty"]),
		new_of[s["ItemCode"]]["new"], SAP_NAME.get(new_of[s["ItemCode"]]["new"], new_of[s["ItemCode"]]["desc"]), "") for s in sorted(so, key=lambda s: (s["DocNum"], s["ItemCode"]))],
	{"Customer name", "Old name", "New description"})
wb.save(os.path.join(OUT, "Open-sales-orders-old-codes.xlsx"))
wb = openpyxl.Workbook()
wb.active.title = "Read me"
for l in [["Made inactive (8 Nov): every old code mapped to a new code, unless stock is left on it in any warehouse after the 01 STORE move or it has an open quantity; and, of the finished goods not mapped, only those with no stock and no transaction history."],
		[f"Deactivated: Pretreads {len(deact['PRE'])}, Manna {len(deact['MT'])}. Kept active with the reason: Pretreads {len(held['PRE'])}, Manna {len(held['MT'])}."],
		["PCTR SAP / HOT SAP items stay active as the file says. Old codes kept for an open sales order can be made inactive once those lines are re-entered under the new code."]]:
	wb.active.append(l)
wb.active.column_dimensions["A"].width = 140
for co, title in (("PRE", "Pretreads - kept active"), ("MT", "Manna - kept active")):
	sheet(wb, title, ["Item code", "Name", "Group", "Mapped?", "Stock", "Why kept active"], held[co], {"Name", "Why kept active"})
for co, title in (("PRE", "Pretreads - deactivated"), ("MT", "Manna - deactivated")):
	src = PRE_SRC if co == "PRE" else MT_SRC
	names = {i["code"]: i["name"] for i in load(f"{src}-items.json")}
	sheet(wb, title, ["Item code", "Name"], [(c, names.get(c)) for c in deact[co]], {"Name"})
wb.save(os.path.join(OUT, "Deactivation-review.xlsx"))
print(f"deactivate Pretreads {len(deact['PRE'])} (+{len(held['PRE'])} holding stock listed), Manna {len(deact['MT'])} (+{len(held['MT'])} listed); code list PRE {len(pre_map)} / MT {len(load('FINAL_MT-mapping.json'))}; open SO lines on old codes {len(so)} in {len({s['DocNum'] for s in so})} orders")
