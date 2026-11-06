// Fields the sales repo's doctypes (SALES_DASHBOARD/app/server/*_doctypes.json) have gained since the LOCAL copy
// made them. apply-sales-erp.mjs creates a missing doctype but never touches one that exists; this adds what an
// existing one lacks, and nothing else.
//
//     node localdev/add-sales-fields.mjs            dry run: which fields each doctype lacks
//     node localdev/add-sales-fields.mjs --apply    add them
//
// Only ADDS: a field already on the site is never changed, moved or removed, even when the JSON now says
// something else about it - changing a field is a migration, not a sync. Refuses any ERPNext but 127.0.0.1,
// because the key it uses (Manna_CMMS/server/.env) is the local Administrator's. A doctype the site lacks is
// left to apply-sales-erp.mjs. Example: the pick-list approval fields (approval_status, approved_by,
// approved_on), added to Manna Pick List on 6 Nov 2026.

import fs from "node:fs";
import path from "node:path";
import { CMMS_ENV, SALES_DASHBOARD } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const SERVER = path.join(SALES_DASHBOARD, "app", "server");

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = (env.ERPNEXT_URL || "").replace(/\/+$/, "");
if (BASE !== "http://127.0.0.1:8000") throw new Error(`Refusing: ${CMMS_ENV} points at ${BASE || "nothing"}, not the local copy`);
const auth = `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`;

const call = async (method, p, body) => {
	const r = await fetch(BASE + p, {
		method,
		headers: { Authorization: auth, "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await r.text();
	if (r.status === 404) return null;
	if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
};

let todo = 0;
for (const f of fs.readdirSync(SERVER).filter((n) => n.endsWith("_doctypes.json")).sort()) {
	for (const def of JSON.parse(fs.readFileSync(path.join(SERVER, f), "utf8")).doctypes) {
		const cur = (await call("GET", `/api/resource/DocType/${encodeURIComponent(def.name)}`))?.data;
		if (!cur) { console.log(`skipped  ${def.name}: not on the site - node localdev/apply-sales-erp.mjs --apply makes it`); continue; }
		const have = new Set(cur.fields.map((x) => x.fieldname));
		const add = (def.fields || []).filter((x) => !have.has(x.fieldname));
		if (!add.length) { console.log(`ok       ${def.name}`); continue; }
		todo += add.length;
		console.log(`${apply ? "added  " : "missing"}  ${def.name}: ${add.map((x) => x.fieldname).join(", ")}  (${f})`);
		if (!apply) continue;
		// The site's own rows go back exactly as they are, so nothing on them changes; Frappe orders the new
		// ones after them, and a Section Break among them starts its section there as the JSON intends.
		await call("PUT", `/api/resource/DocType/${encodeURIComponent(def.name)}`, {
			fields: [...cur.fields, ...add.map((x) => ({ ...x, doctype: "DocField" }))],
		});
	}
}
console.log(todo ? `\n${todo} field(s) ${apply ? `added on ${BASE}` : "to add. Run again with --apply."}` : "\nNothing to add.");
