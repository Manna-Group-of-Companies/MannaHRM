# The SSMS check for every step of a packaged import, read from the step's own files (8 Nov 2026).
#
#     python -I localdev/sap/dtw_checks.py "<package folder>" <company database>
#
# Each check_NN.sql says at the top what it must show. A "before" check runs before the step's trial, an
# "after" check once the step's rest is in. They are the queries that passed in Z_TEST_HITECH_PRETREADS,
# written for any company: every one reads only. The step files are read as packaged (trial + rest).

import os
import sys

PKG, DB = sys.argv[1], sys.argv[2]
TAB, CRLF, NL = chr(9), chr(13) + chr(10), chr(10)


def rows(folder, name):
	out = []
	for part in ("1-trial", "2-rest", ""):
		p = os.path.join(PKG, folder, part, name + ".txt")
		if os.path.exists(p):
			L = open(p, encoding="utf-8", newline="").read().split(CRLF)
			h = L[0].split(TAB)
			out += [dict(zip(h, l.split(TAB))) for l in L[2:] if l]
	return out


def q(s):
	return "N'" + s.replace("'", "''") + "'"


def values(name, cols, data):
	return name + "(" + ", ".join(cols) + ") AS (SELECT * FROM (VALUES" + NL + ("," + NL).join(
		"(" + ",".join(q(str(r[c])) if isinstance(r[c], str) else str(r[c]) for c in cols) + ")" for r in data) + ") v(" + ", ".join(cols) + "))"


def write(folder, name, text):
	open(os.path.join(PKG, folder, name), "w", encoding="utf-8-sig").write("USE " + DB + ";" + NL + text)


def codes_in(lst):
	return ",".join(q(c) for c in lst) or "N''"


# 01 SFG rename / 05 old FG rename: names as the file has them.
for folder, name in (("01 SFG rename", "DTW_SFG_1_rename"), ("05 Old FG rename", "DTW_FG_PRE_4_rename_old")):
	r = [{"code": x["ItemCode"], "name": x["ItemName"]} for x in rows(folder, name)]
	W = "WITH " + values("F", ["code", "name"], r) + NL
	write(folder, "check_" + folder[:2] + ".sql",
		"-- AFTER the rest: expect InFile = %d, NotRenamed = 0 (second result lists any; a name ending in a hidden" % len(r) + NL +
		"-- line break in live, like I-12715, may stay and is fixed by hand in Item Master Data)" + NL + W +
		"SELECT (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code) AS InFile, (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code WHERE I.ItemName <> F.name) AS NotRenamed;" + NL +
		W + "SELECT F.code, I.ItemName AS InSAP, F.name AS InFile FROM F JOIN OITM I ON I.ItemCode = F.code WHERE I.ItemName <> F.name;" + NL)

# 02 / 06 / 14: made inactive.
for folder, name in (("02 SFG retire", "DTW_SFG_2_retire"), ("06 Old FG retire", "DTW_FG_PRE_5_retire_old"), ("14 Deactivate FG", "DTW_FG_PRE_6_deactivate")):
	c = [x["ItemCode"] for x in rows(folder, name)]
	pre = ""
	if folder.startswith("14"):
		pre = ("-- BEFORE step 14 (after 13): expect InFile = %d, HoldStock = 0, OpenQty = 0 (second result lists any)" % len(c) + NL +
			"SELECT (SELECT COUNT(*) FROM OITM I WHERE I.ItemCode IN (%s)) AS InFile," % codes_in(c) + NL +
			"       (SELECT COUNT(DISTINCT W.ItemCode) FROM OITW W WHERE W.ItemCode IN (%s) AND W.OnHand <> 0) AS HoldStock," % codes_in(c) + NL +
			"       (SELECT COUNT(DISTINCT W.ItemCode) FROM OITW W WHERE W.ItemCode IN (%s) AND (W.IsCommited <> 0 OR W.OnOrder <> 0)) AS OpenQty;" % codes_in(c) + NL +
			"SELECT W.ItemCode, W.WhsCode, W.OnHand, W.IsCommited, W.OnOrder FROM OITW W WHERE W.ItemCode IN (%s) AND (W.OnHand <> 0 OR W.IsCommited <> 0 OR W.OnOrder <> 0);" % codes_in(c) + NL + NL)
	write(folder, "check_" + folder[:2] + ".sql", pre +
		"-- AFTER the rest: expect InFile = %d and Inactive = %d" % (len(c), len(c)) + NL +
		"SELECT COUNT(*) AS InFile, SUM(CASE WHEN validFor = 'N' AND frozenFor = 'Y' THEN 1 ELSE 0 END) AS Inactive FROM OITM WHERE ItemCode IN (%s);" % codes_in(c) + NL)

# 03 sandered items: codes come from series 104, so the next number must be the first code.
r = [{"code": x["ItemCode"], "name": x["ItemName"]} for x in rows("03 Sandered items", "DTW_SANDERED_1_items")]
wn = len(rows("03 Sandered items", "DTW_SANDERED_2_warehouses"))
first, last = r[0]["code"], r[-1]["code"]
W = "WITH " + values("F", ["code", "name"], r) + NL
write("03 Sandered items", "check_03.sql",
	"-- BEFORE: expect NextNumber = %s and AlreadyThere = 0 - otherwise STOP: every code would shift" % first[2:] + NL +
	"SELECT Series, NextNumber FROM NNM1 WHERE ObjectCode = '4' AND Series = 104;" + NL +
	"SELECT COUNT(*) AS AlreadyThere FROM OITM WHERE ItemCode BETWEEN '%s' AND '%s';" % (first, last) + NL + NL +
	"-- AFTER the rest: expect Items = %d, NameMismatch = 0, Missing = 0, WarehouseLines = %d, NextNumber = %d" % (len(r), wn, int(first[2:]) + len(r)) + NL + W +
	"SELECT (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code) AS Items," + NL +
	"       (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code WHERE I.ItemName <> F.name) AS NameMismatch," + NL +
	"       (SELECT COUNT(*) FROM F WHERE NOT EXISTS (SELECT 1 FROM OITM I WHERE I.ItemCode = F.code)) AS Missing," + NL +
	"       (SELECT COUNT(*) FROM OITW W JOIN F ON F.code = W.ItemCode) AS WarehouseLines," + NL +
	"       (SELECT NextNumber FROM NNM1 WHERE ObjectCode = '4' AND Series = 104) AS NextNumber;" + NL)

# 04 new FG items.
it = rows("04 New FG items", "DTW_FG_PRE_1_items")
wh = rows("04 New FG items", "DTW_FG_PRE_2_warehouses")
pr = rows("04 New FG items", "DTW_FG_PRE_3_prices")
F = "WITH " + values("F", ["code", "name", "frgn"], [{"code": x["ItemCode"], "name": x["ItemName"], "frgn": x["ForeignName"]} for x in it])
P = values("P", ["code", "list", "price"], [{"code": x["ParentKey"], "list": int(x["PriceList"]), "price": float(x["Price"])} for x in pr])
write("04 New FG items", "check_04.sql",
	"-- BEFORE: expect AlreadyThere = 0, and series 3 IsManual = Y" + NL + F + NL +
	"SELECT COUNT(*) AS AlreadyThere FROM F JOIN OITM I ON I.ItemCode = F.code;" + NL +
	"SELECT Series, SeriesName, IsManual FROM NNM1 WHERE ObjectCode = '4' AND Series = 3;" + NL + NL +
	"-- AFTER the rest: expect Items = %d, NameMismatch = 0, ForeignNameMismatch = 0, Missing = 0, WarehouseLines = %d, PricesWrong = 0" % (len(it), len(wh)) + NL +
	F + "," + NL + P + NL +
	"SELECT (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code) AS Items," + NL +
	"       (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code WHERE I.ItemName <> F.name) AS NameMismatch," + NL +
	"       (SELECT COUNT(*) FROM F JOIN OITM I ON I.ItemCode = F.code WHERE ISNULL(I.FrgnName,'') <> F.frgn) AS ForeignNameMismatch," + NL +
	"       (SELECT COUNT(*) FROM F WHERE NOT EXISTS (SELECT 1 FROM OITM I WHERE I.ItemCode = F.code)) AS Missing," + NL +
	"       (SELECT COUNT(*) FROM OITW W JOIN F ON F.code = W.ItemCode) AS WarehouseLines," + NL +
	"       (SELECT COUNT(*) FROM P LEFT JOIN ITM1 X ON X.ItemCode = P.code AND X.PriceList = P.list WHERE ISNULL(X.Price, -1) <> P.price) AS PricesWrong;" + NL)

# 07 / 08 BOMs.
for folder, head, lines_, mode in (("07 New BOMs", "DTW_BOM_1_new", "DTW_BOM_1_new_lines", "new"), ("08 Changed BOMs", "DTW_BOM_2_changed", "DTW_BOM_2_changed_lines", "changed")):
	H = rows(folder, head)
	L = rows(folder, lines_)
	nl = {}
	for x in L:
		nl[x["ParentKey"]] = nl.get(x["ParentKey"], 0) + 1
	HF = values("H", ["code", "qty", "nlines"], [{"code": x["TreeCode"], "qty": float(x["Quantity"]), "nlines": nl.get(x["TreeCode"], 0)} for x in H])
	LF = values("L", ["father", "comp", "qty"], [{"father": x["ParentKey"], "comp": x["ItemCode"], "qty": float(x["Quantity"])} for x in L])
	before = ("-- BEFORE: expect BOMsAlreadyThere = 0, ItemsMissing = 0, ComponentsMissing = 0" if mode == "new" else
		"-- BEFORE: expect BOMsThere = %d, MoreLinesNowThanFile = 0, ComponentsMissing = 0" % len(H)) + NL + "WITH " + HF + "," + NL + LF + NL
	if mode == "new":
		before += ("SELECT (SELECT COUNT(*) FROM H JOIN OITT T ON T.Code = H.code) AS BOMsAlreadyThere," + NL +
			"       (SELECT COUNT(*) FROM H WHERE NOT EXISTS (SELECT 1 FROM OITM I WHERE I.ItemCode = H.code)) AS ItemsMissing,")
	else:
		before += ("SELECT (SELECT COUNT(*) FROM H JOIN OITT T ON T.Code = H.code) AS BOMsThere," + NL +
			"       (SELECT COUNT(*) FROM H WHERE (SELECT COUNT(*) FROM ITT1 X WHERE X.Father = H.code) > H.nlines) AS MoreLinesNowThanFile,")
	before += NL + "       (SELECT COUNT(DISTINCT comp) FROM L WHERE NOT EXISTS (SELECT 1 FROM OITM I WHERE I.ItemCode = L.comp)) AS ComponentsMissing;" + NL + NL
	after = ("-- AFTER the rest: expect BOMs = %d, HeaderQtyWrong = 0, Lines = %d, LinesWrong = 0, ExtraLines = 0 (second result lists any)" % (len(H), len(L)) + NL +
		"WITH " + HF + "," + NL + LF + NL +
		"SELECT (SELECT COUNT(*) FROM H JOIN OITT T ON T.Code = H.code) AS BOMs," + NL +
		"       (SELECT COUNT(*) FROM H JOIN OITT T ON T.Code = H.code WHERE ABS(T.Qauntity - H.qty) > 0.0005) AS HeaderQtyWrong," + NL +
		"       (SELECT COUNT(*) FROM ITT1 X JOIN H ON H.code = X.Father) AS Lines," + NL +
		"       (SELECT COUNT(*) FROM L WHERE NOT EXISTS (SELECT 1 FROM ITT1 X WHERE X.Father = L.father AND X.Code = L.comp AND ABS(X.Quantity - L.qty) <= 0.0005)) AS LinesWrong," + NL +
		"       (SELECT COUNT(*) FROM ITT1 X JOIN H ON H.code = X.Father WHERE NOT EXISTS (SELECT 1 FROM L WHERE L.father = X.Father AND L.comp = X.Code)) AS ExtraLines;" + NL +
		"WITH " + HF + "," + NL + LF + NL +
		"SELECT DISTINCT L.father FROM L WHERE NOT EXISTS (SELECT 1 FROM ITT1 X WHERE X.Father = L.father AND X.Code = L.comp AND ABS(X.Quantity - L.qty) <= 0.0005)" + NL +
		"UNION SELECT DISTINCT X.Father FROM ITT1 X JOIN H ON H.code = X.Father WHERE NOT EXISTS (SELECT 1 FROM L WHERE L.father = X.Father AND L.comp = X.Code);" + NL)
	write(folder, "check_" + folder[:2] + ".sql", before + after)

# 09 BOM header names.
r = [{"code": x["TreeCode"], "name": x["ProductDescription"]} for x in rows("09 BOM header names", "DTW_BOM_3_names")]
W = "WITH " + values("F", ["code", "name"], r) + NL
write("09 BOM header names", "check_09.sql",
	"-- AFTER the rest: expect BOMs = %d, NameWrong = 0 (second result lists any). A header-only update leaves the lines alone." % len(r) + NL + W +
	"SELECT (SELECT COUNT(*) FROM F JOIN OITT T ON T.Code = F.code) AS BOMs, (SELECT COUNT(*) FROM F JOIN OITT T ON T.Code = F.code WHERE T.Name <> F.name) AS NameWrong;" + NL +
	W + "SELECT F.code, T.Name AS InSAP, F.name AS InFile FROM F JOIN OITT T ON T.Code = F.code WHERE T.Name <> F.name;" + NL)

# 10 production orders.
O = rows("10 Production orders", "PROD_1_orders")
OL = rows("10 Production orders", "PROD_1_orders_lines")
OF = values("O", ["k", "product", "whs", "qty"], [{"k": int(x["AbsoluteEntry"]), "product": x["ItemNo"], "whs": x["Warehouse"], "qty": float(x["PlannedQuantity"])} for x in O])
LF = values("L", ["k", "comp", "whs", "qty"], [{"k": int(x["ParentKey"]), "comp": x["ItemNo"], "whs": x["Warehouse"], "qty": float(x["PlannedQuantity"])} for x in OL])
write("10 Production orders", "check_10.sql",
	"-- BEFORE: expect ProductsMissing = 0, ComponentsInactive = 0, StockShort = 0, StockMore = 0, ConversionOrdersAlready = 0" + NL +
	"-- (StockShort / StockMore: the old code's 01 stock is not what the order plans - live moved since the backup: REBUILD step 10)" + NL +
	"WITH " + OF + "," + NL + LF + NL +
	"SELECT (SELECT COUNT(*) FROM O WHERE NOT EXISTS (SELECT 1 FROM OITM I WHERE I.ItemCode = O.product AND I.validFor = 'Y')) AS ProductsMissing," + NL +
	"       (SELECT COUNT(*) FROM L JOIN OITM I ON I.ItemCode = L.comp WHERE I.validFor <> 'Y' OR I.frozenFor = 'Y') AS ComponentsInactive," + NL +
	"       (SELECT COUNT(*) FROM L LEFT JOIN OITW W ON W.ItemCode = L.comp AND W.WhsCode = L.whs WHERE ISNULL(W.OnHand,0) + 0.0005 < L.qty) AS StockShort," + NL +
	"       (SELECT COUNT(*) FROM L LEFT JOIN OITW W ON W.ItemCode = L.comp AND W.WhsCode = L.whs WHERE ISNULL(W.OnHand,0) > L.qty + 0.0005) AS StockMore," + NL +
	"       (SELECT COUNT(*) FROM OWOR WHERE Comments LIKE N'Item code conversion %') AS ConversionOrdersAlready;" + NL +
	"WITH " + LF + NL +
	"SELECT L.k, L.comp, L.whs, L.qty AS Planned, ISNULL(W.OnHand,0) AS OnHand FROM L LEFT JOIN OITW W ON W.ItemCode = L.comp AND W.WhsCode = L.whs WHERE ABS(ISNULL(W.OnHand,0) - L.qty) > 0.0005;" + NL + NL +
	"-- AFTER the rest: expect Orders = %d, Planned = %d, Special = %d, ProductOrQtyWrong = 0, Lines = %d, LinesWrong = 0" % (len(O), len(O), len(O), len(OL)) + NL +
	"WITH " + OF + "," + NL + LF + "," + NL +
	"W AS (SELECT DocEntry, CAST(SUBSTRING(Comments, 22, 10) AS int) AS k, ItemCode, Warehouse, PlannedQty, Status, Type FROM OWOR WHERE Comments LIKE N'Item code conversion %')" + NL +
	"SELECT (SELECT COUNT(*) FROM W) AS Orders," + NL +
	"       (SELECT COUNT(*) FROM W WHERE Status = 'P') AS Planned," + NL +
	"       (SELECT COUNT(*) FROM W WHERE Type = 'P') AS Special," + NL +
	"       (SELECT COUNT(*) FROM O LEFT JOIN W ON W.k = O.k WHERE W.k IS NULL OR W.ItemCode <> O.product OR W.Warehouse <> O.whs OR ABS(W.PlannedQty - O.qty) > 0.0005) AS ProductOrQtyWrong," + NL +
	"       (SELECT COUNT(*) FROM WOR1 X JOIN W ON W.DocEntry = X.DocEntry) AS Lines," + NL +
	"       (SELECT COUNT(*) FROM L LEFT JOIN W ON W.k = L.k LEFT JOIN WOR1 X ON X.DocEntry = W.DocEntry AND X.ItemCode = L.comp AND X.wareHouse = L.whs AND ABS(X.PlannedQty - L.qty) <= 0.0005 WHERE X.DocEntry IS NULL) AS LinesWrong;" + NL)
print("checks written for", DB)
