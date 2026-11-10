# Every finished good in both companies, old code → new code, for accounts to check by hand.
#
#     python -I localdev/sap/fg_verify.py
#
# Asked 6 Nov 2026: one workbook the accounts staff compare against SAP — item, code, quantity, BOM —
# and correct in its yellow columns; the corrected copy is what the final stock-move import is built
# from. Stock, batches, prices and history are the 2 Nov live backups (ORIG_*-verify.json, exported from
# the restored copies); the new items and their BOMs are TEST's final state.
#
# Per company (PRE = Hi-Tech Pretreads, MT = Manna Treads):
#   Mapped          one row per old code that has a new code; old codes sharing a new code sit together
#   Combined        the new codes that take more than one old code, with the stock they add up to
#   Stock lines     every warehouse (and batch) holding old-code stock: the lines a stock move would carry
#   No code - stock / - history / - unused
#                   finished goods with no new code: holding stock; no stock but transactions; neither
#                   (the last are the ones that can be made inactive)
# Finished goods = Pretreads' FG, FG - TRP, HOT and Seconds groups, Manna's PRECURED, HOT, Tread Gum and
# VULCANISING SOLUTION — plus any old code management's sheet maps, wherever it is filed.
# "History" = any inventory transaction (OINM), any sales or purchase document line, a production
# order, or a place on a BOM — anything that would make deleting the item lose a record.

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, MT_SRC, OUT, PRE_SRC, load

IST = timezone(timedelta(hours=5, minutes=30))
def day(v):
	m = re.match(r"/Date\((-?\d+)\)/", str(v or ""))
	return datetime.fromtimestamp(int(m.group(1)) / 1000, IST).strftime("%Y-%m-%d") if m else ""

# DTW_FG=FINAL (7 Nov): the mapping the import files follow — management's ITEM CATEGORY NEW.xlsx, old items
# by name (fg_build.py) — stock from the source backup, and the new one-roll packing BOMs (fg_rolls.py).
FINAL = FG == "FINAL"
# DTW_NOSTOCK=1 (7 Nov): the mapping without quantities, so accounts check codes, names and BOMs now and the
# stock is filled in from the backup taken on the day. Stock-held decisions wait for that backup too.
NOSTOCK = os.environ.get("DTW_NOSTOCK") == "1"
STOCK_COLUMNS = {"Stock (backup)", "Stock by warehouse", "Stock value ₹", "Combined stock on new code", "Batches", "Committed (open SO)",
	"On order (open PO)", "Correct stock qty", "Combined stock", "Valuation old → new"}
mapping = load("fg-mapping-final.json" if FINAL else "fg-mapping.json")
new_desc = {m["new"]: m["desc"] for m in mapping}
test_boms = {b["TreeCode"]: b for b in load("FINAL_PRE-boms-new.json" if FINAL else "TEST_HITECH_PRETREADS-boms-full.json")}
orig_boms = {b["Code"]: b for b in load(f"{PRE_SRC if FINAL else 'ORIG_HITECH_PRETREADS'}-boms-full.json")}
test_names = {i["code"]: i["name"] for i in load("TEST_HITECH_PRETREADS-naming-status.json")["items"]}
if FINAL:
	test_names.update({i["ItemCode"]: i["ItemName"] for i in load("FINAL_PRE-fg-full.json")})
	test_names.update({m["sandered"]: m["name"] for m in load("EXTRA_PRE-sandered.json")})
	# Kept under their old code by the file (PCTR SAP, HOT SAP): never deactivated.
	keep_rows = load("fg-mapping-final-keep.json")

TRANS = {13: "A/R invoice", 14: "A/R credit note", 15: "delivery", 16: "sales return", 18: "A/P invoice", 19: "A/P credit note",
	20: "goods receipt PO", 21: "goods return", 59: "goods receipt", 60: "goods issue", 67: "stock transfer", 162: "revaluation",
	202: "production order", 310000001: "opening balance", 10000071: "stock posting"}
EVAL = {"A": "Moving average", "F": "FIFO", "B": "Serial/batch", "S": "Standard"}
# The quality an old name carries, longest first: most old items leave U_Quality empty.
QUALITY = [r"BLACK\s*PEARL\s+B\b", r"BLACK\s*PEA?RA?L|BACKPEARL|\bB\s?P\b", r"TRACTOR\s+SILVER", r"PLATINUM|\bPL\b", r"POLY\s*GOLD|POLGOLD",
	r"POLY\s*COLD", r"SILVER|SIVER|SLVER", r"DIAMOND|DAIMOND|DIAMAND", r"MEDIUM", r"RUBCO", r"EXCELLENT|EXLNT", r"\bGOLD\b"]
def old_quality(item):
	if item.get("Quality"):
		return item["Quality"].strip().upper()
	for pat in QUALITY:
		m = re.search(pat, item["ItemName"] or "", re.I)
		if m:
			return re.sub(r"\s+", " ", m.group(0)).upper()
	return ""

# The same product however its old name was typed (naming_status.py's rule): for a suggestion only.
def tokens(v):
	s = str(v or "").upper().replace("PRECURD", "PRECURED")
	for pat, label in ((r"\bBLACK\s+PEARL\s+B\b", "DOUBLE BLUE B"), (r"\bBLACK\s*PEA?RA?L\b|\bBACKPEARL\b|\bB\s?P\b", "DOUBLE BLUE"),
			(r"\bPLATINUM\b|\bPL\b", "BLUE"), (r"\bPOLY\s*GOLD\b|\bPOLGOLD\b", "ORANGE/VERDO"), (r"\bSILVER\b|\bSIVER\b|\bSLVER\b", "YELLOW/ROX"),
			(r"\bDIAMOND\b|\bDAIMOND\b|\bDIAMAND\b", "SINGLE WHITE")):
		s = re.sub(pat, label, s)
	s = re.sub(r"[\"'*()\-]", " ", s)
	return tuple(sorted(w for w in re.findall(r"[A-Z0-9/]+", s) if w not in ("TREAD", "RUBBER", "PRECURED", "PCTR")))
by_tokens = defaultdict(set)
for m in mapping:
	by_tokens[tokens(m["old_name"])].add(m["new"])

COMPANIES = [
	("PRE", "Hi-Tech Pretreads", "ORIG_HITECH_PRETREADS", "TEST_HITECH_PRETREADS",
		re.compile(r"^(FG\b.*|HOT|Seconds)$", re.I), {m["old"]: m["new"] for m in mapping if m["old"]}),
	("MT", "Manna Treads", "ORIG_MANNA_TREADS", "TEST_MANNA_TREADS",
		re.compile(r"^(PRECURED|HOT|Tread Gum|VULCANISING SOLUTION)$", re.I), {p["old"]: p["new"] for p in load("TEST_MANNA_TREADS-old-by-name.json")}),
]
if FINAL:
	COMPANIES = [
		("PRE", "Hi-Tech Pretreads", PRE_SRC, "FINAL_PRE", re.compile(r"^(FG\b.*|HOT|Seconds)$", re.I),
			{m["old"]: m["new"] for m in load("FINAL_PRE-mapping.json")}),
		("MT", "Manna Treads", MT_SRC, "FINAL_MT", re.compile(r"^(PRECURED|HOT|Tread Gum|VULCANISING SOLUTION)$", re.I),
			{m["old"]: m["new"] for m in load("FINAL_MT-mapping.json")}),
	]

r3 = lambda v: round(float(v or 0), 3)
r2 = lambda v: round(float(v or 0), 2)
built = []
for co, label, orig_db, test_db, fg_group, old_to_new in COMPANIES:
	d = load(f"{orig_db}-verify.json")
	items = {i["ItemCode"]: i for i in d["items"]}
	new_items = {i["ItemCode"]: i for i in load(f"{test_db}-fg-full.json")}
	whs, batches, prices, moves, docs = (defaultdict(list) for _ in range(5))
	for w in ([] if NOSTOCK else d["whs"]):
		whs[w["ItemCode"]].append(w)
	for b in ([] if NOSTOCK else d["batches"]):
		batches[b["ItemCode"]].append(b)
	for p in d["prices"]:
		prices[p["ItemCode"]].append(p)
	for m in d["moves"]:
		moves[m["ItemCode"]].append(m)
	for x in d["docs"]:
		docs[x["ItemCode"]].append(x)
	open_so = {x["ItemCode"]: x for x in d["openSO"]}
	bom_use = {x["ItemCode"]: x["N"] for x in d["bomUse"]}
	missing = sorted(o for o in old_to_new if o not in items)
	if missing:
		raise SystemExit(f"{label}: mapped old codes not in the backup: {', '.join(missing[:10])}")

	def stock(c):
		return r3(sum(w["OnHand"] for w in whs[c]))
	def value(c):
		return r2(sum(w["StockValue"] or 0 for w in whs[c]))
	def by_wh(c):
		return "; ".join(f"{w['WhsCode']} {w['WhsName']}: {r3(w['OnHand']):g}" for w in sorted(whs[c], key=lambda w: w["WhsCode"]) if w["OnHand"])
	def history(c):
		parts, last = [], ""
		for m in sorted(moves[c], key=lambda m: -m["N"]):
			parts.append(f"{m['N']} {TRANS.get(m['TransType'], m['TransType'])}")
			last = max(last, day(m["Last"]))
		seen = {TRANS.get(m["TransType"]) for m in moves[c]}
		for x in sorted(docs[c], key=lambda x: -x["N"]):
			if x["Doc"] not in seen:  # an invoice or delivery is in OINM already; orders and quotations are not
				parts.append(f"{x['N']} {x['Doc']} lines")
			last = max(last, day(x["Last"]))
		if c in bom_use:
			parts.append(f"on {bom_use[c]} BOM(s)")
		if c in orig_boms and co == "PRE":
			parts.append("own BOM")
		return ", ".join(parts), last
	def bom_text(b, lines_key, code_key, names):
		if not b:
			return ""
		return f"makes {b.get('Quantity', b.get('Qauntity')):g}: " + " | ".join(
			f"{l[code_key]} {names.get(l[code_key], '')} × {float(l['Quantity']):g}" for l in b[lines_key])
	orig_names = {c: i["ItemName"] for c, i in items.items()}

	scope = [i for c, i in items.items() if fg_group.match(i["ItmsGrpNam"] or "") or c in old_to_new]
	mapped, unmapped = [], []
	for i in scope:
		c = i["ItemCode"]
		hist, last = history(c)
		base = {"code": c, "name": i["ItemName"], "group": i["ItmsGrpNam"], "quality": old_quality(i), "active": i["validFor"] == "Y" and i["frozenFor"] != "Y",
			"uom": i["InvntryUom"] or "", "batch": i["ManBtchNum"] == "Y", "eval": EVAL.get(i["EvalSystem"], i["EvalSystem"]),
			"stock": stock(c), "value": value(c), "byWh": by_wh(c), "committed": r3(sum(w["IsCommited"] for w in whs[c])),
			"ordered": r3(sum(w["OnOrder"] for w in whs[c])), "openSO": open_so.get(c, {}).get("N", 0),
			"batches": len(batches[c]), "prices": "; ".join(f"{p['ListName']}: {p['Price']:g}" for p in sorted(prices[c], key=lambda p: p["PriceList"])),
			"history": hist, "last": last, "created": day(i["CreateDate"])}
		if c in old_to_new:
			n = old_to_new[c]
			ni = new_items.get(n, {})
			base.update(new=n, desc=new_desc[n], link=ni.get("ForeignName"), descQ=f"{new_desc[n]} ({base['quality']})" if base["quality"] else new_desc[n],
				newUom=ni.get("InventoryUOM") or "", newBatch=ni.get("ManageBatchNumbers") == "tYES",
				newEval={"bis_MovingAverage": "Moving average", "bis_FIFO": "FIFO", "bis_SNB": "Serial/batch", "bis_Standard": "Standard"}.get(ni.get("CostAccountingMethod"), ""),
				oldBom=bom_text(orig_boms.get(c), "lines", "Code", orig_names) if co == "PRE" else "",
				newBom=bom_text(test_boms.get(n), "ProductTreeLines", "ItemCode", test_names) if co == "PRE" else "")
			mapped.append(base)
		else:
			sug = sorted(by_tokens.get(tokens(i["ItemName"]), ()))
			base.update(sug=", ".join(sug), sugDesc=" | ".join(new_desc[s] for s in sug))
			unmapped.append(base)

	# Old codes that land on one new code: their stock adds up there.
	group = defaultdict(list)
	for r in mapped:
		group[r["new"]].append(r)
	for r in mapped:
		g = group[r["new"]]
		r["merged"] = len(g)
		r["combined"] = r3(sum(x["stock"] for x in g))
		flags = []
		if r["stock"] and not r["active"]:
			flags.append("old item inactive but holds stock")
		if r["stock"] < 0:
			flags.append("negative stock")
		if r["uom"].upper() != r["newUom"].upper():
			flags.append(f"unit {r['uom']} → {r['newUom']}")
		if r["batch"] != r["newBatch"]:
			flags.append("batch handling differs from the new item")
		if r["stock"] and r["eval"] != r["newEval"]:
			flags.append(f"valuation {r['eval']} → {r['newEval']}")
		if r["openSO"]:
			flags.append(f"{r['openSO']} open sales order line(s) on the old code")
		elif r["committed"]:
			flags.append(f"{r['committed']:g} committed on the old code, no open sales order line")
		if len(g) > 1 and len({x["oldBom"].split(": ", 1)[-1] for x in g if x["oldBom"]}) > 1:
			flags.append("merged old codes have different BOMs")
		if len(g) > 1 and len({x["uom"].upper() for x in g}) > 1:
			flags.append("merged old codes use different units")
		r["flags"] = "; ".join(flags)
	mapped.sort(key=lambda r: (r["new"], -r["stock"], r["code"]))
	if FINAL:
		# The file's rules (7 Nov): items it keeps under their old code stay active; the rest are made
		# inactive unless they still hold stock or an open quantity, which waits for a decision.
		normn = lambda v: re.sub(r"[^A-Z0-9]", "", str(v or "").upper().replace("PRECURD", "PRECURED"))
		kept_names = {normn(r["name"]) for r in keep_rows}
		kept_codes = {r["old"] for r in keep_rows} if co == "PRE" else set()
		for r in unmapped:
			r["kind"] = ("keep" if r["code"] in kept_codes or normn(r["name"]) in kept_names else "notinfile" if NOSTOCK
				else "stock" if r["stock"] or r["committed"] or r["ordered"] else "deactivate")
	else:
		for r in unmapped:
			r["kind"] = "stock" if r["stock"] or r["committed"] or r["ordered"] else "history" if r["history"] else "unused"
	unmapped.sort(key=lambda r: (-abs(r["stock"]), r["code"]))
	lines = []
	for r in mapped + [u for u in unmapped if u["stock"]]:
		c = r["code"]
		cost = {w["WhsCode"]: w for w in whs[c]}
		if batches[c]:
			for b in sorted(batches[c], key=lambda b: (b["WhsCode"], b["DistNumber"])):
				w = cost.get(b["WhsCode"], {})
				lines.append([c, r["name"], b["WhsCode"], w.get("WhsName", ""), b["DistNumber"], day(b["InDate"]), r3(b["Quantity"]), r2(w.get("AvgPrice")), r2(b["Quantity"] * (w.get("AvgPrice") or 0)), r.get("new", ""), r.get("desc", "")])
			held = Counter()
			for b in batches[c]:
				held[b["WhsCode"]] += b["Quantity"]
			for w in whs[c]:
				if w["OnHand"] and abs(held[w["WhsCode"]] - w["OnHand"]) > 0.001:
					lines.append([c, r["name"], w["WhsCode"], w["WhsName"], "(not in any batch)", "", r3(w["OnHand"] - held[w["WhsCode"]]), r2(w["AvgPrice"]), "", r.get("new", ""), r.get("desc", "")])
		else:
			for w in sorted(whs[c], key=lambda w: w["WhsCode"]):
				if w["OnHand"]:
					lines.append([c, r["name"], w["WhsCode"], w["WhsName"], "", "", r3(w["OnHand"]), r2(w["AvgPrice"]), r2(w["StockValue"]), r.get("new", ""), r.get("desc", "")])
	no_old = sorted(set(new_items) - set(old_to_new.values()))
	built.append((co, label, mapped, unmapped, lines, no_old, new_items))

HEAD_FILL, DECIDE_HEAD, DECIDE_FILL, FLAG_FILL = (PatternFill("solid", fgColor=c) for c in ("1F4E78", "BF8F00", "FFF2CC", "F8CBAD"))
def sheet(wb, title, cols, rows, decide=(), wide=(), flag=None):
	ws = wb.create_sheet(title)
	heads = [h for h, _ in cols] + list(decide)
	ws.append(heads)
	for r in rows:
		ws.append([f(r) for _, f in cols] + [None] * len(decide))
	for n, h in enumerate(heads, start=1):
		x = ws.cell(row=1, column=n)
		x.font = Font(color="FFFFFF", bold=True)
		x.fill = DECIDE_HEAD if h in decide else HEAD_FILL
		x.alignment = Alignment(wrap_text=True, vertical="top")
		ws.column_dimensions[get_column_letter(n)].width = 22 if h in decide else 48 if h in wide else 13
		if h in decide:
			for k in range(2, ws.max_row + 1):
				ws.cell(row=k, column=n).fill = DECIDE_FILL
	if flag:
		at = heads.index(flag) + 1
		for k in range(2, ws.max_row + 1):
			if ws.cell(row=k, column=at).value:
				ws.cell(row=k, column=at).fill = FLAG_FILL
	ws.row_dimensions[1].height = 45
	ws.freeze_panes = "C2"
	ws.auto_filter.ref = ws.dimensions
	return ws

yn = lambda v: "Y" if v else "N"
MAPPED = [
	("New code", lambda r: r["new"]), ("New description", lambda r: r["desc"]), ("New description (old quality)", lambda r: r["descQ"]),
	("New item's Foreign Name", lambda r: r.get("link") or ""), ("Old codes on this new code", lambda r: r["merged"]), ("Old code", lambda r: r["code"]), ("Old name", lambda r: r["name"]),
	("Old group", lambda r: r["group"]), ("Old quality", lambda r: r["quality"]), ("Old active", lambda r: yn(r["active"])),
	("Stock (backup)", lambda r: r["stock"]), ("Stock by warehouse", lambda r: r["byWh"]), ("Stock value ₹", lambda r: r["value"]),
	("Combined stock on new code", lambda r: r["combined"]), ("Batches", lambda r: r["batches"] or ""),
	("Committed (open SO)", lambda r: r["committed"] or ""), ("On order (open PO)", lambda r: r["ordered"] or ""),
	("Unit old → new", lambda r: f"{r['uom']} → {r['newUom']}"), ("Batch-managed old → new", lambda r: f"{yn(r['batch'])} → {yn(r['newBatch'])}"),
	("Valuation old → new", lambda r: f"{r['eval']} → {r['newEval']}"), ("Old prices", lambda r: r["prices"]),
	("Old BOM (live)", lambda r: r["oldBom"]), ("New BOM", lambda r: r["newBom"]),
	("Last transaction", lambda r: r["last"]), ("Check this", lambda r: r["flags"]),
]
MAPPED_DECIDE = ("OK? (Y/N)", "Correct new code", "Correct new description", "Correct stock qty", "Remarks")
UNMAPPED = [
	("Old code", lambda r: r["code"]), ("Old name", lambda r: r["name"]), ("Group", lambda r: r["group"]), ("Quality", lambda r: r["quality"]),
	("Active", lambda r: yn(r["active"])), ("Stock (backup)", lambda r: r["stock"]), ("Stock by warehouse", lambda r: r["byWh"]),
	("Stock value ₹", lambda r: r["value"]), ("Committed (open SO)", lambda r: r["committed"] or ""), ("On order (open PO)", lambda r: r["ordered"] or ""),
	("Unit", lambda r: r["uom"]), ("Batch-managed", lambda r: yn(r["batch"])), ("Prices", lambda r: r["prices"]),
	("History", lambda r: r["history"]), ("Last transaction", lambda r: r["last"]), ("Created", lambda r: r["created"]),
	("Same product as new code (suggestion)", lambda r: r["sug"]), ("Its description", lambda r: r["sugDesc"]),
]
UNMAPPED_DECIDE = ("Decision (Map / Keep / Deactivate)", "New code", "New description", "Remarks")
STOCK = [("Old code", lambda r: r[0]), ("Old name", lambda r: r[1]), ("Warehouse", lambda r: r[2]), ("Warehouse name", lambda r: r[3]),
	("Batch", lambda r: r[4]), ("Batch received", lambda r: r[5]), ("Qty (backup)", lambda r: r[6]), ("Unit cost ₹", lambda r: r[7]),
	("Value ₹", lambda r: r[8]), ("New code", lambda r: r[9] or "(no new code)"), ("New description", lambda r: r[10])]
STOCK_DECIDE = ("Verified qty", "Remarks")

wb = openpyxl.Workbook()
info = wb.active
info.title = "Read me"
out = [["Finished goods: old codes → new codes, for checking", ""], [],
	[(f"Mapping: management's ITEM CATEGORY NEW.xlsx (old items found by name). Old items' prices, BOMs and history: Pretreads from {PRE_SRC}, Manna from {MT_SRC}. New items and BOMs: the import files." if NOSTOCK
		else f"Mapping: management's ITEM CATEGORY NEW.xlsx (old items found by name). Stock, batches, prices and history ('backup' columns): Pretreads from {PRE_SRC}, Manna from {MT_SRC} ({os.environ.get('DTW_ASOF', 'see the backup dates')}). New items and BOMs: the import files." if FINAL
		else "Stock, batches, prices and history are as on 2 Nov 2026 (the live backup). New items and BOMs are the final ones built in TEST."), ""], []]
for co, label, mapped, unmapped, lines, no_old, new_items in built:
	k = Counter(r["kind"] for r in unmapped)
	sk = lambda kind: r3(sum(r["stock"] for r in unmapped if r["kind"] == kind))
	if NOSTOCK:
		out += [[label, ""], ["  Old codes with a new code", len(mapped)],
			["    new codes taking more than one old code", sum(1 for n in {r["new"] for r in mapped} if sum(1 for r in mapped if r["new"] == n) > 1)],
			["  Finished goods with no new code", len(unmapped)], ["    kept under the old code (PCTR SAP / HOT SAP)", k["keep"]],
			["    not in the file: made inactive, unless they still hold stock on the day", k["notinfile"]],
			["  New codes with no old item (nothing to move)", len(no_old)], []]
		continue
	out += [[label, ""],
		["  Old codes with a new code", len(mapped)], ["    holding stock", sum(1 for r in mapped if r["stock"])], ["    stock (kg)", r3(sum(r["stock"] for r in mapped))],
		["    new codes taking more than one old code", sum(1 for n in {r["new"] for r in mapped} if sum(1 for r in mapped if r["new"] == n) > 1)],
		["    rows with something to check (pink)", sum(1 for r in mapped if r["flags"])],
		["  Finished goods with no new code", len(unmapped)]] + ([
		["    kept under the old code (PCTR SAP / HOT SAP)", k["keep"]], ["    their stock (kg)", sk("keep")],
		["    not in the file, holding stock or open orders (decision)", k["stock"]], ["    their stock (kg)", sk("stock")],
		["    not in the file, nothing held (made inactive in step 14 / M4)", k["deactivate"]]] if FINAL else [
		["    holding stock (or open orders)", k["stock"]], ["    their stock (kg)", sk("stock")],
		["    no stock, but history", k["history"]], ["    no stock and no history (can be made inactive)", k["unused"]]]) + [
		["  New codes with no old item (nothing to move)", len(no_old)],
		["  Stock lines (warehouse / batch)", len(lines)], ["  All finished-good stock (kg)", r3(sum(r["stock"] for r in mapped) + sum(r["stock"] for r in unmapped))], []]
out += [
	["How to use", ""],
	["1", "Check each sheet against SAP. Fill the yellow columns only; leave the blue ones as they are, the import is matched on the codes in them."],
	["2", "Mapped: OK = Y when code, name, quantity and BOM are right. Otherwise fill the correct value beside it and say why in Remarks."],
	["3", "Combined: the stock of every old code on a new code is added up there. Check the total is what should be on the new code."],
	["4", "Stock lines: one row per warehouse (and batch). Fill Verified qty with what is really there; this is what the stock move will carry."],
	["5", "No code sheets: Map (give the new code and description), Keep (stays as it is), or Deactivate. Only items with no stock should be deactivated."],
	["6", "The quantities are the backup's; the stock move is built again from the backup taken on the day, so this file is for checking the mapping and the stock."],
	["Old code link", "Each new item's Foreign Name reads 'OLD: <old code(s)>' — shown in 'New item's Foreign Name'."],
	["Pink", "'Check this' flags a row that needs a decision: different unit or batch handling, open sales orders, stock on an inactive item, merged codes with different BOMs."],
	["Quality", "'Old quality' is U_Quality where the old item has one, else the quality word in its old name."],
]
for line in out:
	info.append(line)
info["A1"].font = Font(bold=True, size=14)
info.column_dimensions["A"].width = 52
info.column_dimensions["B"].width = 120

for co, label, mapped, unmapped, lines, no_old, new_items in built:
	sheet(wb, f"{co} Mapped", MAPPED, mapped, MAPPED_DECIDE, {"New description", "New description (old quality)", "Old name", "Stock by warehouse", "Old BOM (live)", "New BOM", "Check this", "Old prices"}, "Check this")
	comb = defaultdict(list)
	for r in mapped:
		comb[r["new"]].append(r)
	rows = [{"new": n, "desc": g[0]["desc"], "n": len(g), "olds": "; ".join(f"{r['code']} {r['name']}" + ("" if NOSTOCK else f": {r['stock']:g}") for r in g),
		"total": g[0]["combined"], "flags": "; ".join(sorted({f for r in g for f in r["flags"].split("; ") if f and ("merged" in f or "unit" in f or "batch" in f)}))}
		for n, g in sorted(comb.items()) if len(g) > 1]
	sheet(wb, f"{co} Combined", [("New code", lambda r: r["new"]), ("New description", lambda r: r["desc"]), ("Old codes", lambda r: r["n"]),
		("Old codes and their stock", lambda r: r["olds"]), ("Combined stock", lambda r: r["total"]), ("Check this", lambda r: r["flags"])],
		rows, ("OK? (Y/N)", "Remarks"), {"New description", "Old codes and their stock", "Check this"}, "Check this")
	if not NOSTOCK:
		sheet(wb, f"{co} Stock lines", STOCK, lines, STOCK_DECIDE, {"Old name", "New description"})
	kinds = ((("keep", "No code - kept (in file)"), ("notinfile", "Not in file - to deactivate")) if NOSTOCK
		else (("keep", "No code - kept (in file)"), ("stock", "Not in file - holds stock"), ("deactivate", "Not in file - deactivated")) if FINAL
		else (("stock", "No code - stock"), ("history", "No code - history"), ("unused", "No code - unused")))
	for kind, title in kinds:
		sheet(wb, f"{co} {title}", UNMAPPED, [r for r in unmapped if r["kind"] == kind], UNMAPPED_DECIDE,
			{"Old name", "Stock by warehouse", "History", "Its description", "Prices"})
	sheet(wb, f"{co} New, no old item", [("New code", lambda c: c), ("New description", lambda c: new_desc[c])], no_old, (), {"New description"})

for ws in wb.worksheets[1:]:
	for row in ws.iter_rows(min_row=2):
		for x in row:
			x.alignment = Alignment(wrap_text=True, vertical="top")
if NOSTOCK:
	# The quantity columns go: they come back with the stock from the backup taken on the day.
	for ws in wb.worksheets[1:]:
		heads = [c.value for c in ws[1]]
		for i in sorted((i for i, h in enumerate(heads, start=1) if h in STOCK_COLUMNS or (h or "").startswith("Old codes and their")), reverse=True):
			ws.delete_cols(i)
	for ws in wb.worksheets[1:]:
		for c in ws[1]:
			if c.value == "Old codes and their stock":
				c.value = "Old codes"
	ws = wb["Read me"]
	ws.insert_rows(3)
	ws["A3"] = "NO STOCK IN THIS VERSION: quantities, values and warehouse lines are added from the backup taken on the day of the import."
	ws["A3"].font = Font(bold=True, color="C00000")
dest = os.path.join(OUT, "FG-mapping-verification.xlsx" if NOSTOCK else "FG-stock-verification.xlsx")
wb.save(dest)
for co, label, mapped, unmapped, lines, no_old, new_items in built:
	print(f"{label}: mapped {len(mapped)} ({sum(1 for r in mapped if r['stock'])} with stock, {r3(sum(r['stock'] for r in mapped))} kg), "
		f"no code {dict(Counter(r['kind'] for r in unmapped))}, stock lines {len(lines)}, new without old {len(no_old)}")
print(dest)
