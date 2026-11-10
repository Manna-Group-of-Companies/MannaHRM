# What the DTW file builders share: where live's data comes from, the item fields copied from a
# template item, the database value → DI value for each, and the file writer.

import json
import os
import re

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
load = lambda f: json.load(open(os.path.join(OUT, f), encoding="utf-8-sig"))

# The restored live backup the files are built against. ORIG_* is 2 Nov's, the one TEST was copied
# from; CLONE_HITECH_PRETREADS is 6 Nov's (export_backup.ps1). Manna Treads has only 2 Nov's.
PRE_BASE = "ORIG_HITECH_PRETREADS"
PRE_SRC = os.environ.get("DTW_SOURCE", PRE_BASE)
MT_SRC = os.environ.get("DTW_SOURCE_MT", "ORIG_MANNA_TREADS")  # 8 Nov: CLONE_MANNA_TREADS, the 8 Nov backup
# Which list of new codes the FG, BOM and stock-move files follow: TEST's (fgitems.mjs, from the first
# sheet) or FINAL (fg_build.py, from management's final list of 6 Nov 2026, old items found by name).
FG = os.environ.get("DTW_FG", "TEST")

YN = {"Y": "tYES", "N": "tNO"}
# (DTW/DI field, OITM column, database value → DI value). None: copied as it is.
ITEM_FIELDS = [
	("ItemsGroupCode", "ItmsGrpCod", None),
	("InventoryItem", "InvntItem", YN), ("SalesItem", "SellItem", YN), ("PurchaseItem", "PrchseItem", YN),
	("ItemType", "ItemType", {"I": "itItems"}), ("ItemClass", "ItemClass", {"2": "itcMaterial"}),
	("MaterialType", "MatType", {"1": "mt_FinishedGoods", "2": "mt_GoodsInProcess", "3": "mt_RawMaterial"}),
	("ManageSerialNumbers", "ManSerNum", YN), ("ManageBatchNumbers", "ManBtchNum", YN),
	("SRIAndBatchManageMethod", "MngMethod", {"A": "bomm_OnEveryTransaction", "R": "bomm_OnReleaseOnly"}),
	("IssuePrimarilyBy", "IssuePriBy", {"0": "ipbSerialAndBatchNumbers", "1": "ipbBinLocations"}),
	("CostAccountingMethod", "EvalSystem", {"A": "bis_MovingAverage", "F": "bis_FIFO", "B": "bis_SNB", "S": "bis_Standard"}),
	("GLMethod", "GLMethod", {"W": "glm_WH", "C": "glm_ItemClass", "L": "glm_ItemLevel"}),
	("ManageStockByWarehouse", "ByWh", YN),
	("IssueMethod", "IssueMthd", {"M": "im_Manual", "B": "im_Backflush"}),
	("PlanningSystem", "PlaningSys", {"M": "bop_MRP", "N": "bop_None"}),
	("ProcurementMethod", "PrcrmntMtd", {"M": "bom_Make", "B": "bom_Buy"}),
	("ComponentWarehouse", "CompoWH", {"B": "bomcw_BOM", "P": "bomcw_Parent"}),
	("UoMGroupEntry", "UgpEntry", None), ("InventoryUoMEntry", "IUoMEntry", None),
	("InventoryUOM", "InvntryUom", None), ("SalesUnit", "SalUnitMsr", None), ("PurchaseUnit", "BuyUnitMsr", None),
	("VatLiable", "VATLiable", YN), ("WTLiable", "WTLiable", YN), ("TaxType", "TaxType", {"Y": "tt_Yes", "N": "tt_No", "U": "tt_UseTax"}),
	("GSTRelevnt", "GSTRelevnt", YN), ("GSTTaxCategory", "GstTaxCtg", {"R": "gtc_Regular", "N": "gtc_NilRated", "E": "gtc_Exempt"}),
	("ChapterID", "ChapterID", None), ("InCostRollup", "InCostRoll", YN),
]
# Pretreads' user fields on OITM. Manna Treads has none, and SAP refuses an item naming one it lacks.
U_FIELDS = [
	("U_SubTypeA", "U_SubTypeA", None), ("U_SubTypeB", "U_SubTypeB", None), ("U_TaxRate", "U_TaxRate", None),
	("U_Width", "U_Width", None), ("U_Design", "U_Design", None), ("U_Length", "U_Length", None), ("U_Size", "U_Size", None),
	("U_Color", "U_Color", None), ("U_BeltsPerRoll", "U_BeltsPerRoll", None), ("U_WeightPerRoll", "U_WeightPerRoll", None),
]


def cell(v, enum):
	"""A database value as DTW is given it; KeyError when an enum value has no DI name here."""
	if v is None or (isinstance(v, str) and v.strip() == ""):
		return ""
	if v == -1:
		return ""  # "none" for a UoM group or an HSN chapter is SAP's own default; DTW is not given -1
	if isinstance(v, float) and v.is_integer():
		v = int(v)
	v = str(v).strip()
	if enum is None:
		return v
	if v not in enum:
		raise KeyError(v)
	return enum[v]


def unquote(v):
	# Excel-style quoting, as an earlier import left it in live: "130""" is 130". Taken off as often as it
	# was put on, so a value that went through it twice comes back clean too.
	while len(v) >= 2 and v[0] == v[-1] == '"' and '"' not in v[1:-1].replace('""', ''):
		v = v[1:-1].replace('""', '"')
	return v


def field(v):
	# DTW stores a field exactly as written — it does not undo Excel's quoting (7 Nov: a quoted name
	# landed in Z_TEST as "NAME 130""" and live's U_Length "130""" came from the same thing). So a value
	# goes out bare, with any old quoting taken off. A tab or line break would split the record.
	v = unquote(str(v))
	if "\t" in v or "\n" in v or "\r" in v:
		raise SystemExit(f"tab or line break in a DTW value: {v!r}")
	# DTW reads the file as Windows ANSI, not UTF-8 (8 Nov: live Manna's I-2032 ends in a typographic
	# closing quote, which landed in Z_TEST_MANNA_TREADS as "a-euro"). Typographic quotes become the plain
	# ones every other name uses; anything else outside ASCII is refused rather than garbled.
	v = v.translate(TYPOGRAPHIC)
	odd = [ch for ch in v if ord(ch) > 126]
	if odd:
		raise SystemExit(f"character DTW would garble in a DTW value: {v!r} ({odd})")
	return v


TYPOGRAPHIC = {0x201C: '"', 0x201D: '"', 0x201E: '"', 0x2033: '"', 0x2018: "'", 0x2019: "'", 0x2032: "'", 0x00A0: " "}


# The user's own DTW templates (6 Nov 2026), copied from the server's Templates folder. This DTW keys a
# record by its own code — ItemCode, TreeCode — and a child row names its parent's code in ParentKey;
# there is no RecordKey. Row 2 is taken from the template so the files read exactly as DTW's own.
TEMPLATES = {
	"items_pre": "pre/OITM - Items.xlt", "whs_pre": "pre/OITW - ItemWarehouseInfo.xlt", "prices_pre": "pre/ITM1 - Items_Prices.xlt",
	"items": "generic/OITM - Items.xlt", "whs": "generic/OITW - ItemWarehouseInfo.xlt", "prices": "generic/ITM1 - Items_Prices.xlt",
	"bom": "generic/OITT - ProductTrees.xlt", "bom_lines": "generic/ITT1 - ProductTrees_Lines.xlt",
	"gi": "pre/GI OIGE - Documents.xlt", "gi_lines": "pre/GI IGE1 - Document_Lines.xlt", "gi_batches": "pre/GI BTNT - BatchNumbers.xlt",
	"gi_bins": "pre/GI IGE19 - DocumentLinesBinAllocations.xlt",
	"gr": "pre/GR OIGN - Documents.xlt", "gr_lines": "pre/GR IGN1 - Document_Lines.xlt", "gr_batches": "pre/GR BTNT - BatchNumbers.xlt",
	"gr_bins": "pre/GR IGN19 - DocumentLinesBinAllocations.xlt",
	"po": "pre/PO OWOR - ProductionOrders.xlt", "po_lines": "pre/PO WOR1 - ProductionOrders_Lines.xlt",
}
_rows2 = {}


def row2(template):
	if template not in _rows2:
		with open(os.path.join(HERE, "dtw_templates", TEMPLATES[template]), "rb") as f:
			ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
			r = [list(x) for x, _ in zip(ws.iter_rows(values_only=True), range(2))]
		_rows2[template] = {a: b for a, b in zip(r[0], r[1]) if a}
	return _rows2[template]


# Row-2 names the templates have out of step with row 1 (8 Nov: the document templates put BnkBranch under
# BPL_IDAssignedToInvoice, whose field is the header's BPLId).
ROW2_FIX = {"BPL_IDAssignedToInvoice": "BPLId"}


def dtw(fname, template, heads, body):
	"""A DTW text file: tab-separated, CRLF, row 2 from the template. A column the template lacks is
	refused — DTW would ignore it — except a user field the template predates (U_BeltsPerRoll)."""
	known = row2(template)
	missing = [h for h in heads if h not in known and not h.startswith("U_")]
	if missing:
		raise SystemExit(f"{fname}: not in DTW's {TEMPLATES[template]}: {', '.join(missing)}")
	with open(os.path.join(OUT, fname), "w", encoding="utf-8", newline="\r\n") as f:
		# A user field's own name in row 2: the goods receipt template's user-field row is out of step
		# with its first (it puts U_OworId under U_Approve).
		f.write("\t".join(heads) + "\n" + "\t".join(h if h.startswith("U_") else ROW2_FIX.get(h) or str(known.get(h, h)) for h in heads) + "\n")
		for line in body:
			f.write("\t".join(field(v) for v in line) + "\n")


def three_way(base, live, ours):
	"""Whether to write a value: only what this conversion changed, never over a change live made
	since. Returns (write, conflict)."""
	if ours == base:
		return False, False
	if live != base and live != ours:
		return False, True
	return live != ours, False


def history(src):
	"""What makes an item unsafe to retire in a backup: stock or open quantities, any inventory
	transaction, any document line, a BOM of its own or a place on one. {code: "reason, reason"}."""
	v = load(f"{src}-verify.json")
	why = {}
	add = lambda c, r: why.setdefault(c, []).append(r)
	for w in v["whs"]:
		if w["OnHand"] or w["IsCommited"] or w["OnOrder"]:
			add(w["ItemCode"], "stock or open orders")
	n = {}
	for m in v["moves"]:
		n[m["ItemCode"]] = n.get(m["ItemCode"], 0) + m["N"]
	for c, k in n.items():
		add(c, f"{k} stock transactions")
	for d in v["docs"]:
		add(d["ItemCode"], f"{d['N']} {d['Doc']} lines")
	for b in load(f"{src}-boms-full.json"):
		add(b["Code"], "own BOM")
		for l in b["lines"]:
			add(l["Code"], f"on BOM {b['Code']}")
	return {c: ", ".join(dict.fromkeys(r)) for c, r in why.items()}


def sandered_pairs():
	"""cured → sandered: TEST's 612, and on the final list the ones added since (EXTRA_PRE-sandered.json)."""
	pairs = load("TEST_HITECH_PRETREADS-sandered.json")
	extra = os.path.join(OUT, "EXTRA_PRE-sandered.json")
	return pairs + (load("EXTRA_PRE-sandered.json") if FG == "FINAL" and os.path.exists(extra) else [])


# The quality an old item carries, one spelling each: the quality word in its name (longest first), else
# U_Quality. Most old items leave U_Quality empty.
QUALITY = [r"BLACK\s*PEARL\s+B\b", r"BLACK\s*PEA?RA?L|BACKPEARL|\bB\s?P\b", r"TRACTOR\s+SILVER", r"PLATINUM|\bPL\b", r"POLY\s*GOLD|POLGOLD",
	r"POLY\s*COLD", r"SILVER|SIVER|SLVER", r"DIAMOND|DAIMOND|DIAMAND", r"MEDIUM", r"RUBCO", r"EXCELLENT|EXLNT", r"\bGOLD\b"]
# One spelling a quality (8 Nov: it goes on the new name), whatever the old name's typo.
QUALITY_LABEL = ["BLACK PEARL B", "BLACK PEARL", "TRACTOR SILVER", "PLATINUM", "POLY GOLD", "POLY GOLD", "SILVER", "DIAMOND", "MEDIUM",
	"RUBCO", "EXCELLENT", "GOLD"]


def old_quality(item):
	# The name's quality word first: it is what people read, and the one item where the two disagree
	# (220R2BP: named BLACK PEARL, U_Quality MEDIUM) has the name right. U_Quality where the name has none.
	own = (item.get("Quality") or "").strip()
	for text in (item.get("ItemName") or "", own):
		for pat, label in zip(QUALITY, QUALITY_LABEL):
			if re.search(pat, text, re.I):
				return label
	return re.sub(r"\s+", " ", own).upper()


def new_names():
	"""Each new code's SAP name (8 Nov): management's description, then the old quality in brackets - the
	quality of its Hi-Tech old codes, else of its Manna old codes; several are joined with ' / '. A new
	code with no old item keeps the description alone. The same name in both companies."""
	desc = {m["new"]: m["desc"] for m in load("fg-mapping-final.json")}
	quals = {}
	for co, src in (("PRE", PRE_SRC), ("MT", MT_SRC)):
		items = {i["ItemCode"]: i for i in load(f"{src}-verify.json")["items"]}
		got = {}
		for m in load(f"FINAL_{co}-mapping.json"):
			q = old_quality(items[m["old"]]) if m["old"] in items else ""
			if q:
				got.setdefault(m["new"], set()).add(q)
		for code, qs in got.items():
			quals.setdefault(code, qs)
	return {c: d + (f" ({' / '.join(sorted(quals[c]))})" if quals.get(c) else "") for c, d in desc.items()}
