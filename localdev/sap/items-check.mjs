// Read-only: which of the local copy's HRI engineering items exist in a SAP test company.
//
//     node localdev/sap/items-check.mjs                HITECH_RUBBER, every HRI item on the copy
//
// The copy's items carry the live company's SAP codes; a test company restored earlier may lack the newer ones,
// and a purchase request for an item SAP does not have is refused.

import fs from "node:fs";
import { CMMS_ENV } from "../paths.mjs";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2] || "HITECH_RUBBER";
const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.ERPNEXT_URL || "")) throw new Error("not the local copy");
const q = new URLSearchParams({
	fields: JSON.stringify(["name", "item_name", "custom_sap_item_code"]),
	filters: JSON.stringify([["name", "like", "HRI-%"], ["custom_sap_item_code", "is", "set"]]),
	limit_page_length: "2000",
});
const items = (await (await fetch(`${env.ERPNEXT_URL}/api/resource/Item?${q}`, { headers: { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}` } })).json()).data || [];

const s = new SapSession(loadConfig(), db);
await s.login();
try {
	const have = new Set();
	// 20 codes a query: the Service Layer pages at 20 rows whatever $top asks, and a batch of 40 read only its first 20.
	for (let i = 0; i < items.length; i += 20) {
		const codes = items.slice(i, i + 20).map((it) => `ItemCode eq '${String(it.custom_sap_item_code).replace(/'/g, "''")}'`).join(" or ");
		const r = await s.get(`Items?$select=ItemCode&$filter=${encodeURIComponent(codes)}&$top=20`);
		for (const v of r?.value ?? []) have.add(v.ItemCode);
	}
	const missing = items.filter((it) => !have.has(it.custom_sap_item_code));
	console.log(`${items.length} HRI items on the copy; ${items.length - missing.length} in ${db}; ${missing.length} missing`);
	if (missing.length) console.log("missing:", missing.slice(0, 30).map((m) => `${m.custom_sap_item_code} (${m.item_name})`).join(", "));
	const present = items.filter((it) => have.has(it.custom_sap_item_code));
	if (present.length) console.log("present:", present.slice(0, 30).map((m) => `${m.custom_sap_item_code} (${m.item_name})`).join(", "));
} finally {
	await s.logout();
}
