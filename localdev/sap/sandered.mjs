// A SANDERED item for every CURED item a finished good is packed from, in one SAP test company.
//
//     node localdev/sap/sandered.mjs TEST_HITECH_PRETREADS                   dry run: every item it would create
//     node localdev/sap/sandered.mjs TEST_HITECH_PRETREADS --only I-10982    one cured item
//     node localdev/sap/sandered.mjs TEST_HITECH_PRETREADS --apply ...       create them
//
// Sandering sits between curing and packing: a sandering order turns CURED into
// SANDERED, and packing takes SANDERED. So the sandered item is the cured one
// under another name — same group, unit, batch handling, valuation, warehouses
// and user fields — with the word CURED replaced and U_ProductType SANDERED.
// Its BOM is not made here; what goes into sandering is still being decided.
//
// Codes come from series 104 ("Items", I-), not the manual series the cured
// items carry, so a code can never collide with one somebody typed by hand.
// An item already holding the sandered name is left alone, so a second run
// creates only what the first did not. Every created item is read back.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const db = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!db) throw new Error("name the test company: node sandered.mjs TEST_HITECH_PRETREADS [--only I-10982] [--apply]");
const SERIES = 104;
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
const q = (v) => String(v).replace(/'/g, "''");

/** The sandered name for a cured one, or "" when there is no CURED to replace. Pure. */
export const sanderedName = (cured) => (/\bCURED\b/i.test(cured) ? cured.replace(/\bCURED\b(?!.*\bCURED\b)/i, (m) => (m === m.toLowerCase() ? "sandered" : m === "Cured" ? "Sandered" : "SANDERED")) : "");

// What the sandered item takes from the cured one unchanged.
const COPY = ["ItemsGroupCode", "InventoryItem", "SalesItem", "PurchaseItem", "ItemType", "ItemClass", "MaterialType",
	"ManageBatchNumbers", "ManageSerialNumbers", "SRIAndBatchManageMethod", "IssuePrimarilyBy", "ForceSelectionOfSerialNumber",
	"CostAccountingMethod", "GLMethod", "ManageStockByWarehouse", "IssueMethod", "PlanningSystem", "ProcurementMethod",
	"ComponentWarehouse", "InventoryUOM", "UoMGroupEntry", "InventoryUoMEntry", "SalesUnit", "PurchaseUnit",
	"VatLiable", "WTLiable", "TaxType", "GSTRelevnt", "GSTTaxCategory", "ChapterID", "InCostRollup",
	"U_SubTypeA", "U_SubTypeB", "U_TaxRate", "U_Quality", "U_Width", "U_Design", "U_Length", "U_Size", "U_Color",
	"U_BeltsPerRoll", "U_WeightPerRoll"];

const s = new SapSession(loadConfig(), db);
await s.login();
let failed = 0;
const made = [];
try {
	// Cured items that a finished good's BOM takes: those are the ones packing will need sandered.
	const boms = await all(s, "ProductTrees?$select=TreeCode,ProductTreeLines");
	const usedBy = new Map();
	for (const b of boms) for (const l of b.ProductTreeLines || []) {
		if (!usedBy.has(l.ItemCode)) usedBy.set(l.ItemCode, []);
		usedBy.get(l.ItemCode).push(b.TreeCode);
	}
	// Finished goods by item group, not by U_ProductType: most of them leave it blank, and a
	// `ne` filter in the Service Layer drops blanks along with the values it excludes.
	const groups = new Map((await all(s, "ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	const isFg = (g) => /^(FG|HOT$|Seconds$)/i.test(groups.get(g) || "");
	const items = await all(s, "Items?$select=ItemCode,ItemName,ItemsGroupCode,U_ProductType,Valid,Frozen");
	const fgCodes = new Set(items.filter((i) => isFg(i.ItemsGroupCode)).map((i) => i.ItemCode));
	// A finished good filed in the wrong group (DIES, Items) is still one if management's sheet converts it.
	const sheet = path.join(OUT, "fg-mapping.json");
	if (fs.existsSync(sheet)) for (const r of JSON.parse(fs.readFileSync(sheet, "utf8"))) if (r.old) fgCodes.add(r.old);
	const isCured = (i) => i.U_ProductType === "CURED" || (!isFg(i.ItemsGroupCode) && /\bCURED\b/i.test(i.ItemName));
	const cured = items.filter((i) => (only ? i.ItemCode === only : isCured(i)));
	const wanted = cured.filter((c) => only || (usedBy.get(c.ItemCode) || []).some((p) => fgCodes.has(p)));
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${cured.length} cured item(s), ${wanted.length} packed into a finished good`);

	for (const c of wanted) {
		try {
			const name = sanderedName(c.ItemName);
			if (!name) throw new Error("no CURED in the name to replace");
			if (name.length > 100) throw new Error("the sandered name is longer than SAP allows (100)");
			const there = await s.get(`Items?$select=ItemCode,ItemName&$filter=${encodeURIComponent(`ItemName eq '${q(name)}'`)}`);
			if (there.value.length) {
				console.log(`exists  ${c.ItemCode} → ${there.value[0].ItemCode} "${name}"`);
				made.push({ cured: c.ItemCode, sandered: there.value[0].ItemCode, name, existed: true });
				continue;
			}
			const full = await s.get(`Items('${encodeURIComponent(q(c.ItemCode))}')`);
			const payload = { ItemName: name, Series: SERIES, U_ProductType: "SANDERED", TreeType: "iNotATree" };
			for (const k of COPY) if (full[k] !== undefined && full[k] !== null) payload[k] = full[k];
			payload.ItemWarehouseInfoCollection = (full.ItemWarehouseInfoCollection || []).map((w) => ({ WarehouseCode: w.WarehouseCode }));
			if (!apply) {
				console.log(`would create from ${c.ItemCode} "${c.ItemName}": "${name}"${c.Valid === "tNO" || c.Frozen === "tYES" ? "  (cured item is inactive)" : ""}`);
				continue;
			}
			const res = await s.request("POST", "Items", payload);
			const back = await s.get(`Items('${encodeURIComponent(q(res.ItemCode))}')?$select=ItemCode,ItemName,ItemsGroupCode,InventoryUOM,ManageBatchNumbers,CostAccountingMethod,U_ProductType,U_Quality,Series`);
			const bad = ["ItemsGroupCode", "InventoryUOM", "ManageBatchNumbers", "CostAccountingMethod", "U_Quality"].filter((k) => back[k] !== full[k]);
			if (back.ItemName !== name || back.U_ProductType !== "SANDERED") bad.push("name/type");
			if (bad.length) throw new Error(`created ${res.ItemCode} but it reads back different in ${bad.join(", ")}`);
			console.log(`created ${c.ItemCode} → ${res.ItemCode} "${name}"`);
			made.push({ cured: c.ItemCode, sandered: res.ItemCode, name });
		} catch (e) {
			failed++;
			console.log(`FAILED  ${c.ItemCode} "${c.ItemName}": ${e.message}`);
		}
	}
} finally {
	await s.logout();
}
if (apply && made.length) {
	// The cured → sandered map the BOM step reads; merged so --only runs add up.
	const file = path.join(OUT, `${db}-sandered.json`);
	const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
	const byCured = new Map(prev.map((m) => [m.cured, m]));
	for (const m of made) byCured.set(m.cured, m);
	fs.writeFileSync(file, JSON.stringify([...byCured.values()], null, 1));
	console.log(`map → ${file}`);
}
if (failed) process.exitCode = 1;
