// Everything a LOCAL ERPNext copy needs before B1if on the SAP server can post to it, in one run. Written on
// 12 Nov 2026, when a second PC was to take the end-to-end test: the first PC had got half of this by hand.
//
//     node localdev/setup-b1if-erp.mjs               dry run: what is missing or different
//     node localdev/setup-b1if-erp.mjs --apply       make it so
//     node localdev/setup-b1if-erp.mjs --apply --new-key    ...and a new API secret for the sync user, even
//                                                            when the one on file still signs in
//
// In order:
//   1. the sales repo's doctypes, Server Scripts and fields       (apply-sales-erp.mjs, add-sales-fields.mjs)
//   2. the two "manager has seen it" fields on Sales Order        (app/server/order_seen_fields.json)
//   3. the WhatsApp doctypes and scripts, held in test mode       (whatsapp/)
//   4. what B1if posts to: scripts, status fields, two permission rows   (sap-b1if/erpnext/install_local.py)
//   5. the sync user B1if signs in as, and an API key for it kept in a gitignored file
//   6. the switch that lets B1if's posts write                    (SAP Sync Control, custom_b1if_writes)
//
// Refuses any ERPNext but 127.0.0.1:8000, because the key it uses (Manna_CMMS/server/.env) is the local
// Administrator's and because step 6 lets SAP's TEST data overwrite customers, stock and order status.
// What it cannot do is on the SAP server and in Windows: the firewall rule for port 8000 and B1if's
// ERPNEXT_LOCAL system. localdev/sap/SETUP_OTHER_PC.md section 8 has both.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CMMS_ENV, LOCALDEV, SALES_DASHBOARD } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const newKey = process.argv.includes("--new-key");
if (newKey && !apply) throw new Error("--new-key changes the sync user's secret; it needs --apply");

const SYNC_USER = "sapsync@mannarubber.com";
const SYNC_ROLE = "SAP Sync Bot";
const KEY_FILE = path.join(SALES_DASHBOARD, "sap-b1if", "erpnext", ".sapsync-local-key.txt");

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = (env.ERPNEXT_URL || "").replace(/\/+$/, "");
if (BASE !== "http://127.0.0.1:8000") throw new Error(`Refusing: ${CMMS_ENV} points at ${BASE || "nothing"}, not the local copy`);
const admin = `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`;

const call = async (method, p, body, auth = admin) => {
	const r = await fetch(BASE + p, {
		method,
		headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await r.text();
	if (!r.ok) throw Object.assign(new Error(`${method} ${p} -> ${r.status}: ${text.slice(0, 300)}`), { status: r.status });
	return text ? JSON.parse(text) : null;
};
const R = (dt, name = "") => `/api/resource/${encodeURIComponent(dt)}${name ? "/" + encodeURIComponent(name) : ""}`;
const find = async (dt, filters, fields = ["name"]) =>
	(await call("GET", `${R(dt)}?fields=${encodeURIComponent(JSON.stringify(fields))}&filters=${encodeURIComponent(JSON.stringify(filters))}&limit_page_length=0`)).data;
const exists = async (dt, name) => (await find(dt, [["name", "=", name]])).length > 0;

const who = await call("GET", "/api/method/frappe.auth.get_logged_user").catch((e) => {
	throw new Error(e.status === 401
		? `The key in ${CMMS_ENV} does not sign in to ${BASE}. It must be this PC's own Administrator key (localdev/README.md section 4).`
		: `The local ERPNext at ${BASE} is not answering - start it with localdev/start.sh (${e.message})`);
});
if (who.message !== "Administrator") throw new Error(`The key in ${CMMS_ENV} signs in as ${who.message}, not Administrator`);

let todo = 0;
let warnings = 0;
const say = (verb, what) => { if (!["ok", "skipped", "to run"].includes(verb)) todo++; console.log(`${verb.padEnd(8)} ${what}`); };
const warn = (what) => { warnings++; console.log(`WARNING  ${what}`); };
const step = (n, title) => console.log(`\n== ${n}. ${title}`);
const run = (exe, args, title) => {
	const r = spawnSync(exe, args, { stdio: "inherit" });
	if (r.error) throw new Error(`${title}: could not start ${exe} (${r.error.message})`);
	if (r.status !== 0) throw new Error(`${title} stopped with exit code ${r.status}; nothing after it was run`);
};

// 1. The sales repo's own installers, unchanged: they hold the rules for a doctype and a script.
step(1, "Sales doctypes, Server Scripts and fields");
for (const f of ["apply-sales-erp.mjs", "add-sales-fields.mjs"]) {
	console.log(`-- ${f}${apply ? " --apply" : ""}`);
	run(process.execPath, [path.join(LOCALDEV, f), ...(apply ? ["--apply"] : [])], f);
}

// 2. Added when missing, never changed: a field already there may have been moved on purpose.
step(2, "Order-seen fields on Sales Order");
for (const cf of JSON.parse(fs.readFileSync(path.join(SALES_DASHBOARD, "app", "server", "order_seen_fields.json"), "utf8")).custom_fields) {
	if ((await find("Custom Field", [["dt", "=", cf.dt], ["fieldname", "=", cf.fieldname]])).length) { say("ok", `field ${cf.dt}.${cf.fieldname}`); continue; }
	say(apply ? "created" : "missing", `field ${cf.dt}.${cf.fieldname}`);
	if (apply) await call("POST", R("Custom Field"), { ...cf, doctype: "Custom Field" });
}

// 3. WhatsApp. Its scripts' headers are not apply-sales-erp's ("Event", and a Scheduler type), so they are read here.
step(3, "WhatsApp doctypes and scripts, in test mode");
const WA = path.join(SALES_DASHBOARD, "whatsapp");
// Every right spelled out: DocPerm defaults write, create and delete to 1, so a row that says only "read"
// would hand a reader the right to change and delete (found 5 Nov 2026 on SAP Invoice).
const RIGHTS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "import",
	"print", "email", "share", "set_user_permissions", "if_owner"];
for (const def of JSON.parse(fs.readFileSync(path.join(WA, "doctypes.json"), "utf8")).doctypes) {
	if (await exists("DocType", def.name)) { say("ok", `DocType ${def.name} (exists; not compared)`); continue; }
	say(apply ? "created" : "missing", `DocType ${def.name}`);
	const permissions = (def.permissions || []).map((p) => ({ permlevel: 0, ...Object.fromEntries(RIGHTS.map((k) => [k, p[k] ? 1 : 0])), role: p.role }));
	if (apply) await call("POST", R("DocType"), { ...def, permissions, doctype: "DocType" });
}
for (const f of fs.readdirSync(path.join(WA, "server-scripts")).filter((n) => n.endsWith(".py")).sort()) {
	const src = fs.readFileSync(path.join(WA, "server-scripts", f), "utf8").replace(/\r\n/g, "\n");
	const h = {};
	// "#   Cron Format       * * * * *          (every minute)": the value ends at three spaces or the line.
	for (const m of src.slice(0, 1200).matchAll(/^#\s+(Script Type|Reference Doc|Event Frequency|Cron Format|Event|Name)\s{2,}(.+?)(?:\s{3,}.*)?$/gm)) h[m[1]] = m[2].trim();
	const name = h.Name;
	const type = h["Script Type"];
	if (!name || !type) { say("skipped", `${f}: no Name / Script Type in its header`); continue; }
	const doc = { script_type: type, script: src };
	if (type === "DocType Event") Object.assign(doc, { reference_doctype: h["Reference Doc"], doctype_event: h.Event });
	else if (type === "Scheduler Event") Object.assign(doc, { event_frequency: h["Event Frequency"], cron_format: h["Cron Format"] });
	else { say("skipped", `${f}: a ${type} script, which this does not install`); continue; }
	if (Object.values(doc).some((v) => !v)) { say("skipped", `${f}: its header does not say when it runs`); continue; }
	if (await exists("Server Script", name)) {
		const cur = (await call("GET", R("Server Script", name))).data;
		const same = (cur.script || "").replace(/\r\n/g, "\n").trim() === src.trim()
			&& Object.entries(doc).every(([k, v]) => k === "script" || cur[k] === v);
		if (same) { say("ok", `Server Script ${name}${cur.disabled ? " (disabled on the site)" : ""}`); continue; }
		say(apply ? "updated" : "differs", `Server Script ${name}`);
		if (apply) await call("PUT", R("Server Script", name), doc);
	} else {
		say(apply ? "created" : "missing", `Server Script ${name}  (${type})`);
		if (apply) await call("POST", R("Server Script"), { ...doc, name, __newname: name, disabled: 0 });
	}
}
// A copy restored from live carries live's settings. Test mode is forced on: a test PC must never message a
// customer, whatever the backup said. It is switched on only where it cannot send at all (no phone number
// id), so the queue fills and the triggers can be watched; with a number id on file that choice is a person's.
if (await exists("DocType", "Manna WhatsApp Settings")) {
	const s = (await call("GET", R("Manna WhatsApp Settings", "Manna WhatsApp Settings"))).data;
	if (!s.test_mode) {
		say(apply ? "set" : "differs", "WhatsApp test mode ON (it was off: this copy would have messaged customers)");
		if (apply) await call("PUT", R("Manna WhatsApp Settings", "Manna WhatsApp Settings"), { test_mode: 1 });
	} else say("ok", "WhatsApp test mode is on");
	if (s.phone_number_id) {
		warn(`this copy holds a WhatsApp phone number id (enabled = ${s.enabled ? 1 : 0}). In test mode it can still send to the numbers under "test numbers". Clear the number id and the token in Desk unless that is wanted.`);
	} else if (!s.enabled) {
		say(apply ? "set" : "differs", "WhatsApp enabled, with no phone number id: messages queue and nothing can be sent");
		if (apply) await call("PUT", R("Manna WhatsApp Settings", "Manna WhatsApp Settings"), { enabled: 1 });
	} else say("ok", "WhatsApp enabled with no phone number id (queues, cannot send)");
} else say("skipped", "WhatsApp settings: the doctype is not there yet (run again with --apply)");

// 4. The sales repo's installer for what B1if posts to. It has no dry run - it rewrites every script each time -
// so a dry run only names it.
step(4, "What B1if posts to (sap-b1if/erpnext/install_local.py)");
const INSTALLER = path.join(SALES_DASHBOARD, "sap-b1if", "erpnext", "install_local.py");
if (apply) run("python", [INSTALLER], "install_local.py");
else say("to run", "python sap-b1if/erpnext/install_local.py (it has no dry run; --apply runs it)");

// 5. The sync user. Both it and its role come with a copy restored from live; they are made here only for a
// site that lacks them, and such a site also lacks the role's standard permissions (a restore has them).
step(5, `The sync user ${SYNC_USER}`);
if (await exists("Role", SYNC_ROLE)) say("ok", `role ${SYNC_ROLE}`);
else {
	say(apply ? "created" : "missing", `role ${SYNC_ROLE}`);
	warn(`role ${SYNC_ROLE} was not on this site, so it is not a copy of live: the role's rights on Customer, Sales Order, SAP Invoice and the rest are missing too. Restore a live backup (localdev/new_site.sh) rather than build them by hand.`);
	if (apply) await call("POST", R("Role"), { role_name: SYNC_ROLE, desk_access: 1 });
}
let user = (await find("User", [["name", "=", SYNC_USER]], ["name", "enabled", "api_key"]))[0];
if (!user) {
	say(apply ? "created" : "missing", `user ${SYNC_USER} (role ${SYNC_ROLE} only, no welcome email)`);
	if (apply) {
		await call("POST", R("User"), { email: SYNC_USER, first_name: "SAP Sync", last_name: "Bot", user_type: "System User", send_welcome_email: 0, enabled: 1, roles: [{ role: SYNC_ROLE }] });
		user = { name: SYNC_USER, enabled: 1, api_key: null };
	}
} else {
	const roles = (await call("GET", R("User", SYNC_USER))).data.roles.map((r) => r.role);
	if (!user.enabled) warn(`user ${SYNC_USER} is disabled on this site; enable it in Desk or B1if's posts are refused`);
	if (roles.includes(SYNC_ROLE)) say("ok", `user ${SYNC_USER} with role ${SYNC_ROLE}`);
	else warn(`user ${SYNC_USER} does not hold role ${SYNC_ROLE} (it has: ${roles.join(", ") || "none"}); give it in Desk`);
}

// The key. generate_keys keeps the key id and ALWAYS replaces the secret, so whatever held the old one stops
// working that second (11 Nov 2026: one run of it took the CMMS and the order sync off the local site). So a
// key on file that still signs in is kept, and a new one is made only when there is none, it no longer works,
// or --new-key asks. The secret goes to the gitignored file and is never printed.
const onFile = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8").match(/token\s+([A-Za-z0-9]+):([A-Za-z0-9]+)/) : null;
const signsInAs = async (key, secret) => (await call("GET", "/api/method/frappe.auth.get_logged_user", undefined, `token ${key}:${secret}`).catch(() => null))?.message;
const works = onFile ? (await signsInAs(onFile[1], onFile[2])) === SYNC_USER : false;
const rel = path.relative(path.dirname(SALES_DASHBOARD), KEY_FILE);
if (works && !newKey) say("ok", `API key in ${rel} signs in as ${SYNC_USER}`);
else {
	const why = newKey && works ? "--new-key" : onFile ? "the key on file no longer signs in" : "no key on file";
	say(apply ? "created" : "missing", `API key for ${SYNC_USER} (${why}) -> ${rel}`);
	if (apply) {
		if (!user) throw new Error(`cannot make a key: ${SYNC_USER} does not exist`);
		const made = (await call("POST", "/api/method/frappe.core.doctype.user.user.generate_keys", { user: SYNC_USER })).message;
		const key = made.api_key || (await call("GET", R("User", SYNC_USER))).data.api_key;
		if (!key || !made.api_secret) throw new Error("generate_keys answered without a key or secret");
		if ((await signsInAs(key, made.api_secret)) !== SYNC_USER) throw new Error("the new key does not sign in; nothing was written to the key file");
		fs.writeFileSync(KEY_FILE, [
			`LOCAL ERPNext (${BASE} on this PC) only - user ${SYNC_USER}, made ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} by localdev/setup-b1if-erp.mjs.`,
			"B1if signs in with basic authentication: user = the part before the colon, password = the part after it.",
			`Authorization: token ${key}:${made.api_secret}`,
			"",
		].join("\n"), { mode: 0o600 });
		console.log(`         B1if's ERPNEXT_LOCAL system on the SAP server must be given this key (SETUP_OTHER_PC.md section 8); the old one is dead.`);
	}
}

// 6. Blank means every sync answers what it would do and writes nothing. A value somebody chose is left alone.
step(6, "Letting B1if's posts write (SAP Sync Control)");
if ((await find("Custom Field", [["dt", "=", "SAP Sync Control"], ["fieldname", "=", "custom_b1if_writes"]])).length) {
	const writes = String((await call("GET", R("SAP Sync Control", "SAP Sync Control"))).data.custom_b1if_writes || "").trim();
	if (writes === "all") say("ok", "every sync writes (custom_b1if_writes = all)");
	else if (writes) warn(`custom_b1if_writes is "${writes}", not "all": only those syncs write. Left as it is.`);
	else {
		say(apply ? "set" : "differs", `custom_b1if_writes = all (it was blank: every sync a dry run)`);
		if (apply) await call("PUT", R("SAP Sync Control", "SAP Sync Control"), { custom_b1if_writes: "all" });
	}
} else say("skipped", "the switch's field is not there yet - step 4 adds it (run again with --apply)");

// A dry run cannot see inside step 4, so it never says "nothing to do" outright.
const dryRunEnd = todo === 0 ? "Nothing to do in steps 1-3, 5 and 6; step 4 is only run by --apply." : `${todo} change(s) to make, and step 4. Run again with --apply.`;
console.log(`\n${apply ? (todo === 0 ? "Nothing to do beyond step 4's scripts, rewritten as they are every run." : `${todo} change(s) made on ${BASE}.`) : dryRunEnd}${warnings ? ` ${warnings} warning(s) above.` : ""}`);
if (todo === 0 || apply) console.log("Left to do by hand: the firewall rule for port 8000 and B1if's ERPNEXT_LOCAL system - localdev/sap/SETUP_OTHER_PC.md section 8.");
