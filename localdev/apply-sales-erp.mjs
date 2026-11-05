// The sales repo's ERPNext changes, put on the LOCAL copy: its custom doctypes (app/server/*_doctypes.json) and
// its Server Scripts (app/server/*.py, each named and typed by its header). Live gets them by hand in Desk, as
// SALES_DASHBOARD/app/server/README.md says; this is the "local first" half.
//
//     node localdev/apply-sales-erp.mjs            dry run: what is missing or different
//     node localdev/apply-sales-erp.mjs --apply    create what is missing, update a script whose body differs
//
// Refuses any ERPNext but 127.0.0.1, because the key it uses (Manna_CMMS/server/.env) is the local Administrator's.
// A doctype that exists is reported, never altered: changing a doctype's fields is a migration, not a sync.
// A script's `disabled` flag is left as the site has it; a new one is created enabled, as live has them.

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
	if (!r.ok) throw new Error(`${method} ${p} -> ${r.status}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
};
const R = (dt, name = "") => `/api/resource/${encodeURIComponent(dt)}${name ? "/" + encodeURIComponent(name) : ""}`;
const exists = async (dt, name) => {
	const r = await call("GET", `${R(dt)}?filters=${encodeURIComponent(JSON.stringify([["name", "=", name]]))}&limit_page_length=1`);
	return r.data.length > 0;
};

let todo = 0;
const say = (verb, what) => { if (verb !== "ok" && verb !== "skipped") todo++; console.log(`${verb.padEnd(8)} ${what}`); };

// 1. Doctypes, in file order: a child table comes before the doctype whose Table field names it.
for (const f of fs.readdirSync(SERVER).filter((n) => n.endsWith("_doctypes.json")).sort()) {
	for (const def of JSON.parse(fs.readFileSync(path.join(SERVER, f), "utf8")).doctypes) {
		if (await exists("DocType", def.name)) { say("ok", `DocType ${def.name} (exists; not compared)`); continue; }
		say(apply ? "created" : "missing", `DocType ${def.name}  (${f})`);
		// Every right spelled out: DocPerm defaults write, create and delete to 1, so a row that says only
		// "read" would hand a reader the right to change and delete (found 5 Nov 2026 on SAP Invoice).
		const RIGHTS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "import",
			"print", "email", "share", "set_user_permissions", "if_owner"];
		const permissions = (def.permissions || []).map((p) => ({ permlevel: 0, ...Object.fromEntries(RIGHTS.map((k) => [k, p[k] ? 1 : 0])), role: p.role }));
		if (apply) await call("POST", R("DocType"), { ...def, permissions, doctype: "DocType" });
	}
}

// 2. Server Scripts, from each file's header.
const header = (src) => {
	const h = {};
	for (const m of src.matchAll(/^#\s{2,}([A-Za-z ()]+?)\s*:\s*(.+)$/gm)) h[m[1].trim()] = m[2].trim();
	return h;
};
for (const f of fs.readdirSync(SERVER).filter((n) => n.endsWith(".py")).sort()) {
	const src = fs.readFileSync(path.join(SERVER, f), "utf8").replace(/\r\n/g, "\n");
	if (!/^# Frappe Server Script/m.test(src)) continue;
	const h = header(src);
	const name = h.Name;
	const type = h["Script Type"];
	if (!name || !type) { say("skipped", `${f}: no Name / Script Type in its header`); continue; }
	const doc = { name, script_type: type, script: src };
	if (type === "API") doc.api_method = h["API Method"] || name;
	else if (type === "DocType Event") {
		doc.reference_doctype = h["Reference Doc"];
		doc.doctype_event = h["DocType Event"];
		if (!doc.reference_doctype || !doc.doctype_event) { say("skipped", `${f}: DocType Event without Reference Doc / DocType Event`); continue; }
	}
	if (await exists("Server Script", name)) {
		const cur = (await call("GET", R("Server Script", name))).data;
		const same = (cur.script || "").replace(/\r\n/g, "\n").trim() === src.trim()
			&& cur.script_type === type
			&& (type !== "API" || cur.api_method === doc.api_method)
			&& (type !== "DocType Event" || (cur.reference_doctype === doc.reference_doctype && cur.doctype_event === doc.doctype_event));
		if (same) { say("ok", `Server Script ${name}${cur.disabled ? " (disabled on the site)" : ""}`); continue; }
		say(apply ? "updated" : "differs", `Server Script ${name}  (${f})`);
		if (apply) await call("PUT", R("Server Script", name), { script: src, script_type: type, api_method: doc.api_method, reference_doctype: doc.reference_doctype, doctype_event: doc.doctype_event });
	} else {
		say(apply ? "created" : "missing", `Server Script ${name}  (${f}, ${type}${doc.reference_doctype ? ` on ${doc.reference_doctype} ${doc.doctype_event}` : ""})`);
		if (apply) await call("POST", R("Server Script"), { ...doc, disabled: 0 });
	}
}

console.log(todo === 0 ? "\nNothing to do." : apply ? `\n${todo} change(s) made on ${BASE}.` : `\n${todo} change(s) to make. Run again with --apply.`);
