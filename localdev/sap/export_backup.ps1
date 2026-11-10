# Read-only: what the DTW builders need from a restored live backup, as JSON in out/.
#
#     powershell -File localdev/sap/export_backup.ps1 -Database CLONE_HITECH_PRETREADS
#
# Writes out/<Database>-items.json, -warehouses-active.json, -cured-full.json, -fg-templates.json,
# -boms-full.json and -verify.json — the same files the 2 Nov backup (ORIG_HITECH_PRETREADS) gave, so
# the builders take DTW_SOURCE=<Database> and nothing else changes. Windows sign-in to the local instance;
# every statement is a SELECT. The cured and template lists come from TEST's sandered map and FG plan.
param([Parameter(Mandatory)][string]$Database, [string]$Test = 'TEST_HITECH_PRETREADS')

$out = Join-Path $PSScriptRoot 'out'
$c = New-Object System.Data.SqlClient.SqlConnection "Server=localhost;Database=$Database;Integrated Security=True"
$c.Open()
$cmd = $c.CreateCommand(); $cmd.CommandTimeout = 600
function Rows($sql) {
	$cmd.CommandText = $sql; $r = $cmd.ExecuteReader(); $l = New-Object System.Collections.ArrayList
	while ($r.Read()) { $o = [ordered]@{}; for ($i = 0; $i -lt $r.FieldCount; $i++) { $o[$r.GetName($i)] = if ($r.IsDBNull($i)) { $null } else { $r[$i] } }; [void]$l.Add($o) }
	$r.Close(); , $l
}
function Save($name, $data) { [IO.File]::WriteAllText("$out\$Database-$name.json", (ConvertTo-Json -InputObject $data -Depth 6 -Compress), (New-Object Text.UTF8Encoding $false)) }
function Quoted($codes) { ($codes | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" }) -join ',' }

$cmd.CommandText = "SELECT COL_LENGTH('OITM','U_Quality')"; $hasU = -not ($cmd.ExecuteScalar() -is [DBNull])
$u = if ($hasU) { 'U_ProductType AS type, U_Quality AS quality' } else { 'NULL AS type, NULL AS quality' }

$items = Rows "SELECT ItemCode AS code, ItemName AS name, ItmsGrpCod AS [group], $u, validFor AS valid, frozenFor AS frozen FROM OITM ORDER BY ItemCode"
Save 'items' $items
Save 'warehouses-active' @((Rows "SELECT WhsCode FROM OWHS WHERE Inactive = 'N'") | ForEach-Object { $_.WhsCode })

# Every column the builders copy from a template item, with its warehouses and prices.
$full = 'ItemCode, ItemName, ItmsGrpCod, VATLiable, PrchseItem, SellItem, InvntItem, ManSerNum, ManBtchNum, SalUnitMsr, BuyUnitMsr, SalPackUn, GLMethod, TaxType, ByWh, WTLiable, EvalSystem, IssueMthd, MngMethod, InvntryUom, PlaningSys, PrcrmntMtd, CompoWH, ItemType, ItemClass, MatType, IssuePriBy, UgpEntry, IUoMEntry, ChapterID, InCostRoll, GSTRelevnt, GstTaxCtg, MinLevel, MaxLevel, ReorderQty, validFor, frozenFor'
$udf = if ($hasU) { ', U_SubTypeA, U_SubTypeB, U_TaxRate, U_ProductType, U_Quality, U_Width, U_Design, U_Length, U_Size, U_Color, U_BeltsPerRoll, U_WeightPerRoll' } else { ', NULL U_SubTypeA, NULL U_SubTypeB, NULL U_TaxRate, NULL U_ProductType, NULL U_Quality, NULL U_Width, NULL U_Design, NULL U_Length, NULL U_Size, NULL U_Color, NULL U_BeltsPerRoll, NULL U_WeightPerRoll' }
function Full($codes) {
	if (-not $codes) { return , (New-Object System.Collections.ArrayList) }
	$in = Quoted $codes
	$rows = Rows "SELECT $full$udf FROM OITM WHERE ItemCode IN ($in)"
	$idx = @{}; foreach ($o in $rows) { $o['Warehouses'] = New-Object System.Collections.ArrayList; $o['WhsLevels'] = New-Object System.Collections.ArrayList; $o['Prices'] = New-Object System.Collections.ArrayList; $idx[$o.ItemCode] = $o }
	foreach ($w in (Rows "SELECT W.ItemCode, W.WhsCode, W.MinStock, W.MaxStock, W.MinOrder FROM OITW W WHERE W.ItemCode IN ($in) ORDER BY W.ItemCode, W.WhsCode")) {
		[void]$idx[$w.ItemCode].Warehouses.Add($w.WhsCode)
		[void]$idx[$w.ItemCode].WhsLevels.Add([ordered]@{ w = $w.WhsCode; min = [double]$w.MinStock; max = [double]$w.MaxStock; ord = [double]$w.MinOrder })
	}
	foreach ($p in (Rows "SELECT ItemCode, PriceList, Price, Currency FROM ITM1 WHERE ItemCode IN ($in) AND Price <> 0 ORDER BY ItemCode, PriceList")) {
		[void]$idx[$p.ItemCode].Prices.Add([ordered]@{ list = [int]$p.PriceList; price = [double]$p.Price; cur = $(if ($p.Currency) { $p.Currency } else { '' }) })
	}
	, $rows
}
$sandered = "$out\$Test-sandered.json"
if (Test-Path $sandered) { Save 'cured-full' (Full ((Get-Content $sandered -Raw | ConvertFrom-Json) | ForEach-Object { $_.cured } | Sort-Object -Unique)) }
$plan = "$out\$Test-fg-plan-applied.json"
if (Test-Path $plan) { Save 'fg-templates' (Full ((Get-Content $plan -Raw | ConvertFrom-Json) | ForEach-Object { $_.template } | Where-Object { $_ } | Sort-Object -Unique)) }
# Every item in full, for fg_build.py: a template can be any old item the final list names.
Save 'items-full' (Full ($items | ForEach-Object { $_.code }))
# An item moved into a group takes that group's valuation, planning and procurement (SAP does it on add).
Save 'groups' (Rows "SELECT ItmsGrpCod, ItmsGrpNam, InvntSys, PlaningSys, PrcrmntMtd, MatType FROM OITB")
Save 'chapters' (Rows "SELECT AbsEntry, ChapterID FROM OCHP")
Save 'warehouse-branches' (Rows "SELECT WhsCode, BPLid FROM OWHS")
Save 'doc-series' (Rows "SELECT ObjectCode, Series, SeriesName, BPLId, Locked, Indicator FROM NNM1 WHERE ObjectCode IN ('59', '60')")

# BOMs, with lines whose header is gone (left by deleted BOMs) set aside.
$h = New-Object 'System.Collections.Generic.Dictionary[string,object]'; $order = New-Object System.Collections.ArrayList
foreach ($o in (Rows "SELECT Code, TreeType, PriceList, Qauntity, ToWH, HideComp, PlAvgSize, Name, OcrCode, Project, UpdateDate FROM OITT")) { $o['lines'] = New-Object System.Collections.ArrayList; $h[$o.Code] = $o; [void]$order.Add($o) }
foreach ($l in (Rows "SELECT Father, ChildNum, VisOrder, Code, Quantity, Warehouse, Price, Currency, PriceList, IssueMthd, Comment, Type, AddQuantit, LineText, StageId, ItemName, OcrCode, Project FROM ITT1 ORDER BY Father, VisOrder, ChildNum")) {
	if ($h.ContainsKey($l.Father)) { $f = $l.Father; $l.Remove('Father'); [void]$h[$f].lines.Add($l) }
}
Save 'boms-full' $order

# Stock, batches, prices and history, for the verification workbook (fg_verify.py).
$v = [ordered]@{}
$q = if ($hasU) { 'T.U_Quality' } else { 'NULL' }
$v.items = Rows "SELECT T.ItemCode, T.ItemName, T.ItmsGrpCod, G.ItmsGrpNam, $q AS Quality, T.validFor, T.frozenFor, T.InvntryUom, T.ManBtchNum, T.EvalSystem, T.OnHand, T.IsCommited, T.OnOrder, T.AvgPrice, T.CreateDate, T.UpdateDate FROM OITM T LEFT JOIN OITB G ON G.ItmsGrpCod = T.ItmsGrpCod"
$v.whs = Rows "SELECT W.ItemCode, W.WhsCode, H.WhsName, W.OnHand, W.IsCommited, W.OnOrder, W.AvgPrice, W.StockValue FROM OITW W JOIN OWHS H ON H.WhsCode = W.WhsCode WHERE W.OnHand <> 0 OR W.IsCommited <> 0 OR W.OnOrder <> 0"
$v.batches = Rows "SELECT Q.ItemCode, Q.WhsCode, N.DistNumber, Q.Quantity, N.InDate, N.MnfDate, N.ExpDate FROM OBTQ Q JOIN OBTN N ON N.AbsEntry = Q.MdAbsEntry WHERE Q.Quantity <> 0"
$v.prices = Rows "SELECT P.ItemCode, P.PriceList, L.ListName, P.Price FROM ITM1 P JOIN OPLN L ON L.ListNum = P.PriceList WHERE P.Price <> 0"
$v.moves = Rows "SELECT ItemCode, TransType, COUNT(*) AS N, MIN(DocDate) AS First, MAX(DocDate) AS Last FROM OINM GROUP BY ItemCode, TransType"
$docs = foreach ($t in @(@('RDR1', 'sales order'), @('QUT1', 'sales quotation'), @('POR1', 'purchase order'), @('PRQ1', 'purchase request'), @('DLN1', 'delivery'), @('INV1', 'A/R invoice'), @('RIN1', 'A/R credit note'), @('PDN1', 'goods receipt PO'), @('PCH1', 'A/P invoice'))) {
	"SELECT ItemCode, '$($t[1])' AS Doc, COUNT(*) AS N, MAX(DocDate) AS Last FROM $($t[0]) GROUP BY ItemCode" }
$docs += "SELECT L.ItemCode, 'production order component' AS Doc, COUNT(*) AS N, MAX(H.PostDate) AS Last FROM WOR1 L JOIN OWOR H ON H.DocEntry = L.DocEntry GROUP BY L.ItemCode"
$docs += "SELECT ItemCode, 'production order' AS Doc, COUNT(*) AS N, MAX(PostDate) AS Last FROM OWOR GROUP BY ItemCode"
$v.docs = Rows ($docs -join ' UNION ALL ')
$v.openSO = Rows "SELECT L.ItemCode, SUM(L.OpenQty) AS OpenQty, COUNT(*) AS N FROM RDR1 L JOIN ORDR H ON H.DocEntry = L.DocEntry WHERE L.LineStatus = 'O' AND H.CANCELED = 'N' GROUP BY L.ItemCode"
$v.bomUse = Rows "SELECT Code AS ItemCode, COUNT(*) AS N FROM ITT1 I WHERE EXISTS (SELECT 1 FROM OITT T WHERE T.Code = I.Father) GROUP BY Code"
Save 'verify' $v
# Open production orders and open sales order lines (dtw_extras.py's open-SO list; the cut-over check).
$oo = [ordered]@{}
$oo.orders = Rows "SELECT W.DocEntry, W.DocNum, W.Type, W.Status, CONVERT(varchar(10), W.PostDate, 120) AS PostDate, CONVERT(varchar(10), W.DueDate, 120) AS DueDate, W.ItemCode, I.ItemName, G.ItmsGrpNam, W.PlannedQty, W.CmpltQty, W.Warehouse, W.OriginNum, W.CardCode FROM OWOR W JOIN OITM I ON I.ItemCode = W.ItemCode JOIN OITB G ON G.ItmsGrpCod = I.ItmsGrpCod WHERE W.Status IN ('P', 'R')"
$oo.lines = Rows "SELECT L.DocEntry, L.ItemCode, L.PlannedQty, L.IssuedQty, L.wareHouse FROM WOR1 L JOIN OWOR W ON W.DocEntry = L.DocEntry WHERE W.Status IN ('P', 'R')"
$oo.so = Rows "SELECT H.DocNum, CONVERT(varchar(10), H.DocDate, 120) AS DocDate, CONVERT(varchar(10), H.DocDueDate, 120) AS DueDate, H.CardCode, H.CardName, L.ItemCode, L.OpenQty FROM RDR1 L JOIN ORDR H ON H.DocEntry = L.DocEntry WHERE L.LineStatus = 'O' AND H.CANCELED = 'N'"
Save 'open-orders' $oo
$c.Close()
"$Database -> items $($items.Count), BOMs $($order.Count) in $out"
