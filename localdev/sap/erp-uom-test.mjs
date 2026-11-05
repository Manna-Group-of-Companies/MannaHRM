// The ERPNext conversion-factor test (plan doc, items 5 and 8), LOCAL copy only.
//
//     node localdev/sap/erp-uom-test.mjs              drafts only: what ERPNext works out, nothing posted
//     node localdev/sap/erp-uom-test.mjs --submit     also submits the closest one, reads its ledger, cancels it
//
// The worked example: a bill for 3 of a vendor unit at 8,800, weighed in at 59.4 of the stock unit. The question is
// whether a Material Receipt takes a unit and conversion factor the item does not carry, and whether it can book
// exactly 26,400 when 26,400 / 59.4 has no exact value. Every draft is deleted again; a submitted one is cancelled.

import fs from "node:fs";
import { CMMS_ENV } from "../paths.mjs";

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.ERPNEXT_URL || "")) throw new Error("not the local copy");
const H = { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`, "Content-Type": "application/json" };
const call = async (method, path, body) => {
	const r = await fetch(`${env.ERPNEXT_URL}/api/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
	const j = await r.json().catch(() => ({}));
	if (!r.ok) {
		let msg = j.exception || j.exc_type || r.status;
		try { msg = JSON.parse(JSON.parse(j._server_messages)[0]).message; } catch { /* keep the exception */ }
		throw new Error(String(msg).replace(/<[^>]+>/g, ""));
	}
	return j.data ?? j.message;
};
const q = (doctype, fields, filters) => call("GET", `resource/${encodeURIComponent(doctype)}?${new URLSearchParams({ fields: JSON.stringify(fields), filters: JSON.stringify(filters), limit_page_length: "50" })}`);

const ITEM = "HRI-ENG-12";
const STORE = "Stores - HRI";
const COMPANY = "Hi-Tech Rubber Industries";
const BILL_QTY = 3, BILL_PRICE = 8800, WEIGHED = 59.4;
const factor = WEIGHED / BILL_QTY;

const item = await call("GET", `resource/Item/${ITEM}`);
console.log(`${ITEM} ${item.item_name}: stock unit ${item.stock_uom}, its units ${JSON.stringify(item.uoms.map((u) => [u.uom, u.conversion_factor]))}`);
const vendorUom = (await q("UOM", ["name", "must_be_whole_number"], [["name", "in", ["Drum", "Bag", "Box"]]])).find((u) => u.name === "Drum") ? "Drum" : "Box";
console.log(`vendor unit for the test: ${vendorUom}; factor ${factor}`);
const sys = await call("GET", "resource/System Settings/System Settings");
console.log(`currency precision ${sys.currency_precision || "(default)"}, float precision ${sys.float_precision || "(default)"}`);

// Each way of sending the line. ERPNext's basic_rate is per stock unit, so the question is what it keeps.
const variants = [
	{ name: "A. vendor unit, rate per stock unit unrounded", line: { qty: BILL_QTY, uom: vendorUom, conversion_factor: factor, basic_rate: (BILL_PRICE * BILL_QTY) / WEIGHED } },
	{ name: "B. vendor unit, rate per stock unit at 2 dp", line: { qty: BILL_QTY, uom: vendorUom, conversion_factor: factor, basic_rate: Math.round(((BILL_PRICE * BILL_QTY) / WEIGHED) * 100) / 100 } },
	{ name: "C. stock unit, 59.4 at the unrounded rate", line: { qty: WEIGHED, uom: item.stock_uom, conversion_factor: 1, basic_rate: (BILL_PRICE * BILL_QTY) / WEIGHED } },
];
const drafts = [];
try {
	for (const v of variants) {
		try {
			const se = await call("POST", "resource/Stock Entry", {
				stock_entry_type: "Material Receipt", purpose: "Material Receipt", company: COMPANY, docstatus: 0,
				remarks: "CMMS conversion-factor test - draft, deleted by the test",
				items: [{ item_code: ITEM, t_warehouse: STORE, ...v.line }],
			});
			drafts.push(se.name);
			const d = se.items[0];
			console.log(`${v.name}: ${se.name} qty ${d.qty} ${d.uom} x ${d.conversion_factor} = ${d.transfer_qty} ${d.stock_uom}; basic_rate ${d.basic_rate}, basic_amount ${d.basic_amount}, valuation_rate ${d.valuation_rate}, amount ${d.amount}; total ${se.total_incoming_value}`);
			v.doc = se;
		} catch (e) {
			console.log(`${v.name}: REFUSED - ${e.message}`);
		}
	}

	if (process.argv.includes("--submit")) {
		const best = variants.find((v) => v.doc && Math.abs(Number(v.doc.total_incoming_value) - BILL_PRICE * BILL_QTY) < 0.005) || variants.find((v) => v.doc);
		if (best) {
			const name = best.doc.name;
			await call("PUT", `resource/Stock Entry/${name}`, { docstatus: 1 });
			drafts.splice(drafts.indexOf(name), 1);
			const sle = await q("Stock Ledger Entry", ["actual_qty", "valuation_rate", "stock_value_difference", "incoming_rate", "is_cancelled"], [["voucher_no", "=", name]]);
			console.log(`submitted ${best.name} as ${name}; ledger ${JSON.stringify(sle)}`);
			await call("POST", "method/frappe.client.cancel", { doctype: "Stock Entry", name });
			console.log(`cancelled ${name}`);
		}
	}
} finally {
	for (const n of drafts) await call("DELETE", `resource/Stock Entry/${n}`).catch((e) => console.log(`could not delete ${n}: ${e.message}`));
	if (drafts.length) console.log(`deleted drafts ${drafts.join(", ")}`);
}
