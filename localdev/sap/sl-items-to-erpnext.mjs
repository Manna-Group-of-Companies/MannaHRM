// The item sync, run by hand: every sales item of TEST_MANNA_TREADS, read through the Service Layer and posted to the
// LOCAL ERPNext's manna_sap_in (kind "items") - what B1iF's nightly step Z.erpitemall posts, without waiting for 01:20.
//
//     node localdev/sap/sl-items-to-erpnext.mjs            posts in batches of 200 and prints what ERPNext answered
//
// The rows have the shape of SALES_DASHBOARD/sap-b1if/items/items.sql: code, name, active (not inactive and not
// frozen), uom (the inventory unit), hsn (the India HSN chapter's digits). ERPNext decides everything - which codes
// are shared ones, what is created or renamed - and whether it WRITES is its own switch (SAP Sync Control ->
// "B1iF: syncs that write"); this only delivers. Posts as the sync user (the key in sap-b1if/erpnext/.sapsync-local-key.txt),
// as B1iF does, and refuses any ERPNext but 127.0.0.1. Test company only, through sapguard.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, SapSession } from "./sapguard.mjs";
import { SALES_DASHBOARD } from "../paths.mjs";

const ERP = "http://127.0.0.1:8000";
const keyLine = fs.readFileSync(path.join(SALES_DASHBOARD, "sap-b1if", "erpnext", ".sapsync-local-key.txt"), "utf8")
	.split(/\r?\n/).find((l) => l.startsWith("Authorization:"));
const token = keyLine.slice(keyLine.indexOf(":") + 1).trim().replace(/^token\s+/, "");
const auth = "Basic " + Buffer.from(token).toString("base64");

const s = new SapSession(loadConfig(), "TEST_MANNA_TREADS");
let rows = [];
try {
	await s.login();
	const hsn = new Map();
	// The Service Layer gives 20 rows a page whatever $top says (unless a Prefer header raises it), so a page
	// shorter than $top is not the last one - only an empty page is.
	for (let skip = 0; ; ) {
		const page = (await s.get(`IndiaHsn?$select=AbsEntry,Chapter,Heading,SubHeading&$top=500&$skip=${skip}`)).value;
		for (const h of page) hsn.set(h.AbsEntry, `${h.Chapter ?? ""}${h.Heading ?? ""}${h.SubHeading ?? ""}`.replace(/\D/g, ""));
		if (!page.length) break;
		skip += page.length;
	}
	for (let skip = 0; ; ) {
		const page = (await s.get(`Items?$select=ItemCode,ItemName,Valid,Frozen,InventoryUOM,ChapterID&$filter=${encodeURIComponent("SalesItem eq 'tYES'")}&$orderby=ItemCode&$top=500&$skip=${skip}`)).value;
		for (const it of page) {
			rows.push({
				code: it.ItemCode, name: it.ItemName ?? "", active: it.Valid === "tNO" || it.Frozen === "tYES" ? "N" : "Y",
				uom: String(it.InventoryUOM ?? "").trim(), hsn: it.ChapterID != null && it.ChapterID !== -1 ? hsn.get(it.ChapterID) ?? "" : "",
			});
		}
		if (!page.length) break;
		skip += page.length;
	}
} finally {
	await s.logout();
}
console.log(`${rows.length} sales items read from TEST_MANNA_TREADS`);

const total = {};
const reasons = {};
const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
	const started = Date.now();
	const r = await fetch(`${ERP}/api/method/manna_sap_in`, {
		method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({ kind: "items", items: rows.slice(i, i + BATCH) }),
	});
	const text = await r.text();
	if (!r.ok) throw new Error(`batch at ${i}: ${r.status} ${text.replace(/\s+/g, " ").slice(0, 300)}`);
	const m = JSON.parse(text).message;
	for (const [k, v] of Object.entries(m.count)) total[k] = (total[k] || 0) + v;
	for (const p of m.results) if (p.action === "skip" || p.action === "error") reasons[p.reason] = (reasons[p.reason] || 0) + 1;
	console.log(`  ${i + 1}-${Math.min(i + BATCH, rows.length)}: ${JSON.stringify(m.count)}  ${m.dry_run ? "(DRY RUN)" : ""} ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
console.log("total:", total);
for (const [k, v] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${v} x ${k}`);
