# The twins squeeze_names.mjs would not settle by itself → a workbook for a person to decide.
#
#     python -I localdev/sap/squeeze_review.py
#
# Reads out/<DB>-squeeze-plan.json for both test companies and lists every group of items whose
# names differ only in spacing where two or more have a history (or two are management's new
# codes). Nothing in these groups was renamed or retired; the yellow columns are the decision.

import json
import os

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
with open(os.path.join(OUT, "fg-mapping.json"), encoding="utf-8") as f:
	new_codes = {m["new"] for m in json.load(f)}

heads = ["Company", "Group", "Name once spaces are cleaned", "Item code", "Current name", "Kind", "New code (management)", "Active", "History",
	"Decision (Keep / Retire / Rename)", "New name if renamed", "Notes"]
decide = set(heads[-3:])
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Twins to verify"
ws.append(heads)
n = 0
for db, label in (("TEST_HITECH_PRETREADS", "Hi-Tech Pretreads"), ("TEST_MANNA_TREADS", "Manna Treads")):
	with open(os.path.join(OUT, f"{db}-squeeze-plan.json"), encoding="utf-8") as f:
		plan = json.load(f)
	for g in plan["leftAlone"]:
		n += 1
		for i in g["items"]:
			ws.append([label, n, g["name"], i["code"], i["name"], i["kind"], "Y" if i["code"] in new_codes else "", "Y" if i["active"] else "N",
				i["history"] or "none found", None, None, None])
fill = PatternFill("solid", fgColor="FFF2CC")
for c, h in enumerate(heads, start=1):
	cell = ws.cell(row=1, column=c)
	cell.font = Font(color="FFFFFF", bold=True)
	cell.fill = PatternFill("solid", fgColor="BF8F00" if h in decide else "1F4E78")
	cell.alignment = Alignment(wrap_text=True, vertical="top")
	ws.column_dimensions[get_column_letter(c)].width = {"History": 70, "Current name": 45, "Name once spaces are cleaned": 45}.get(h, 22 if h in decide else 14)
	if h in decide:
		for r in range(2, ws.max_row + 1):
			ws.cell(row=r, column=c).fill = fill
for r in range(2, ws.max_row + 1):
	ws.cell(row=r, column=heads.index("History") + 1).alignment = Alignment(wrap_text=True, vertical="top")
ws.freeze_panes = "E2"
ws.auto_filter.ref = ws.dimensions

info = wb.create_sheet("How to use")
for line in [
	"Items whose names differ only in spacing, where more than one has a history. Nothing in these groups was changed.",
	"History = stock, open orders, a BOM of its own, a place on another BOM, production orders, and past document lines",
	"(sales/purchase orders, quotations, deliveries, invoices, returns, credit notes, goods receipts/issues, transfers).",
	"Two rows marked 'New code' in one group are management's own codes sharing a description: management's call.",
	"Fill Decision for every row: Keep (stays, spaces cleaned), Retire (OLD added, made inactive), or Rename (give the new name).",
	"Only one item per group may keep the cleaned name; a retired item with stock or open orders must be emptied first.",
]:
	info.append([line])
info.column_dimensions["A"].width = 120
dest = os.path.join(OUT, "Twins-to-verify.xlsx")
wb.save(dest)
print(f"{n} groups, {ws.max_row - 1} items -> {dest}")
