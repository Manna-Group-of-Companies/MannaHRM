// The sandering → packing trial on 220 R2, posted through the Service Layer, in one SAP test company.
//
//     node localdev/sap/trial.mjs TEST_HITECH_PRETREADS           run, or carry on from the last step that worked
//     node localdev/sap/trial.mjs TEST_HITECH_PRETREADS --status  what has been posted so far
//
// Each step is a production document as production would enter it: order, release, issue for
// production, receipt from production (by-product too), close. The first SAP error stops the run,
// and what was posted is kept in out/<DB>-trial.json, so a second run after a fix starts at the
// step that failed instead of posting the earlier ones again. Its purpose is to find what SAP
// refuses before people enter the same orders by hand.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const db = args.find((a) => !a.startsWith("--"));
if (!db) throw new Error("name the test company: node trial.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const STATE = path.join(OUT, `${db}-trial.json`);
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

const QTY = 10;
const DATE = new Date().toISOString().slice(0, 10);
const NEW_BATCH = "TRIAL-220R2";
const ORDERS = [
	{ key: "sandering", item: "I-14649", batchOut: NEW_BATCH },
	{ key: "packing", item: "PMD00901502", batchOut: null },
];
const MEMO = "Sandering trial";

if (args.includes("--status")) { console.log(JSON.stringify(state, null, 1)); process.exit(0); }

const s = new SapSession(loadConfig(), db);
const stockOf = async (code) => {
	const i = await s.get(`Items('${code}')?$select=ItemCode,ManageBatchNumbers,ItemWarehouseInfoCollection`);
	const w = i.ItemWarehouseInfoCollection.find((x) => x.WarehouseCode === "01") || {};
	return { batch: i.ManageBatchNumbers === "tYES", onHand: w.InStock || 0, avg: w.StandardAveragePrice || 0 };
};
// Batches of an item in warehouse 01 with stock, oldest first — through the saved query stockmove.mjs made.
const batchesOf = async (code) => {
	const rows = [];
	for (let n = "SQLQueries('conv_batches')/List"; n;) {
		const r = await s.get(n);
		rows.push(...r.value);
		const l = r["odata.nextLink"];
		n = l ? l.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
	return rows.filter((b) => b.ItemCode === code && b.WhsCode === "01" && b.Quantity > 0);
};
// Takes qty from batches in order; refuses when they do not hold enough.
const pick = (batches, qty) => {
	const out = [];
	let left = qty;
	for (const b of batches) {
		if (left <= 0) break;
		const q = Math.min(b.Quantity, left);
		out.push({ BatchNumber: b.DistNumber, Quantity: Math.round(q * 1000) / 1000 });
		left = Math.round((left - q) * 1000) / 1000;
	}
	if (left > 0) throw new Error(`batches hold ${qty - left} of ${qty}`);
	return out;
};

const step = async (o, name, fn) => {
	const st = (state[o.key] ||= {});
	if (st[name]) { console.log(`  ${o.key} ${name}: already done (${JSON.stringify(st[name])})`); return st[name]; }
	try {
		st[name] = await fn(st);
		save();
		console.log(`  ${o.key} ${name}: ${JSON.stringify(st[name])}`);
		return st[name];
	} catch (e) {
		st.error = { step: name, message: e.message, sapCode: e.sapCode ?? null, at: new Date().toISOString() };
		save();
		console.log(`STOPPED at ${o.key} ${name}: ${e.message}${e.sapCode ? ` (SAP ${e.sapCode})` : ""}`);
		throw e;
	}
};

await s.login();
try {
	for (const o of ORDERS) {
		console.log(`\n${o.key}: ${QTY} of ${o.item}`);
		const order = await step(o, "order", async () => {
			const r = await s.request("POST", "ProductionOrders", { ItemNo: o.item, PlannedQuantity: QTY, Warehouse: "01",
				ProductionOrderType: "bopotStandard", PostingDate: DATE, DueDate: DATE, Remarks: MEMO });
			return { entry: r.AbsoluteEntry, number: r.DocumentNumber, lines: r.ProductionOrderLines.map((l) => ({ line: l.LineNumber, item: l.ItemNo, planned: l.PlannedQuantity })) };
		});
		await step(o, "release", async () => {
			await s.request("PATCH", `ProductionOrders(${order.entry})`, { ProductionOrderStatus: "boposReleased" });
			const r = await s.get(`ProductionOrders(${order.entry})?$select=ProductionOrderStatus`);
			if (r.ProductionOrderStatus !== "boposReleased") throw new Error(`status is ${r.ProductionOrderStatus}`);
			return { status: r.ProductionOrderStatus };
		});
		await step(o, "issue", async () => {
			const lines = [];
			for (const l of order.lines.filter((x) => x.planned > 0)) {
				const st = await stockOf(l.item);
				const line = { BaseType: 202, BaseEntry: order.entry, BaseLine: l.line, Quantity: l.planned, WarehouseCode: "01" };
				if (st.batch) line.BatchNumbers = pick(await batchesOf(l.item), l.planned);
				lines.push(line);
			}
			const r = await s.request("POST", "InventoryGenExits", { DocDate: DATE, Comments: `${MEMO}: issue for production ${order.number}`, DocumentLines: lines });
			return { entry: r.DocEntry, number: r.DocNum, lines: r.DocumentLines.map((l) => ({ item: l.ItemCode, qty: l.Quantity, price: l.Price, batches: (l.BatchNumbers || []).map((b) => b.BatchNumber).join(",") })) };
		});
		await step(o, "receipt", async () => {
			const parent = await stockOf(o.item);
			const lines = [{ BaseType: 202, BaseEntry: order.entry, Quantity: QTY, WarehouseCode: "01",
				...(parent.batch ? { BatchNumbers: [{ BatchNumber: o.batchOut, Quantity: QTY }] } : {}) }];
			// By-products: the order's negative lines are received, not issued.
			for (const l of order.lines.filter((x) => x.planned < 0)) {
				const st = await stockOf(l.item);
				lines.push({ BaseType: 202, BaseEntry: order.entry, BaseLine: l.line, Quantity: -l.planned, WarehouseCode: "01",
					...(st.batch ? { BatchNumbers: [{ BatchNumber: `${o.batchOut || "TRIAL"}-BP`, Quantity: -l.planned }] } : {}) });
			}
			// "Is Approve" = Yes, as the company's variance rule asks: a new item has no cost to
			// compare with, so its first receipt is always "off". Agreed for the TEST trial only
			// (2 Nov 2026); live needs its own answer.
			const r = await s.request("POST", "InventoryGenEntries", { DocDate: DATE, Comments: `${MEMO}: receipt from production ${order.number}`,
				U_Approve: "Y", DocumentLines: lines });
			return { entry: r.DocEntry, number: r.DocNum, lines: r.DocumentLines.map((l) => ({ item: l.ItemCode, qty: l.Quantity, price: l.Price })) };
		});
		await step(o, "close", async () => {
			await s.request("PATCH", `ProductionOrders(${order.entry})`, { ProductionOrderStatus: "boposClosed" });
			const r = await s.get(`ProductionOrders(${order.entry})?$select=ProductionOrderStatus,CompletedQuantity`);
			return { status: r.ProductionOrderStatus, completed: r.CompletedQuantity };
		});
	}
	console.log("\ntrial complete");
} catch {
	process.exitCode = 1;
} finally {
	await s.logout();
}
