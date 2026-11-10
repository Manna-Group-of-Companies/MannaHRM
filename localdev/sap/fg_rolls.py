# Production's figures on the roll (7 Nov 2026), applied to the BOMs fg_build.py and TEST hold.
#
#     python -I localdev/sap/fg_rolls.py          after fg_build.py; dtw_bom.py reads what it writes
#
# Decided 7 Nov:
#   a PCTR finished good's packing BOM makes one roll: header = the final list's weight per roll, the
#   sandered item = that weight, stretch film 0.1 kg a roll, every other line its old per-kg figure
#   times the roll weight. Labels and bags (NOS) are not rounded to whole numbers: the old BOMs give
#   most codes about half a barcode sticker a roll, and a whole number would be a figure nobody gave —
#   they are listed for production instead (FINAL_PRE-roll-counts.json). HOT, bonding gum and
#   solution carry no roll weight and keep their BOMs.
#   sandering powder 0.15 kg and flash 0.2 kg come out per roll; firewood goes in at 0.3 kg per kg.
#   Powder sits on the sandering BOM and flash on the curing BOM, per kg, so each is divided by a
#   roll weight: the most common one among the final list's finished goods packed from that sandered
#   item, else among the first list's, else the most common overall — listed for review. These replace
#   live's own firewood and flash figures everywhere (decided 7 Nov, over 6 Nov's keep-live rule).
#
# Writes out/FINAL_PRE-boms-new.json (packing, in place) and out/FINAL_PRE-boms-stage.json (sandering
# and curing BOMs, replacing TEST's), and out/FINAL_PRE-rollweights.json.

import json
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import OUT, PRE_SRC, load, sandered_pairs

POWDER, FLASH, FIREWOOD = "I-10176", "I-10178", "I-13163"
FILMS = {"I-10098", "I-14497"}
r3 = lambda n: round(n * 1000) / 1000
save = lambda name, data: json.dump(data, open(os.path.join(OUT, name), "w", encoding="utf-8"), indent=1, default=str)

final_w = {r["new"]: float(r["weight_per_roll"]) for r in load("fg-mapping-final.json") if r.get("weight_per_roll")}
first_w = {r["new"]: float(r["weight_per_roll"]) for r in load("fg-mapping.json") if r.get("weight_per_roll")}
pairs = sandered_pairs()
sandered_of = {m["cured"]: m["sandered"] for m in pairs}
sandered = set(sandered_of.values())
items = {i["ItemCode"]: i for i in load(f"{PRE_SRC}-items-full.json")}
test = {b["TreeCode"]: b for b in load("TEST_HITECH_PRETREADS-boms-full.json")}
packing = load("FINAL_PRE-boms-new.json")
uom = lambda c: (items.get(c, {}).get("InvntryUom") or "").upper()

# Packing BOMs: one roll.
notes, counts = [], []
for b in packing:
	w = final_w.get(b["TreeCode"])
	if not w:
		continue
	per_kg = float(b["Quantity"])
	lines = []
	for l in b["ProductTreeLines"]:
		q = float(l["Quantity"]) / per_kg
		if l["ItemCode"] in sandered:
			q = w
		elif l["ItemCode"] in FILMS:
			q = 0.1
		elif uom(l["ItemCode"]) in ("NOS", "PCS", "NO"):
			# A count within 5% of a whole number is that number (1.983 Checked OK is 2); the rest stay
			# as the old BOM gives them and are listed.
			exact, whole = q * w, round(q * w)
			if whole and abs(exact - whole) <= 0.05 * whole:
				q = whole
			else:
				q = r3(exact)
				counts.append({"bom": b["TreeCode"], "item": l["ItemCode"], "name": items.get(l["ItemCode"], {}).get("ItemName"), "per_roll": q, "roll_kg": w})
		else:
			q = r3(q * w)
		lines.append({**l, "Quantity": q})
	if not any(l["ItemCode"] in FILMS for l in lines):
		lines.append({"ItemCode": "I-10098", "Quantity": 0.1, "Warehouse": b["Warehouse"] or "01", "IssueMethod": "im_Manual", "PriceList": b["PriceList"],
			"ItemType": "pit_Item", "AdditionalQuantity": 0, "Comment": None, "LineText": None})
	if not any(l["ItemCode"] in sandered for l in lines):
		notes.append(f"{b['TreeCode']}: no sandered line; scaled to one roll ({w} kg) as it is")
	b.update(Quantity=w, ProductTreeLines=lines, PlanAvgProdSize=w, roll=w)
save("FINAL_PRE-boms-new.json", packing)
save("FINAL_PRE-roll-counts.json", counts)

# A roll weight for every sandered item, and its cured twin.
def most_common(ws):
	c = Counter(ws)
	return max(c, key=lambda w: (c[w], -w)) if c else None
used_final, used_first = {}, {}
for b in packing:
	for l in b["ProductTreeLines"]:
		if l["ItemCode"] in sandered and b["TreeCode"] in final_w:
			used_final.setdefault(l["ItemCode"], []).append(final_w[b["TreeCode"]])
for code, b in test.items():
	if code in first_w:
		for l in b["ProductTreeLines"]:
			if l["ItemCode"] in sandered:
				used_first.setdefault(l["ItemCode"], []).append(first_w[code])
overall = most_common(list(final_w.values()))
roll = {}
for s in sorted(sandered):
	if s in used_final:
		roll[s] = (most_common(used_final[s]), "final list", sorted(set(used_final[s])))
	elif s in used_first:
		roll[s] = (most_common(used_first[s]), "first list", sorted(set(used_first[s])))
	else:
		roll[s] = (overall, "most common overall", [])

def line(code, q, like):
	return {"ItemCode": code, "Quantity": q, "Warehouse": like.get("Warehouse") or "01", "IssueMethod": "im_Manual", "PriceList": like.get("PriceList"),
		"ItemType": "pit_Item", "AdditionalQuantity": 0, "Comment": None, "LineText": None}
def set_line(lines, code, q, like):
	for l in lines:
		if l["ItemCode"] == code:
			l["Quantity"] = q
			return
	lines.append(line(code, q, like))

stage = []
for cured, s in sorted(sandered_of.items()):
	w = roll[s][0]
	if s not in test and any(p["sandered"] == s and p.get("for") for p in pairs):
		# Added on the final list: its sandering BOM is cured 1 for 1, as its packing template I-10432's
		# BOM in live takes it.
		test[s] = {"TreeCode": s, "TreeType": "iProductionTree", "Quantity": 1, "Warehouse": "01", "PriceList": 1, "PlanAvgProdSize": 1,
			"HideBOMComponentsInPrintout": "tNO", "ProductDescription": next(p["name"] for p in pairs if p["sandered"] == s), "ProductTreeStages": [],
			"ProductTreeLines": [line(cured, 1, {"Warehouse": "01", "PriceList": 1})]}
	if s in test:
		b = json.loads(json.dumps(test[s]))
		set_line(b["ProductTreeLines"], POWDER, r3(-0.15 / w), b)
		b["ProductTreeLines"] = [l for l in b["ProductTreeLines"] if l["Quantity"] != 0]
		stage.append({**b, "kind": "sandering", "roll": w})
	if cured in test:
		b = json.loads(json.dumps(test[cured]))
		if float(b["Quantity"]) != 1:
			notes.append(f"{cured}: curing BOM makes {b['Quantity']}, not 1; firewood and flash set per kg of that")
		set_line(b["ProductTreeLines"], FIREWOOD, r3(0.3 * float(b["Quantity"])), b)
		set_line(b["ProductTreeLines"], FLASH, r3(-0.2 / w * float(b["Quantity"])), b)
		stage.append({**b, "kind": "curing", "roll": w})
save("FINAL_PRE-boms-stage.json", stage)
save("FINAL_PRE-rollweights.json", [{"sandered": s, "cured": c, "roll": roll[s][0], "from": roll[s][1], "weights": roll[s][2]}
	for c, s in sorted(sandered_of.items())])
src = Counter(v[1] for v in roll.values())
print(f"packing BOMs to one roll: {sum(1 for b in packing if b.get('roll'))} of {len(packing)}; sandering {sum(1 for b in stage if b['kind'] == 'sandering')}, "
	f"curing {sum(1 for b in stage if b['kind'] == 'curing')}; roll weights from {dict(src)}; several weights on {sum(1 for v in roll.values() if len(v[2]) > 1)}")
print(f"label/bag lines not a whole number a roll: {len(counts)} on {len({c['bom'] for c in counts})} BOMs (kept as the old BOMs give them)")
for n in notes:
	print("  note:", n)
