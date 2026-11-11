// The stock sync, run by hand: TEST_HITECH_PRETREADS' saleable stock in ONE warehouse, read through the Service
// Layer and posted to the LOCAL ERPNext's manna_sap_in (kind "stock") - what B1iF's step Z.erpstockht posts.
//
//     node localdev/sap/sl-stock-to-erpnext.mjs               warehouse 07; ERPNext answers what it did or why it refused
//     node localdev/sap/sl-stock-to-erpnext.mjs --force       past the "more than half the shelf would go to 0" guard
//     node localdev/sap/sl-stock-to-erpnext.mjs --whs 01      another warehouse
//
// For the one run B1iF cannot make: when the warehouse the shelf is read from changes (01 -> 07, 11 Nov 2026) nearly
// every stocked item moves at once, which manna_sap_stock rightly refuses unless told "force" - and B1iF's body has
// no force. Rows have the shape of SALES_DASHBOARD/sap-b1if/stock/stock.sql: code, qty = on hand less committed.
// Only items with stock somewhere are read: the rest are 0 in any warehouse, and ERPNext sets what a batch leaves
// out to 0 anyway. Posts as the sync user, refuses any ERPNext but 127.0.0.1; test company only, through sapguard.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, SapSession } from "./sapguard.mjs";
import { SALES_DASHBOARD } from "../paths.mjs";

const args = process.argv.slice(2);
const whs = args.includes("--whs") ? String(args[args.indexOf("--whs") + 1]) : "07";
const ERP = "http://127.0.0.1:8000";
const keyLine = fs.readFileSync(path.join(SALES_DASHBOARD, "sap-b1if", "erpnext", ".sapsync-local-key.txt"), "utf8")
	.split(/\r?\n/).find((l) => l.startsWith("Authorization:"));
const token = keyLine.slice(keyLine.indexOf(":") + 1).trim().replace(/^token\s+/, "");
const auth = "Basic " + Buffer.from(token).toString("base64");

const s = new SapSession(loadConfig(), "TEST_HITECH_PRETREADS");
const rows = [];
try {
	await s.login();
	// 20 rows a page whatever $top says: only an empty page is the last one.
	for (let skip = 0; ; ) {
		const page = (await s.get(`Items?$select=ItemCode,ItemWarehouseInfoCollection&$filter=${encodeURIComponent("SalesItem eq 'tYES' and InventoryItem eq 'tYES' and QuantityOnStock gt 0")}&$orderby=ItemCode&$skip=${skip}`)).value;
		if (!page.length) break;
		skip += page.length;
		for (const it of page) {
			const w = (it.ItemWarehouseInfoCollection || []).find((x) => x.WarehouseCode === whs);
			if (w) rows.push({ code: it.ItemCode, qty: Math.round(((w.InStock || 0) - (w.Committed || 0)) * 1000) / 1000 });
		}
	}
} finally {
	await s.logout();
}
console.log(`${rows.length} items with a row in warehouse ${whs} and stock somewhere; ${rows.filter((r) => r.qty > 0).length} available above 0`);
const sent_at = new Date().toISOString().slice(0, 19).replace("T", " ");
const r = await fetch(`${ERP}/api/method/manna_sap_in`, {
	method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
	body: JSON.stringify({ kind: "stock", sent_at, stock: rows, ...(args.includes("--force") ? { force: 1 } : {}) }),
});
const text = await r.text();
if (!r.ok) throw new Error(`${r.status} ${text.replace(/\s+/g, " ").slice(0, 300)}`);
const m = JSON.parse(text).message;
console.log({ dry_run: m.dry_run, refused: m.refused, error: m.error, changed: m.changed, reconciliations: m.reconciliations });
