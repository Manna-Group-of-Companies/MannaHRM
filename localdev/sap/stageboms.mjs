// Curing, sandering and packing BOMs on production's fixed figures, in one SAP test company.
//
//     node localdev/sap/stageboms.mjs TEST_HITECH_PRETREADS                  dry run → out/<DB>-stageboms-plan.json
//     node localdev/sap/stageboms.mjs TEST_HITECH_PRETREADS --only I-14649   one sandered item and its chain
//     node localdev/sap/stageboms.mjs TEST_HITECH_PRETREADS --apply ...      write them
//
// Production's figures (2 Nov 2026) are per unit produced, already calculated,
// and the same on every BOM — nothing here converts them:
//   curing     firewood 0.3 in, flash 0.2 out
//   packing    sandered in, stretch film 0.1 (labels and Checked OK as they were)
// Powder and flash come out of production: negative lines, received into stock.
//
// Sandering is a copy of what packing does today (decided the same day): the
// cured and powder lines move out of the old packing BOM with their ratio to
// what it made, and their line settings — 220 R2's cured 175.7 and powder -2.8
// per 175.7 become 1 and -0.016 per 1. The old packing BOM is the one the new
// finished good was built from (fgitems.mjs), else any finished-good BOM taking
// that cured item. No powder line there, no powder line here; a powder line
// that goes in rather than out is copied as it is and reported. The sandered
// item takes the finished good's issue method (backflush), units and HSN code,
// and keeps the cured item's batch handling.
//
// Every BOM written makes 1. A packing or curing BOM made for another quantity
// (220 R2's made 175.7) is brought to 1 with its other lines scaled to match,
// to SAP's three decimals; a line that rounding moves by more than 5%, or to
// nothing, is reported. Sandering BOMs are new, one per sandered item. Packing
// means the new finished goods' BOMs that take a sandered item; a missing film
// line is added as Stretch Film. Curing means the cured items' own BOMs.
// Every BOM written is read back. SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const db = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!db) throw new Error("name the test company: node stageboms.mjs TEST_HITECH_PRETREADS [--only SANDERED] [--apply]");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const FIXED = { firewood: 0.3, flash: -0.2, film: 0.1 };
// GST relevance with the HSN: SAP keeps an HSN only on a GST-relevant item, and drops it silently otherwise.
const FROM_FG = ["IssueMethod", "SalesUnit", "SalesPackagingUnit", "PurchaseUnit", "GSTRelevnt", "GSTTaxCategory", "ChapterID"];
const ITEM = { powder: "I-10176", flash: "I-10178", firewood: "I-13163", film: "I-10098" };
const FILM = new Set(["I-10098", "I-14497"]);
const r3 = (n) => Math.round(n * 1000) / 1000;

const mapping = JSON.parse(fs.readFileSync(path.join(OUT, "fg-mapping.json"), "utf8"));
const sanderedOf = new Map(JSON.parse(fs.readFileSync(path.join(OUT, `${db}-sandered.json`), "utf8")).map((m) => [m.sandered, m.cured]));
const newCodes = new Set(mapping.map((r) => r.new));

const key = (c) => `('${encodeURIComponent(String(c).replace(/'/g, "''"))}')`;
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
const sig = (ls) => ls.map((l) => `${l.ItemCode}:${l.Quantity}:${l.Warehouse}`).join(",");
const newLine = (code, q, whs) => ({ ItemCode: code, Quantity: q, Warehouse: whs || "01", IssueMethod: "im_Manual", ItemType: "pit_Item" });

/** The BOM brought to 1, with `fixed` lines set (added when missing). Pure, so it can be argued about. */
export const toOne = (b, fixed, addAs = {}) => {
	const changes = [];
	const lost = [];
	const want = { ...fixed };
	const lines = (b.ProductTreeLines || []).map((l) => {
		if (l.ItemCode in want) {
			const q = want[l.ItemCode];
			delete want[l.ItemCode];
			if (l.Quantity !== q || b.Quantity !== 1) changes.push(`${l.ItemName || l.ItemCode} ${l.Quantity} → ${q}`);
			return { ...l, Quantity: q };
		}
		const exact = l.Quantity / b.Quantity;
		const q = r3(exact);
		if (exact !== 0 && (q === 0 || Math.abs(q - exact) / Math.abs(exact) > 0.05)) lost.push(`${l.ItemName || l.ItemCode} ${exact.toPrecision(3)} → ${q}`);
		if (q !== l.Quantity) changes.push(`${l.ItemName || l.ItemCode} ${l.Quantity} → ${q}`);
		return { ...l, Quantity: q };
	});
	for (const [code, q] of Object.entries(want)) {
		lines.push(newLine(code, q, b.Warehouse));
		changes.push(`${addAs[code] || code} added ${q}`);
	}
	return { lines, changes, lost };
};

const s = new SapSession(loadConfig(), db);
await s.login();
const plan = { db, sandering: [], items: [], packing: [], curing: [], skipped: [] };
let failed = 0;
try {
	const boms = new Map((await all(s, "ProductTrees")).map((b) => [b.TreeCode, b]));
	const scope = [...sanderedOf.keys()].filter((sd) => !only || sd === only);
	const cureds = new Set(scope.map((sd) => sanderedOf.get(sd)));

	// Sandering: today's packing, cut out of the old packing BOM — the one each new finished
	// good was built from, else any finished-good BOM that takes the cured item.
	const fgPlan = JSON.parse(fs.readFileSync(path.join(OUT, `${db}-fg-plan-before-apply.json`), "utf8"));
	const oldFor = new Map();
	for (const p of fgPlan) for (const part of (p.bom?.lines || "").split(" | ")) {
		const c = part.split(" ")[0];
		if (sanderedOf.has(c) && !oldFor.has(c) && p.bom.from) oldFor.set(c, p.bom.from);
	}
	const groupOf = new Map((await all(s, "Items?$select=ItemCode,ItemsGroupCode")).map((i) => [i.ItemCode, i.ItemsGroupCode]));
	const groups = new Map((await all(s, "ItemGroups?$select=Number,GroupName")).map((g) => [g.Number, g.GroupName]));
	const isFg = (c) => /^(FG|HOT$|Seconds$)/i.test(groups.get(groupOf.get(c)) || "");
	const takers = new Map();
	for (const b of boms.values()) if (isFg(b.TreeCode)) for (const l of b.ProductTreeLines || []) takers.set(l.ItemCode, (takers.get(l.ItemCode) || []).concat(b.TreeCode));
	const ratio = (b, code) => { const l = b.ProductTreeLines.find((x) => x.ItemCode === code); return l ? r3(l.Quantity / b.Quantity) : 0; };
	for (const sd of scope) {
		const cured = sanderedOf.get(sd);
		const from = oldFor.get(sd) || (takers.get(cured) || []).find((c) => !newCodes.has(c));
		const ob = from && boms.get(from);
		const cl = ob?.ProductTreeLines.find((l) => l.ItemCode === cured);
		if (!cl) { plan.skipped.push({ item: sd, why: `no old packing BOM takes ${cured}` }); continue; }
		const pl = ob.ProductTreeLines.find((l) => l.ItemCode === ITEM.powder);
		const copy = (l, q) => ({ ItemCode: l.ItemCode, Quantity: q, Warehouse: l.Warehouse, IssueMethod: l.IssueMethod, PriceList: l.PriceList, ItemType: l.ItemType });
		const lines = [copy(cl, ratio(ob, cured))];
		// A line that rounds to nothing is left out: SAP stores a zero quantity as 1, which here
		// would turn powder coming out into a kilogram going in (I-15257, 2 Nov 2026).
		if (pl && ratio(ob, ITEM.powder) !== 0) lines.push(copy(pl, ratio(ob, ITEM.powder)));
		const notes = [];
		if (pl && pl.Quantity > 0) notes.push("powder goes in on the old BOM, copied as it is");
		if (pl && ratio(ob, ITEM.powder) === 0) notes.push(`powder ${pl.Quantity} per ${ob.Quantity} rounds to 0: left out`);
		if (ratio(ob, cured) < 0.5) notes.push(`old BOM issues only ${cl.Quantity} cured per ${ob.Quantity} made: check the old BOM`);
		const differ = (takers.get(cured) || []).filter((c) => c !== from && !newCodes.has(c) && ratio(boms.get(c), ITEM.powder) !== ratio(ob, ITEM.powder));
		if (differ.length) notes.push(`other old packing BOMs of this cured item differ on powder: ${differ.join(", ")}`);
		const have = boms.get(sd);
		if (!(have && have.Quantity === 1 && sig(have.ProductTreeLines) === sig(lines))) {
			plan.sandering.push({ code: sd, cured, from, was: have ? sig(have.ProductTreeLines) : null, note: notes.join("; "),
				bom: { TreeCode: sd, TreeType: ob.TreeType, Quantity: 1, Warehouse: ob.Warehouse, PriceList: ob.PriceList, ProductTreeLines: lines } });
		}
		// The item takes the finished good's issue method, units and HSN.
		const fgItem = await s.get(`Items${key(from)}?$select=${FROM_FG.join(",")}`);
		const sdItem = await s.get(`Items${key(sd)}?$select=${FROM_FG.join(",")},ManageBatchNumbers`);
		// SAP allows only manual issue on a batch item, and the sandered items keep the cured
		// item's batches — so a backflushing finished good does not pass that on to them.
		const take = FROM_FG.filter((k) => !(k === "IssueMethod" && sdItem.ManageBatchNumbers === "tYES" && fgItem[k] === "im_Backflush"));
		const patch = Object.fromEntries(take.filter((k) => fgItem[k] !== null && fgItem[k] !== undefined && (fgItem[k] ?? "") !== (sdItem[k] ?? "")).map((k) => [k, fgItem[k]]));
		if (Object.keys(patch).length) plan.items.push({ code: sd, from, patch });
	}

	// Packing: the new finished goods' BOMs that take a sandered item.
	for (const code of newCodes) {
		const b = boms.get(code);
		if (!b || !(b.ProductTreeLines || []).some((l) => sanderedOf.has(l.ItemCode))) continue;
		if (only && !b.ProductTreeLines.some((l) => l.ItemCode === only)) continue;
		const film = b.ProductTreeLines.filter((l) => FILM.has(l.ItemCode)).map((l) => l.ItemCode);
		const fixed = Object.fromEntries((film.length ? film : [ITEM.film]).map((c) => [c, FIXED.film]));
		// One sandered per one packed: the sanding loss is in the sandering BOM now, and left here
		// as well it was taken twice (145 DR asked for 1.049 sandered and 1.049 cured a kg).
		for (const l of b.ProductTreeLines) if (sanderedOf.has(l.ItemCode)) fixed[l.ItemCode] = 1;
		const r = toOne(b, fixed, { [ITEM.film]: "Stretch Film" });
		if (r.changes.length) plan.packing.push({ code, was: b.Quantity, ...r });
	}

	// Curing: the cured items' own BOMs.
	for (const cured of cureds) {
		const b = boms.get(cured);
		if (!b) { plan.skipped.push({ item: cured, why: "cured item has no BOM" }); continue; }
		const r = toOne(b, { [ITEM.firewood]: FIXED.firewood, [ITEM.flash]: FIXED.flash }, { [ITEM.firewood]: "Fire wood", [ITEM.flash]: "Waste Flash" });
		if (r.changes.length) plan.curing.push({ code: cured, was: b.Quantity, ...r });
	}

	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${plan.sandering.length} sandering BOMs to write (${plan.sandering.filter((x) => x.was).length} replacing), ${plan.items.length} sandered items to update, ${plan.packing.length} packing and ${plan.curing.length} curing BOMs to change, ${plan.skipped.length} skipped`);

	if (apply) {
		for (const x of plan.items) {
			try {
				await s.request("PATCH", `Items${key(x.code)}`, x.patch);
				const back = await s.get(`Items${key(x.code)}?$select=${Object.keys(x.patch).join(",")}`);
				const off = Object.keys(x.patch).filter((k) => (back[k] ?? "") !== (x.patch[k] ?? ""));
				if (off.length) throw new Error(`reads back different in ${off.join(", ")}`);
				x.done = true;
			} catch (e) { failed++; x.error = e.message; console.log(`FAILED  item ${x.code}: ${e.message}`); }
		}
		for (const x of plan.sandering) {
			try {
				// A PATCH adds lines rather than replacing them (it doubled I-14649 on 2 Nov 2026), so
				// a sandering BOM is rewritten by deleting it and adding it back — only while no
				// production order has been made from it.
				if (x.was) {
					const orders = Number(await s.get(`ProductionOrders/$count?$filter=${encodeURIComponent(`ItemNo eq '${x.code.replace(/'/g, "''")}'`)}`));
					if (orders) throw new Error(`${orders} production order(s) use it; not rewritten`);
					await s.request("DELETE", `ProductTrees${key(x.code)}`);
				}
				await s.request("POST", "ProductTrees", x.bom);
				const back = await s.get(`ProductTrees${key(x.code)}`);
				if (sig(back.ProductTreeLines) !== sig(x.bom.ProductTreeLines) || back.Quantity !== 1) throw new Error(`reads back as ${back.Quantity}: ${sig(back.ProductTreeLines)}`);
				x.done = true;
			} catch (e) { failed++; x.error = e.message; console.log(`FAILED  sandering ${x.code}: ${e.message}`); }
		}
		for (const x of [...plan.packing, ...plan.curing]) {
			try {
				await s.request("PATCH", `ProductTrees${key(x.code)}`, { Quantity: 1, ProductTreeLines: x.lines });
				const back = await s.get(`ProductTrees${key(x.code)}`);
				if (sig(back.ProductTreeLines) !== sig(x.lines) || back.Quantity !== 1) throw new Error(`reads back as ${back.Quantity}: ${sig(back.ProductTreeLines)}`);
				x.done = true;
			} catch (e) { failed++; x.error = e.message; console.log(`FAILED  ${x.code}: ${e.message}`); }
		}
		console.log(`written: ${[...plan.items, ...plan.sandering, ...plan.packing, ...plan.curing].filter((x) => x.done).length}, failed ${failed}`);
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-stageboms-plan${apply ? "-applied" : ""}.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 1));
console.log(`plan → ${file}`);
if (failed) process.exitCode = 1;
