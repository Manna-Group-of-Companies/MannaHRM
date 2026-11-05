# The semi-finished renaming as a workbook people own: every item, what it is called, what it
# should be called, and whether to import it. dtw_semi.py turns it into a DTW file.
#
#     python -I localdev/sap/semi_mapping.py TEST_HITECH_PRETREADS
#
# Reads out/<DB>-semirename-plan-dryrun.json (semirename.mjs, before anything was renamed) and
# out/<DB>-discovery.json for groups. Writes out/semi-finished-mapping.xlsx.
#
# "Current" is the name the item had before the pilot, which is also what the live company still
# has: the workbook describes live → new, so the same file serves the live import.
#
# Columns A–I are the proposal and are not read back. J–L are the decision: J and K are filled
# with the proposal where there is one and may be changed by hand; L says whether the row is
# imported. Only J, K and L are read by dtw_semi.py.

import json
import os
import re
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

db = sys.argv[1]
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
plan = json.load(open(os.path.join(here, f"{db}-semirename-plan-dryrun.json"), encoding="utf8"))
disc = json.load(open(os.path.join(here, f"{db}-discovery.json"), encoding="utf8"))
groups = {g["Number"]: g["GroupName"] for g in disc["groups"]}
group_of = {i["ItemCode"]: groups.get(i["ItemsGroupCode"]) for i in disc["items"]}
PILOT = {"I-10239", "I-10982", "I-14649"}


def kind(name, t=None):
	if t and t.upper() in ("CURED", "EXTRUDED", "SANDERED"):
		return t.upper()
	m = re.search(r"\b(CURED|EXTRUDED|SANDERED)\b", name, re.I)
	return m.group(1).upper() if m else (t or "")


rows = []
for p in plan["rename"]:
	status = "Renamed in TEST (pilot)" if p["code"] in PILOT else "Rename"
	rows.append([p["code"], p.get("group") or group_of.get(p["code"]), kind(p["from"], p.get("type")), p["from"], p.get("qualityFrom"),
		p["to"], p["qualityTo"], status, p.get("note") or "", p["to"], p["qualityTo"], "Y"])
for p in plan["clash"]:
	rows.append([p["code"], p.get("group") or group_of.get(p["code"]), kind(p["from"], p.get("type")), p["from"], p.get("qualityFrom"),
		p["to"], p["qualityTo"], "Held back", p["why"] + " - choose which item keeps the name", "", "", "N"])
for u in plan["unchanged"]:
	word = (re.search(r"MEDIUM|EXCELLENT|EXLNT|RUBCO|GOLD|MSP", u["name"], re.I) or [None])[0]
	rows.append([u["code"], group_of.get(u["code"]), kind(u["name"]), u["name"], u.get("quality"), "", "",
		"Leave as is", f"{word.upper()} has no new label yet" if word else "no compound word in the name", "", "", "N"])
rows.sort(key=lambda r: (r[3] or "").upper())

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Semi-finished mapping"
head = ["Item Code", "Item Group", "Type", "Current Description", "Current Quality", "Proposed Description", "Proposed Quality",
	"Status", "Note", "New Description", "New Quality", "Import (Y/N)"]
ws.append(head)
bold = Font(bold=True)
proposal = PatternFill("solid", fgColor="EDEDED")
decision = PatternFill("solid", fgColor="DDEBF7")
for i, c in enumerate(ws[1], start=1):
	c.font = bold
	c.fill = decision if i >= 10 else proposal
	c.alignment = Alignment(wrap_text=True, vertical="top")
fills = {"Held back": PatternFill("solid", fgColor="F8CBAD"), "Leave as is": PatternFill("solid", fgColor="F2F2F2"),
	"Renamed in TEST (pilot)": PatternFill("solid", fgColor="E2EFDA")}
for r in rows:
	ws.append(r)
	f = fills.get(r[7]) or (PatternFill("solid", fgColor="FFF2CC") if r[8] else None)
	if f:
		for c in ws[ws.max_row][:9]:
			c.fill = f
yn = DataValidation(type="list", formula1='"Y,N"', allow_blank=False)
ws.add_data_validation(yn)
yn.add(f"L2:L{ws.max_row}")
for col, w in zip("ABCDEFGHIJKL", [11, 14, 10, 38, 13, 40, 14, 20, 46, 40, 14, 10]):
	ws.column_dimensions[col].width = w
ws.freeze_panes = "E2"
ws.auto_filter.ref = ws.dimensions

rules = wb.create_sheet("Rules")
for r in [["Old word in the name (as found in SAP)", "New label", "Decided"],
		["Black Pearl B", "DOUBLE BLUE B", "2 Nov 2026"],
		["BP, B P, Black Pearl, Black Peral, Backpearl", "DOUBLE BLUE", "2 Nov 2026"],
		["Platinum, PL", "BLUE", "2 Nov 2026"],
		["Polygold, Poly Gold, Polgold", "ORANGE/VERDO", "2 Nov 2026"],
		["Silver, Siver, Slver", "YELLOW/ROX", "2 Nov 2026"],
		["Diamond, Daimond, Diamand", "SINGLE WHITE", "2 Nov 2026"],
		["MEDIUM, EXCELLENT, RUBCO, GOLD, MSP", "(unchanged until decided)", ""],
		[],
		["Only the compound word changes; the rest of the name, spacing included, stays as it is."],
		["U_Quality (Quality) is set to the same label. Sandered items follow their cured item."],
		["Item codes do not change, so BOMs, stock and open documents keep pointing at the same items."]]:
	rules.append(r)
rules["A1"].font = rules["B1"].font = rules["C1"].font = bold
rules.column_dimensions["A"].width = 44
rules.column_dimensions["B"].width = 26
rules.column_dimensions["C"].width = 12

how = wb.create_sheet("How to import")
for line in [
	"1. Review the mapping sheet. Change New Description / New Quality where needed; set Import to N for anything not to change.",
	"2. Save, then run:  python -I localdev/sap/dtw_semi.py localdev/sap/out/semi-finished-mapping.xlsx",
	"   It writes Items_semi_rename.txt (DTW Items template: RecordKey, ItemCode, ItemName, U_Quality) for rows with Import = Y",
	"   whose New Description differs from the Current one, and refuses the file if two rows would end up with the same name.",
	"3. In the Data Transfer Workbench, log in to the TEST company first (TEST_HITECH_PRETREADS).",
	"4. Data Import > Business Object: Items (oItems) > choose 'Update existing objects' and untick 'Add new objects'.",
	"5. Source: Text file, Items_semi_rename.txt. Simulate first, read the log, then Import.",
	"6. Check a few items in Item Master Data, then repeat on the live company when it is time.",
	"",
	"Not done by DTW: the item name SAP keeps on each BOM line is a copy and is not refreshed by an item import.",
	"After the import, run  node localdev/sap/semirename.mjs <DB> --bom-names --apply  to refresh those copies (1,857 BOMs in TEST).",
]:
	how.append([line])
how.column_dimensions["A"].width = 130

out = os.path.join(here, "semi-finished-mapping.xlsx")
wb.save(out)
count = lambda s: sum(1 for r in rows if r[7] == s)
print(f"{len(rows)} items: {count('Rename')} rename, {count('Renamed in TEST (pilot)')} pilot, {count('Held back')} held back, {count('Leave as is')} unchanged -> {out}")
