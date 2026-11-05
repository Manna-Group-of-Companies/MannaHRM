# out/<DB>-stockmove-plan.json (stockmove.mjs) → out/<DB>-stockmove-plan.xlsx, to be read before --apply.
#
#     python -I localdev/sap/stockmove_review.py TEST_HITECH_PRETREADS

import json
import os
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill

db = sys.argv[1]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
plan = json.load(open(os.path.join(here, f"{db}-stockmove-plan.json"), encoding="utf8"))
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Stock move"
ws.append(["Document pair", "Warehouse", "Old code", "Old name", "New code", "Quantity", "Batches (batch qty)", "Receipt batches",
	"Est. unit cost", "Est. value", "Valuation", "Open orders on old code"])
for c in ws[1]:
	c.font = Font(bold=True)
yellow = PatternFill("solid", fgColor="FFF2CC")
for d in plan["docs"]:
	for l in d["lines"]:
		b = l.get("batches") or []
		ws.append([d["id"], d["whs"], l["old"], l["name"], l["new"], l["qty"], ", ".join(f"{x['BatchNumber']} ({x['Quantity']})" for x in b),
			"same" if l.get("grBatch") == "same" else (l.get("grBatch") or ""), round(l["price"], 3), round(l["qty"] * l["price"], 2),
			l["valuation"].replace("bis_", ""), l["committed"] or None])
		if l["committed"]:
			for c in ws[ws.max_row]:
				c.fill = yellow
for col, w in zip("ABCDEFGHIJKL", [12, 9, 11, 46, 14, 10, 40, 14, 12, 14, 14, 12]):
	ws.column_dimensions[col].width = w
ws.freeze_panes = "A2"
ws.auto_filter.ref = ws.dimensions
sk = wb.create_sheet("Not moved")
sk.append(["Old code", "Warehouse", "Quantity", "Why"])
for x in plan["skipped"] + plan["problems"]:
	sk.append([x.get("old"), x.get("whs"), x.get("qty"), x.get("why")])
out = os.path.join(here, f"{db}-stockmove-plan.xlsx")
wb.save(out)
print(f"{sum(len(d['lines']) for d in plan['docs'])} lines -> {out}")
