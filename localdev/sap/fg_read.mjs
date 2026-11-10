// Read-only: the new finished goods as they stand in one TEST company, for dtw_fg.py.
//
//     node localdev/sap/fg_read.mjs TEST_HITECH_PRETREADS
//
// Writes out/<DB>-fg-full.json: every new code in fg-mapping.json with the fields fgitems.mjs set
// from management's sheet (group, quality, pattern, belts, roll weight). The rest of each item comes
// from its template in the live backup, not from here. Every call after Login is a GET.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2];
if (!db) throw new Error("node fg_read.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const want = new Set(JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8")).map((m) => m.new));

const s = new SapSession(loadConfig(), db);
await s.login();
const rows = [];
try {
	const udfs = new Set((await s.get("UserFieldsMD?$filter=TableName eq 'OITM'&$select=Name")).value.map((f) => `U_${f.Name}`));
	// The rest of the item too, so dtw_fg.py can show where TEST differs from the template on purpose.
	const sel = ["ItemCode", "ItemName", "ItemsGroupCode", "Valid", "Frozen", "U_Quality", "U_Design", "U_BeltsPerRoll", "U_WeightPerRoll", "U_ProductType",
		"InventoryItem", "SalesItem", "PurchaseItem", "ItemType", "ItemClass", "MaterialType", "ManageSerialNumbers", "ManageBatchNumbers",
		"SRIAndBatchManageMethod", "IssuePrimarilyBy", "CostAccountingMethod", "GLMethod", "ManageStockByWarehouse", "IssueMethod", "PlanningSystem",
		"ProcurementMethod", "ComponentWarehouse", "UoMGroupEntry", "InventoryUoMEntry", "InventoryUOM", "SalesUnit", "SalesPackagingUnit", "PurchaseUnit",
		"VatLiable", "WTLiable", "TaxType", "GSTRelevnt", "GSTTaxCategory", "ChapterID", "InCostRollup", "MinInventory", "MaxInventory",
		"U_SubTypeA", "U_SubTypeB", "U_TaxRate", "U_Width", "U_Length", "U_Size", "U_Color", "ItemWarehouseInfoCollection", "ItemPrices"]
		.filter((f) => !f.startsWith("U_") || udfs.has(f));
	for (let next = `Items?$select=${sel.join(",")}`; next;) {
		const r = await s.get(next);
		for (const i of r.value) if (want.has(i.ItemCode)) rows.push({ ...i,
			ItemWarehouseInfoCollection: (i.ItemWarehouseInfoCollection || []).map((w) => ({ w: w.WarehouseCode, min: w.MinimalStock, max: w.MaximalStock, ord: w.MinimalOrder })),
			ItemPrices: (i.ItemPrices || []).filter((x) => x.Price).map((x) => ({ list: x.PriceList, price: x.Price, cur: x.Currency })) });
		const lnk = r["odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-fg-full.json`);
fs.writeFileSync(file, JSON.stringify(rows, null, 1));
console.log(`${db}: ${rows.length} of ${want.size} new codes → ${file}`);
