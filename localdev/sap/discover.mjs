// Read-only: what the item-code conversion has to move, in one SAP test company.
//
//     node localdev/sap/discover.mjs TEST_HITECH_PRETREADS
//
// Every item with its batch, serial and valuation settings and its stock per
// warehouse; every bill of materials with its lines; the item groups. Written
// to out/<DB>-discovery.json for the conversion list to be filled from. Every
// call after Login is a GET.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2];
if (!db) throw new Error("name the test company: node discover.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const all = async (s, rel) => {
	const rows = [];
	for (let next = rel; next;) {
		const r = await s.get(next);
		rows.push(...(r?.value ?? []));
		const lnk = r?.["odata.nextLink"] || r?.["@odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
		if (rows.length % 500 < 20) process.stdout.write(`\r  ${rel.split("?")[0]} ${rows.length}   `);
	}
	process.stdout.write("\n");
	return rows;
};

const s = new SapSession(loadConfig(), db);
await s.login();
try {
	const groups = await all(s, "ItemGroups?$select=Number,GroupName");
	const items = await all(s, "Items?$select=ItemCode,ItemName,ItemsGroupCode,InventoryItem,SalesItem,PurchaseItem,ManageBatchNumbers,ManageSerialNumbers,CostAccountingMethod,Valid,Frozen,ItemWarehouseInfoCollection&$orderby=ItemCode");
	const boms = await all(s, "ProductTrees?$select=TreeCode,TreeType,Quantity,ProductTreeLines&$orderby=TreeCode");
	const stock = items.flatMap((i) => (i.ItemWarehouseInfoCollection || [])
		.filter((w) => w.InStock || w.Committed || w.Ordered)
		.map((w) => ({ ItemCode: i.ItemCode, Warehouse: w.WarehouseCode, InStock: w.InStock, Committed: w.Committed, Ordered: w.Ordered, AvgPrice: w.StandardAveragePrice })));
	for (const i of items) delete i.ItemWarehouseInfoCollection;
	fs.mkdirSync(OUT, { recursive: true });
	const file = path.join(OUT, `${db}-discovery.json`);
	fs.writeFileSync(file, JSON.stringify({ db, read: new Date().toISOString(), groups, items, boms, stock }, null, 1));
	console.log(`${db}: ${items.length} items, ${groups.length} groups, ${boms.length} BOMs, ${stock.length} item-warehouse rows with stock → ${file}`);
} finally {
	await s.logout();
}
