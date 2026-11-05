# out/<DB>-stageboms-plan.json (stageboms.mjs) → out/<DB>-stageboms-plan.xlsx, to be read before --apply.
#
#     python -I localdev/sap/stageboms_review.py TEST_HITECH_PRETREADS

import json
import os
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill

db = sys.argv[1]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
plan = json.load(open(os.path.join(here, f"{db}-stageboms-plan.json"), encoding="utf8"))
wb = openpyxl.Workbook()
yellow = PatternFill("solid", fgColor="FFF2CC")


def sheet(title, head, rows, widths):
	ws = wb.create_sheet(title)
	ws.append(head)
	for c in ws[1]:
		c.font = Font(bold=True)
	for r, flag in rows:
		ws.append(r)
		if flag:
			for c in ws[ws.max_row]:
				c.fill = yellow
	for i, w in enumerate(widths):
		ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
	ws.freeze_panes = "A2"
	ws.auto_filter.ref = ws.dimensions


lines = lambda ls: " | ".join(f"{l['ItemCode']} {l['Quantity']}" for l in ls)
sheet("Sandering", ["Sandered item", "Cured item", "Copied from old packing BOM", "Makes", "Lines now", "Lines before", "Note"],
	[([x["code"], x["cured"], x["from"], 1, lines(x["bom"]["ProductTreeLines"]), x.get("was") or "(new)", x.get("note")], bool(x.get("note"))) for x in plan["sandering"]],
	[14, 11, 16, 7, 40, 36, 60])
sheet("Sandered items", ["Sandered item", "Settings from", "Changes"],
	[([x["code"], x["from"], ", ".join(f"{k} = {v}" for k, v in x["patch"].items())], False) for x in plan.get("items", [])], [14, 14, 90])
for name, part in (("Packing", "packing"), ("Curing", "curing")):
	sheet(name, ["BOM", "Made before", "Makes now", "New lines", "Changes", "Rounding to check"],
		[([x["code"], x["was"], 1, lines(x["lines"]), "; ".join(x["changes"]), "; ".join(x["lost"])], bool(x["lost"])) for x in plan[part]],
		[14, 11, 10, 60, 70, 50])
sheet("Skipped", ["Item / BOM", "Why"], [([x["item"], x["why"]], False) for x in plan["skipped"]], [16, 70])
del wb["Sheet"]
out = os.path.join(here, f"{db}-stageboms-plan.xlsx")
wb.save(out)
print(f"{len(plan['sandering'])} sandering, {len(plan['packing'])} packing, {len(plan['curing'])} curing, {len(plan['skipped'])} skipped -> {out}")
