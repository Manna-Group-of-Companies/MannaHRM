# out/<DB>-semirename-plan.json (semirename.mjs) → out/<DB>-semirename-plan.xlsx, to be read before --apply.
#
#     python -I localdev/sap/semirename_review.py TEST_HITECH_PRETREADS

import json
import os
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill

db = sys.argv[1]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
plan = json.load(open(os.path.join(here, f"{db}-semirename-plan.json"), encoding="utf8"))
wb = openpyxl.Workbook()
yellow = PatternFill("solid", fgColor="FFF2CC")
red = PatternFill("solid", fgColor="F8CBAD")


def sheet(title, head, rows, widths, fill=None):
	ws = wb.create_sheet(title)
	ws.append(head)
	for c in ws[1]:
		c.font = Font(bold=True)
	for r, f in rows:
		ws.append(r)
		if f:
			for c in ws[ws.max_row]:
				c.fill = f
	for i, w in enumerate(widths):
		ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
	ws.freeze_panes = "A2"
	ws.auto_filter.ref = ws.dimensions


sheet("Rename", ["Code", "Type", "Group", "Current name", "New name", "Quality now", "Quality new", "Note"],
	[([p["code"], p.get("type"), p.get("group"), p["from"], p["to"], p.get("qualityFrom"), p["qualityTo"], p.get("note")], yellow if p.get("note") else None)
		for p in sorted(plan["rename"], key=lambda p: p["from"].upper())], [11, 12, 14, 40, 44, 12, 14, 50])
sheet("Held back", ["Code", "Current name", "New name", "Why"], [([p["code"], p["from"], p["to"], p["why"]], red) for p in plan["clash"]], [11, 40, 44, 50])
sheet("Unchanged", ["Code", "Name", "Quality"], [([u["code"], u["name"], u.get("quality")], None) for u in sorted(plan["unchanged"], key=lambda u: u["name"].upper())], [11, 46, 14])
del wb["Sheet"]
out = os.path.join(here, f"{db}-semirename-plan.xlsx")
wb.save(out)
print(f"{len(plan['rename'])} renames, {len(plan['clash'])} held back, {len(plan['unchanged'])} unchanged -> {out}")
