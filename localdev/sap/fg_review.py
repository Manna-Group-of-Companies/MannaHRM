# out/<DB>-fg-plan.json (fgitems.mjs) → out/<DB>-fg-plan.xlsx, to be read before --apply.
#
#     python -I localdev/sap/fg_review.py TEST_HITECH_PRETREADS

import json
import os
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill

db = sys.argv[1]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
plan = json.load(open(os.path.join(here, f"{db}-fg-plan.json"), encoding="utf8"))

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "New finished goods"
head = ["New code", "New description", "Sheet", "Old code(s)", "Copied from", "Item group", "Prices (list:price)",
	"Action", "BOM qty", "New BOM lines (code qty)", "Changes from old BOM", "Notes", "Error"]
ws.append(head)
for c in ws[1]:
	c.font = Font(bold=True)
red = PatternFill("solid", fgColor="F8CBAD")
yellow = PatternFill("solid", fgColor="FFF2CC")
for p in sorted(plan, key=lambda p: (not p.get("error"), not p["notes"], p["sheet"], p["code"])):
	b = p.get("bom") or {}
	ws.append([p["code"], p["name"], p["sheet"], ", ".join(p["olds"]), p.get("template"), p.get("group"), p.get("prices"),
		p.get("action"), b.get("quantity"), b.get("lines"), b.get("changes"), "; ".join(p["notes"]), p.get("error")])
	fill = red if p.get("error") else yellow if p["notes"] else None
	if fill:
		for c in ws[ws.max_row]:
			c.fill = fill
for col, w in zip("ABCDEFGHIJKLM", [14, 42, 14, 20, 12, 22, 16, 22, 9, 60, 40, 60, 40]):
	ws.column_dimensions[col].width = w
ws.freeze_panes = "A2"
ws.auto_filter.ref = ws.dimensions
out = os.path.join(here, f"{db}-fg-plan.xlsx")
wb.save(out)
print(f"{len(plan)} rows -> {out}")
