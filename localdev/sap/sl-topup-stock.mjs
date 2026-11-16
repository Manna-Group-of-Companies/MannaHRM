// Brings every stock item in TEST_HITECH_PRETREADS up to a minimum in one warehouse, finished goods left out, so
// production orders and transfers on the TEST company have something to draw on (asked for 12 Nov 2026).
//
//     node localdev/sap/sl-topup-stock.mjs                      dry run: what is short, and by how much
//     node localdev/sap/sl-topup-stock.mjs --apply --approve    posts the goods receipts
//     node localdev/sap/sl-topup-stock.mjs --apply --approve --docs 1     ...the first receipt only
//     --min 100   --whs 01   --lines 50   --skip-groups 107,114,115,116,117,118,120
//     node localdev/sap/sl-topup-stock.mjs --skip-groups none   finished goods as well (asked for the same day)
//
// It reaches a TARGET, like Set-SapTestStock.ps1: each run reads what the warehouse holds now and receives only
// the shortfall, so a run that stopped half way is finished by running it again, and a second run adds nothing.
//
// The decisions in it are the user's (12 Nov 2026):
//   - Warehouse 01. That is where stock sits and what every bill of material issues from; 07 is the aged-stock
//     store and nothing reads it.
//   - Hi-Tech refuses a receipt into 01 without U_Approve = Y. This never sets that by itself: --approve has to
//     be on the command line, because the flag is a person's approval and was given for this job, not for good.
//   - "Finished goods" are the item groups named FG (107 and the six "FG - TRP" groups). The item's own
//     material type is no guide: most finished goods here say Raw Material.
//   - Each item comes in at its CURRENT cost. The company costs by moving average, so a nil-value receipt would
//     pull down the cost of every item that has one; at its own cost the average stays where it is. An item
//     with no cost comes in at nil.
// The minimum is in the item's own unit: 100 kg for nearly all of them, 100 pieces or litres for the rest.
//
// TEST company only, through sapguard. A receipt cannot be deleted afterwards, only reversed by a goods issue.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const DB = "TEST_HITECH_PRETREADS";
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] ?? "") : fallback; };
const apply = args.includes("--apply");
const approve = args.includes("--approve");
const MIN = Number(opt("--min", "100"));
const WHS = opt("--whs", "01");
const LINES = Number(opt("--lines", "50"));
const DOCS = Number(opt("--docs", "0"));
const SKIP = new Set(opt("--skip-groups", "107,114,115,116,117,118,120").split(",").map((x) => Number(x.trim())).filter(Number.isFinite));
// The account the receipt is offset against, as the 11 Nov test receipt (6005) had it.
const OFFSET_ACCOUNT = opt("--account", "500500");
if (!(MIN > 0) || !(LINES > 0)) throw new Error("--min and --lines must be numbers above 0");
if (apply && WHS === "01" && !approve) throw new Error("A receipt into 01 needs U_Approve = Y, and that is not set without --approve on the command line.");

const today = new Date().toLocaleDateString("en-CA");
const BATCH = `TEST-TOPUP-${today.replaceAll("-", "")}`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", `topup-stock-${today}.json`);
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

const s = new SapSession(loadConfig(), DB);
const pages = async (rel) => {
	const rows = [];
	for (;;) {
		const p = (await s.get(`${rel}&$skip=${rows.length}`)).value;
		rows.push(...p);
		if (p.length < 20) return rows; // the Service Layer gives 20 a page whatever is asked
	}
};

const plan = [];
const left = { finishedGoods: 0, enough: 0, lockedInWarehouse: [], notInWarehouse: [] };
const refused = [];
const posted = [];
try {
	await s.login();
	const groups = Object.fromEntries((await pages("ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	console.log(`\n${apply ? "APPLY" : "DRY RUN"} - ${DB}, warehouse ${WHS}, at least ${MIN} of each item's own unit`);
	console.log(`${SKIP.size ? `Left out as finished goods: ${[...SKIP].map((n) => `${n} ${groups[n] ?? "?"}`).join(", ")}` : "No item group left out: finished goods too"}\n`);

	const items = await pages("Items?$filter=InventoryItem eq 'tYES' and Valid eq 'tYES' and Frozen eq 'tNO'"
		+ "&$select=ItemCode,ItemName,ItemsGroupCode,InventoryUOM,ManageBatchNumbers,ManageSerialNumbers,MovingAveragePrice,ItemWarehouseInfoCollection&$orderby=ItemCode");
	for (const i of items) {
		if (SKIP.has(i.ItemsGroupCode)) { left.finishedGoods++; continue; }
		const w = i.ItemWarehouseInfoCollection.find((x) => x.WarehouseCode === WHS);
		if (!w) { left.notInWarehouse.push(i.ItemCode); continue; }
		const have = Number(w.InStock) || 0;
		if (have >= MIN) { left.enough++; continue; }
		if (w.Locked === "tYES") { left.lockedInWarehouse.push(i.ItemCode); continue; }
		// A serial-numbered item would need a number for every piece; there are none here, and one is refused
		// rather than given invented serials.
		if (i.ManageSerialNumbers === "tYES") { refused.push({ item: i.ItemCode, why: "serial-numbered: not topped up" }); continue; }
		// The warehouse's own cost where the company keeps cost per warehouse, the item's otherwise.
		const cost = Number(w.StandardAveragePrice) || Number(i.MovingAveragePrice) || 0;
		plan.push({ item: i.ItemCode, name: i.ItemName, group: i.ItemsGroupCode, unit: i.InventoryUOM || "", have, add: round(MIN - have, 3), cost: round(cost, 6), batch: i.ManageBatchNumbers === "tYES" });
	}

	const byGroup = {};
	for (const p of plan) { const g = (byGroup[p.group] ??= { items: 0, qty: 0, value: 0 }); g.items++; g.qty += p.add; g.value += p.add * p.cost; }
	for (const [g, v] of Object.entries(byGroup)) console.log(`  ${String(g).padEnd(4)} ${String(groups[g] ?? "?").padEnd(26)} ${String(v.items).padStart(5)} items  ${round(v.qty, 0).toLocaleString("en-IN").padStart(10)} to receive  value ${round(v.value, 0).toLocaleString("en-IN")}`);
	const value = plan.reduce((t, p) => t + p.add * p.cost, 0);
	console.log(`\n${plan.length} item(s) short of ${MIN} in ${WHS}: ${round(plan.reduce((t, p) => t + p.add, 0), 0).toLocaleString("en-IN")} to receive, value ${round(value, 0).toLocaleString("en-IN")} at current cost`
		+ ` (${plan.filter((p) => p.cost === 0).length} at nil: no cost on the item); ${plan.filter((p) => p.batch).length} batch-managed, batch ${BATCH}.`);
	console.log(`Already at ${MIN} or more: ${left.enough}. Finished goods left out: ${left.finishedGoods}.`
		+ (left.lockedInWarehouse.length ? ` Locked in ${WHS}, left alone: ${left.lockedInWarehouse.length}.` : "")
		+ (left.notInWarehouse.length ? ` Not set up for ${WHS}, left alone: ${left.notInWarehouse.length}.` : ""));

	if (apply && plan.length) {
		const line = (p) => ({
			ItemCode: p.item, Quantity: p.add, WarehouseCode: WHS, UnitPrice: p.cost, AccountCode: OFFSET_ACCOUNT,
			...(p.batch ? { BatchNumbers: [{ BatchNumber: BATCH, Quantity: p.add }] } : {}),
		});
		// One line SAP will not take fails the whole receipt, so a refused receipt is cut in half and tried
		// again until the line is alone - then it is written down and the rest go through. A timeout is NOT a
		// refusal: the receipt may have posted, and trying again could post it twice. That stops the run; the
		// next run reads the stock afresh and receives only what is still short.
		const post = async (chunk) => {
			try {
				const doc = await s.request("POST", "InventoryGenEntries", {
					DocDate: today, TaxDate: today,
					Comments: `TEST top-up to ${MIN} in ${WHS}, ${SKIP.size ? "finished goods left out" : "every item group"}, at current cost (localdev/sap/sl-topup-stock.mjs)`,
					...(approve ? { U_Approve: "Y" } : {}),
					DocumentLines: chunk.map(line),
				});
				posted.push({ doc: doc.DocNum, entry: doc.DocEntry, lines: chunk.length, items: chunk.map((p) => p.item) });
				console.log(`  receipt ${doc.DocNum} (entry ${doc.DocEntry}): ${chunk.length} line(s), ${chunk[0].item} to ${chunk.at(-1).item}`);
			} catch (e) {
				if (!e.status) throw e; // a timeout or a dropped connection, not SAP's answer
				if (chunk.length === 1) { refused.push({ item: chunk[0].item, why: e.message.replace(/^POST \S+ -> /, "") }); console.log(`  REFUSED ${chunk[0].item}: ${e.message.slice(0, 200)}`); return; }
				const mid = Math.ceil(chunk.length / 2);
				await post(chunk.slice(0, mid));
				await post(chunk.slice(mid));
			}
		};
		const chunks = [];
		for (let i = 0; i < plan.length; i += LINES) chunks.push(plan.slice(i, i + LINES));
		const todo = DOCS > 0 ? chunks.slice(0, DOCS) : chunks;
		console.log(`\nPosting ${todo.length} of ${chunks.length} receipt(s), up to ${LINES} lines each${approve ? ", U_Approve = Y" : ""}:`);
		for (const c of todo) await post(c);
	}
} finally {
	await s.logout().catch(() => {});
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	const before = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { runs: [] };
	before.runs.push({ at: new Date().toISOString(), apply, min: MIN, warehouse: WHS, planned: plan.length, posted, refused, left });
	fs.writeFileSync(OUT, JSON.stringify(before, null, 1));
}
if (refused.length) console.log(`\n${refused.length} item(s) not topped up - the reasons are in ${path.relative(process.cwd(), OUT)}.`);
console.log(apply ? `\n${posted.reduce((t, d) => t + d.lines, 0)} line(s) received in ${posted.length} receipt(s).` : "\nNothing was written. --apply --approve posts it.");
