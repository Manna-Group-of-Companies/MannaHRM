// Delivery dates along the order chain on the TEST companies: what B1if's step 6 (SALES_DASHBOARD/sap-b1if/
// step6-dates) has to keep in step, read through the Service Layer - and, to try the step, the change
// production would make in Hi-Tech's sales order.
//
//     node localdev/sap/sl-dates.mjs                      the settings, and every open chain with its dates
//     node localdev/sap/sl-dates.mjs --order 612          one chain (Hi-Tech's order number), every line
//     node localdev/sap/sl-dates.mjs --order 612 --move 2026-11-25            what moving the whole order would send
//     node localdev/sap/sl-dates.mjs --order 612 --move 2026-11-25 --apply    ...moved: every open line, and the order's own date
//     node localdev/sap/sl-dates.mjs --order 612 --move 2026-11-27 --item PMB00101002 --apply    one item's lines only
//
// The chain: Hi-Tech's sales order names Manna Treads' purchase order (U_MannaMtPo), which names Manna Treads'
// sales order (U_MannaMtSo). A line is matched by item code, as the step and the status sync match it.
// "WANTS" marks a Manna Treads line or document whose date is not Hi-Tech's - what the step will change on
// its next turn, if both companies' @MANNA_IC say ENABLED = Y and Manna Treads' says DATE_SYNC = Y.
//
// --move writes to TEST_HITECH_PRETREADS only, and only dates: it is the hand-made change the step is tried
// with. Nothing here writes to Manna Treads - that is the step's job, and seeing it done is the test.
// Test companies only, through sapguard.

import { loadConfig, SapSession } from "./sapguard.mjs";

const MT = "TEST_MANNA_TREADS";
const HT = "TEST_HITECH_PRETREADS";
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] ?? "") : ""; };
const apply = args.includes("--apply");
const orderNo = opt("--order");
const move = opt("--move");
const item = opt("--item").toUpperCase();
if (move && !/^\d{4}-\d{2}-\d{2}$/.test(move)) throw new Error(`--move takes a date as yyyy-mm-dd (got ${move})`);
if (move && !orderNo) throw new Error("--move needs --order <Hi-Tech's order number>");
if (orderNo && !/^\d+$/.test(orderNo)) throw new Error(`--order takes Hi-Tech's order number (got ${orderNo})`);

const day = (v) => String(v || "").slice(0, 10);
const open = (l) => l.LineStatus === "bost_Open";
const SELECT = "$select=DocEntry,DocNum,NumAtCard,DocDueDate,UpdateDate,DocumentStatus,Cancelled,DocumentLines";

const cfg = loadConfig();
const ht = new SapSession(cfg, HT);
const mt = new SapSession(cfg, MT);

// The Service Layer's workers do not all know the user tables and fields: one answers "Service Not Found"
// for @MANNA_IC, or "Property 'U_MannaMtSo' ... is invalid", where another reads it (4, 11 and 13 Nov 2026).
// A new login lands on another worker; five tries, then the error stands. Only reads go through here.
const STALE_NODE = /Service Not Found|Property '\w+' of '\w+' ?is invalid/i;
const read = async (s, rel) => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await s.get(rel);
		} catch (e) {
			if (attempt >= 5 || !STALE_NODE.test(e.message)) throw e;
			await s.logout();
			s.cookies = "";
			await s.login();
		}
	}
};

const settings = async (s) => {
	try {
		return Object.fromEntries((await read(s, "U_MANNA_IC?$select=Code,U_Value&$top=100")).value.map((r) => [r.Code, r.U_Value]));
	} catch (e) {
		return { ENABLED: `(could not be read: ${e.message})`, DATE_SYNC: "(could not be read)" };
	}
};

// The Service Layer hands out 20 rows a page whatever $top says.
const pages = async (s, rel, max) => {
	const all = [];
	for (let skip = 0; all.length < max; skip += 20) {
		const got = (await read(s, `${rel}&$skip=${skip}`)).value;
		all.push(...got);
		if (got.length < 20) break;
	}
	return all;
};

/** Hi-Tech's date per item: the latest among the item's open lines - a split line is complete on the later day. */
const promised = (order) => {
	const by = {};
	for (const l of order.DocumentLines.filter(open)) {
		const k = String(l.ItemCode || "").toUpperCase();
		if (k && day(l.ShipDate) > (by[k] || "")) by[k] = day(l.ShipDate);
	}
	return by;
};

const show = (title, doc, want, hdrWant) => {
	if (!doc) { console.log(`   ${title}: not found, cancelled or closed`); return 0; }
	let wants = 0;
	const hdr = hdrWant && day(doc.DocDueDate) !== hdrWant;
	if (hdr) wants++;
	console.log(`   ${title} ${doc.DocNum} (DocEntry ${doc.DocEntry})   document date ${day(doc.DocDueDate)}${hdr ? `   WANTS ${hdrWant}` : ""}`);
	for (const l of [...doc.DocumentLines].sort((a, b) => (a.VisualOrder ?? a.LineNum) - (b.VisualOrder ?? b.LineNum))) {
		const w = want && open(l) ? want[String(l.ItemCode || "").toUpperCase()] : "";
		const differs = w && w !== day(l.ShipDate);
		if (differs) wants++;
		console.log(`      line ${String(l.LineNum).padStart(2)}  ${String(l.ItemCode).padEnd(16)} ${open(l) ? "open  " : "closed"} ${day(l.ShipDate)}${differs ? `   WANTS ${w}` : ""}`);
	}
	return wants;
};

try {
	await ht.login();
	await mt.login();
	const [sh, sm] = [await settings(ht), await settings(mt)];
	console.log(`\n${HT}: ENABLED = ${sh.ENABLED ?? "(not set)"}`);
	console.log(`${MT}: ENABLED = ${sm.ENABLED ?? "(not set)"}, DATE_SYNC = ${sm.DATE_SYNC ?? "(not set)"}`);
	if (sh.ENABLED !== "Y" || sm.ENABLED !== "Y" || sm.DATE_SYNC !== "Y") console.log("The step writes nothing until all three are Y.");

	const filter = orderNo ? `DocNum eq ${orderNo}` : "DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'";
	const orders = (await pages(ht, `Orders?${SELECT},U_MannaMtPo&$filter=${encodeURIComponent(filter)}&$orderby=DocEntry desc`, orderNo ? 20 : 200))
		.filter((o) => /^\d+$/.test(String(o.U_MannaMtPo || "").trim()));
	if (!orders.length) console.log(orderNo ? `\nHi-Tech has no order ${orderNo} that names a Manna Treads purchase order.` : "\nNo open Hi-Tech order names a Manna Treads purchase order.");

	let total = 0;
	for (const o of orders) {
		const want = promised(o);
		const hdrWant = Object.values(want).sort().pop() || "";
		console.log(`\n${o.NumAtCard || "(no ERPNext name)"} - changed ${day(o.UpdateDate)}${o.DocumentStatus !== "bost_Open" ? "   [Hi-Tech's order is not open: the step leaves it alone]" : ""}`);
		show("Hi-Tech sales order   ", o);
		if (o.DocumentStatus !== "bost_Open" || o.Cancelled !== "tNO") continue;
		let po = null, so = null;
		try { po = await read(mt, `PurchaseOrders(${String(o.U_MannaMtPo).trim()})?${SELECT},U_MannaMtSo`); } catch (e) { if (e.status !== 404) throw e; }
		if (po && (po.Cancelled !== "tNO" || po.DocumentStatus !== "bost_Open")) po = null;
		if (po && /^\d+$/.test(String(po.U_MannaMtSo || "").trim())) {
			try { so = await read(mt, `Orders(${String(po.U_MannaMtSo).trim()})?${SELECT}`); } catch (e) { if (e.status !== 404) throw e; }
			if (so && (so.Cancelled !== "tNO" || so.DocumentStatus !== "bost_Open")) so = null;
		}
		total += show("Manna purchase order  ", po, want, hdrWant);
		total += show("Manna sales order     ", so, want, hdrWant);
	}
	if (orders.length && !move) console.log(`\n${total} date(s) in Manna Treads differ from Hi-Tech's${total ? " - the step takes one chain a minute." : "."}`);

	if (move) {
		const o = orders[0];
		if (!o) throw new Error(`no chain for Hi-Tech order ${orderNo}`);
		if (o.DocumentStatus !== "bost_Open" || o.Cancelled !== "tNO") throw new Error(`Hi-Tech order ${orderNo} is not open`);
		const lines = o.DocumentLines.filter(open).filter((l) => !item || String(l.ItemCode || "").toUpperCase() === item);
		if (!lines.length) throw new Error(item ? `order ${orderNo} has no open line for ${item}` : `order ${orderNo} has no open line`);
		const body = { DocumentLines: lines.map((l) => ({ LineNum: l.LineNum, ShipDate: move })) };
		// The whole order moved is what SAP's own screen does when the header date is changed and the rows
		// are updated with it. One item moved leaves the header alone, as a change on the row does.
		if (!item) body.DocDueDate = move;
		console.log(`\n${apply ? "MOVING" : "WOULD move"} on ${HT} order ${o.DocNum}: ${item ? `${item} (${lines.length} line(s))` : `all ${lines.length} open line(s) and the document date`} to ${move}`);
		if (apply) {
			await ht.request("PATCH", `Orders(${o.DocEntry})`, body);
			const back = await read(ht, `Orders(${o.DocEntry})?${SELECT}`);
			show("Hi-Tech sales order now", back);
			console.log("Run this again without --move in a minute or two: the Manna Treads lines should stop saying WANTS.");
		} else console.log("Nothing was written. --apply moves it.");
	}
} catch (e) {
	console.log(`FAILED - ${e.message}`);
	process.exitCode = 1;
} finally {
	await ht.logout();
	await mt.logout();
}
