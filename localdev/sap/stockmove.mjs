// Old finished-good stock onto the new codes, in one SAP test company: a Goods Issue of each
// old code and a Goods Receipt of its new code, same warehouse, quantity, batch and cost.
//
//     node localdev/sap/stockmove.mjs TEST_HITECH_PRETREADS                         dry run → out/<DB>-stockmove-plan.json
//     node localdev/sap/stockmove.mjs TEST_HITECH_PRETREADS --only 220R2BP          one old code
//     node localdev/sap/stockmove.mjs TEST_HITECH_PRETREADS --apply --account 1234  post them
//
// The pairs come from out/fg-mapping.json (fg_mapping.py); the new items must
// already exist (fgitems.mjs). Several old codes onto one new code simply add up.
//
// Value: the Goods Receipt is priced at what the Goods Issue actually took out
// of stock, read back line by line, so the stock value does not move. The dry
// run's values are estimates from the average and batch costs.
//
// Account: --apply refuses without --account, and puts that one account on both
// documents. Left to the defaults, an Issue posts to Stock Difference Losses and
// a Receipt to Stock Difference Gains — a code change dressed up as a loss and
// a gain of the same amount.
//
// Batches are moved batch for batch, read through a saved SQL query
// (SQLQueries 'conv_batches'), since the Service Layer has no batch-quantity
// read. Per-batch valued items get one line per batch, so each batch keeps its
// own cost. Bin-managed warehouses are reported and not moved yet.
//
// If a Receipt fails after its Issue posted, the run stops at once: that stock
// is out of the old code and not yet on the new one, and needs a person.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const apply = args.includes("--apply");
const only = opt("--only");
const account = opt("--account");
const date = opt("--date") || new Date().toISOString().slice(0, 10);
const db = args.find((a, i) => !a.startsWith("--") && !["--only", "--account", "--date"].includes(args[i - 1]));
if (!db) throw new Error("name the test company: node stockmove.mjs TEST_HITECH_PRETREADS [--only OLD] [--apply --account CODE] [--date YYYY-MM-DD]");
if (apply && !account) throw new Error("--apply needs --account: the one account both the Issue and the Receipt post against");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const LINES_PER_DOC = 40;
const MEMO = "Item code conversion";

const mapping = JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8"));
const newOf = new Map();
for (const r of mapping) if (r.old && (!only || r.old === only)) newOf.set(r.old, r.new);

const q = (v) => String(v).replace(/'/g, "''");
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
const items = async (s, codes, select) => {
	const out = new Map();
	const list = [...codes];
	// 20 codes a query: the Service Layer pages at 20 rows whatever $top asks.
	for (let i = 0; i < list.length; i += 20) {
		const f = list.slice(i, i + 20).map((c) => `ItemCode eq '${q(c)}'`).join(" or ");
		for (const it of await all(s, `Items?$select=${select}&$filter=${encodeURIComponent(f)}`)) out.set(it.ItemCode, it);
	}
	return out;
};
const savedQuery = async (s, code, name, sql) => {
	const have = await s.get(`SQLQueries('${code}')`).catch(() => null);
	if (!have) await s.request("POST", "SQLQueries", { SqlCode: code, SqlName: name, SqlText: sql });
	else if (have.SqlText !== sql) await s.request("PATCH", `SQLQueries('${code}')`, { SqlText: sql });
	return all(s, `SQLQueries('${code}')/List`);
};
// The Receipt's batches: the Issue's own, one CONV- batch, or none — whatever the new item keeps.
const grBatches = (l, qty) => (l.grBatch === "same" ? { BatchNumbers: l.batches.map((b) => ({ BatchNumber: b.BatchNumber, Quantity: b.Quantity })) }
	: l.grBatch ? { BatchNumbers: [{ BatchNumber: l.grBatch, Quantity: qty }] } : {});
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

const s = new SapSession(loadConfig(), db);
await s.login();
const plan = { db, date, account: account || null, docs: [], skipped: [], problems: [] };
try {
	const sel = "ItemCode,ItemName,ManageBatchNumbers,ManageSerialNumbers,CostAccountingMethod,Valid,Frozen,ItemWarehouseInfoCollection";
	const olds = await items(s, newOf.keys(), sel);
	const news = await items(s, new Set(newOf.values()), "ItemCode,ItemName,ManageBatchNumbers,CostAccountingMethod,Valid,Frozen");
	const whs = new Map((await s.get("Warehouses?$select=WarehouseCode,EnableBinLocations")).value.map((w) => [w.WarehouseCode, w]));
	const batches = (await savedQuery(s, "conv_batches", "Item code conversion - batch stock",
		"SELECT T0.ItemCode, T0.WhsCode, T1.DistNumber, T0.Quantity, T1.CostTotal, T1.Quantity AS BatchTotal FROM OBTQ T0 INNER JOIN OBTN T1 ON T0.ItemCode = T1.ItemCode AND T0.SysNumber = T1.SysNumber WHERE T0.Quantity <> 0 ORDER BY T0.ItemCode, T0.WhsCode, T0.SysNumber"))
		.filter((b) => newOf.has(b.ItemCode));
	const batchesAt = new Map();
	for (const b of batches) {
		const k = `${b.ItemCode}|${b.WhsCode}`;
		if (!batchesAt.has(k)) batchesAt.set(k, []);
		batchesAt.get(k).push(b);
	}

	// One line per old code and warehouse — or per batch, for an item valued per batch.
	const lines = new Map();
	for (const [old, nw] of newOf) {
		const o = olds.get(old);
		const n = news.get(nw);
		if (!o) { plan.problems.push({ old, new: nw, why: "old code not in SAP" }); continue; }
		if (!n) { plan.problems.push({ old, new: nw, why: "new item not created yet (run fgitems.mjs)" }); continue; }
		if (o.ManageSerialNumbers === "tYES") { plan.problems.push({ old, new: nw, why: "serial-managed: not handled" }); continue; }
		// Several old codes onto one new code need not agree on batches: the Issue follows the old
		// item, the Receipt the new one, and a new batch item fed from a plain one gets CONV-<old>.
		const grBatch = n.ManageBatchNumbers === "tYES" ? (o.ManageBatchNumbers === "tYES" ? "same" : `CONV-${old}`) : null;
		if (n.Valid === "tNO" || n.Frozen === "tYES") { plan.problems.push({ old, new: nw, why: "new item is inactive" }); continue; }
		for (const w of o.ItemWarehouseInfoCollection || []) {
			const qty = round(w.InStock || 0);
			if (!qty) continue;
			const base = { old, new: nw, grBatch, name: o.ItemName, whs: w.WarehouseCode, valuation: o.CostAccountingMethod, committed: round(w.Committed || 0) };
			if (qty < 0) { plan.skipped.push({ ...base, qty, why: "negative stock" }); continue; }
			if (whs.get(w.WarehouseCode)?.EnableBinLocations === "tYES") { plan.skipped.push({ ...base, qty, why: "bin-managed warehouse: not handled yet" }); continue; }
			let entries = [{ ...base, qty, price: w.StandardAveragePrice || 0 }];
			if (o.ManageBatchNumbers === "tYES") {
				const bs = batchesAt.get(`${old}|${w.WarehouseCode}`) || [];
				const sum = round(bs.reduce((a, b) => a + b.Quantity, 0));
				if (sum !== qty) { plan.skipped.push({ ...base, qty, why: `batches add up to ${sum}, stock says ${qty}` }); continue; }
				const batchList = bs.map((b) => ({ BatchNumber: b.DistNumber, Quantity: round(b.Quantity), cost: b.BatchTotal ? b.CostTotal / b.BatchTotal : null }));
				entries = o.CostAccountingMethod === "bis_SNB"
					? batchList.map((b) => ({ ...base, qty: b.Quantity, price: b.cost ?? w.StandardAveragePrice ?? 0, batches: [b] }))
					: [{ ...base, qty, price: w.StandardAveragePrice || 0, batches: batchList }];
			}
			if (!lines.has(w.WarehouseCode)) lines.set(w.WarehouseCode, []);
			lines.get(w.WarehouseCode).push(...entries);
		}
	}
	for (const [wc, ls] of lines) {
		for (let i = 0; i < ls.length; i += LINES_PER_DOC) {
			const chunk = ls.slice(i, i + LINES_PER_DOC);
			plan.docs.push({ id: `${wc}-${i / LINES_PER_DOC + 1}`, whs: wc, lines: chunk,
				qty: round(chunk.reduce((a, l) => a + l.qty, 0)), value: round(chunk.reduce((a, l) => a + l.qty * l.price, 0), 2) });
		}
	}

	const totals = { lines: plan.docs.reduce((a, d) => a + d.lines.length, 0), qty: round(plan.docs.reduce((a, d) => a + d.qty, 0)), value: round(plan.docs.reduce((a, d) => a + d.value, 0), 2) };
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db} on ${date}: ${newOf.size} old code(s) → ${plan.docs.length} Issue/Receipt pair(s), ${totals.lines} lines, ${totals.qty} on hand, about ₹${totals.value.toLocaleString("en-IN")}`);
	for (const d of plan.docs) console.log(`  ${d.id}: ${d.lines.length} lines, ${d.qty}, about ₹${d.value.toLocaleString("en-IN")}`);
	console.log(`  skipped ${plan.skipped.length}, problems ${plan.problems.length}, ${plan.docs.flatMap((d) => d.lines).filter((l) => l.committed).length} lines with open orders on the old code`);

	if (apply) {
		const doneFile = path.join(OUT, `${db}-stockmove-done.json`);
		const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, "utf8")) : [];
		for (const d of plan.docs) {
			const giLines = d.lines.map((l) => ({ ItemCode: l.old, Quantity: l.qty, WarehouseCode: d.whs, AccountCode: account,
				...(l.batches ? { BatchNumbers: l.batches.map((b) => ({ BatchNumber: b.BatchNumber, Quantity: b.Quantity })) } : {}) }));
			const memo = `${MEMO} ${d.id}`;
			const gi = await s.request("POST", "InventoryGenExits", { DocDate: date, TaxDate: date, Comments: memo, JournalMemo: memo, DocumentLines: giLines });
			let gr;
			try {
				const back = await s.get(`InventoryGenExits(${gi.DocEntry})?$select=DocNum,DocumentLines`);
				const grLines = back.DocumentLines.map((bl, i) => ({ ItemCode: d.lines[i].new, Quantity: bl.Quantity, WarehouseCode: d.whs, AccountCode: account,
					UnitPrice: bl.Price, ...grBatches(d.lines[i], bl.Quantity) }));
				gr = await s.request("POST", "InventoryGenEntries", { DocDate: date, TaxDate: date, Comments: `${memo} (Issue ${back.DocNum})`, JournalMemo: memo, DocumentLines: grLines });
				const giTotal = round(back.DocumentLines.reduce((a, l) => a + l.LineTotal, 0), 2);
				const grBack = await s.get(`InventoryGenEntries(${gr.DocEntry})?$select=DocNum,DocumentLines`);
				const grTotal = round(grBack.DocumentLines.reduce((a, l) => a + l.LineTotal, 0), 2);
				done.push({ id: d.id, issue: back.DocNum, receipt: grBack.DocNum, issueValue: giTotal, receiptValue: grTotal });
				fs.writeFileSync(doneFile, JSON.stringify(done, null, 1));
				console.log(`posted ${d.id}: Issue ${back.DocNum} ₹${giTotal} → Receipt ${grBack.DocNum} ₹${grTotal}${giTotal !== grTotal ? "  VALUES DIFFER" : ""}`);
			} catch (e) {
				console.log(`STOPPED at ${d.id}: Issue DocEntry ${gi.DocEntry} posted, Receipt failed: ${e.message}`);
				console.log("That stock is off the old codes and not on the new ones. Post the Receipt by hand or cancel the Issue before running again.");
				process.exitCode = 2;
				break;
			}
		}
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-stockmove-plan.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 1));
console.log(`plan → ${file}`);
