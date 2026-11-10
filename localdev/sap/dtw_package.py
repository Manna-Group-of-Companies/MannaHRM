# The built DTW files as numbered import steps, each split into a trial and the rest.
#
#     DTW_FG=FINAL python -I localdev/sap/dtw_package.py "%USERPROFILE%\Downloads\DTW steps (final list)"
#
# Importing a trial and then the whole file would bring the trial's records in twice: harmless "already
# exists" errors for items and BOMs, but a second posting for stock documents. So each step has 1-trial
# (a few records, with their child rows) and 2-rest (everything else). The files themselves are dtw_*.py's,
# unchanged; only rows are split.
# Hi-Tech Pretreads' steps sit at the top; Manna Treads' (finished goods only, decided 7 Nov) in their own
# folder. The stock moves by production order in rounds: round 1 is packaged here; rounds 2-4 are built
# from what round 1 made (dtw_prodmove.py), so their folders hold only the query to run.

import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, OUT

dest = sys.argv[1]
# The production-order trial: an order in the bin warehouse with a batch, a plain one, and a batch item.
trial_orders = None
if FG == "FINAL" and os.path.exists(os.path.join(OUT, "PROD_plan.json")):
	plan = json.load(open(os.path.join(OUT, "PROD_plan.json"), encoding="utf-8"))["orders"]
	pick = lambda f: next((str(p["key"]) for p in plan if f(p)), None)
	# Only 01 STORE moves (7 Nov), so no bin order: a batch order, a plain one, a batch item made new.
	trial_orders = {k for k in (pick(lambda p: p["whs"] == "01" and any(c["batches"] for c in p["comps"]) and not p["newBatch"]),
		pick(lambda p: p["whs"] == "01" and not any(c["batches"] for c in p["comps"])),
		pick(lambda p: p["whs"] == "01" and p["newBatch"] and any(c["batches"] for c in p["comps"]))) if k}
# (folder, parent file, child files, trial keys — None for the first three records, review workbooks)
PRE = [
	("01 SFG rename", "DTW_SFG_1_rename", [], None, ["DTW_SFG_review.xlsx"]),
	("02 SFG retire", "DTW_SFG_2_retire", [], None, []),
	("03 Sandered items", "DTW_SANDERED_1_items", ["DTW_SANDERED_2_warehouses"], None, ["DTW_SANDERED_review.xlsx"]),
	("04 New FG items", "DTW_FG_PRE_1_items", ["DTW_FG_PRE_2_warehouses", "DTW_FG_PRE_3_prices"], None, ["DTW_FG_review.xlsx"]),
	("05 Old FG rename", "DTW_FG_PRE_4_rename_old", [], None, []),
	("06 Old FG retire", "DTW_FG_PRE_5_retire_old", [], None, []),
	("07 New BOMs", "DTW_BOM_1_new", ["DTW_BOM_1_new_lines"], None, ["DTW_BOM_review.xlsx", "BOM-roll-review.xlsx"]),
	("08 Changed BOMs", "DTW_BOM_2_changed", ["DTW_BOM_2_changed_lines"], None, []),
	("09 BOM header names", "DTW_BOM_3_names", [], None, []),
]
if FG == "FINAL":
	PRE += [("10 Production orders", "PROD_1_orders", ["PROD_1_orders_lines"], trial_orders, ["Open-sales-orders-old-codes.xlsx"])]
	PRE += [("14 Deactivate FG", "DTW_FG_PRE_6_deactivate", [], None, ["Deactivation-review.xlsx", "SAP-code-changes.xlsx"])]
else:
	PRE += [("10 Goods Issue", "DTW_STOCK_1_GI", ["DTW_STOCK_1_GI_lines", "DTW_STOCK_1_GI_batches", "DTW_STOCK_1_GI_bins"], {"8", "9"}, ["DTW_STOCK_review.xlsx"]),
		("11 Goods Receipt", "DTW_STOCK_2_GR", ["DTW_STOCK_2_GR_lines", "DTW_STOCK_2_GR_batches", "DTW_STOCK_2_GR_bins"], {"8", "9"}, [])]
MT = [
	("M1 New FG items", "DTW_FG_MT_1_items", ["DTW_FG_MT_2_warehouses", "DTW_FG_MT_3_prices"], None, ["DTW_FG_review.xlsx"]),
	("M2 Old FG rename", "DTW_FG_MT_4_rename_old", [], None, []),
	("M3 Old FG retire", "DTW_FG_MT_5_retire_old", [], None, []),
]
if FG == "FINAL":
	MT += [("M4 Deactivate FG not in the file", "DTW_FG_MT_6_deactivate", [], None, ["Deactivation-review.xlsx"])]


def read(name):
	with open(os.path.join(OUT, name + ".txt"), encoding="utf-8", newline="") as f:
		lines = f.read().split("\r\n")
	return lines[:2], [l for l in lines[2:] if l]


def write(folder, name, head, rows):
	os.makedirs(folder, exist_ok=True)
	with open(os.path.join(folder, name + ".txt"), "w", encoding="utf-8", newline="") as f:
		f.write("\r\n".join(head + rows) + "\r\n")


def package(root, steps):
	for folder, parent, children, keys, reviews in steps:
		path = os.path.join(root, folder)
		if os.path.isdir(path):
			shutil.rmtree(path)  # this script's own output: a step is rebuilt whole, never merged
		head, rows = read(parent)
		keys = keys or {r.split("\t")[0] for r in rows[:3]}
		split = lambda rs: ([r for r in rs if r.split("\t")[0] in keys], [r for r in rs if r.split("\t")[0] not in keys])
		trial, rest = split(rows)
		if len(trial) != len(keys):
			raise SystemExit(f"{folder}: trial keys {sorted(keys)} not all in {parent}")
		write(os.path.join(path, "1-trial"), parent, head, trial)
		write(os.path.join(path, "2-rest"), parent, head, rest)
		counts = [f"{len(trial)} + {len(rest)} {parent}"]
		for c in children:
			ch, cr = read(c)
			t, r = split(cr)
			write(os.path.join(path, "1-trial"), c, ch, t)
			write(os.path.join(path, "2-rest"), c, ch, r)
			counts.append(f"{len(t)} + {len(r)} {c}")
		for review in reviews:
			shutil.copy(os.path.join(OUT, review), os.path.join(path, review))
		print(f"{folder}: trial {', '.join(sorted(keys))} | " + "; ".join(counts))


package(dest, PRE)
if FG == "FINAL":
	for old in ("10 Goods Issue", "11 Goods Receipt", "14 Deactivate old FG codes"):
		if os.path.isdir(os.path.join(dest, old)):
			shutil.rmtree(os.path.join(dest, old))
	shutil.copy(os.path.join(OUT, "query_2.sql"), os.path.join(dest, "10 Production orders", "query_2.sql"))
	for folder, text in (("11 Issue for production", "Built after step 10: run 10 Production orders\\query_2.sql and send the result (orders.txt)."),
			("12 Receipt from production", "Built after step 11: run the query_3.sql that comes with step 11 and send the result (issued.txt)."),
			("13 Close production orders", "Built with step 12: PROD_4_close.txt closes every conversion order once its receipt has posted.")):
		os.makedirs(os.path.join(dest, folder), exist_ok=True)
		open(os.path.join(dest, folder, "WAIT - built later.txt"), "w", encoding="utf-8").write(text + "\n")
	if os.environ.get("DTW_PACKAGE_MT", "1") == "1":  # 0 for a Hi-Tech-only package (live, 8 Nov)
		package(os.path.join(dest, "Manna Treads"), MT)
