// The new finished-good items under management's codes, and their packing BOMs, in one SAP test company.
//
//     node localdev/sap/fgitems.mjs TEST_HITECH_PRETREADS                     dry run: the plan, and out/<DB>-fg-plan.json
//     node localdev/sap/fgitems.mjs TEST_HITECH_PRETREADS --only PMD02516502  one new code
//     node localdev/sap/fgitems.mjs TEST_HITECH_PRETREADS --apply ...         create them
//     node localdev/sap/fgitems.mjs TEST_MANNA_TREADS --by-name               a company with its own old codes
//
// Reads out/fg-mapping.json (fg_mapping.py, from management's sheet) and
// out/<DB>-sandered.json (sandered.mjs). The codes and descriptions are
// management's and are used as they are.
//
// Each new item is a copy of an old finished good — group, unit, tax, valuation,
// warehouses, prices — under the new code and description, with quality,
// pattern, belts and roll weight from the sheet. Where several old codes become
// one new code, the old one with a BOM and the most stock is the template, and
// the others' BOMs are compared with it and reported, not merged.
//
// The new BOM is the template's with the cured line swapped for its sandered
// item and the sandering powder line left out: powder now comes out of the
// sandering order. Everything else on it is copied unchanged.
//
// A code with no old one (most bonding gum, Verdo and Rox solution) takes its
// item settings from the nearest row of its sheet that has one, and gets no
// BOM: another product's recipe is not its own.
//
// --by-name is for a company whose old codes are not the sheet's (Manna Treads
// buys and sells what Pretreads makes, under codes of its own). There an old
// item is found by its name matching the sheet's old name, and only when that
// name points at exactly one new code; the pairs found are written to
// out/<DB>-old-by-name.json for the stock move. A code with no match there
// copies its settings from the nearest matched item of its sheet but not its
// prices: another item's price is not this one's.
//
// An item or BOM that already exists is left alone, so a second run creates
// only what the first did not. Every created item and BOM is read back.
// SapSession refuses any company outside test_dbs. Old items are not touched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const byName = args.includes("--by-name");
const db = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!db) throw new Error("name the test company: node fgitems.mjs TEST_HITECH_PRETREADS [--only CODE] [--apply]");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const POWDER = "I-10176";
const MANUAL_SERIES = 3;

let mapping = JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8"));
const sanderedFile = path.join(OUT, `${db}-sandered.json`);
// A company that makes nothing has no sandered items and no BOMs to swap them into.
const sandered = new Map(fs.existsSync(sanderedFile) ? JSON.parse(fs.readFileSync(sanderedFile, "utf8")).map((m) => [m.cured, m.sandered]) : []);
const normName = (v) => String(v || "").toUpperCase().replace(/PRECURD/g, "PRECURED").replace(/[^A-Z0-9]/g, "");

const q = (v) => String(v).replace(/'/g, "''");
const key = (code) => `('${encodeURIComponent(q(code))}')`;
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
const tryGet = (s, rel) => s.get(rel).catch((e) => (e.status === 404 ? null : Promise.reject(e)));

// What the new item takes from its template unchanged.
const COPY = ["ItemsGroupCode", "InventoryItem", "SalesItem", "PurchaseItem", "ItemType", "ItemClass", "MaterialType",
	"ManageBatchNumbers", "ManageSerialNumbers", "SRIAndBatchManageMethod", "IssuePrimarilyBy", "ForceSelectionOfSerialNumber",
	"CostAccountingMethod", "GLMethod", "ManageStockByWarehouse", "IssueMethod", "PlanningSystem", "ProcurementMethod",
	"ComponentWarehouse", "InventoryUOM", "UoMGroupEntry", "InventoryUoMEntry", "SalesUnit", "PurchaseUnit", "SalesPackagingUnit",
	"VatLiable", "WTLiable", "TaxType", "GSTRelevnt", "GSTTaxCategory", "ChapterID", "InCostRollup",
	"U_SubTypeA", "U_SubTypeB", "U_TaxRate", "U_ProductType", "U_Width", "U_Length", "U_Size", "U_Color"];
const LINE = ["ItemCode", "Quantity", "Warehouse", "IssueMethod", "PriceList", "ItemType", "AdditionalQuantity", "Comment", "LineText"];

// For a code with no old one: the row of the same sheet, with an old code, whose new code is
// closest once the brand letter is set aside — BV02200509 takes after BM02200504.
const mask = (c) => c.slice(0, 1) + "_" + c.slice(2);
const common = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
// A stand-in must sit in the sheet's own group: Manna files one HOT item under PRECURED.
let inSheetGroup = () => true;
const nearest = (code, sheet) => mapping.filter((r) => r.old && r.sheet === sheet && inSheetGroup(r.old, sheet))
	.sort((a, b) => common(mask(b.new), mask(code)) - common(mask(a.new), mask(code)))[0];
// When no row of a sheet has an old item here at all (Manna's bonding gum is one "Bonding Gum"
// that matches twelve codes), the item of the sheet's group holding the most stock.
const SHEET_GROUP = { "PCTR BROCHURE": /^(PRECURED|FG - TRP)/i, "HOT BROCHURE": /^HOT$/i, "BONDING GUM": /^Tread Gum$|BONDING/i, "SOLUTION": /SOLUTION/i };
let groupStandIn = () => null;
let siblingGroup = () => null;
const FG_GROUP = /^(FG|HOT$|Seconds$|PRECURED$|Tread Gum$|VULCANISING SOLUTION$)/i;

const s = new SapSession(loadConfig(), db);
await s.login();
const plan = [];
let failed = 0;
try {
	const groups = new Map((await all(s, "ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	// User fields differ between companies (Manna's items have no U_BeltsPerRoll), and SAP refuses
	// an item that names one it lacks — so only the ones this company has are filled.
	// An inactive warehouse (ENG) can neither take stock levels nor be added to a new item.
	const activeWhs = new Set((await all(s, "Warehouses?$select=WarehouseCode,Inactive")).filter((w) => w.Inactive !== "tYES").map((w) => w.WarehouseCode));
	const udfs = new Set((await all(s, "UserFieldsMD?$filter=TableName eq 'OITM'&$select=Name")).map((f) => `U_${f.Name}`));
	{
		const stock = await all(s, "Items?$select=ItemCode,ItemsGroupCode,QuantityOnStock,Valid,Frozen");
		const groupOf = new Map(stock.map((i) => [i.ItemCode, groups.get(i.ItemsGroupCode) || ""]));
		// An old item filed outside finished goods (DIES, Items, SFG) does not pass that on: the new
		// item goes where the most items of its sheet, brand and quality already are.
		siblingGroup = (row) => {
			const tally = new Map();
			for (const r of mapping) {
				if (!r.old || r.sheet !== row.sheet || r.brand !== row.brand || r.quality !== row.quality) continue;
				const g = stock.find((i) => i.ItemCode === r.old)?.ItemsGroupCode;
				if (g !== undefined && FG_GROUP.test(groups.get(g) || "")) tally.set(g, (tally.get(g) || 0) + 1);
			}
			return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
		};
		inSheetGroup = (code, sheet) => !SHEET_GROUP[sheet] || SHEET_GROUP[sheet].test(groupOf.get(code) || "");
		groupStandIn = (sheet) => stock.filter((i) => SHEET_GROUP[sheet]?.test(groups.get(i.ItemsGroupCode) || "") && i.Valid === "tYES" && i.Frozen !== "tYES")
			.sort((a, b) => b.QuantityOnStock - a.QuantityOnStock)[0]?.ItemCode;
	}
	if (byName) {
		const here = new Map();
		for (const it of await all(s, "Items?$select=ItemCode,ItemName")) {
			const k = normName(it.ItemName);
			if (!here.has(k)) here.set(k, []);
			here.get(k).push(it.ItemCode);
		}
		const codesFor = new Map();
		for (const r of mapping) {
			const k = normName(r.old_name);
			if (!codesFor.has(k)) codesFor.set(k, new Set());
			codesFor.get(k).add(r.new);
		}
		mapping = mapping.map((r) => {
			const k = normName(r.old_name);
			const found = codesFor.get(k).size === 1 ? here.get(k) || [] : [];
			return { ...r, sheetOld: r.old, old: found.length === 1 ? found[0] : null };
		});
		const pairs = mapping.filter((r) => r.old).map((r) => ({ old: r.old, new: r.new, name: r.old_name }));
		fs.writeFileSync(path.join(OUT, `${db}-old-by-name.json`), JSON.stringify(pairs, null, 1));
		console.log(`by name: ${new Set(pairs.map((p) => p.old)).size} ${db} items matched to ${new Set(pairs.map((p) => p.new)).size} new codes`);
	}
	// The sheet's rows, one entry per new code.
	const byNew = new Map();
	for (const r of mapping) {
		if (only && r.new !== only) continue;
		if (!byNew.has(r.new)) byNew.set(r.new, { code: r.new, desc: r.desc, sheet: r.sheet, rows: [] });
		byNew.get(r.new).rows.push(r);
	}
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${byNew.size} new code(s)`);

	for (const n of byNew.values()) {
		const p = { code: n.code, name: n.desc, sheet: n.sheet, olds: [...new Set(n.rows.map((r) => r.old).filter(Boolean))], notes: [] };
		plan.push(p);
		try {
			if (!n.desc) throw new Error("no description on the sheet");
			if (n.desc.length > 200) throw new Error("description longer than SAP allows (200)");
			if (new Set(n.rows.map((r) => r.desc)).size > 1) throw new Error("the sheet gives this code more than one description");

			// Template: an old item that exists, preferring one with a BOM, then the most stock.
			const cands = [];
			for (const old of p.olds) {
				const it = await tryGet(s, `Items${key(old)}`);
				if (!it) { p.notes.push(`old ${old} is not in ${db}`); continue; }
				const bom = await tryGet(s, `ProductTrees${key(old)}`);
				cands.push({ old, it, bom });
			}
			let tpl = cands.sort((a, b) => (!!b.bom - !!a.bom) || (b.it.QuantityOnStock - a.it.QuantityOnStock))[0];
			let bomFrom = tpl?.bom ? tpl : null;
			if (!tpl) {
				const twin = nearest(n.code, n.sheet) || (groupStandIn(n.sheet) && { old: groupStandIn(n.sheet), new: "its group" });
				const it = twin && (await tryGet(s, `Items${key(twin.old)}`));
				if (!it) throw new Error("no old item to copy settings from");
				tpl = { old: twin.old, it, bom: null, borrowed: true };
				p.notes.push(`no old code: settings from ${twin.old} (${twin.new}), no prices, no BOM`);
			}
			p.template = tpl.old;
			const gname = groups.get(tpl.it.ItemsGroupCode) || "";
			p.group = gname;
			let groupCode = tpl.it.ItemsGroupCode;
			if (!FG_GROUP.test(gname)) {
				const sib = siblingGroup(n.rows[0]);
				if (sib === null) p.notes.push(`template's group is ${gname}, not a finished-goods group, and no sibling group found`);
				else { groupCode = sib; p.group = groups.get(sib); p.notes.push(`group ${groups.get(sib)}, not the old item's ${gname}`); }
			}

			const r0 = n.rows.find((r) => r.old === tpl.old) || n.rows[0];
			const item = { ItemCode: n.code, ItemName: n.desc, Series: MANUAL_SERIES };
			for (const k of COPY) if (tpl.it[k] !== undefined && tpl.it[k] !== null) item[k] = tpl.it[k];
			item.ItemsGroupCode = groupCode;
			if (r0.quality) item.U_Quality = String(r0.quality).slice(0, 30);
			if (r0.pattern) item.U_Design = String(r0.pattern).slice(0, 30);
			if (Number(r0.belts_per_roll) > 0) item.U_BeltsPerRoll = Number(r0.belts_per_roll);
			if (Number(r0.weight_per_roll) > 0) item.U_WeightPerRoll = Number(r0.weight_per_roll);
			const dropped = Object.keys(item).filter((k) => k.startsWith("U_") && !udfs.has(k));
			for (const k of dropped) delete item[k];
			if (dropped.length) p.fieldsLeftOut = dropped.join(", ");
			item.ItemWarehouseInfoCollection = (tpl.it.ItemWarehouseInfoCollection || []).filter((w) => activeWhs.has(w.WarehouseCode)).map((w) => ({ WarehouseCode: w.WarehouseCode }));
			// Stock levels, like prices, belong to the item they were set for: a stand-in's are not copied.
			if (!tpl.borrowed) {
				for (const k of ["MinInventory", "MaxInventory", "DesiredInventory"]) if (tpl.it[k]) item[k] = tpl.it[k];
				item.ItemWarehouseInfoCollection = (tpl.it.ItemWarehouseInfoCollection || []).filter((w) => activeWhs.has(w.WarehouseCode)).map((w) => ({ WarehouseCode: w.WarehouseCode,
					...(w.MinimalStock ? { MinimalStock: w.MinimalStock } : {}), ...(w.MaximalStock ? { MaximalStock: w.MaximalStock } : {}),
					...(w.MinimalOrder ? { MinimalOrder: w.MinimalOrder } : {}) }));
			}
			item.ItemPrices = tpl.borrowed ? [] : (tpl.it.ItemPrices || []).filter((x) => x.Price).map((x) => ({ PriceList: x.PriceList, Price: x.Price, Currency: x.Currency }));
			p.prices = item.ItemPrices.map((x) => `${x.PriceList}:${x.Price}`).join(" ");

			// The packing BOM: the template's, cured → sandered, powder out.
			let bom = null;
			if (bomFrom) {
				const b = bomFrom.bom;
				const lines = [];
				const swaps = [];
				for (const l of b.ProductTreeLines || []) {
					if (l.ItemCode === POWDER) { swaps.push(`powder ${l.Quantity} dropped`); continue; }
					const line = {};
					for (const k of LINE) if (l[k] !== undefined && l[k] !== null && l[k] !== "") line[k] = l[k];
					if (sandered.has(l.ItemCode)) {
						swaps.push(`${l.ItemCode} → ${sandered.get(l.ItemCode)}`);
						line.ItemCode = sandered.get(l.ItemCode);
					} else if (/\bCURED\b/i.test(l.ItemName || "")) {
						throw new Error(`BOM line ${l.ItemCode} "${l.ItemName}" is cured but has no sandered item`);
					}
					lines.push(line);
				}
				if (!swaps.some((x) => x.includes("→"))) p.notes.push("BOM has no cured line to swap (copied as it is)");
				bom = { TreeCode: n.code, TreeType: b.TreeType, Quantity: b.Quantity, Warehouse: b.Warehouse, PriceList: b.PriceList,
					PlanAvgProdSize: b.PlanAvgProdSize, ProductDescription: n.desc, ProductTreeLines: lines };
				p.bom = { from: bomFrom.old, quantity: b.Quantity, lines: lines.map((l) => `${l.ItemCode} ${l.Quantity}`).join(" | "), changes: swaps.join("; ") };
				// Other old codes merged into this one: say where their BOMs differ, merge nothing.
				const sig = (bb) => (bb?.ProductTreeLines || []).filter((l) => l.ItemCode !== POWDER).map((l) => sandered.get(l.ItemCode) || l.ItemCode).sort().join(",");
				for (const c of cands) if (c !== bomFrom && sig(c.bom) !== sig(bomFrom.bom)) p.notes.push(`old ${c.old}'s BOM differs from ${bomFrom.old}'s; using ${bomFrom.old}'s`);
			} else if (tpl.bom === null && p.olds.length && sandered.size) {
				p.notes.push("old item has no BOM: none made");
			}

			const existing = await tryGet(s, `Items${key(n.code)}?$select=ItemCode,ItemName`);
			const existingBom = bom && (await tryGet(s, `ProductTrees${key(n.code)}?$select=TreeCode`));
			if (existing && existing.ItemName !== n.desc) throw new Error(`code already in ${db} as "${existing.ItemName}"`);
			p.action = `${existing ? "item exists" : "create item"}${bom ? (existingBom ? ", BOM exists" : ", create BOM") : ""}`;
			if (!apply) continue;

			if (!existing) {
				await s.request("POST", "Items", item);
				const back = await s.get(`Items${key(n.code)}?$select=ItemCode,ItemName,ItemsGroupCode,InventoryUOM,ChapterID`);
				if (back.ItemName !== n.desc || back.ItemsGroupCode !== item.ItemsGroupCode) throw new Error("item created but reads back different");
			}
			if (bom && !existingBom) {
				await s.request("POST", "ProductTrees", bom);
				const back = await s.get(`ProductTrees${key(n.code)}`);
				const want = bom.ProductTreeLines.map((l) => `${l.ItemCode}:${l.Quantity}`).sort().join(",");
				const got = back.ProductTreeLines.map((l) => `${l.ItemCode}:${l.Quantity}`).sort().join(",");
				if (want !== got || back.Quantity !== bom.Quantity) throw new Error(`BOM created but reads back different: ${got}`);
			}
			p.done = true;
			console.log(`done    ${n.code} "${n.desc}" (${p.action})`);
		} catch (e) {
			failed++;
			p.error = e.message;
			console.log(`FAILED  ${n.code} "${n.desc}": ${e.message}`);
		}
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-fg-plan${apply ? "-applied" : ""}.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 1));
const count = (f) => plan.filter(f).length;
console.log(`\n${count((p) => p.action?.startsWith("create item"))} items to create, ${count((p) => p.action?.includes("create BOM"))} BOMs to create, ` +
	`${count((p) => p.action?.startsWith("item exists"))} items already there, ${count((p) => p.notes.length)} with notes, ${failed} failed → ${file}`);
if (failed) process.exitCode = 1;
