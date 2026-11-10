# Old finished-good stock onto the new codes, as DTW files: a Goods Issue of each old code and a Goods
# Receipt of its new code — same warehouse, quantity, batch and cost — for the live Hi-Tech Pretreads.
#
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/dtw_stockmove.py
#
# The DTW twin of stockmove.mjs (2 Nov), and its rules: pairs from fg-mapping.json, several old codes onto
# one new code simply add up, batch for batch, one line per batch for an item valued per batch so each
# batch keeps its cost. Stock is the source backup's (export_backup.ps1), which is also what a company
# restored from it holds.
#
# Decided 6 Nov: every line of both documents posts to 340100 Suspense Account, so the conversion nets to
# zero there instead of showing as a Stock Difference loss and gain; and the import is run as Eldhose, the
# one user the transaction notification lets post a warehouse-01 issue or receipt without U_Approve —
# so U_Approve is left empty and no approval is raised.
# Live's other rules, from SBO_SP_TransactionNotification and the setup:
#   a receipt into a warehouse not value-managed (U_ValueManaged N: 02, 03, 06, 08) must be priced 0;
#   warehouse 07 keeps bins (one, 07-SYSTEM-BIN-LOCATION), so its lines carry a bin allocation;
#   a document dated beyond the poster's U_BackDate is refused — DocDate is left for DTW's day.
# The Receipt's price is the Issue's expected cost (warehouse average, or the batch's own for per-batch
# valuation). An Issue's real cost can differ a little (FIFO layers): DTW_STOCK_review.xlsx says how to
# check both totals after posting, and the difference sits in 340100.
#
# Not moved, and listed: stock on an old code with no new code, negative stock, stock in an inactive
# warehouse, batches that do not add up to the warehouse's figure, an old item that is inactive (SAP will
# not issue it until it is made active), and anything whose new item is not in TEST.
#
#   DTW_STOCK_1_GI (+ _lines, _batches, _bins)   Goods Issue, add
#   DTW_STOCK_2_GR (+ _lines, _batches, _bins)   Goods Receipt, add — run only after every Issue posted

import os
import sys
from collections import defaultdict

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, MT_SRC, OUT, PRE_SRC, dtw, load

# DTW_CO=MT (8 Nov): Manna Treads, which makes nothing, moves its own stock this way - every warehouse
# (01 and MTPL, agreed), plain issue and receipt. Manna's notification has no U_Approve rule; its only
# receipt rule is price 0 into a warehouse with U_ValueManaged = N, and neither 01 nor MTPL is.
CO = os.environ.get("DTW_CO", "PRE")
SRC = MT_SRC if CO == "MT" else PRE_SRC
TAG = "_MT" if CO == "MT" else ""

ACCOUNT = "340100"
BIN = {"07": 5} if CO == "PRE" else {}  # 07-SYSTEM-BIN-LOCATION, Hi-Tech's only bin; Manna has none
NOT_VALUED = {"02", "03", "04", "05", "06", "08"} if CO == "PRE" else set()  # OWHS.U_ValueManaged = N
LINES_PER_DOC = 40
MEMO = "Item code conversion"

d = load(f"{SRC}-verify.json")
items = {i["ItemCode"]: i for i in d["items"]}
active_whs = set(load(f"{SRC}-warehouses-active.json"))
# The final list maps by name (fg_build.py); TEST's mapping is the first sheet's, by code.
new_items = {i["ItemCode"]: i for i in load(f"FINAL_{CO}-fg-full.json" if FG == "FINAL" else "TEST_HITECH_PRETREADS-fg-full.json")}
mapping = {m["old"]: m["new"] for m in load(f"FINAL_{CO}-mapping.json" if FG == "FINAL" else "fg-mapping.json") if m["old"]}
cost = {(b["ItemCode"], b["DistNumber"]): (b["CostTotal"] / b["Quantity"] if b["Quantity"] else None) for b in (load(f"{SRC}-batchcost.json") if os.path.exists(os.path.join(OUT, f"{SRC}-batchcost.json")) else [])}
# Batch handling as the item file being imported sets it - for Manna that is Hi-Tech's (dtw_fg.py, 8 Nov),
# not what fg_build gave Manna's own template.
imported_batch = {}
_items_file = os.path.join(OUT, f"DTW_FG_{CO}_1_items.txt")
if FG == "FINAL" and os.path.exists(_items_file):
	_rows = open(_items_file, encoding="utf-8").read().splitlines()
	_h = _rows[0].split(chr(9))
	for _r in _rows[2:]:
		if _r:
			_d = dict(zip(_h, _r.split(chr(9))))
			imported_batch[_d["ItemCode"]] = _d.get("ManageBatchNumbers")
whs, batches = defaultdict(list), defaultdict(list)
for w in d["whs"]:
	whs[w["ItemCode"]].append(w)
for b in d["batches"]:
	batches[(b["ItemCode"], b["WhsCode"])].append(b)
r3 = lambda v: round(float(v or 0), 3)
r4 = lambda v: round(float(v or 0), 4)

lines, skipped = defaultdict(list), []
for old, new in sorted(mapping.items()):
	o, n = items.get(old), new_items.get(new)
	stock = [w for w in whs[old] if r3(w["OnHand"])]
	if not stock:
		continue
	why = None if o else "old code not in live"
	why = why or (None if n else f"new item {new} not in TEST")
	why = why or (None if o["validFor"] == "Y" and o["frozenFor"] != "Y" else "old item is inactive: make it active to issue it")
	if why:
		skipped += [{"old": old, "new": new, "whs": w["WhsCode"], "qty": r3(w["OnHand"]), "why": why} for w in stock]
		continue
	old_batch, new_batch = o["ManBtchNum"] == "Y", imported_batch.get(new, n.get("ManageBatchNumbers")) == "tYES"
	for w in sorted(stock, key=lambda w: w["WhsCode"]):
		qty, wc = r3(w["OnHand"]), w["WhsCode"]
		base = {"old": old, "oldName": o["ItemName"], "new": new, "whs": wc, "committed": r3(w["IsCommited"])}
		if qty < 0:
			skipped.append({**base, "qty": qty, "why": "negative stock"})
			continue
		if wc not in active_whs:
			skipped.append({**base, "qty": qty, "why": "warehouse is inactive: SAP will not receive into it"})
			continue
		price = 0 if wc in NOT_VALUED else r4(w["AvgPrice"])
		if not old_batch:
			lines[wc].append({**base, "qty": qty, "price": price, "batches": [], "grBatches": [(f"CONV-{old}", qty)] if new_batch else []})
			continue
		bs = [(b["DistNumber"], r3(b["Quantity"])) for b in sorted(batches[(old, wc)], key=lambda b: b["DistNumber"])]
		if r3(sum(q for _, q in bs)) != qty:
			skipped.append({**base, "qty": qty, "why": f"batches add up to {r3(sum(q for _, q in bs))}, stock says {qty}"})
			continue
		if o["EvalSystem"] == "B":
			# Valued per batch: one line a batch, each at its own cost.
			for bn, bq in bs:
				c = cost.get((old, bn))
				lines[wc].append({**base, "qty": bq, "price": 0 if wc in NOT_VALUED else r4(c if c is not None else w["AvgPrice"]),
					"batches": [(bn, bq)], "grBatches": [(bn, bq)] if new_batch else []})
		else:
			lines[wc].append({**base, "qty": qty, "price": price, "batches": bs, "grBatches": bs if new_batch else []})

docs = []
for wc in sorted(lines):
	ls = lines[wc]
	for i in range(0, len(ls), LINES_PER_DOC):
		docs.append({"key": len(docs) + 1, "whs": wc, "lines": ls[i:i + LINES_PER_DOC]})

# A company with branches wants the branch on every document's header (8 Nov, Z_TEST_MANNA_TREADS:
# "Specify an active branch [OIGE.BPLId]"): the warehouse's own. Manna: 01 -> 1 Kerala, MTPL -> 3 Gujarat.
# Hi-Tech has none, and its files keep the three columns they had.
_bf = os.path.join(OUT, f"{SRC}-warehouse-branches.json")
BRANCH = {w["WhsCode"]: w["BPLid"] for w in load(f"{SRC}-warehouse-branches.json")} if os.path.exists(_bf) else {}
USE_BRANCH = any(BRANCH.get(x["whs"]) for x in docs)
if USE_BRANCH and any(not BRANCH.get(x["whs"]) for x in docs):
	raise SystemExit("a warehouse moved has no branch: " + ", ".join(sorted({x["whs"] for x in docs if not BRANCH.get(x["whs"])})))


# And each branch numbers its documents in its own series (8 Nov: "numbering series assigned to another
# branch [OIGE.Series], 'GI-K1'" for the Gujarat issue): the newest unlocked series of the branch -
# Manna FY26-27: issues 209 GI-K1 (Kerala) / 210 GI-G1 (Gujarat), receipts 207 GR-K 1 / 208 GR-G 1.
SERIES = {}
if USE_BRANCH:
	for s in load(f"{SRC}-doc-series.json"):
		if s["Locked"] != "Y" and s["BPLId"]:
			k = (s["ObjectCode"], s["BPLId"])
			SERIES[k] = max(SERIES.get(k, 0), s["Series"])


def write(stem, tpl, prefix, priced):
	obj = "59" if priced else "60"
	if USE_BRANCH:
		missing = sorted({x["whs"] for x in docs if (obj, BRANCH[x["whs"]]) not in SERIES})
		if missing:
			raise SystemExit(f"no {obj} numbering series for the branch of warehouse(s) {missing}")
	dtw(f"{stem}.txt", tpl, ["DocNum", "Comments", "JournalMemo"] + (["BPL_IDAssignedToInvoice", "Series"] if USE_BRANCH else []),
		[[x["key"], f"{MEMO} {prefix} {x['key']} (warehouse {x['whs']})", f"{MEMO} {x['key']}"]
			+ ([BRANCH[x["whs"]], SERIES[(obj, BRANCH[x["whs"]])]] if USE_BRANCH else []) for x in docs])
	cols = ["ParentKey", "LineNum", "ItemCode", "Quantity", "WarehouseCode", "AccountCode"] + (["UnitPrice"] if priced else [])
	dtw(f"{stem}_lines.txt", tpl + "_lines", cols,
		[[x["key"], i, l["new" if priced else "old"], l["qty"], x["whs"], ACCOUNT] + ([l["price"]] if priced else []) for x in docs for i, l in enumerate(x["lines"])])
	pick = "grBatches" if priced else "batches"
	# LineNum numbers a document's batch rows from 0; BaseLineNumber names the document line they belong to.
	brows = []
	for x in docs:
		n = 0
		for i, l in enumerate(x["lines"]):
			for bn, bq in l[pick]:
				brows.append([x["key"], n, bn, bq, i])
				n += 1
	dtw(f"{stem}_batches.txt", tpl + "_batches", ["ParentKey", "LineNum", "BatchNumber", "Quantity", "BaseLineNumber"], brows)
	# A bin allocation per line, or per batch of a line, in a bin warehouse; the batch is named by its
	# position among that line's batches, as SAP's SerialAndBatchNumbersBaseLine does.
	rows = []
	for x in docs:
		if x["whs"] not in BIN:
			continue
		n = 0
		for i, l in enumerate(x["lines"]):
			for k, (_, bq) in enumerate(l[pick] or [(None, l["qty"])]):
				rows.append([x["key"], n, BIN[x["whs"]], bq, k if l[pick] else "", i])
				n += 1
	dtw(f"{stem}_bins.txt", tpl + "_bins", ["ParentKey", "LineNum", "BinAbsEntry", "Quantity", "SerialAndBatchNumbersBaseLine", "BaseLineNumber"], rows)

write(f"DTW_STOCK{TAG}_1_GI", "gi", "issue", False)
write(f"DTW_STOCK{TAG}_2_GR", "gr", "receipt", True)

# What was not moved: old FGs with stock and no new code, so the totals add up.
fg = {c for c, i in items.items() if (i["ItmsGrpNam"] or "").upper().startswith("FG") or i["ItmsGrpNam"] in ("HOT", "Seconds")}
unmapped = [(c, items[c]["ItemName"], w["WhsCode"], r3(w["OnHand"]), r4(w["StockValue"])) for c in sorted(fg - set(mapping)) for w in whs[c] if r3(w["OnHand"])]

def sheet(wb, title, heads, body, wide):
	ws = wb.create_sheet(title)
	ws.append(heads)
	for line in body:
		ws.append(line)
	for c, h in enumerate(heads, start=1):
		x = ws.cell(row=1, column=c)
		x.font = Font(color="FFFFFF", bold=True)
		x.fill = PatternFill("solid", fgColor="1F4E78")
		x.alignment = Alignment(wrap_text=True, vertical="top")
		ws.column_dimensions[get_column_letter(c)].width = 44 if h in wide else 13
	ws.freeze_panes = "C2"
	ws.auto_filter.ref = ws.dimensions

moved = [l for x in docs for l in x["lines"]]
total_q = round(sum(l["qty"] for l in moved), 3)
total_v = round(sum(l["qty"] * l["price"] for l in moved), 2)
wb = openpyxl.Workbook()
info = wb.active
info.title = "How to import"
by_whs = defaultdict(lambda: [0, 0.0, 0])
for l in moved:
	by_whs[l["whs"]][0] += l["qty"]; by_whs[l["whs"]][1] += l["qty"] * l["price"]; by_whs[l["whs"]][2] += 1
for line in [
	["Moves", f"{len(moved)} lines in {len(docs)} Issue/Receipt pairs: {total_q:g} kg, about ₹{total_v:,.2f}"],
	["Not moved", f"{len(skipped)} lines (see 'Not moved'); {len(unmapped)} warehouse lines of finished goods with no new code stay where they are"],
	["Open orders", f"{sum(1 for l in moved if l['committed'])} moved lines have open sales orders on the old code: those orders cannot be delivered from the old code afterwards"],
	[],
	["Before", "Items imported (SFG, sandered, FG). Log in to DTW as Eldhose: warehouse 01 documents are refused for anyone else without U_Approve."] if CO == "PRE"
		else ["Before", "Manna: new items (M1) imported first. Manna has no U_Approve rule; post on the day you import (back-date limit per user)."],
	["Before", "Post on the day you import: Eldhose may not back-date more than 2 days."] if CO == "PRE" else ["Order", "Every Issue first, then the Receipts."],
	["1", "Goods Issue, add: DTW_STOCK_1_GI.txt (documents), _lines, _batches, _bins. Try document 1 alone first."],
	["2", "Only when every Issue has posted: Goods Receipt, add: DTW_STOCK_2_GR.txt and its _lines, _batches, _bins. DocNum k in the Receipt files matches Issue k."],
	["3", "Check: Inventory Audit Report or the query on 'Check' — each old code 0 in each warehouse, each new code the totals on 'Per new code'."],
	["Value", "The Receipt is priced at the Issue's expected cost. 340100 should end near zero; any small balance is the difference between expected and actual issue cost (FIFO layers)."],
	["Third-party", "Warehouses 02, 03, 06, 08 are not value-managed: receipts there are priced 0, as live's rule requires."],
	["Source", f"{SRC}: stock as restored on this PC. Rebuild from a fresh backup before the real cut-over."],
	[],
	["Warehouse", "Lines / kg / ₹"],
] + [[w, f"{v[2]} / {v[0]:,.3f} / {v[1]:,.2f}"] for w, v in sorted(by_whs.items())]:
	info.append(line)
info.column_dimensions["A"].width = 16
info.column_dimensions["B"].width = 150
sheet(wb, "Lines", ["Doc", "Warehouse", "Old code", "Old name", "New code", "Qty", "Unit cost ₹", "Value ₹", "Batches", "Open SO qty"],
	[[x["key"], x["whs"], l["old"], l["oldName"], l["new"], l["qty"], l["price"], round(l["qty"] * l["price"], 2),
		"; ".join(f"{b} {q:g}" for b, q in l["batches"]), l["committed"] or ""] for x in docs for l in x["lines"]], {"Old name", "Batches"})
per_new = defaultdict(lambda: defaultdict(float))
for l in moved:
	per_new[l["new"]][l["whs"]] += l["qty"]
sheet(wb, "Per new code", ["New code", "Warehouse", "Qty after move"], [[n, w, round(q, 3)] for n in sorted(per_new) for w, q in sorted(per_new[n].items())], set())
sheet(wb, "Not moved", ["Old code", "New code", "Warehouse", "Qty", "Why"], [[s["old"], s["new"], s["whs"], s["qty"], s["why"]] for s in skipped], {"Why"})
sheet(wb, "No new code", ["Old code", "Name", "Warehouse", "Qty", "Value ₹"], [list(u) for u in unmapped], {"Name"})
q = wb.create_sheet("Check")
codes = ",".join(f"'{c}'" for c in sorted({l["old"] for l in moved} | {l["new"] for l in moved}))
for line in ["-- After both imports, in Query Manager: every old code should be 0, every new code as on 'Per new code'.",
		f"SELECT ItemCode, WhsCode, OnHand FROM OITW WHERE OnHand <> 0 AND ItemCode IN ({codes}) ORDER BY ItemCode, WhsCode"]:
	q.append([line])
q.column_dimensions["A"].width = 160
wb.save(os.path.join(OUT, f"DTW_STOCK{TAG}_review.xlsx"))
print(f"{SRC}: {len(docs)} Issue/Receipt pairs, {len(moved)} lines, {total_q:g} kg, about Rs {total_v:,.2f}; not moved {len(skipped)}; "
	f"no new code {len(unmapped)} warehouse lines ({round(sum(u[3] for u in unmapped), 3):g} kg)")
for s in skipped:
	print("  not moved:", s["old"], s["whs"], s["qty"], s["why"])
