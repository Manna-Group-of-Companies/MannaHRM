// LOCAL copy only: closes the purchase requests that came over from the live site still carrying the live
// company's SAP numbers, for every company whose SAP database is a test one (HRI -> HITECH_RUBBER).
//
//     node localdev/sap/retire-copied-requests.mjs            lists them
//     node localdev/sap/retire-copied-requests.mjs --apply    closes them
//
// Why: the sync reads each open request's SAP document by its number on every run, dry runs included, and
// writes back the status it finds. In a test company those numbers belong to other documents, so a copied
// request gets closed or ordered by somebody else's document (PR-2026-00304/306/307, 24 Oct 2026). Closed is
// a status the sync no longer reads. Requests raised on the copy afterwards get the test company's own numbers.

import fs from "node:fs";
import { CMMS_ENV } from "../paths.mjs";
import { loadConfig, refusalFor } from "./sapguard.mjs";

const apply = process.argv.includes("--apply");
const NOTE = "Copied from the live site: its SAP numbers are the live company's, not the test company's. Closed on the local copy so the sync does not match them.";

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = (env.ERPNEXT_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error(`Refusing: ${base} is not an ERPNext on this PC`);
const headers = { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`, "Content-Type": "application/json" };
const erp = async (method, path, body) => {
	const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
	const j = await r.json();
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
	return j.data;
};

const sap = loadConfig();
const control = await erp("GET", "/api/resource/SAP%20Item%20Category%20Sync%20Control/SAP%20Item%20Category%20Sync%20Control");
const options = JSON.parse(control.item_master_options || "{}");
const testCompanies = Object.entries(options).filter(([, o]) => !refusalFor(o.sap_db, sap.test_dbs)).map(([abbr]) => abbr);

const q = new URLSearchParams({
	fields: JSON.stringify(["name", "company", "status", "sap_doc_entry", "po_numbers", "creation"]),
	filters: JSON.stringify([["company", "in", testCompanies], ["status", "in", ["In SAP", "Ordered"]], ["sap_doc_entry", "is", "set"]]),
	limit_page_length: "500",
	order_by: "name asc",
});
const rows = await erp("GET", `/api/resource/CMMS%20Purchase%20Request?${q}`);
console.log(`${rows.length} copied request(s) in ${testCompanies.join(", ")} still open with a SAP number:`);
for (const r of rows) console.log(`  ${r.name} ${r.status} entry ${r.sap_doc_entry}${r.po_numbers ? ` PO ${r.po_numbers}` : ""}`);
if (!apply) { console.log("Dry run. --apply closes them."); process.exit(0); }
for (const r of rows) {
	await erp("PUT", `/api/resource/CMMS%20Purchase%20Request/${encodeURIComponent(r.name)}`, { status: "Closed", error: NOTE });
	console.log(`  closed ${r.name}`);
}
