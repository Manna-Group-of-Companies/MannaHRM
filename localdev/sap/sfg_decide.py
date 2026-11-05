# The 3 Nov 2026 label decisions → the yellow columns of SFG-names-not-updated.xlsx, and the files
# that apply them.
#
#     python -I localdev/sap/sfg_decide.py localdev/sap/out/SFG-names-not-updated.xlsx
#
# Decided by the user, 3 Nov 2026:
#   MEDIUM stays MEDIUM (management's sheet gives it no new quality); U_Quality = MEDIUM.
#   Customer job work (RUBCO, MSP, EXCELLENT, CRESCENT, ASRTU, CENTURY) keeps the customer's name,
#   EXLNT spelled out as EXCELLENT; U_Quality = JOB WORK, which is what management's sheet calls them.
#   235 B582: the item that is used is renamed to DOUBLE BLUE, its unused twin is retired — renamed
#   with OLD on the end and made inactive, so the two never share a name.
#
# Writes beside the workbook:
#   Items_sfg_rename.txt   DTW oItems file (RecordKey, ItemCode, ItemName, U_Quality) — apply_semi.mjs reads it
#   Items_sfg_retire.txt   the codes to make inactive, one per line — retire_items.mjs reads it
# Refused, nothing written, when a new name is empty, too long, or another item's name.

import json
import os
import re
import sys

import openpyxl

src = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
JOB_WORK = r"\b(RUBCO|MSP|EXCELLENT|EXLNT|CRESCENT|ASRTU|CENTURY)\b"
# Of each 235 B582 pair, the one with stock, a BOM or production orders stays; the other retires.
# Extruded: I-10255 has the BOM and a closed order, I-14467 has nothing. Cured: I-14468 has the
# stock, the BOM, three orders and feeds two BOMs; I-10998 has none of them.
KEEP = {"I-10255": "235 B582 DOUBLE BLUE EXTRUDED", "I-14468": "235 B582 DOUBLE BLUE CURED"}
RETIRE = {"I-14467": "I-10255", "I-10998": "I-14468"}
norm = lambda v: re.sub(r"\s+", " ", str(v or "")).strip().upper()

wb = openpyxl.load_workbook(src)
with open(os.path.join(HERE, "out", "TEST_HITECH_PRETREADS-naming-status.json"), encoding="utf-8") as f:
	everyone = {i["code"]: i["name"] or "" for i in json.load(f)["items"]}

decided = []
for title in ("Old label (held back)", "Label undecided", "No quality word"):
	ws = wb[title]
	head = [c.value for c in ws[1]]
	at = {h: i + 1 for i, h in enumerate(head)}
	for r in range(2, ws.max_row + 1):
		code = ws.cell(r, at["Item code"]).value
		cur = ws.cell(r, at["Current name"]).value or ""
		if code in KEEP:
			new, q, note = KEEP[code], "DOUBLE BLUE", "Kept of the 235 B582 pair: renamed to the new label"
		elif code in RETIRE:
			new, q, note = f"{cur.strip()} OLD", "DOUBLE BLUE", f"Retired (inactive): unused duplicate of {RETIRE[code]}"
		elif re.search(JOB_WORK, cur, re.I):
			new, q, note = re.sub(r"\bEXLNT\b", "EXCELLENT", cur, flags=re.I), "JOB WORK", "Customer job work: name kept"
		elif re.search(r"\bMEDIUM\b", cur, re.I):
			new, q, note = cur, "MEDIUM", "MEDIUM kept (no new label from management)"
		else:
			continue
		ws.cell(r, at["New name"]).value = new
		ws.cell(r, at["New quality (U_Quality)"]).value = q
		ws.cell(r, at["Import Y/N"]).value = "Y"
		ws.cell(r, at["Notes"]).value = note
		decided.append({"code": code, "cur": cur, "curq": ws.cell(r, at["U_Quality"]).value, "new": new, "q": q, "retire": code in RETIRE})

problems = []
after = dict(everyone)
for d in decided:
	after[d["code"]] = d["new"]
	if not d["new"] or len(d["new"]) > 200:
		problems.append(f"{d['code']}: new name empty or longer than 200")
for d in decided:
	if norm(d["new"]) == norm(d["cur"]):
		continue
	twins = [c for c, n in after.items() if c != d["code"] and norm(n) == norm(d["new"])]
	if twins:
		problems.append(f"{d['code']} -> {d['new']}: same name as {', '.join(twins)}")
if problems:
	print(f"Not written: {len(problems)} problem(s)")
	for p in problems:
		print("  " + p)
	sys.exit(1)

wb.save(src)
out = [d for d in decided if d["new"] != d["cur"] or (d["q"] or "") != (d["curq"] or "")]
fields = ["RecordKey", "ItemCode", "ItemName", "U_Quality"]
lines = ["\t".join(fields), "\t".join(fields)] + ["\t".join([str(n), d["code"], d["new"], d["q"]]) for n, d in enumerate(out, start=1)]
folder = os.path.dirname(os.path.abspath(src))
with open(os.path.join(folder, "Items_sfg_rename.txt"), "wb") as f:
	f.write(("\r\n".join(lines) + "\r\n").encode("cp1252"))
with open(os.path.join(folder, "Items_sfg_retire.txt"), "w", encoding="ascii") as f:
	f.write("\n".join(RETIRE) + "\n")
names = sum(1 for d in out if d["new"] != d["cur"])
print(f"{len(decided)} decided, {len(out)} to write ({names} name changes, {len(out) - names} quality only), {len(RETIRE)} to retire -> {folder}")
