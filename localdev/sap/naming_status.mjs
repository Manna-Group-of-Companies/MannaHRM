// Read-only: where the item naming stands, in one SAP test company.
//
//     node localdev/sap/naming_status.mjs TEST_HITECH_PRETREADS
//
// Every item with its group, type, quality, active flags, stock and whether a
// BOM makes it or uses it — written to out/<DB>-naming-status.json for
// naming_status.py to turn into the FG and SFG workbooks. Every call after
// Login is a GET.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2];
if (!db) throw new Error("name the test company: node naming_status.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const all = async (s, rel) => {
	const rows = [];
	for (let next = rel; next;) {
		const r = await s.get(next);
		rows.push(...(r?.value ?? []));
		const lnk = r?.["odata.nextLink"] || r?.["@odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
	return rows;
};

const s = new SapSession(loadConfig(), db);
await s.login();
try {
	const groups = await all(s, "ItemGroups?$select=Number,GroupName");
	// Manna Treads has no U_ProductType / U_Quality, so ask for them only where they exist.
	const base = "ItemCode,ItemName,ItemsGroupCode,Valid,Frozen,ManageBatchNumbers,ItemWarehouseInfoCollection";
	let items;
	try { items = await all(s, `Items?$select=${base},U_ProductType,U_Quality&$orderby=ItemCode`); }
	catch { items = await all(s, `Items?$select=${base}&$orderby=ItemCode`); }
	const boms = await all(s, "ProductTrees?$select=TreeCode,ProductTreeLines");
	const usedIn = new Map();
	for (const b of boms) for (const l of b.ProductTreeLines || []) usedIn.set(l.ItemCode, (usedIn.get(l.ItemCode) || 0) + 1);
	const bomOf = new Set(boms.map((b) => b.TreeCode));
	const out = items.map((i) => {
		const wh = (i.ItemWarehouseInfoCollection || []).filter((w) => w.InStock || w.Committed || w.Ordered);
		return {
			code: i.ItemCode, name: i.ItemName, group: i.ItemsGroupCode, type: i.U_ProductType ?? null, quality: i.U_Quality ?? null,
			active: i.Valid === "tYES" && i.Frozen !== "tYES", batch: i.ManageBatchNumbers === "tYES",
			onHand: wh.reduce((a, w) => a + (w.InStock || 0), 0), committed: wh.reduce((a, w) => a + (w.Committed || 0), 0),
			value: wh.reduce((a, w) => a + (w.InStock || 0) * (w.StandardAveragePrice || 0), 0),
			hasBom: bomOf.has(i.ItemCode), usedIn: usedIn.get(i.ItemCode) || 0,
		};
	});
	const file = path.join(OUT, `${db}-naming-status.json`);
	fs.writeFileSync(file, JSON.stringify({ db, at: new Date().toISOString(), groups, items: out }, null, 1));
	console.log(`${db}: ${out.length} items, ${groups.length} groups, ${boms.length} BOMs → ${file}`);
} finally {
	await s.logout();
}
