# Management's final item list (6 Nov 2026) → the plan, items and packing BOMs the DTW builders read,
# in the shapes fgitems.mjs and bom_read.mjs left TEST's, so dtw_fg.py, dtw_bom.py and dtw_stockmove.py
# take DTW_FG=FINAL and nothing else changes.
#
#     DTW_SOURCE=CLONE_HITECH_PRETREADS python -I localdev/sap/fg_build.py
#
# Reads out/fg-mapping-final.json (fg_final_diff.py). Old items are found by name: the final sheet's
# C. ITEM CODE column is out of step with its ITEMS column in most PCTR rows. Bonding gum and solution
# rows share a generic name, and there the code column is right, so they go by code. Every SAP code
# carrying an old name goes to that name's new code (17 names sit on two or three codes).
#
# The rules are fgitems.mjs's and stageboms.mjs's (2 Nov):
#   template = an old item with a BOM, then the most stock; with no old item, the nearest row of the
#   same sheet by code (BV02200509 takes after BM02200504), else the sheet group's most-stocked item —
#   a borrowed template gives settings and warehouses, never prices or stock levels;
#   group = the template's when it is a finished-goods group, else the one most items of the same
#   sheet, brand and quality sit in — and then that group's valuation, planning and procurement, as
#   SAP gives them on add;
#   from the sheet: name, U_Quality, U_Design (pattern), U_BeltsPerRoll, U_WeightPerRoll;
#   packing BOM = the template's, sandering powder out, each cured line its sandered twin at 1, stretch
#   film 0.1 (added when missing), the rest scaled to make 1 at three decimals. A BOM with no cured line
#   is copied as it is.
# Where the final list keeps a code TEST built from the same template, TEST's BOM is used as it is: it
# carries fixes made by hand there (PMD01100504's swap, 4 Nov).
# Manna Treads (by name, only where a name points at one new code) gets items and no BOMs.
#
# Writes out/FINAL_<co>-plan.json, -fg-full.json, -mapping.json and, for Pretreads, -boms-new.json.

import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
from dtw_common import ITEM_FIELDS, MT_SRC, OUT, PRE_SRC, cell, load, sandered_pairs

POWDER, FILM, FILMS = "I-10176", "I-10098", {"I-10098", "I-14497"}
FG_GROUP = re.compile(r"^(FG|HOT$|Seconds$|PRECURED$|Tread Gum$|VULCANISING SOLUTION$)", re.I)
SHEET_GROUP = {"PCTR BROCHURE": re.compile(r"^(PRECURED|FG - TRP)", re.I), "HOT BROCHURE": re.compile(r"^HOT$", re.I),
	"BONDING GUM": re.compile(r"^Tread Gum$|BONDING", re.I), "SOLUTION": re.compile(r"SOLUTION", re.I)}
GENERIC = ("BONDING GUM", "SOLUTION")
# Codes management corrected after TEST was built (7 Nov file: BM0200509 was a typo for BM02200509). The new
# code takes the settings TEST gave the old spelling.
RECODED = {"BM02200509": "BM0200509"}
r3 = lambda n: round(n * 1000) / 1000
norm = lambda v: re.sub(r"[^A-Z0-9]", "", str(v or "").upper().replace("PRECURD", "PRECURED"))
final = load("fg-mapping-final.json")
sandered_of = {m["cured"]: m["sandered"] for m in sandered_pairs()}


def build(co, src, test_db, has_bom):
	items = {i["ItemCode"]: i for i in load(f"{src}-items-full.json")}
	groups = {g["ItmsGrpCod"]: g for g in load(f"{src}-groups.json")}
	gname = lambda c: (groups.get(items[c]["ItmsGrpCod"]) or {}).get("ItmsGrpNam", "") if c in items else ""
	stock = defaultdict(float)
	for w in load(f"{src}-verify.json")["whs"]:
		stock[w["ItemCode"]] += w["OnHand"]
	boms = {b["Code"]: b for b in load(f"{src}-boms-full.json")}
	by_name = defaultdict(list)
	for c, i in items.items():
		by_name[norm(i["ItemName"])].append(c)
	codes_for = defaultdict(set)
	for r in final:
		codes_for[norm(r["old_name"])].add(r["new"])

	# Old items per row: by name (PCTR, HOT), by code (bonding gum, solution). Manna's names must point
	# at one new code only (fgitems.mjs --by-name), since its codes are its own.
	rows = []
	for r in final:
		if r["sheet"] in GENERIC:
			olds = [r["old"]] if co == "PRE" and r["old"] in items else []
			if co == "MT" and r["old_name"] and len(codes_for[norm(r["old_name"])]) == 1:
				olds = by_name.get(norm(r["old_name"]), [])[:1] if len(by_name.get(norm(r["old_name"]), [])) == 1 else []
		else:
			found = by_name.get(norm(r["old_name"]), []) if r["old_name"] else []
			olds = found if co == "PRE" else (found if len(found) == 1 and len(codes_for[norm(r["old_name"])]) == 1 else [])
		rows.append({**r, "olds": olds})
	by_new = defaultdict(list)
	for r in rows:
		by_new[r["new"]].append(r)

	def sibling_group(row):
		tally = Counter()
		for r in rows:
			if r["sheet"] == row["sheet"] and r["brand"] == row["brand"] and r["quality"] == row["quality"]:
				for o in r["olds"]:
					if FG_GROUP.search(gname(o)):
						tally[items[o]["ItmsGrpCod"]] += 1
		return tally.most_common(1)[0][0] if tally else None
	mask = lambda c: c[:1] + "_" + c[2:]
	def common(a, b):
		i = 0
		while i < min(len(a), len(b)) and a[i] == b[i]:
			i += 1
		return i
	def nearest(code, sheet):
		cands = [r for r in rows if r["olds"] and r["sheet"] == sheet and (not SHEET_GROUP.get(sheet) or SHEET_GROUP[sheet].search(gname(r["olds"][0])))]
		cands.sort(key=lambda r: -common(mask(r["new"]), mask(code)))
		return cands[0] if cands else None
	def stand_in(sheet):
		pat = SHEET_GROUP.get(sheet)
		cands = [c for c, i in items.items() if pat and pat.search(gname(c)) and i["validFor"] == "Y" and i["frozenFor"] != "Y"]
		return max(cands, key=lambda c: stock[c], default=None)

	test_plan = {p["code"]: p for p in load(f"{test_db}-fg-plan-applied.json")}
	test_boms = {b["TreeCode"]: b for b in load(f"{test_db}-boms-full.json")} if has_bom else {}
	test_by_template = defaultdict(list)
	for p in test_plan.values():
		test_by_template[p.get("template")].append(p["code"])
	plan, full, boms_new, mapping, problems = [], [], [], [], []
	for code in sorted(by_new):
		rs = by_new[code]
		r0 = rs[0]
		desc = r0["desc"]
		if len({r["desc"] for r in rs}) > 1:
			problems.append(f"{co} {code}: several descriptions on the sheet")
		if not desc or len(desc) > 100:
			problems.append(f"{co} {code}: description unusable {desc!r}")
		olds = sorted({o for r in rs for o in r["olds"]})
		notes = []
		cands = sorted(olds, key=lambda o: (o not in boms, -stock[o], o))
		tpl, borrowed = (cands[0], False) if cands else (None, True)
		if borrowed:
			# The stand-in fgitems.mjs chose on 2 Nov where TEST has one; the same rule otherwise.
			tp = test_plan.get(code) or test_plan.get(RECODED.get(code), {})
			n = None if tp.get("template") in items else nearest(code, r0["sheet"])
			tpl = tp["template"] if n is None and tp.get("template") in items else (n["olds"][0] if n else stand_in(r0["sheet"]))
			if not tpl:
				problems.append(f"{co} {code}: no item to copy settings from")
				continue
			notes.append(f"no old code: settings from {tpl}" + (f" ({n['new']})" if n else "") + ", no prices, no BOM")
		t = items[tpl]
		group = t["ItmsGrpCod"]
		if not FG_GROUP.search(gname(tpl)):
			sib = sibling_group(r0)
			if sib is None:
				notes.append(f"template's group is {gname(tpl)}, no finished-goods group found")
			else:
				group = sib
				notes.append(f"group {groups[sib]['ItmsGrpNam']}, not the template's {gname(tpl)}")
		vals = {f: cell(t[col], enum) for f, col, enum in ITEM_FIELDS}
		if group != t["ItmsGrpCod"]:
			g = groups[group]
			vals["CostAccountingMethod"] = {"A": "bis_MovingAverage", "F": "bis_FIFO", "B": "bis_SNB", "S": "bis_Standard"}.get(g["InvntSys"], vals["CostAccountingMethod"])
			vals["PlanningSystem"] = {"M": "bop_MRP", "N": "bop_None"}.get(g["PlaningSys"], vals["PlanningSystem"])
			vals["ProcurementMethod"] = {"M": "bom_Make", "B": "bom_Buy"}.get(g["PrcrmntMtd"], vals["ProcurementMethod"])
		item = {"ItemCode": code, "ItemName": desc, "ItemsGroupCode": group, **{k: (v if v != "" else None) for k, v in vals.items() if k != "ItemsGroupCode"}}
		# The old code(s) on the new item, so a user can look up their history from it (decided 7 Nov: the
		# Foreign Name field, blank on the new items and shown on Item Master Data). Limit 100 characters.
		link = "OLD: " + ", ".join(olds) if olds else None
		if link and len(link) > 100:
			problems.append(f"{co} {code}: old codes do not fit Foreign Name ({len(link)} characters)")
		item["ForeignName"] = link
		row = next((r for r in rs if tpl in r["olds"]), r0)
		if co == "PRE":
			item.update(U_ProductType=t.get("U_ProductType"), U_Quality=str(row["quality"])[:30] if row["quality"] else t.get("U_Quality"),
				U_Design=str(row["pattern"])[:30] if row["pattern"] else None,
				U_BeltsPerRoll=float(row["belts_per_roll"]) if (row["belts_per_roll"] or 0) and float(row["belts_per_roll"]) > 0 else None,
				U_WeightPerRoll=float(row["weight_per_roll"]) if (row["weight_per_roll"] or 0) and float(row["weight_per_roll"]) > 0 else None)
		full.append(item)
		plan.append({"code": code, "name": desc, "sheet": r0["sheet"], "olds": olds, "template": tpl, "notes": notes, "group": groups[group]["ItmsGrpNam"]})
		mapping += [{"old": o, "new": code, "old_name": items[o]["ItemName"], "desc": desc, "sheet": r0["sheet"]} for o in olds]

		if not has_bom or borrowed or tpl not in boms:
			continue
		# TEST's own BOM where TEST built this product from the same template: it carries hand fixes.
		same = [] if os.environ.get("FG_FRESH") else [c for c in test_by_template.get(tpl, []) if c in test_boms]
		if same:
			b = test_boms[same[0]]
			boms_new.append({**{k: b[k] for k in ("TreeType", "Quantity", "Warehouse", "PriceList", "PlanAvgProdSize", "HideBOMComponentsInPrintout")},
				"TreeCode": code, "ProductDescription": desc, "ProductTreeLines": b["ProductTreeLines"], "ProductTreeStages": [], "from": f"TEST {same[0]}"})
			continue
		ob = boms[tpl]
		im = {"M": "im_Manual", "B": "im_Backflush"}
		it = {"4": "pit_Item", "290": "pit_Resource", "-18": "pit_Text"}
		lines, cured_seen, missing = [], False, []
		for l in ob["lines"]:
			if l["Code"] == POWDER:
				continue
			x = {"ItemCode": l["Code"], "Quantity": float(l["Quantity"]), "Warehouse": l["Warehouse"], "IssueMethod": im.get(l["IssueMthd"], l["IssueMthd"]),
				"PriceList": l["PriceList"], "ItemType": it.get(str(l["Type"]), l["Type"]), "AdditionalQuantity": l["AddQuantit"], "Comment": l["Comment"], "LineText": l["LineText"]}
			if l["Code"] in sandered_of:
				x["ItemCode"], cured_seen = sandered_of[l["Code"]], True
			elif re.search(r"\bCURED\b", items.get(l["Code"], {}).get("ItemName", ""), re.I):
				missing.append(l["Code"])
			lines.append(x)
		if missing:
			problems.append(f"{co} {code}: template {tpl}'s BOM has cured {', '.join(missing)} with no sandered item")
			continue
		q = float(ob["Qauntity"])
		if cured_seen:
			fixed = {x["ItemCode"]: 0.1 for x in lines if x["ItemCode"] in FILMS} or {FILM: 0.1}
			for x in lines:
				if x["ItemCode"] in sandered_of.values():
					fixed[x["ItemCode"]] = 1
			for x in lines:
				x["Quantity"] = fixed.pop(x["ItemCode"]) if x["ItemCode"] in fixed else r3(x["Quantity"] / q)
			for c, v in fixed.items():
				lines.append({"ItemCode": c, "Quantity": v, "Warehouse": ob["ToWH"] or "01", "IssueMethod": "im_Manual", "PriceList": ob["PriceList"],
					"ItemType": "pit_Item", "AdditionalQuantity": 0, "Comment": None, "LineText": None})
			q = 1
		boms_new.append({"TreeCode": code, "TreeType": {"P": "iProductionTree", "A": "iAssemblyTree", "S": "iSalesTree", "T": "iTemplateTree"}[ob["TreeType"]],
			"Quantity": q, "Warehouse": ob["ToWH"], "PriceList": ob["PriceList"], "PlanAvgProdSize": ob["PlAvgSize"],
			"HideBOMComponentsInPrintout": {"Y": "tYES", "N": "tNO"}[ob["HideComp"]], "ProductDescription": desc, "ProductTreeLines": lines,
			"ProductTreeStages": [], "from": f"template {tpl}" + ("" if cured_seen else " (no cured line: as it is)")})
	return plan, full, boms_new, mapping, problems


problems = []
for co, src, test_db, has_bom in (("PRE", PRE_SRC, "TEST_HITECH_PRETREADS", True), ("MT", MT_SRC, "TEST_MANNA_TREADS", False)):
	plan, full, boms_new, mapping, p = build(co, src, test_db, has_bom)
	problems += p
	for name, data in (("plan", plan), ("fg-full", full), ("mapping", mapping), ("boms-new", boms_new)):
		with open(os.path.join(OUT, f"FINAL_{co}-{name}.json"), "w", encoding="utf-8") as f:
			json.dump(data, f, indent=1, default=str)
	print(f"{co}: {len(plan)} new codes ({sum(1 for x in plan if x['notes'] and x['notes'][0].startswith('no old code'))} borrowed), "
		f"{len(mapping)} old codes mapped, {len(boms_new)} packing BOMs ({sum(1 for b in boms_new if b['from'].startswith('TEST'))} TEST's own)")
for x in problems:
	print("  problem:", x)
