// A goods receipt against a CMMS PO, made through the local CMMS API as the Maintenance Manager test login - the
// same route, role check and rules the form uses. LOCAL only: refuses any API not on this PC.
//
//     node localdev/sap/receive.mjs PO-2026-00344 BILL-1 HRI-ENG-2:6:6:125 HRI-ENG-1:10:10
//
// Each line is item:billed:received[:bill price[:ratio[:hsn]]] - billed in the vendor's unit, received in the stock
// unit (leave received empty and give a ratio instead: HRI-ENG-2:4::120:1). The tax code is the bill's: the 18% one
// of the kind the supplier's state calls for, or TAXCODE=IGST@18. HSN and tax rate are sent only for an item without
// its own (27 Oct 2026): the hsn in the line spec, and TAX=18% for the rate.

import fs from "node:fs";
import { TEST_LOGINS } from "../paths.mjs";

const API = "http://localhost:5055/api";
const [order, billNo, ...rest] = process.argv.slice(2);
if (!order || !billNo || !rest.length) throw new Error("usage: receive.mjs <CMMS PO> <bill no> item:billed:received[:price[:ratio]] ...");
const tax = (rest.find((a) => a.startsWith("TAX=")) || "TAX=18%").slice(4);
const givenCode = (rest.find((a) => a.startsWith("TAXCODE=")) || "").slice(8);
const specs = rest.filter((a) => !a.startsWith("TAX=") && !a.startsWith("TAXCODE="));

const md = fs.readFileSync(TEST_LOGINS, "utf8");
const row = md.split(/\r?\n/).find((l) => l.startsWith("| Maintenance Manager |"));
const [, , email, password] = row.split("|").map((c) => c.trim());

const call = async (method, path, body, token) => {
	const r = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
	const j = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${j.message || JSON.stringify(j).slice(0, 300)}`);
	return j;
};

const { token } = await call("POST", "/session/login", { email, password });
const open = await call("GET", "/goods-receipts/open-po?company=HRI", null, token);
const po = open.pos.find((p) => p.order === order);
if (!po) throw new Error(`${order} is not on the open list: ${open.pos.map((p) => p.order || p.number).join(", ")}`);
// The bill's tax code, of the kind the form offers for this supplier.
const kind = po.vendorState && open.companyState ? (po.vendorState === open.companyState ? "cgst_sgst" : "igst") : null;
const offered = (open.taxCodes || []).filter((t) => !kind || t.kind === kind);
const taxCode = givenCode || (offered.find((t) => Number(t.rate) === 18) || offered[0])?.code;
console.log(`supplier ${po.vendorCode} in ${po.vendorState || "?"}, company in ${open.companyState || "?"}: ${kind || "any"} - tax code ${taxCode}`);
const lines = specs.map((s) => {
	const [item, billed, received, price, ratio, hsn] = s.split(":");
	const l = po.lines.find((x) => x.itemCode === item);
	if (!l) throw new Error(`${item} is not on ${order}`);
	return {
		orderLine: l.line, vendorQty: Number(billed), receivedQty: received ? Number(received) : undefined, ratio: ratio ? Number(ratio) : undefined,
		billPrice: price ? Number(price) : undefined, taxCode, hsnCode: l.hsnCode ? "" : hsn || "", taxRate: l.taxRate ? "" : tax,
	};
});
const gr = await call("POST", "/goods-receipts", { company: "HRI", purchaseOrder: order, billNo, billDate: new Date().toISOString().slice(0, 10), remarks: "Phase 4 test", lines }, token);
console.log(`${gr.id} ${gr.status} against PO ${gr.poNumber} (${gr.purchaseOrder}), total ${gr.total}`);
for (const l of gr.lines) console.log(`  ${l.itemCode}: ${l.vendorQty} ${l.vendorUnit} @ ${l.billPrice} (quoted ${l.quotedPrice}) -> ${l.qty} ${l.unit} at ${l.rate}; tax code ${l.taxCode}, HSN ${l.hsnCode} ${l.taxRate}`);
