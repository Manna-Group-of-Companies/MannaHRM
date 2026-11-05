// One space between words in the semi-finished and finished-good item names, in one SAP test company.
//
//     node localdev/sap/squeeze_names.mjs TEST_HITECH_PRETREADS            dry run → out/<DB>-squeeze-plan.json
//     node localdev/sap/squeeze_names.mjs TEST_HITECH_PRETREADS --apply    rename, retire, refresh BOM copies
//
// In scope: semi-finished items (EXTRUDED, CURED, SANDERED — by type or by the word, CURING too)
// and finished goods (the FG groups, and every new code from the brochure). Spaces inside a name
// become one and the ends are trimmed; nothing else in the name changes.
//
// Items whose names differ only in spacing become exact twins once squeezed (decided 4 Nov 2026):
// in each such group the one with a history — stock, open orders, a BOM of its own, a place on
// another BOM, a production order, or any past document line (stock movement, sales or purchase
// order, quotation, invoice, purchase request) — is kept, and the others are retired: OLD on the end
// of the name and made inactive. A group where two or more have a history is left exactly as it is
// and listed for a person to verify (user, 4 Nov 2026). A group where none has one keeps the
// active, typed, oldest code.
//
// Then every BOM whose header or line still carries an old copy of a renamed item's name is
// refreshed, the lines sent back as they were and checked unchanged.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const db = args.find((a) => !a.startsWith("--"));
if (!db) throw new Error("name the test company: node squeeze_names.mjs TEST_HITECH_PRETREADS [--apply]");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const newCodes = new Set(JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8")).map((m) => m.new));
// Manna Treads makes nothing; its finished goods are the groups it sells from.
const FG_GROUP = /^(FG|HOT|Seconds|PRECURED|Tread Gum|VULCANISING SOLUTION)$|^FG\b/i;

// Saved queries may read these; stock movement (OINM), goods receipt/issue and transfer lines are
// refused (702), so those three documents are asked per item through QueryService instead.
const HISTORY_TABLES = [["RDR1", "sales order lines"], ["QUT1", "quotation lines"], ["DLN1", "delivery lines"],
	["INV1", "invoice lines"], ["RDN1", "return lines"], ["RIN1", "credit note lines"], ["POR1", "purchase order lines"],
	["PRQ1", "purchase request lines"], ["PDN1", "goods receipt PO lines"], ["PCH1", "purchase invoice lines"],
	["RPD1", "goods return lines"], ["RPC1", "purchase credit lines"], ["WOR1", "production order lines"]];
const STOCK_DOCS = [["InventoryGenEntries", "DocumentLines", "goods receipts"], ["InventoryGenExits", "DocumentLines", "goods issues"],
	["StockTransfers", "StockTransferLines", "stock transfers"]];
const squeeze = (v) => String(v || "").replace(/\s+/g, " ").trim();
const keyOf = (v) => squeeze(v).toUpperCase();
const q = (v) => String(v).replace(/'/g, "''");
const key = (c) => `('${encodeURIComponent(q(c))}')`;
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
const plan = { db, rename: [], retire: [], leftAlone: [] };
let failed = 0;
try {
	const groups = new Map((await all(s, "ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	const base = "ItemCode,ItemName,ItemsGroupCode,Valid,Frozen,ItemWarehouseInfoCollection";
	let items;
	try { items = await all(s, `Items?$select=${base},U_ProductType&$orderby=ItemCode`); }
	catch { items = await all(s, `Items?$select=${base}&$orderby=ItemCode`); }
	const boms = await all(s, "ProductTrees?$select=TreeCode,ProductDescription,ProductTreeLines");
	const ownBom = new Set(boms.map((b) => b.TreeCode));
	const usedOn = new Set(boms.flatMap((b) => (b.ProductTreeLines || []).map((l) => l.ItemCode)));
	const ordered = new Set((await all(s, "ProductionOrders?$select=ItemNo")).map((p) => p.ItemNo));
	// Past documents too: an item somebody sold, bought, moved or quoted is not "unused" just because
	// its stock is gone. One saved query per table, since the Service Layer cannot read them itself.
	const moves = new Map();
	for (const [t, what] of HISTORY_TABLES) {
		const code = `conv_hist_${t.toLowerCase()}`, sql = `SELECT T0.ItemCode, COUNT(*) AS N FROM ${t} T0 GROUP BY T0.ItemCode ORDER BY T0.ItemCode`;
		const have = await s.get(`SQLQueries('${code}')`).catch(() => null);
		if (!have) await s.request("POST", "SQLQueries", { SqlCode: code, SqlName: `Item code conversion - ${what}`, SqlText: sql });
		for (const r of await all(s, `SQLQueries('${code}')/List`)) moves.set(r.ItemCode, (moves.get(r.ItemCode) || []).concat(`${r.N} ${what}`));
	}

	const isFg = (i) => newCodes.has(i.ItemCode) || FG_GROUP.test(groups.get(i.ItemsGroupCode) || "");
	// CURING only in the SFG group: elsewhere it is a curing bag or flap, not a tread (I-14084 is the one).
	const isSemi = (i) => !isFg(i) && (/^(CURED|EXTRUDED|SANDERED)$/i.test(i.U_ProductType || "") || /\b(CURED|EXTRUDED|SANDERED)\b/i.test(i.ItemName || "")
		|| (/\bCURING\b/i.test(i.ItemName || "") && /^SFG$/i.test(groups.get(i.ItemsGroupCode) || "")));
	const inScope = (i) => isFg(i) || isSemi(i);
	const active = (i) => i.Valid === "tYES" && i.Frozen !== "tYES";
	const history = (i) => {
		const why = [];
		const wh = i.ItemWarehouseInfoCollection || [];
		if (wh.some((w) => w.InStock)) why.push("stock");
		if (wh.some((w) => w.Committed || w.Ordered)) why.push("open orders");
		if (ownBom.has(i.ItemCode)) why.push("own BOM");
		if (usedOn.has(i.ItemCode)) why.push("on a BOM");
		if (ordered.has(i.ItemCode)) why.push("production orders");
		why.push(...(moves.get(i.ItemCode) || []));
		return why;
	};
	const row = (i) => ({ code: i.ItemCode, name: i.ItemName, kind: isFg(i) ? "FG" : isSemi(i) ? "SFG" : "other", active: active(i), history: history(i).join(", ") });

	const byKey = new Map();
	for (const i of items) byKey.set(keyOf(i.ItemName), (byKey.get(keyOf(i.ItemName)) || []).concat(i));
	const taken = new Set(items.map((i) => keyOf(i.ItemName)));
	const done = new Set();
	for (const [k, group] of byKey) {
		if (!group.some(inScope)) continue;
		if (group.length === 1) {
			const i = group[0];
			if (squeeze(i.ItemName) !== i.ItemName) plan.rename.push({ ...row(i), to: squeeze(i.ItemName) });
			continue;
		}
		const used = group.filter((i) => history(i).length);
		// Two of management's new codes under one description are management's to settle, never retired here.
		if (used.length > 1 || group.filter((i) => newCodes.has(i.ItemCode)).length > 1) { plan.leftAlone.push({ name: squeeze(group[0].ItemName), items: group.map(row) }); continue; }
		const keep = used[0] || [...group].sort((a, b) => (active(b) - active(a)) || (!!b.U_ProductType - !!a.U_ProductType) || a.ItemCode.localeCompare(b.ItemCode, "en", { numeric: true }))[0];
		if (squeeze(keep.ItemName) !== keep.ItemName) plan.rename.push({ ...row(keep), to: squeeze(keep.ItemName), note: `kept of ${group.length} twins`, group: k });
		for (const i of group.filter((x) => x !== keep)) {
			let to = `${squeeze(i.ItemName)} OLD`;
			for (let n = 2; taken.has(keyOf(to)); n++) to = `${squeeze(i.ItemName)} OLD ${n}`;
			taken.add(keyOf(to));
			plan.retire.push({ ...row(i), to, twinOf: keep.ItemCode, group: k });
		}
		done.add(k);
	}
	// A twin about to be retired is asked once more, against the stock documents saved queries cannot
	// read. One with any goes back, with its whole group, to the list a person verifies.
	const stockDocs = async (code) => {
		const found = [];
		for (const [e, ln, what] of STOCK_DOCS) {
			const r = await s.request("POST", "QueryService_PostQuery", { QueryPath: `$crossjoin(${e},${e}/${ln})`,
				QueryOption: `$expand=${e}($select=DocEntry),${e}/${ln}($select=ItemCode)&$filter=${e}/DocEntry eq ${e}/${ln}/DocEntry and ${e}/${ln}/ItemCode eq '${q(code)}'&$top=1` });
			if (r?.value?.length) found.push(what);
		}
		return found;
	};
	for (const x of [...plan.retire]) {
		const found = await stockDocs(x.code);
		if (!found.length) continue;
		x.history = found.join(", ");
		const members = [...plan.rename, ...plan.retire].filter((y) => y.group === x.group);
		plan.rename = plan.rename.filter((y) => y.group !== x.group);
		plan.retire = plan.retire.filter((y) => y.group !== x.group);
		plan.leftAlone.push({ name: squeeze(byKey.get(x.group)[0].ItemName), items: byKey.get(x.group).map((i) => ({ ...row(i), ...(members.find((m) => m.code === i.ItemCode && m.history) ? { history: members.find((m) => m.code === i.ItemCode).history } : {}) })) });
	}
	const count = (xs) => xs.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {});
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: rename ${plan.rename.length} ${JSON.stringify(count(plan.rename))}, retire ${plan.retire.length} ${JSON.stringify(count(plan.retire))}, twin groups left alone ${plan.leftAlone.length}`);

	if (apply) {
		for (const x of [...plan.rename, ...plan.retire]) {
			try {
				const retire = plan.retire.includes(x);
				// A retired twin keeps any open state of its own: refuse rather than strand it.
				if (retire && x.history) throw new Error(`has ${x.history}`);
				await s.request("PATCH", `Items${key(x.code)}`, { ItemName: x.to, ...(retire ? { Valid: "tNO", Frozen: "tYES" } : {}) });
				const back = await s.get(`Items${key(x.code)}?$select=ItemName,Frozen`);
				if (back.ItemName !== x.to || (retire && back.Frozen !== "tYES")) throw new Error(`reads back "${back.ItemName}" frozen ${back.Frozen}`);
				x.done = true;
			} catch (e) {
				failed++;
				x.error = e.message;
				console.log(`FAILED  ${x.code} "${x.name}": ${e.message}`);
			}
		}
		console.log(`renamed ${plan.rename.filter((x) => x.done).length}, retired ${plan.retire.filter((x) => x.done).length}, failed ${failed}`);
	}

	// BOM copies of the names, for the items this run renamed (or would).
	const nameNow = new Map([...plan.rename, ...plan.retire].filter((x) => !apply || x.done).map((x) => [x.code, x.to]));
	const stale = boms.filter((b) => (nameNow.has(b.TreeCode) && b.ProductDescription !== nameNow.get(b.TreeCode)) || (b.ProductTreeLines || []).some((l) => nameNow.has(l.ItemCode) && l.ItemName !== nameNow.get(l.ItemCode)));
	plan.staleBoms = stale.length;
	console.log(`  BOMs carrying an old name copy: ${stale.length}`);
	if (apply) {
		let fixed = 0;
		for (const b of stale) {
			try {
				const t = await s.get(`ProductTrees${key(b.TreeCode)}`);
				const lines = t.ProductTreeLines.map((l) => (nameNow.has(l.ItemCode) ? { ...l, ItemName: nameNow.get(l.ItemCode) } : l));
				await s.request("PATCH", `ProductTrees${key(b.TreeCode)}`, { ProductTreeLines: lines, ...(nameNow.has(b.TreeCode) ? { ProductDescription: nameNow.get(b.TreeCode) } : {}) });
				const back = await s.get(`ProductTrees${key(b.TreeCode)}`);
				const sig = (ls) => ls.map((l) => `${l.ItemCode}:${l.Quantity}:${l.Warehouse}:${l.IssueMethod}`).join(",");
				if (sig(back.ProductTreeLines) !== sig(t.ProductTreeLines) || back.Quantity !== t.Quantity) throw new Error("BOM reads back changed");
				fixed++;
			} catch (e) {
				failed++;
				console.log(`FAILED  BOM ${b.TreeCode}: ${e.message}`);
			}
		}
		console.log(`  BOM name copies refreshed: ${fixed}`);
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-squeeze-plan${apply ? "-applied" : ""}.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 1));
console.log(`plan → ${file}`);
if (failed) process.exitCode = 1;
