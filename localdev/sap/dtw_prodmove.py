# Old finished-good stock onto the new codes by production order (decided 7 Nov 2026), as DTW files for
# Hi-Tech Pretreads, in three rounds — a DTW file can name a production order only by the number SAP gives
# it on adding, so each round reads back what the last one made.
#
#     DTW_SOURCE=... DTW_FG=FINAL python -I localdev/sap/dtw_prodmove.py orders   <step folder>
#     DTW_SOURCE=... DTW_FG=FINAL python -I localdev/sap/dtw_prodmove.py issues   <step folder> <orders.txt>
#     DTW_SOURCE=... DTW_FG=FINAL python -I localdev/sap/dtw_prodmove.py receipts <step folder> <issued.txt>
#
# orders    one Special production order, PLANNED, per new code and warehouse: the new code is the
#           product, its old codes there are the components (manual issue), planned = their stock.
#           Writes PROD_1_orders (+ _lines), the plan (out/PROD_plan.json) and query_2.sql.
# issues    from query_2.sql's result (copied from SSMS with headers into a text file): an issue for
#           production per order — every component, its batches, and the bin in warehouse 07.
#           Writes PROD_2_issue (+ _lines, _batches, _bins) and query_3.sql — and before it PROD_2a_release,
#           which releases the orders: DTW adds a production order as planned only (Z_TEST, 8 Nov: "Production
#           orders can be created in planned status only"), and an issue needs a released order.
# receipts  from query_3.sql's result: a receipt from production per order of the whole planned quantity,
#           priced at what the issue took out (so the order closes with no variance), the batches carried
#           across as the receipt's (or CONV-<old code> where the old item kept none), and the bin in 07;
#           then the orders' closing. Writes PROD_3_receipt (+ children) and PROD_4_close.
#
# Live's rules this meets (SBO_SP_TransactionNotification): the warehouse-01 U_Approve rule skips lines
# from a production order; a receipt from production needs an issue to the order first; it is priced
# within 10% of the item's last receipt — none for a new code, and a code received in two warehouses is
# listed when its two costs differ by more than that; an order closes only within ±10% of planned.
# The stock is the source backup's: rebuild from the backup taken after production closed its orders.

import csv
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, OUT, PRE_SRC, dtw, load

if FG != "FINAL":
	raise SystemExit("run with DTW_FG=FINAL: the production-order move follows the final list")
round_, folder = sys.argv[1], sys.argv[2]
COMPANY_DB = os.environ.get("DTW_TARGET", "Z_TEST_HITECH_PRETREADS")
KEY = "Item code conversion"
MOVE_WHS = {"01"}
BIN = {"07": 5}  # 07-SYSTEM-BIN-LOCATION, the only bin there
PLAN = os.path.join(OUT, "PROD_plan.json")
r3 = lambda v: round(float(v or 0), 3)
TAB, CRLF = chr(9), chr(13) + chr(10)
os.makedirs(folder, exist_ok=True)


def write_to(name, tpl, heads, body):
	dtw(name, tpl, heads, body)
	os.replace(os.path.join(OUT, name), os.path.join(folder, name))


def read_grid(path):
	# What SSMS's "Copy with Headers" pastes: tab-separated, one header row.
	with open(path, encoding="utf-8-sig") as f:
		return list(csv.DictReader(f, delimiter="\t"))


if round_ == "orders":
	d = load(f"{PRE_SRC}-verify.json")
	items = {i["ItemCode"]: i for i in d["items"]}
	new_items = {i["ItemCode"]: i for i in load("FINAL_PRE-fg-full.json")}
	mapping = {m["old"]: m["new"] for m in load("FINAL_PRE-mapping.json")}
	active_whs = set(load(f"{PRE_SRC}-warehouses-active.json"))
	batches = defaultdict(list)
	for b in d["batches"]:
		batches[(b["ItemCode"], b["WhsCode"])].append((b["DistNumber"], r3(b["Quantity"])))
	orders, skipped = defaultdict(list), []
	for w in d["whs"]:
		old, wc, qty = w["ItemCode"], w["WhsCode"], r3(w["OnHand"])
		if old not in mapping or not qty:
			continue
		o, new = items[old], mapping[old]
		# Only 01 STORE's stock is converted (decided 7 Nov): aged stock (07) and seconds (10) stay on
		# the old code, which keeps them active through step 14.
		why = None if wc in MOVE_WHS else f"warehouse {wc}: only 01 STORE is converted"
		why = why or (None if qty > 0 else "negative stock")
		why = why or (None if wc in active_whs else "warehouse inactive")
		why = why or (None if o["validFor"] == "Y" and o["frozenFor"] != "Y" else "old item inactive: make it active to issue it")
		bs = sorted(batches[(old, wc)]) if o["ManBtchNum"] == "Y" else []
		if not why and o["ManBtchNum"] == "Y" and r3(sum(q for _, q in bs)) != qty:
			why = f"batches add up to {r3(sum(q for _, q in bs))}, stock says {qty}"
		if why:
			skipped.append({"old": old, "new": new, "whs": wc, "qty": qty, "why": why})
			continue
		orders[(new, wc)].append({"old": old, "qty": qty, "batches": bs, "price": r3(w["AvgPrice"]), "oldBatch": o["ManBtchNum"] == "Y"})
	plan = []
	for k, (new, wc) in enumerate(sorted(orders), start=1):
		comps = sorted(orders[(new, wc)], key=lambda c: c["old"])
		plan.append({"key": k, "new": new, "whs": wc, "qty": r3(sum(c["qty"] for c in comps)), "comps": comps,
			"newBatch": new_items[new].get("ManageBatchNumbers") == "tYES"})
	json.dump({"orders": plan, "skipped": skipped}, open(PLAN, "w", encoding="utf-8"), indent=1)
	write_to("PROD_1_orders.txt", "po", ["AbsoluteEntry", "ItemNo", "ProductionOrderType", "ProductionOrderStatus", "PlannedQuantity", "Warehouse", "Remarks", "JournalRemarks"],
		[[p["key"], p["new"], "bopotSpecial", "boposPlanned", p["qty"], p["whs"], f"{KEY} {p['key']}", f"{KEY} {p['key']}"] for p in plan])
	write_to("PROD_1_orders_lines.txt", "po_lines", ["ParentKey", "LineNum", "ItemNo", "BaseQuantity", "PlannedQuantity", "ProductionOrderIssueType", "Warehouse"],
		[[p["key"], i, c["old"], round(c["qty"] / p["qty"], 6), c["qty"], "im_Manual", p["whs"]] for p in plan for i, c in enumerate(p["comps"])])
	open(os.path.join(folder, "query_2.sql"), "w", encoding="utf-8").write(
		f"-- After importing PROD_1_orders: run in SSMS, right-click the result > Copy with Headers, paste into Notepad,\n"
		f"-- save as orders.txt and send it back. Read-only.\n"
		f"SELECT W.DocEntry, W.DocNum, W.Comments, W.Status, W.ItemCode AS Product, W.Warehouse, L.LineNum, L.ItemCode, L.PlannedQty\n"
		f"FROM {COMPANY_DB}.dbo.OWOR W JOIN {COMPANY_DB}.dbo.WOR1 L ON L.DocEntry = W.DocEntry\n"
		f"WHERE W.Comments LIKE N'{KEY} %' AND W.Status <> 'C'\nORDER BY W.DocEntry, L.LineNum;\n")
	print(f"{len(plan)} production orders, {sum(len(p['comps']) for p in plan)} component lines, {r3(sum(p['qty'] for p in plan)):g} kg; "
		f"not moved {len(skipped)}; {sum(1 for p in plan if len(p['comps']) > 1)} orders combine several old codes")
	for s in skipped:
		print("  not moved:", s)

elif round_ in ("issues", "receipts"):
	plan = json.load(open(PLAN, encoding="utf-8"))["orders"]
	by_key = {p["key"]: p for p in plan}
	grid = read_grid(sys.argv[3])
	entry = {}
	for r in grid:
		k = int(r["Comments"].split()[-1])
		entry[k] = int(r["DocEntry"])
	missing = [k for k in by_key if k not in entry]
	if missing:
		raise SystemExit(f"orders not in the result: {missing[:20]}")
	if round_ == "issues":
		lines_of = defaultdict(dict)
		for r in grid:
			lines_of[int(r["Comments"].split()[-1])][r["ItemCode"]] = int(r["LineNum"])
		docs = [(n, p) for n, p in enumerate(plan, start=1)]
		write_to("PROD_2a_release.txt", "po", ["AbsoluteEntry", "ProductionOrderStatus"], [[entry[p["key"]], "boposReleased"] for p in plan])
		write_to("PROD_2_issue.txt", "gi", ["DocNum", "Comments", "JournalMemo"], [[n, f"{KEY} issue {p['key']}", f"{KEY} {p['key']}"] for n, p in docs])
		# No ItemCode or WarehouseCode: a line based on a production order takes both from it, and SAP refuses
		# them when given (Z_TEST, 8 Nov: "The field should be empty if the document is referenced to a pro...").
		write_to("PROD_2_issue_lines.txt", "gi_lines", ["ParentKey", "LineNum", "BaseType", "BaseEntry", "BaseLine", "Quantity"],
			[[n, i, 202, entry[p["key"]], lines_of[p["key"]][c["old"]], c["qty"]] for n, p in docs for i, c in enumerate(p["comps"])])
		brows, bins = [], []
		for n, p in docs:
			b = 0
			for i, c in enumerate(p["comps"]):
				for k, (bn, bq) in enumerate(c["batches"]):
					brows.append([n, b, bn, bq, i])
					b += 1
			if p["whs"] in BIN:
				m = 0
				for i, c in enumerate(p["comps"]):
					for k, (_, bq) in enumerate(c["batches"] or [(None, c["qty"])]):
						bins.append([n, m, BIN[p["whs"]], bq, k if c["batches"] else "", i])
						m += 1
		write_to("PROD_2_issue_batches.txt", "gi_batches", ["ParentKey", "LineNum", "BatchNumber", "Quantity", "BaseLineNumber"], brows)
		write_to("PROD_2_issue_bins.txt", "gi_bins", ["ParentKey", "LineNum", "BinAbsEntry", "Quantity", "SerialAndBatchNumbersBaseLine", "BaseLineNumber"], bins)
		open(os.path.join(folder, "query_3.sql"), "w", encoding="utf-8").write(
			f"-- After importing PROD_2_issue: run in SSMS, Copy with Headers into Notepad, save as issued.txt, send it back. Read-only.\n"
			f"SELECT W.DocEntry, W.Comments, SUM(I.Quantity) AS IssuedQty, SUM(I.Quantity * I.StockPrice) AS IssuedValue\n"
			f"FROM {COMPANY_DB}.dbo.OWOR W JOIN {COMPANY_DB}.dbo.IGE1 I ON I.BaseType = 202 AND I.BaseEntry = W.DocEntry\n"
			f"WHERE W.Comments LIKE N'{KEY} %' AND W.Status = 'R'\nGROUP BY W.DocEntry, W.Comments ORDER BY W.DocEntry;\n")
		print(f"{len(docs)} issues for production, {sum(len(p['comps']) for p in plan)} lines, {len(brows)} batch rows, {len(bins)} bin rows")
	else:
		value = {int(r["Comments"].split()[-1]): (float(r["IssuedQty"]), float(r["IssuedValue"])) for r in grid}
		short = [k for k, p in by_key.items() if k in value and r3(value[k][0]) != p["qty"]]
		if short:
			raise SystemExit(f"orders whose issue is not the whole planned quantity: {short[:20]}")
		docs = [(n, p) for n, p in enumerate(plan, start=1)]
		price = {p["key"]: round(value[p["key"]][1] / p["qty"], 4) for p in plan}
		# A new code received in two warehouses: live's 10% rule compares the second receipt with the first.
		# Where their costs differ by more, the later receipt carries U_Approve = Y (agreed 7 Nov 2026).
		per = defaultdict(list)
		for p in plan:
			per[p["new"]].append(p)
		approve = set()
		for n, ps in per.items():
			if len(ps) > 1 and max(price[p["key"]] for p in ps) > 1.1 * min(price[p["key"]] for p in ps):
				approve |= {p["key"] for p in sorted(ps, key=lambda p: p["key"])[1:]}
		write_to("PROD_3_receipt.txt", "gr", ["DocNum", "Comments", "JournalMemo", "U_Approve"],
			[[n, f"{KEY} receipt {p['key']}", f"{KEY} {p['key']}", "Y" if p["key"] in approve else ""] for n, p in docs])
		# As the issue: item and warehouse come from the production order (see PROD_2_issue_lines).
		# No UnitPrice either: SAP prices a receipt from production itself and refuses one given (Z_TEST, 8 Nov:
		# [IGN1.PriceBefDi]). Where it prices at the item's own cost, PROD_3a_cost sets that cost first.
		write_to("PROD_3_receipt_lines.txt", "gr_lines", ["ParentKey", "LineNum", "BaseType", "BaseEntry", "TransactionType", "Quantity"],
			[[n, 0, 202, entry[p["key"]], "botrntComplete", p["qty"]] for n, p in docs])
		# An inventory revaluation (price change) per new code and warehouse, to the issued cost a unit, made
		# while the new code holds nothing — DTW's MaterialRevaluation templates (xls, so written by hand here).
		reval = [(n, p) for n, p in docs if price[p["key"]] > 0]
		def by_hand(name, heads, row2, rows):
			with open(os.path.join(folder, name), "w", encoding="utf-8", newline="") as f:
				f.write(CRLF.join(TAB.join(map(str, r)) for r in [heads, row2] + rows) + CRLF)
		by_hand("PROD_3a_cost.txt", ["DocEntry", "Comments", "JournalMemo", "RevalType"], ["DocEntry", "Comments", "JrnlMemo", "RevalType"],
			[[n, f"{KEY} cost {p['key']}", f"{KEY} {p['key']}", "P"] for n, p in reval])
		by_hand("PROD_3a_cost_lines.txt", ["ParentKey", "LineNum", "ItemCode", "Price", "WarehouseCode"], ["DocNum", "LineNum", "ItemCode", "Price", "WhsCode"],
			[[n, 0, p["new"], price[p["key"]], p["whs"]] for n, p in reval])
		brows, bins = [], []
		for n, p in docs:
			got = [(bn, bq) for c in p["comps"] for bn, bq in (c["batches"] if c["oldBatch"] else [(f"CONV-{c['old']}", c["qty"])])] if p["newBatch"] else []
			merged = defaultdict(float)
			for bn, bq in got:
				merged[bn] += bq
			for b, (bn, bq) in enumerate(sorted(merged.items())):
				brows.append([n, b, bn, r3(bq), 0])
			if p["whs"] in BIN:
				for k, (_, bq) in enumerate(sorted(merged.items()) or [(None, p["qty"])]):
					bins.append([n, k, BIN[p["whs"]], r3(bq), k if merged else "", 0])
		write_to("PROD_3_receipt_batches.txt", "gr_batches", ["ParentKey", "LineNum", "BatchNumber", "Quantity", "BaseLineNumber"], brows)
		write_to("PROD_3_receipt_bins.txt", "gr_bins", ["ParentKey", "LineNum", "BinAbsEntry", "Quantity", "SerialAndBatchNumbersBaseLine", "BaseLineNumber"], bins)
		write_to("PROD_4_close.txt", "po", ["AbsoluteEntry", "ProductionOrderStatus"], [[entry[p["key"]], "boposClosed"] for p in plan])
		print(f"{len(docs)} receipts from production, {len(brows)} batch rows, {len(bins)} bin rows, {len(plan)} orders to close; "
			f"value Rs {sum(v for _, v in value.values()):,.2f}")
		for k in sorted(approve):
			print(f"  U_Approve = Y on receipt {k}: {by_key[k]['new']} in {by_key[k]['whs']} at Rs {price[k]} (its other warehouse's cost differs by over 10%)")
else:
	raise SystemExit("round is orders, issues or receipts")
