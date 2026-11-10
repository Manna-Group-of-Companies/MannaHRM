# Hi-Tech Pretreads: every item's proposed item group, for the user to verify (9 Nov 2026).
# Items = the 8 Nov live backup + what the conversion created (613 sandered, 653 new FG) and changed
# (renames, deactivations, the 01 STORE stock move), with the group changes the user made by hand
# (renames, CENTURY gone, chalk powder to CHEMICAL, test items to "Items").
import json, os, re, sys, collections
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
sys.stdout.reconfigure(encoding="utf-8")
SAP = r"C:\Users\Melvin\Documents\MANNA\MannaHRM\localdev\sap"
OUT = os.path.join(SAP, "out")
DEST = r"C:\Users\Melvin\Downloads\Hi-Tech item groups - proposed.xlsx"
TAB = chr(9)
load = lambda f: json.load(open(os.path.join(OUT, f), encoding="utf-8-sig"))


def dtw_rows(name):
	L = open(os.path.join(OUT, name), encoding="utf-8").read().splitlines()
	h = L[0].split(TAB)
	return [dict(zip(h, l.split(TAB))) for l in L[2:] if l]


# Group names as they stand after the user's renames (8-9 Nov).
GNAME = {100: "Items", 101: "Compound-Master", 102: "CHEMICAL", 103: "CONSUMABLE ITEMS", 104: "Other Material", 105: "Production wastes",
	106: "SFG", 107: "FG", 109: "Rubco-Job Work", 111: "Seconds", 112: "DIES", 113: "HOT", 114: "FG TRP MDB (BP)", 115: "FG TRP MB (Platinum)",
	116: "FG TRP VERDO (POLYGOLD)", 117: "FG TRP ROX (Silver)", 118: "FG TRP VERDO (Diamond)", 119: "Embossed film", 120: "FG - TRP - Black Pearl B",
	121: "Service", 123: "Engineering Stocks"}
QUALITY_GROUP = {"BLACK PEARL B": "FG - TRP - Black Pearl B", "BLACK PEARL": "FG TRP MDB (BP)", "PLATINUM": "FG TRP MB (Platinum)",
	"DIAMOND": "FG TRP VERDO (Diamond)", "POLY GOLD": "FG TRP VERDO (POLYGOLD)", "SILVER": "FG TRP ROX (Silver)", "TRACTOR SILVER": "FG TRP ROX (Silver)"}
# 9 Nov (user): only these quality groups are converted; MEDIUM and any other quality without a group stays in FG.
QPAT = [(r"BLACK\s*PEARL\s+B\b", "BLACK PEARL B"), (r"B[LK]?ACK\s*PEA?E?RA?L|BACKPEARL|BLACKPEARL|\bBPP?\b", "BLACK PEARL"), (r"TRACTOR\s+SILVER", "TRACTOR SILVER"),
	(r"PLATINUM|PLATNIUM|\bPL\b", "PLATINUM"), (r"POLY\s*GOLD|POLGOLD|POLY\s*COLD", "POLY GOLD"), (r"SILVER|SIVER|SLVER", "SILVER"), (r"DIAMOND|DAIMOND|DIAMAND", "DIAMOND"),
	(r"MEDIUM", "MEDIUM")]


def quality(name, bracket=None):
	if bracket:
		return bracket
	for p, q in QPAT:
		if re.search(p, name, re.I):
			return q
	return ""


v = load("LIVE8_HITECH_PRETREADS-verify.json")
stock = collections.defaultdict(float)
for w in v["whs"]:
	stock[w["ItemCode"]] += w["OnHand"]
for p in load("PROD_plan.json")["orders"]:
	for c in p["comps"]:
		stock[c["old"]] -= c["qty"]
		stock[p["new"]] += c["qty"]
inactive = set()
for f in ("DTW_SFG_2_retire.txt", "DTW_FG_PRE_5_retire_old.txt", "DTW_FG_PRE_6_deactivate.txt"):
	inactive |= {r["ItemCode"] for r in dtw_rows(f)}
renamed = {r["ItemCode"]: r["ItemName"] for f in ("DTW_SFG_1_rename.txt", "DTW_FG_PRE_4_rename_old.txt") for r in dtw_rows(f)}
items = {}
for i in v["items"]:
	if i["ItmsGrpCod"] == 108 and i["ItemCode"] != "I-13190":
		continue  # CENTURY: deleted
	g = 102 if i["ItemCode"] == "I-13190" else 100 if i["ItmsGrpCod"] == 122 else i["ItmsGrpCod"]
	items[i["ItemCode"]] = {"name": renamed.get(i["ItemCode"], i["ItemName"] or ""), "group": g, "active": i["validFor"] == "Y" and i["ItemCode"] not in inactive,
		"new": False, "bracket": None}
for r in dtw_rows("DTW_SANDERED_1_items.txt"):
	items[r["ItemCode"]] = {"name": r["ItemName"], "group": int(r["ItemsGroupCode"]), "active": True, "new": True, "bracket": None}
for r in dtw_rows("DTW_FG_PRE_1_items.txt"):
	n = r["ItemName"]
	items[r["ItemCode"]] = {"name": n, "group": int(r["ItemsGroupCode"]), "active": True, "new": True,
		"bracket": n.rsplit("(", 1)[1].rstrip(")") if n.endswith(")") else None}


TEST_ITEMS = {f"I-{n}" for n in range(14636, 14647)}


def is_pctr_code(code, it):
	return it["new"] and bool(re.match(r"P(MD|MB|V|R)\d", code))


SCOPE = {"FG", "FG - TRP - Black Pearl B"} | set(QUALITY_GROUP.values())


def propose_quality_only(code, it):
	"""9 Nov (user): only precured treads move, and only between FG and the quality groups. Every other
	group and item stays as it is."""
	n, g = it["name"], GNAME.get(it["group"], str(it["group"]))
	u = n.upper()
	if g not in SCOPE or code in TEST_ITEMS:
		return (g, "outside the quality groups - unchanged", "")
	if not re.search(r"PRECUR|\bPCTR\b|^TREAD RUBBER POLYGOLD", u) or re.search(r"RUBCO|SECONDS", u):
		return (g, "not a precured tread - unchanged", "")
	if is_pctr_code(code, it):
		pre = re.match(r"P(MD|MB|V|R)", code).group(0)
		b = it["bracket"]
		to = {"PMD": "FG - TRP - Black Pearl B" if b == "BLACK PEARL B" else "FG TRP MDB (BP)", "PMB": "FG TRP MB (Platinum)", "PR": "FG TRP ROX (Silver)",
			"PV": "FG TRP VERDO (Diamond)" if b == "DIAMOND" else "FG TRP VERDO (POLYGOLD)"}[pre]
		# 9 Nov (user, final): a new ROX code made from an old MEDIUM item stays in ROX - management's file maps
		# MEDIUM to ROX (PCTR BROCHURE rows 545-586).
		return (to, f"new code {pre}, old quality {b or '-'}", "")
	q = quality(n)
	if q in QUALITY_GROUP:
		to = QUALITY_GROUP[q]
		if g == "FG - TRP - Black Pearl B" and to == "FG TRP MDB (BP)":
			return (g, "in Black Pearl B, but the name says Black Pearl", "check: Black Pearl or Black Pearl B?")
		return (to, f"precured, old quality {q}", "")
	return ("FG", f"precured, quality {q or 'not in the name'} - no quality group, so FG", "")


def propose(code, it):
	n, g = it["name"], GNAME.get(it["group"], str(it["group"]))
	u = n.upper()
	keep = lambda why: (g, why, "")
	if code in TEST_ITEMS:
		return keep("sales-app sync test item, inactive, moved here on 9 Nov")
	if g in ("Engineering Stocks", "Service", "Production wastes"):
		return keep("group stays as it is")
	if g == "DIES" and re.search(r"\bDIE\b|MOULD", u):
		return keep("die / mould")
	if g == "Seconds":
		return keep("seconds stay in Seconds")
	if re.search(r"CUSHION", u):
		return ("Cushion Gum", "cushion gum", "")
	if (re.search(r"BONDING\s*GUM", u) and not re.search(r"BOX|CARTON|CARTOON|COVER|CALEND", u)) or re.match(r"BG (MANNA|ROX|VERDO|EXPORT)\b", u):
		return ("Bonding gum", "bonding gum", "" if g in ("FG", "Bonding gum") else f"check: bonding gum item in {g}")
	if re.search(r"VULCANI[SZ]ING SOLUTION|^SOLUTION", u):
		return ("Vulcanizing Solution", "vulcanizing solution", "check: ready-to-use solutions" if "READY" in u else "")
	if re.search(r"FINAL\s+(COMPOUND|BATCH)", u):
		return ("Compound-Final", "final compound", "")
	if re.search(r"MASTER\s+COMPOUND", u):
		return ("Compound-Master", "master compound", "")
	if "RUBCO" in u and re.search(r"CURED|EXTRUD|PRECUR|TREAD|SANDER", u):
		return ("Rubco-Job Work", "Rubco job work", "" if g == "Rubco-Job Work" else f"check: Rubco item in {g}")
	if is_pctr_code(code, it):
		pre = re.match(r"P(MD|MB|V|R)", code).group(0)
		b = it["bracket"]
		to = {"PMD": "FG - TRP - Black Pearl B" if b == "BLACK PEARL B" else "FG TRP MDB (BP)", "PMB": "FG TRP MB (Platinum)", "PR": "FG TRP ROX (Silver)",
			"PV": "FG TRP VERDO (Diamond)" if b == "DIAMOND" else "FG TRP VERDO (POLYGOLD)"}[pre]
		return (to, f"new code {pre}, old quality {b or '-'}", "")
	if g == "Compound-Master":
		return ("Compound-Master", "other compound item (premix, sulphur mix, test batch...)", "check")
	if g == "Embossed film" or re.match(r"(EMBOSSED )?FILM\b", u):
		return ("Embossed film", "film", "")
	if re.search(r"\b(EXTRUDED|CURED|SANDERED)\b", u) and not re.search(r"PRECURED", u):
		return ("SFG", "extruded / cured / sandered", "" if g == "SFG" else "check: SFG item outside SFG")
	if g == "SFG":
		return keep("SFG")
	is_hot = bool(re.search(r"TREAD\s*RUBBER\s*HOT|RUBBERHOT|^HOT\s", u))
	is_pctr = bool(re.search(r"PRECUR|\bPCTR\b|^TREAD RUBBER POLYGOLD", u))
	if is_hot:
		return ("HOT", "hot tread rubber", "")
	if is_pctr:
		q = quality(n, it["bracket"])
		if q in QUALITY_GROUP:
			if g == "FG - TRP - Black Pearl B" and QUALITY_GROUP[q] == "FG TRP MDB (BP)":
				return (g, "in Black Pearl B, but the name says Black Pearl", "check: Black Pearl or Black Pearl B?")
			return (QUALITY_GROUP[q], f"precured, quality {q}", "" if g in ("FG",) + tuple(QUALITY_GROUP.values()) else f"check: precured item in {g}")
		return ("FG", f"precured, quality {q or 'not in the name'} - no quality group", "")
	if g == "FG":
		if re.search(r"TOOL|CUTTER|BLADE|GRINDER|TANK|COLLECTOR|LUBE|TYRE COAT|PATCH", u):
			return ("Reselling items", "tool / accessory sold to retreaders?", "check")
		return keep("other finished good - no specific group")
	return keep("group stays as it is")


rows = []
for code, it in sorted(items.items()):
	to, why, chk = propose_quality_only(code, it)
	frm = GNAME.get(it["group"], str(it["group"]))
	rows.append([code, it["name"], it["active"], round(stock.get(code, 0), 3), frm, to, to != frm, why, chk, it["new"]])

wb = openpyxl.Workbook()
ws0 = wb.active
ws0.title = "Summary"
HEADS = ["Item code", "Item name", "Active", "Stock (kg/qty)", "Current group", "Proposed group", "Moves", "Reason", "Check", "New code (8 Nov)"]


def style(ws, heads, wide):
	for k, h in enumerate(heads, 1):
		c = ws.cell(row=1, column=k)
		c.font = Font(bold=True, color="FFFFFF")
		c.fill = PatternFill("solid", fgColor="1F4E78")
		c.alignment = Alignment(wrap_text=True, vertical="top")
		ws.column_dimensions[get_column_letter(k)].width = 48 if h in wide else 16
	ws.freeze_panes = "C2"
	ws.auto_filter.ref = ws.dimensions


ws0.append(["Proposed group", "Items", "Active", "Moving in", "Of which to check"])
cnt = collections.defaultdict(lambda: [0, 0, 0, 0])
for r in rows:
	c = cnt[r[5]]
	c[0] += 1; c[1] += r[2]; c[2] += r[6]; c[3] += bool(r[8]) and r[6]
for g in sorted(cnt):
	ws0.append([g] + cnt[g])
ws0.append([])
ws0.append(["Moves: from -> to", "Items"])
mv = collections.Counter((r[4], r[5]) for r in rows if r[6])
for (a, b), n in sorted(mv.items(), key=lambda x: -x[1]):
	ws0.append([f"{a}  ->  {b}", n])
ws0.append([])
for line in ["Built from the 8 Nov live backup plus what the conversion and the manual group changes did. Not read from live today.",
		"Quality groups follow the OLD quality (the bracket on the new names): BP -> MDB (BP), Platinum -> MB, Diamond / Polygold -> the two VERDO groups, Silver -> ROX.",
		"'Check' marks a judgement call. 'Moves' = TRUE where the proposed group differs from today's."]:
	ws0.append([line])
style(ws0, ["Proposed group", "Items", "Active", "Moving in", "Of which to check"], {"Proposed group"})
ws = wb.create_sheet("All items")
ws.append(HEADS)
for r in rows:
	ws.append(r)
style(ws, HEADS, {"Item name", "Reason"})
ws = wb.create_sheet("Moves only")
ws.append(HEADS)
for r in rows:
	if r[6]:
		ws.append(r)
style(ws, HEADS, {"Item name", "Reason"})
for g in sorted(cnt):
	ws = wb.create_sheet(re.sub(r"[\[\]\*\?/\\:]", "", g)[:31])
	ws.append(HEADS)
	for r in rows:
		if r[5] == g:
			ws.append(r)
	style(ws, HEADS, {"Item name", "Reason"})
wb.save(DEST)
print("items", len(rows), "moving", sum(r[6] for r in rows), "to check", sum(1 for r in rows if r[8]))
for g in sorted(cnt):
	print(f"  {g:28} {cnt[g]}")
for (a, b), n in sorted(mv.items(), key=lambda x: -x[1]):
	print(f"   {a} -> {b}: {n}")
