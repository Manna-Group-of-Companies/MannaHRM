# Management's finished-goods sheet → out/fg-mapping.json, which fgitems.mjs reads.
#
#     python -I localdev/sap/fg_mapping.py "%USERPROFILE%\Downloads\ITEM CATEGORY.xlsx"
#
# Only the sheets that carry both codes: PCTR BROCHURE, HOT BROCHURE, BONDING GUM,
# SOLUTION. The codes and descriptions are management's and are passed on as they
# are; a row is dropped only when it has no new code.

import json
import os
import sys

import openpyxl

SHEETS = ("PCTR BROCHURE", "HOT BROCHURE", "BONDING GUM", "SOLUTION")
COLS = {"old": "C. ITEM CODE", "old_name": "ITEMS", "new": "N. ITEMCODE", "product_type": "PRODUCT TYPE",
	"brand": "BRAND", "quality": "QUALITY/PROPERTY", "pattern": "PATTERN", "category": "CATEGORY",
	"belts_per_roll": "BELTS/ROLL", "std_weight": "STD WEIGHT OF BELT", "weight_per_roll": "WEIGHT PER ROLL"}


def clean(v):
	if isinstance(v, str):
		v = " ".join(v.split())
		return v or None
	return v


wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
rows = []
for sheet in SHEETS:
	ws = wb[sheet]
	head = [str(h).strip() if h else "" for h in next(ws.iter_rows(max_row=1, values_only=True))]
	at = {k: head.index(v) for k, v in COLS.items() if v in head}
	# PCTR BROCHURE calls its description column "N. ITEM DESCRIPTON"; the others "ITEM DESCRIPTON".
	at["desc"] = next(i for i, h in enumerate(head) if h.endswith("DESCRIPTON"))
	for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
		row = {k: clean(r[i]) for k, i in at.items()}
		if not row.get("new"):
			continue
		row["new"] = str(row["new"]).strip()
		row["old"] = str(row["old"]).strip() if row.get("old") else None
		row.update(sheet=sheet, row=n)
		rows.append(row)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "fg-mapping.json")
with open(out, "w", encoding="utf8") as f:
	json.dump(rows, f, indent=1, default=str)
print(f"{len(rows)} rows, {len({r['new'] for r in rows})} new codes, {sum(1 for r in rows if not r['old'])} without an old code -> {out}")
