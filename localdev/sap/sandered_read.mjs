// Read-only: the sandered items as they stand in TEST, every field sandered.mjs gave them, for
// dtw_sandered.py to turn into a DTW create file for live.
//
//     node localdev/sap/sandered_read.mjs TEST_HITECH_PRETREADS
//
// Writes out/<DB>-sandered-full.json. Every call after Login is a GET.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2];
if (!db) throw new Error("node sandered_read.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const map = JSON.parse(fs.readFileSync(path.join(OUT, `${db}-sandered.json`), "utf8"));
const want = new Set(map.map((m) => m.sandered));

// sandered.mjs's COPY list, plus what it set itself.
const FIELDS = ["ItemCode", "ItemName", "Series", "U_ProductType", "Valid", "Frozen",
	"ItemsGroupCode", "InventoryItem", "SalesItem", "PurchaseItem", "ItemType", "ItemClass", "MaterialType",
	"ManageBatchNumbers", "ManageSerialNumbers", "SRIAndBatchManageMethod", "IssuePrimarilyBy", "ForceSelectionOfSerialNumber",
	"CostAccountingMethod", "GLMethod", "ManageStockByWarehouse", "IssueMethod", "PlanningSystem", "ProcurementMethod",
	"ComponentWarehouse", "InventoryUOM", "UoMGroupEntry", "InventoryUoMEntry", "SalesUnit", "SalesPackagingUnit", "PurchaseUnit",
	"VatLiable", "WTLiable", "TaxType", "GSTRelevnt", "GSTTaxCategory", "ChapterID", "InCostRollup",
	"U_SubTypeA", "U_SubTypeB", "U_TaxRate", "U_Quality", "U_Width", "U_Design", "U_Length", "U_Size", "U_Color",
	"U_BeltsPerRoll", "U_WeightPerRoll"];

const s = new SapSession(loadConfig(), db);
await s.login();
const rows = [];
try {
	let next = `Items?$select=${FIELDS.join(",")},ItemWarehouseInfoCollection&$filter=${encodeURIComponent("ItemCode ge 'I-14649' and ItemCode le 'I-15260'")}&$orderby=ItemCode`;
	while (next) {
		const r = await s.get(next);
		for (const i of r.value) if (want.has(i.ItemCode)) {
			i.ItemWarehouseInfoCollection = (i.ItemWarehouseInfoCollection || []).map((w) => w.WarehouseCode);
			rows.push(i);
		}
		const lnk = r["odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
} finally {
	await s.logout();
}
const missing = [...want].filter((c) => !rows.some((r) => r.ItemCode === c));
if (missing.length) throw new Error(`not found in ${db}: ${missing.join(", ")}`);
const file = path.join(OUT, `${db}-sandered-full.json`);
fs.writeFileSync(file, JSON.stringify(rows, null, 1));
console.log(`${rows.length} sandered items → ${file}`);
