// The CMMS's SAP sync (Manna_CMMS/sap-sync/Sync-SapItemCategories.ps1), run from this PC against the local
// ERPNext copy and the SAP test companies only.
//
//     node localdev/sap/run-sync.mjs                                    dry run, every kind of document off
//     node localdev/sap/run-sync.mjs --on post_purchase_requests        dry run of one kind
//     node localdev/sap/run-sync.mjs --on post_purchase_requests --apply     posts it, to the test company
//     node localdev/sap/run-sync.mjs --on all --apply --watch           the live watcher, until Ctrl+C
//
// --watch runs Manna_CMMS/sap-sync/Watch-CmmsSapSync.ps1 the way SAP-CMMS-Watch runs it on the SAP server (a
// 55-second window, started again as soon as it ends), so a save in the local CMMS reaches the test company in
// the same few seconds it takes live. The watcher cannot pass -DryRun to the sync, so --watch needs --apply; the
// switches still decide what posts, and the copy's dry_run tick still holds everything back if it is set.
// Its log is Manna_CMMS/sap-sync/logs/cmms-watch-<date>.log. --on all turns on every switch.
//
// The sync itself has no idea it is not on the SAP server: it signs in to whatever `sap_db` ERPNext names for
// each company, and it calls SAP with curl -k. So before it starts, this:
//
//   1. refuses unless the CMMS's .env points at an ERPNext on this PC;
//   2. checks the Service Layer's certificate against sapguard's pinned fingerprint, and hands the sync that
//      certificate's public key as sap.pinned_pubkey, so curl refuses any other server before a password is sent;
//   3. reads every company's sap_db from the local copy and skips each one not in sap.local.json's test_dbs
//      (sapguard's rule: no _LIVE name, ever) - on the copy that leaves HRI -> HITECH_RUBBER;
//   4. writes the sync a config in the temp folder - local ERPNext, SAP login, the switches asked for, the skip
//      list - and deletes it when the sync ends.
//
// Every switch is off unless named with --on, so the copy's queued records from production are left Queued.
// Without --apply the sync runs with -DryRun: it reads both sides and writes only the open PO lines it read
// back into the local ERPNext.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { loadConfig, refusalFor } from "./sapguard.mjs";
import { CMMS } from "../paths.mjs";

const SYNC = path.join(CMMS, "sap-sync", "Sync-SapItemCategories.ps1");
const WATCH = path.join(CMMS, "sap-sync", "Watch-CmmsSapSync.ps1");
const SWITCHES = [
	"create_items", "post_receipts", "create_groups", "revalue_nil_stock", "post_purchase_requests",
	"post_issues", "post_purchase_orders", "pull_from_sap", "create_hsn", "mark_gst_relevant",
	"post_purchase_quotations", "post_quotation_purchase_orders", "post_quotation_receipts",
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const watch = args.includes("--watch");
let on = args.flatMap((a, i) => (a === "--on" ? String(args[i + 1] || "").split(",") : [])).map((s) => s.trim()).filter(Boolean);
if (on.includes("all")) on = [...SWITCHES];
for (const s of on) if (!SWITCHES.includes(s)) throw new Error(`unknown switch ${s}; known: all, ${SWITCHES.join(", ")}`);
if (watch && !apply) throw new Error("--watch needs --apply: the watcher runs the sync without -DryRun (tick Dry Run on the copy's control Single for a dry watcher)");

// 1. The local ERPNext, from the CMMS's own .env.
const env = Object.fromEntries(
	fs.readFileSync(path.join(CMMS, "server", ".env"), "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const erpUrl = env.ERPNEXT_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(erpUrl)) throw new Error(`Refusing: server/.env points at ${erpUrl}, not an ERPNext on this PC`);
const erpAuth = { Authorization: `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}` };

// 2. The certificate, against the pin; its public key goes to curl.
const sap = loadConfig();
const pubkey = await new Promise((resolve, reject) => {
	const u = new URL(sap.url);
	const s = tls.connect({ host: u.hostname, port: Number(u.port || 443), rejectUnauthorized: false }, () => {
		const cert = s.getPeerCertificate(true);
		s.end();
		const got = String(cert?.fingerprint256 || "").replace(/[^0-9A-F]/gi, "").toUpperCase();
		if (got !== String(sap.fingerprint256).replace(/[^0-9A-F]/gi, "").toUpperCase()) return reject(new Error(`SAP certificate fingerprint mismatch (got ${got || "none"}) - not running`));
		resolve(crypto.createHash("sha256").update(cert.pubkey).digest("base64"));
	});
	s.on("error", reject);
	s.setTimeout(15000, () => s.destroy(new Error("SAP did not answer within 15 s")));
});

// 3. Which SAP databases the copy names, and which of them may be touched.
const control = await (await fetch(`${erpUrl.replace(/\/$/, "")}/api/resource/SAP%20Item%20Category%20Sync%20Control/SAP%20Item%20Category%20Sync%20Control`, { headers: erpAuth })).json();
const options = JSON.parse(control?.data?.item_master_options || "{}");
const dbs = [...new Set(Object.values(options).map((o) => String(o.sap_db || "").trim()).filter(Boolean))];
const allowed = dbs.filter((db) => !refusalFor(db, sap.test_dbs));
const skipped = dbs.filter((db) => refusalFor(db, sap.test_dbs));
if (!allowed.length) throw new Error(`No company on the local copy names a test database (${dbs.join(", ")}). Run localdev/unlive.sh.`);
for (const [abbr, o] of Object.entries(options)) {
	console.log(`  ${abbr.padEnd(6)} ${o.sap_db}  ${allowed.includes(o.sap_db) ? "SYNCED" : `skipped (${refusalFor(o.sap_db, sap.test_dbs)})`}`);
}
if (Number(control?.data?.dry_run) === 1 && apply) console.log("  note: the copy's control Single has dry_run = 1, so the sync stays a dry run anyway");

// 4. The sync's config, for this run only.
const config = {
	erpnext: { url: erpUrl.replace(/\/$/, ""), api_key: env.ERPNEXT_API_KEY, api_secret: env.ERPNEXT_API_SECRET },
	sap: { url: sap.url, username: sap.username, password: sap.password, password_overrides: sap.password_overrides || {}, pinned_pubkey: pubkey },
	control_doctype: "SAP Item Category Sync Control",
	// As live has it since 23 Oct 2026 (sap-sync/README.md); the script's own default leaves out the last two.
	edit_fields: ["ItemName", "ItemsGroupCode", "U_SubTypeA", "U_SubTypeB", "ChapterID", "U_TaxRate", "ForeignName", "MinInventory"],
	...Object.fromEntries(SWITCHES.map((s) => [s, on.includes(s)])),
	pr_requester: "",
	skip_companies: skipped,
	// The sync lets only its demo company post to the test database (28 Oct 2026); on this copy that is HRI.
	demo_company: { abbr: Object.entries(options).find(([, o]) => allowed.includes(o.sap_db))?.[0] || "", sap_db: allowed[0] || "" },
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmms-sync-"));
const file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`\n${watch ? "WATCH, " : ""}${apply ? "APPLY" : "DRY RUN"} - switches on: ${on.join(", ") || "none"}; skipped: ${skipped.join(", ") || "none"}\n`);
const ps = (script, extra) => spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...extra], { stdio: "inherit" });
try {
	if (watch) {
		const poller = path.join(dir, "poller.config.json");
		fs.writeFileSync(poller, JSON.stringify({
			erpnext_site: config.erpnext.url, bot_api_key: config.erpnext.api_key, bot_api_secret: config.erpnext.api_secret,
			control_doctype: config.control_doctype, sync_script: SYNC, sync_config: file,
			log_dir: path.join(CMMS, "sap-sync", "logs"),
		}, null, 2), { mode: 0o600 });
		// Ctrl+C reaches the watcher too and ends its window; this only stops the next one starting.
		let stop = false;
		process.on("SIGINT", () => { stop = true; });
		console.log("Watching the local ERPNext for CMMS saves. Ctrl+C to stop.\n");
		while (!stop) {
			const r = ps(WATCH, ["-ConfigPath", poller]);
			if (r.status === 2) { process.exitCode = 2; break; } // the watcher's own config refusal - it would only repeat
		}
	} else {
		process.exitCode = ps(SYNC, ["-ConfigPath", file, ...(apply ? [] : ["-DryRun"])]).status ?? 1;
	}
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}
