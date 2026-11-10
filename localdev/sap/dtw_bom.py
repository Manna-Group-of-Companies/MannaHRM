# The BOM changes made in TEST, as DTW files for the live Hi-Tech Pretreads company.
#
#     python -I localdev/sap/dtw_bom.py                                  against the 2 Nov backup
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/dtw_bom.py  against a later one
#
# Three versions of every BOM: 2 Nov (ORIG_HITECH_PRETREADS, the copy TEST was made from), live as the
# source backup holds it, and TEST's final state (bom_read.mjs). Writes, each a header and a lines file:
#   DTW_BOM_1_new        ProductTrees, add: the sandering BOMs and the new finished goods' packing BOMs
#   DTW_BOM_2_changed    ProductTrees, update: every line rewritten by its position, in TEST's order
#   DTW_BOM_3_names      ProductTrees, update: only the header's copy of a renamed item's name
#   DTW_BOM_review.xlsx
#
# Rules:
#   A BOM TEST left as it was on 2 Nov is not written, whatever live did to it since.
#   Firewood and flash (decided 6 Nov): where live's BOM has the line, live's figure stays, scaled to the
#   quantity TEST makes (TEST brings every BOM to 1); stageboms.mjs's 0.3 and -0.2 go only where live
#   has no such line. Production edits these figures in live and those edits must survive.
#   A BOM whose other lines or quantity live changed since 2 Nov, and TEST changed too, is left alone
#   and listed: one of the two would be lost.
#   A changed BOM never has fewer lines than live's: updating by position rewrites the old lines and adds
#   the new ones after, and DTW cannot delete a line.
# DTW's ITT1 template has no ItemName, so a line's copy of a renamed item's name cannot be set: SAP shows
# the copy and calculates nothing on it. The header's copy (ProductDescription) can, in file 3.
# The sandered codes are TEST's, I-14649…I-15260 (dtw_sandered.py). Manna Treads has no BOMs.

import os
import sys

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import FG, OUT, PRE_BASE, PRE_SRC, dtw, load, sandered_pairs

test = load("TEST_HITECH_PRETREADS-boms-full.json")
if FG == "FINAL":
	# The new finished goods' packing BOMs are fg_build.py's, from the final list; TEST's were built for
	# the first sheet's codes and are dropped. Every other BOM is still TEST's.
	first = {m["new"] for m in load("fg-mapping.json")}
	test = [b for b in test if b["TreeCode"] not in first] + load("FINAL_PRE-boms-new.json")
	# The sandering and curing BOMs with production's per-roll figures (fg_rolls.py, 7 Nov) replace TEST's.
	stage = load("FINAL_PRE-boms-stage.json")
	staged = {b["TreeCode"] for b in stage}
	test = [b for b in test if b["TreeCode"] not in staged] + stage
base = {b["Code"]: b for b in load(f"{PRE_BASE}-boms-full.json")}
live = {b["Code"]: b for b in load(f"{PRE_SRC}-boms-full.json")}
items = {i["code"]: i for i in load("TEST_HITECH_PRETREADS-naming-status.json")["items"]}
live_items = {i["code"]: i for i in load(f"{PRE_SRC}-items.json")}
base_items = {i["code"]: i for i in load(f"{PRE_BASE}-items.json")}
sandered = {m["sandered"] for m in sandered_pairs()}
new_fg = {m["new"] for m in load("fg-mapping-final.json" if FG == "FINAL" else "fg-mapping.json")}
FIREWOOD, FLASH = "I-13163", "I-10178"

IM = {"im_Manual": "M", "im_Backflush": "B"}
IT = {"pit_Item": "4", "pit_Resource": "290", "pit_Text": "-18"}
TT = {"iProductionTree": "P", "iAssemblyTree": "A", "iSalesTree": "S", "iTemplateTree": "T"}
YN = {"tYES": "Y", "tNO": "N"}
txt = lambda v: "" if v is None else str(v).strip()
num = lambda v: round(float(v or 0), 6)
fmt = lambda v: f"{round(float(v), 6):g}" if v not in (None, "") else ""
name = lambda c: (items.get(c) or {}).get("name", "")

# Every BOM in one shape: (header, [lines]) with TEST's field names.
def from_db(b):
	head = {"Quantity": b["Qauntity"], "TreeType": {v: k for k, v in TT.items()}[b["TreeType"]], "Warehouse": b["ToWH"], "PriceList": b["PriceList"],
		"PlanAvgProdSize": b["PlAvgSize"], "HideBOMComponentsInPrintout": {"Y": "tYES", "N": "tNO"}[b["HideComp"]], "ProductDescription": b["Name"]}
	lines = [{"ItemCode": l["Code"], "Quantity": l["Quantity"], "Warehouse": l["Warehouse"], "IssueMethod": {v: k for k, v in IM.items()}.get(l["IssueMthd"], l["IssueMthd"]),
		"PriceList": l["PriceList"], "ItemType": {v: k for k, v in IT.items()}.get(str(l["Type"]), l["Type"]), "AdditionalQuantity": l["AddQuantit"],
		"Comment": l["Comment"], "LineText": l["LineText"]} for l in b["lines"]]
	return head, lines
def line_sig(l):
	return (l["ItemCode"], num(l["Quantity"]), txt(l["Warehouse"]), l["IssueMethod"], num(l["AdditionalQuantity"]), str(l["ItemType"]), txt(l["Comment"]), txt(l["LineText"]))
def sig(head, lines, skip=()):
	return (num(head["Quantity"]), head["TreeType"], txt(head["Warehouse"]), head["PriceList"], num(head["PlanAvgProdSize"]), head["HideBOMComponentsInPrintout"],
		tuple(line_sig(l) for l in lines if l["ItemCode"] not in skip))

problems, new, changed, names, left, notes = [], [], [], [], [], []
for t in sorted(test, key=lambda b: b["TreeCode"]):
	code = t["TreeCode"]
	th = {k: t[k] for k in ("Quantity", "TreeType", "Warehouse", "PriceList", "PlanAvgProdSize", "HideBOMComponentsInPrintout", "ProductDescription")}
	tl = [{k: l[k] for k in ("ItemCode", "Quantity", "Warehouse", "IssueMethod", "PriceList", "ItemType", "AdditionalQuantity", "Comment", "LineText")} for l in t["ProductTreeLines"]]
	if t.get("ProductTreeStages"):
		problems.append(f"{code}: has stages, which these files do not carry")
	b, l = base.get(code), live.get(code)
	if not l:
		if b:
			left.append((code, "deleted in live since 2 Nov", "", ""))
			continue
		kind = "sandering" if code in sandered else "packing (new FG)" if code in new_fg else None
		if not kind:
			problems.append(f"{code}: new in TEST but neither sandered nor a new FG")
		new.append((code, th, tl, kind))
		continue
	bh, bl = from_db(b) if b else (None, None)
	lh, ll = from_db(l)
	if b and sig(th, tl) == sig(bh, bl):
		if th["ProductDescription"] != lh["ProductDescription"] and th["ProductDescription"] != bh["ProductDescription"]:
			names.append((code, lh["ProductDescription"], th["ProductDescription"]))
		continue
	# Firewood and flash: live's figure where live has the line, scaled to what TEST's BOM makes (6 Nov).
	# On the final list (7 Nov) production's fixed figures replace live's everywhere instead.
	kept = []
	for x in ([] if FG == "FINAL" else tl):
		if x["ItemCode"] in (FIREWOOD, FLASH):
			mine = next((y for y in ll if y["ItemCode"] == x["ItemCode"]), None)
			if mine is not None:
				q = round(float(mine["Quantity"]) * float(th["Quantity"]) / float(lh["Quantity"]), 6)
				if num(q) != num(x["Quantity"]):
					kept.append(f"{name(x['ItemCode']) or x['ItemCode']} {fmt(x['Quantity'])} → live's {fmt(q)}")
				x["Quantity"] = q
	skip = (FIREWOOD, FLASH)
	if b and sig(lh, ll, skip) != sig(bh, bl, skip) and sig(lh, ll, skip) != sig(th, tl, skip):
		left.append((code, "live changed it since 2 Nov, and so did TEST", " | ".join(f"{y['ItemCode']} {fmt(y['Quantity'])}" for y in ll),
			" | ".join(f"{y['ItemCode']} {fmt(y['Quantity'])}" for y in tl)))
		continue
	if sig(th, tl) == sig(lh, ll):
		if th["ProductDescription"] != lh["ProductDescription"]:
			names.append((code, lh["ProductDescription"], th["ProductDescription"]))
		continue
	if len(tl) < len(ll):
		problems.append(f"{code}: {len(ll)} lines in live, {len(tl)} after — DTW cannot remove one")
	for x in tl:
		it, li = items.get(x["ItemCode"]), live_items.get(x["ItemCode"])
		if x["ItemType"] == "pit_Item" and (not it or not it["active"]):
			problems.append(f"{code}: line {x['ItemCode']} is {'missing' if not it else 'inactive'} in TEST")
		bi = base_items.get(x["ItemCode"])
		if li and bi and li["name"] != bi["name"]:
			notes.append((code, f"line {x['ItemCode']} was {bi['name']!r} on 2 Nov and is {li['name']!r} in live now"))
	added = [x["ItemCode"] for x in tl if x["ItemCode"] not in {y["ItemCode"] for y in ll}]
	what = []
	if num(th["Quantity"]) != num(lh["Quantity"]):
		what.append(f"makes {fmt(lh['Quantity'])} → {fmt(th['Quantity'])}")
	if added:
		what.append("adds " + ", ".join(f"{c} {name(c)}" for c in added))
	if kept:
		what.append("keeps live's " + "; ".join(kept))
	if not added and sorted(map(line_sig, tl)) == sorted(map(line_sig, ll)):
		what.append("lines reordered")
	changed.append((code, th, tl, lh, ll, "; ".join(what) or "quantities"))
if problems:
	raise SystemExit("Nothing written:\n  " + "\n  ".join(problems[:40]))

HEAD = ["TreeCode", "TreeType", "Quantity", "Warehouse", "PriceList", "PlanAvgProdSize", "HideBOMComponentsInPrintout", "ProductDescription"]
LINE = ["ParentKey", "LineNum", "ItemCode", "Quantity", "Warehouse", "IssueMethod", "PriceList", "ItemType", "AdditionalQuantity", "Comment", "LineText"]
def head_row(code, h):
	return [code] + [fmt(h[f]) if f in ("Quantity", "PlanAvgProdSize") else txt(h[f]) for f in HEAD[1:]]
def line_rows(code, lines):
	return [[code, i] + [fmt(x[f]) if f in ("Quantity", "AdditionalQuantity") else txt(x[f]) for f in LINE[2:]] for i, x in enumerate(lines)]

# Sandering BOMs first: a reader checking the file meets them in the order production does.
# 8 Nov: a new finished good's BOM header names it as the item does, old quality in brackets.
if FG == "FINAL":
	from dtw_common import new_names
	_nn = new_names()
	for _c, _h, *_ in new:
		if _c in _nn:
			_h["ProductDescription"] = _nn[_c]
new.sort(key=lambda x: (x[3] != "sandering", x[0]))
dtw("DTW_BOM_1_new.txt", "bom", HEAD, [head_row(c, h) for c, h, _, _ in new])
dtw("DTW_BOM_1_new_lines.txt", "bom_lines", LINE, [r for c, _, ls, _ in new for r in line_rows(c, ls)])
dtw("DTW_BOM_2_changed.txt", "bom", HEAD, [head_row(c, h) for c, h, *_ in changed])
dtw("DTW_BOM_2_changed_lines.txt", "bom_lines", LINE, [r for c, _, ls, *_ in changed for r in line_rows(c, ls)])
dtw("DTW_BOM_3_names.txt", "bom", ["TreeCode", "ProductDescription"], [[c, to] for c, _, to in names])

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
		ws.column_dimensions[get_column_letter(c)].width = 60 if h in wide else 16
	ws.freeze_panes = "B2"
	ws.auto_filter.ref = ws.dimensions

show = lambda h, ls: f"makes {fmt(h['Quantity'])}: " + " | ".join(f"{x['ItemCode']} {fmt(x['Quantity'])}" for x in ls)
count = lambda kind: sum(1 for *_, k in new if k == kind)
wb = openpyxl.Workbook()
info = wb.active
info.title = "How to import"
for line in [
	["DTW_BOM_1_new (+ _lines)", f"{len(new)} new BOMs (Bill of Materials, add new): {count('sandering')} sandering, {count('packing (new FG)')} packing for the new finished goods"],
	["DTW_BOM_2_changed (+ _lines)", f"{len(changed)} existing BOMs (update existing), every line rewritten by its position: "
		+ f"{sum('adds' in w for *_, w in changed)} gain lines, {sum('makes' in w for *_, w in changed)} now make 1, {sum('keeps live' in w for *_, w in changed)} keep live's firewood or flash"],
	["DTW_BOM_3_names", f"{len(names)} BOMs whose only change is the header's copy of a renamed item's name. Cosmetic; can wait"],
	["Left alone", f"{len(left)} BOMs changed in live since 2 Nov in a way the import would undo — see the sheet"],
	[],
	["Before", "All item files imported (SFG, sandered, FG). The sandered items must have come out as I-14649 … I-15260."],
	["Order", "1, then 2, then 3. Try 3 BOMs of each first and open them in SAP."],
	["Update", "In file 2, LineNum is the line's position (0 = first). A line beyond the BOM's last is added; none is removed."],
	["Firewood / flash", "Final list (7 Nov): firewood 0.3 kg per kg; flash 0.2 kg and sandering powder 0.15 kg per roll, as per kg of the item's roll weight (FINAL_PRE-rollweights.json). Packing BOMs make one roll." if FG == "FINAL"
		else "Live's figure where live has the line (scaled to make 1); 0.3 and -0.2 only where it has none (decided 6 Nov)."],
	["Built against", f"{PRE_SRC} (live as restored on this PC), with 2 Nov's copy ({PRE_BASE}) to tell live's changes from ours"],
]:
	info.append(line)
info.column_dimensions["A"].width = 30
info.column_dimensions["B"].width = 150
sheet(wb, "New", ["BOM", "Kind", "Name", "Lines"], [[c, k, h["ProductDescription"], show(h, ls)] for c, h, ls, k in new], {"Name", "Lines"})
sheet(wb, "Changed", ["BOM", "Name", "What changes", "Live now", "After import"],
	[[c, h["ProductDescription"], w, show(lh, ll), show(h, ls)] for c, h, ls, lh, ll, w in changed], {"Name", "What changes", "Live now", "After import"})
sheet(wb, "Names only", ["BOM", "Header name in live", "After import"], [list(x) for x in names], {"Header name in live", "After import"})
sheet(wb, "Left alone", ["BOM", "Why", "Live now", "TEST"], [list(x) for x in left], {"Why", "Live now", "TEST"})
sheet(wb, "Check", ["BOM", "Note"], [list(x) for x in notes], {"Note"})
wb.save(os.path.join(OUT, "DTW_BOM_review.xlsx"))
print(f"{PRE_SRC}: new {len(new)} ({count('sandering')} sandering, {count('packing (new FG)')} packing), changed {len(changed)} "
	f"({sum('keeps live' in w for *_, w in changed)} keep live's firewood/flash), names {len(names)}, left alone {len(left)}, notes {len(notes)}")
for c, why, *_ in left:
	print("  left alone:", c, why)
for c, n in notes:
	print("  check:", c, n)
