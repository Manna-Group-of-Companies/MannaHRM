// Drives the purchase workflow on the LOCAL copy through the CMMS's own functions, and does in a SAP test company
// what a user would do in the SAP client (cancel or close a document). For the rule 7 / rule 15 tests.
//
//     node localdev/sap/flow.mjs raise HRI-ENG-3:1 HRI-ENG-4:2 HRI-ENG-5:3      a request, as the Maintenance Manager
//     node localdev/sap/flow.mjs quote PR-... S-1199 HRI-ENG-3:1:Nos:250        a quotation (item:qty:unit:price)
//     node localdev/sap/flow.mjs order PQ-...                                   the PO from a quotation
//     node localdev/sap/flow.mjs drop PR-... HRI-ENG-5 "reason"                 drop a line
//     node localdev/sap/flow.mjs show PR-...                                    the request, its quotations and POs
//     node localdev/sap/flow.mjs sap-cancel quotation|po <DocEntry>             cancel in SAP (HITECH_RUBBER)
//     node localdev/sap/flow.mjs sap-close po <DocEntry>                        close in SAP
//
// Refuses any ERPNext not on this PC; SapSession refuses any company outside test_dbs.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";
import { CMMS } from "../paths.mjs";

const S = pathToFileURL(path.join(CMMS, "server") + path.sep).href;
process.chdir(path.join(CMMS, "server"));
await import(S + "node_modules/dotenv/config.js");
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.ERPNEXT_URL || "")) throw new Error("not the local copy");
const pr = await import(S + "repository/purchaseRequests.js");
const pq = await import(S + "repository/purchaseQuotations.js");
const po = await import(S + "repository/purchaseOrders.js");
const { listDocs, getDoc } = await import(S + "integrations/erpnext/client.js");

const MAINTENANCE = { email: "cmms.maintenance.test@manna.localhost" };
const PURCHASE = { email: "cmms.purchase.test@manna.localhost" };
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const plus = (days) => new Date(Date.now() + (5.5 * 3600 + days * 86400) * 1e3).toISOString().slice(0, 10);
const [cmd, ...args] = process.argv.slice(2);

const show = async (name) => {
	const r = await pr.getRequest(name);
	console.log(`${r.id} ${r.status} SAP PR ${r.sapDocNumber || "-"} POs ${r.poNumbers || "-"} mayQuote ${r.mayQuote}${r.error ? ` | ${r.error}` : ""}`);
	for (const l of r.lines) console.log(`  ${l.itemCode} ${l.qty} ${l.unit} ${l.coverage || "open"} ${l.quotation || ""} ${l.dropReason || ""}`);
	for (const q of await listDocs("CMMS Purchase Quotation", { fields: ["name", "status", "sap_doc_number", "sap_doc_entry", "purchase_order", "error"], filters: [["purchase_request", "=", name]], orderBy: "creation asc" })) {
		console.log(`  quotation ${q.name} ${q.status} SAP ${q.sap_doc_number || "-"} (entry ${q.sap_doc_entry || "-"}) PO ${q.purchase_order || "-"}${q.error ? ` | ${q.error}` : ""}`);
	}
	for (const o of await listDocs("CMMS Purchase Order", { fields: ["name", "status", "sync_status", "sap_doc_number", "sap_doc_entry", "error"], filters: [["purchase_request", "=", name]], orderBy: "creation asc" })) {
		console.log(`  PO ${o.name} ${o.status}/${o.sync_status} SAP ${o.sap_doc_number || "-"} (entry ${o.sap_doc_entry || "-"})${o.error ? ` | ${o.error}` : ""}`);
	}
};

if (cmd === "raise") {
	const r = await pr.raiseRequest({
		company: "HRI", requiredBy: plus(7), reason: "Rule 7 and rule 15 test - safe to ignore",
		lines: args.map((a) => { const [itemCode, qty] = a.split(":"); return { itemCode, qty: Number(qty), remarks: "" }; }),
	}, MAINTENANCE);
	console.log(`raised ${r.id}`);
} else if (cmd === "quote") {
	const [request, vendorCode, ...specs] = args;
	const doc = await getDoc("CMMS Purchase Request", request);
	const options = await pq.optionsFor("HRI");
	const vendor = options.vendors.find((v) => v.code === vendorCode);
	console.log(`vendor ${vendorCode} (${vendor?.name}, state ${vendor?.state}); ${options.units.length} units offered`);
	// No tax code and no HSN on a quotation since 27 Oct 2026: the goods receipt takes both off the bill.
	const lines = specs.map((s) => {
		const [item, qty, unit, price] = s.split(":");
		const line = doc.lines.find((l) => l.item === item && !l.coverage);
		if (!line) throw new Error(`${item} has no open line on ${request}`);
		return { lineId: line.name, vendorUnit: unit, qty: Number(qty), price: Number(price) };
	});
	const q = await pq.createQuotation({ request, vendorCode, quotationDate: today, validUntil: plus(30), remarks: "Rule 7 / 15 test", lines }, PURCHASE);
	console.log(`quotation ${q.id} ${q.status}`);
} else if (cmd === "order") {
	const o = await po.makeOrder(args[0], { poDate: today, deliveryDate: plus(7), remarks: "Rule 7 / 15 test", acceptExpired: true }, PURCHASE);
	console.log(`PO ${o.id} ${o.status}/${o.syncStatus}`);
} else if (cmd === "drop") {
	const [request, item, reason] = args;
	const doc = await getDoc("CMMS Purchase Request", request);
	const line = doc.lines.find((l) => l.item === item);
	await pr.dropLine(request, line.name, reason);
	console.log(`dropped ${item} on ${request}`);
} else if (cmd === "show") {
	await show(args[0]);
} else if (cmd === "sap-cancel" || cmd === "sap-close") {
	const [kind, entry] = args;
	const entity = kind === "quotation" ? "PurchaseQuotations" : "PurchaseOrders";
	const s = new SapSession(loadConfig(), "HITECH_RUBBER");
	await s.login();
	try {
		await s.request("POST", `${entity}(${Number(entry)})/${cmd === "sap-cancel" ? "Cancel" : "Close"}`);
		const d = await s.get(`${entity}(${Number(entry)})?$select=DocNum,DocumentStatus,Cancelled`);
		console.log(`${entity} ${d.DocNum}: ${d.DocumentStatus}, cancelled ${d.Cancelled}`);
	} finally { await s.logout(); }
} else {
	throw new Error("command: raise | quote | order | drop | show | sap-cancel | sap-close");
}
