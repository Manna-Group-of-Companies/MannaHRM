// One test login per CMMS role, on the LOCAL ERPNext copy only. Writes localdev/TEST_LOGINS.md.
//
//     node localdev/make-test-logins.mjs           creates the missing ones; keeps existing passwords
//     node localdev/make-test-logins.mjs --reset   new passwords for all of them
//
// A role is an ERPNext role the CMMS maps (Manna_CMMS server/integrations/erpnext/auth.js). The Production Manager
// also gets a User Permission on CMMS Plant: without one a plant head sees no plant at all. Hi-Tech Rubber
// Industries, because HRI is the company the local copy syncs to the SAP test database.
//
// Store Maintenance Member is left out while the copy has no such role: it is the phone app's, and the live site
// had not got it when the copy was taken (24 Oct 2026).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CMMS_ENV } from "./paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "TEST_LOGINS.md");
const reset = process.argv.includes("--reset");

const LOGINS = [
	{ cmms: "Manager (Admin)", role: "Store Manager", email: "cmms.manager.test@manna.localhost", name: "Test Manager" },
	{ cmms: "Maintenance Manager", role: "Store Maintenance Manager", email: "cmms.maintenance.test@manna.localhost", name: "Test Maintenance" },
	{ cmms: "Production Manager (HRI plant)", role: "Plant Manager", email: "cmms.plant.test@manna.localhost", name: "Test Plant Head", plant: "Hi-Tech Rubber Industries" },
	{ cmms: "Purchase Manager", role: "Store Purchase Manager", email: "cmms.purchase.test@manna.localhost", name: "Test Purchase" },
	{ cmms: "Higher Management", role: "Higher Management", email: "cmms.board.test@manna.localhost", name: "Test Board" },
	{ cmms: "VP Operations", role: "VP Operations", email: "cmms.vpops.test@manna.localhost", name: "Test VP Operations" },
	{ cmms: "Supervisor (store)", role: "Store Supervisor", email: "cmms.supervisor.test@manna.localhost", name: "Test Supervisor" },
];

const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const base = (env.ERPNEXT_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) throw new Error(`Refusing: ${base} is not an ERPNext on this PC`);
const headers = { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`, "Content-Type": "application/json" };
const erp = async (method, p, body) => {
	const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
	const j = await r.json().catch(() => ({}));
	if (!r.ok && !(method === "GET" && r.status === 404)) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
	return r.ok ? j.data : null;
};
const R = (dt, n = "") => `/api/resource/${encodeURIComponent(dt)}${n ? `/${encodeURIComponent(n)}` : ""}`;

// Passwords already handed out stay as they are unless --reset.
const known = {};
if (fs.existsSync(OUT)) {
	for (const m of fs.readFileSync(OUT, "utf8").matchAll(/^\| [^|]+ \| ([^|\s]+) \| ([^|\s]+) \|/gm)) known[m[1]] = m[2];
}

for (const l of LOGINS) {
	if (!(await erp("GET", R("Role", l.role)))) throw new Error(`role ${l.role} is not on the copy`);
	const user = await erp("GET", R("User", l.email));
	const password = !reset && known[l.email] && user ? known[l.email] : "Ct-" + crypto.randomBytes(9).toString("base64url");
	if (!user) {
		await erp("POST", R("User"), { email: l.email, first_name: l.name, send_welcome_email: 0, enabled: 1, user_type: "System User", new_password: password, roles: [{ role: l.role }] });
		console.log(`  + ${l.email} (${l.role})`);
	} else {
		const roles = (user.roles || []).map((r) => r.role);
		const fields = { enabled: 1 };
		if (!roles.includes(l.role)) fields.roles = [...roles.map((role) => ({ role })), { role: l.role }];
		if (password !== known[l.email]) fields.new_password = password;
		await erp("PUT", R("User", l.email), fields);
		console.log(`  = ${l.email} (${l.role})${fields.new_password ? ", new password" : ""}`);
	}
	l.password = password;
	if (l.plant) {
		const q = new URLSearchParams({ filters: JSON.stringify([["user", "=", l.email], ["allow", "=", "CMMS Plant"], ["for_value", "=", l.plant]]) });
		if (!(await erp("GET", `${R("User Permission")}?${q}`))?.length) {
			await erp("POST", R("User Permission"), { user: l.email, allow: "CMMS Plant", for_value: l.plant, apply_to_all_doctypes: 1 });
			console.log(`    plant ${l.plant}`);
		}
	}
}

fs.writeFileSync(OUT, [
	"# Test logins on the local ERPNext copy (manna.localhost) only",
	"",
	"Never on the live site. Made by `node localdev/make-test-logins.mjs`; `--reset` gives them new passwords.",
	"Sign in to the local CMMS at http://localhost:5173 (start it with Manna_CMMS/run-local.bat).",
	"",
	"| CMMS role | Login | Password |",
	"| --- | --- | --- |",
	...LOGINS.map((l) => `| ${l.cmms} | ${l.email} | ${l.password} |`),
	"",
	"No Maintenance Member login: the copy has no Store Maintenance Member role yet, and that role is the phone app's.",
	"",
].join("\n"));
console.log(`credentials in ${OUT}`);
