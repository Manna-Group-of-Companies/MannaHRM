# semi-finished-mapping.xlsx → Items_semi_rename.txt, a Data Transfer Workbench Items file that
# updates the name and quality of the rows marked for import, and nothing else.
#
#     python -I localdev/sap/dtw_semi.py localdev/sap/out/semi-finished-mapping.xlsx
#
# Reads only the decision columns (New Description, New Quality, Import) against the item code and
# the current name. A row goes into the file when Import is Y and its name or quality changes.
#
# The file is refused, and nothing written, when a new name is empty, too long for SAP (200), or
# the same as another item's name after the import — unless the two were already named alike
# (spacing only) before it, which the import carries along rather than causes. Two items under one
# name is how the wrong one gets issued.
#
# DTW: Items (oItems), "Update existing objects", "Add new objects" unticked. The template's two
# header rows are the field names and the database names; for these four they are the same.

import os
import re
import sys

import openpyxl

src = sys.argv[1]
ws = openpyxl.load_workbook(src, data_only=True)["Semi-finished mapping"]
head = [c.value for c in ws[1]]
col = {name: head.index(name) for name in ("Item Code", "Current Description", "Current Quality", "New Description", "New Quality", "Import (Y/N)")}
norm = lambda v: re.sub(r"\s+", " ", str(v or "")).strip().upper()

rows = []
for r in ws.iter_rows(min_row=2, values_only=True):
	code = r[col["Item Code"]]
	if not code:
		continue
	rows.append({"code": str(code).strip(), "cur": r[col["Current Description"]] or "", "curq": r[col["Current Quality"]] or "",
		"new": (r[col["New Description"]] or "").strip() if isinstance(r[col["New Description"]], str) else r[col["New Description"]],
		"newq": (r[col["New Quality"]] or "").strip() if isinstance(r[col["New Quality"]], str) else r[col["New Quality"]],
		"imp": str(r[col["Import (Y/N)"]] or "").strip().upper() == "Y"})

out, problems = [], []
for x in rows:
	if not x["imp"]:
		x["final"] = x["cur"]
		continue
	if not x["new"]:
		problems.append(f"{x['code']}: Import is Y but New Description is empty")
		x["final"] = x["cur"]
		continue
	x["final"] = x["new"]
	if len(str(x["new"])) > 200:
		problems.append(f"{x['code']}: new name longer than 200")
	if x["newq"] and len(str(x["newq"])) > 30:
		problems.append(f"{x['code']}: new quality longer than 30")
	if re.search(r"[\t\r\n]", str(x["new"])):
		problems.append(f"{x['code']}: new name has a tab or line break")
	if x["new"] != x["cur"] or (x["newq"] or "") != (x["curq"] or ""):
		out.append(x)

# Names after the import, against each other — the mapping covers semi-finished items only, so a
# clash with an item outside it is SAP's to refuse, and DTW's log will say so.
by_final = {}
for x in rows:
	by_final.setdefault(norm(x["final"]), []).append(x)
for name, xs in by_final.items():
	if len(xs) > 1 and len({norm(x["cur"]) for x in xs}) > 1 and any(x in out for x in xs):
		problems.append(f"same name after import: {', '.join(x['code'] for x in xs)} -> {xs[0]['final']}")

if problems:
	print(f"Not written: {len(problems)} problem(s)")
	for p in problems[:40]:
		print("  " + p)
	sys.exit(1)

fields = ["RecordKey", "ItemCode", "ItemName", "U_Quality"]
lines = ["\t".join(fields), "\t".join(fields)]
for n, x in enumerate(out, start=1):
	lines.append("\t".join([str(n), x["code"], str(x["new"]), str(x["newq"] or "")]))
text = "\r\n".join(lines) + "\r\n"
dest = os.path.join(os.path.dirname(os.path.abspath(src)), "Items_semi_rename.txt")
# Plain ANSI when it can be; DTW reads a UTF-16 file as Unicode text otherwise.
try:
	data = text.encode("cp1252")
except UnicodeEncodeError:
	data = text.encode("utf-16")
with open(dest, "wb") as f:
	f.write(data)
print(f"{len(out)} items -> {dest}  ({sum(1 for x in rows if x['imp'])} marked Y, {len(rows)} in the workbook)")
