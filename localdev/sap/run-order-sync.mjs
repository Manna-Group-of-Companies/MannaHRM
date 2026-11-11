// The sales order sync (SALES_DASHBOARD/sap-order-sync/Sync-SapOrders.ps1), run from this PC against the local
// ERPNext copy and the SAP test companies only, in the manna_first order flow.
//
//     node localdev/sap/run-order-sync.mjs                          dry run of PASS M, P and H, orders created today on
//     node localdev/sap/run-order-sync.mjs --since 2026-11-01       ...created on or after 1 Nov
//     node localdev/sap/run-order-sync.mjs --limit 1 --apply        posts one, to TEST_MANNA_TREADS
//     node localdev/sap/run-order-sync.mjs --pass M,B               more passes than PASS M
//
// Hi-Tech is TEST_HITECH_PRETREADS and Manna Treads TEST_MANNA_TREADS. Before it starts, this:
//
//   1. refuses unless the CMMS's .env points at an ERPNext on this PC (its key is the local site's Administrator);
//   2. refuses either company unless sapguard allows it (in test_dbs, never a _LIVE name);
//   3. hands the sync the Service Layer's pinned fingerprint as sap.pinned_cert_sha256, so it sends the SAP
//      password to nothing else - the sync checks it on every connection;
//   4. writes the sync a config in the temp folder and deletes it when the sync ends.
//
// The sync itself refuses a TEST_ company with an ERPNext that is not on this PC (Assert-SapErpPairing), so the
// config this writes cannot be pointed at the live site by editing one line. Without --apply it runs -DryRun.
// Its log is SALES_DASHBOARD/sap-order-sync/logs/sap-order-sync-<date>.log.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, refusalFor } from "./sapguard.mjs";
import { CMMS, SALES_DASHBOARD } from "../paths.mjs";

const SYNC_DIR = path.join(SALES_DASHBOARD, "sap-order-sync");
const SYNC = path.join(SYNC_DIR, "Sync-SapOrders.ps1");
const HITECH = "TEST_HITECH_PRETREADS";
const MANNA = "TEST_MANNA_TREADS";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || "") : ""; };
const apply = args.includes("--apply");
const today = new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, local
const since = opt("--since") || today;
const limit = opt("--limit");
const passes = opt("--pass") || "M,P,H,K";
const pickSince = opt("--pick-since") || today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since must be yyyy-mm-dd (got ${since})`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(pickSince)) throw new Error(`--pick-since must be yyyy-mm-dd (got ${pickSince})`);
if (limit && !/^\d+$/.test(limit)) throw new Error(`--limit must be a number (got ${limit})`);

// 1. The local ERPNext, from the CMMS's own .env.
const env = Object.fromEntries(
	fs.readFileSync(path.join(CMMS, "server", ".env"), "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const erpUrl = (env.ERPNEXT_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(erpUrl)) throw new Error(`Refusing: server/.env points at ${erpUrl}, not an ERPNext on this PC`);
const ping = await fetch(`${erpUrl}/api/method/ping`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
if (!ping?.ok) throw new Error(`The local ERPNext at ${erpUrl} is not answering - start it with localdev/start.sh`);

// 2. Both companies, through sapguard's rule.
const sap = loadConfig();
for (const db of [HITECH, MANNA]) {
	const why = refusalFor(db, sap.test_dbs);
	if (why) throw new Error(`Refusing ${db}: ${why}`);
}
const pw = (db) => sap.password_overrides?.[db] ?? sap.password;

// 3 and 4. The sync's config, for this run only.
const config = {
	erpnext: { site: erpUrl, api_key: env.ERPNEXT_API_KEY, api_secret: env.ERPNEXT_API_SECRET },
	sap: {
		url: sap.url.replace(/\/+$/, ""),
		username: sap.username,
		password: pw(HITECH),
		verify_ssl: false,
		pinned_cert_sha256: sap.fingerprint256,
		page_size: 200,
		company: { name: "Hi-Tech Pretreads (TEST)", company_db: HITECH },
		series: null,
		sales_person_code: null,
	},
	// As live has it (sap-order-sync/README.md).
	order_sync: {
		po_status_gate: "PO Approved - Ready for SAP",
		fixed_card_code: "10118",
		send_line_unit_price: true,
		// 01 STORE, where the stock is and the stock step reads (11 Nov 2026); 07 is the aged-stock store.
		line_warehouse: "01",
		status_source: "document_status",
		stamp_erpnext_name_in: "NumAtCard",
		delivery_scan_days: 120,
		invoice_scan_days: 120,
	},
	manna_treads: {
		enabled: true,
		company_db: MANNA,
		series: 189,
		bpl_id: 1,
		warehouse: "01",
		tax_code: "CG+SG@18",
		location_code: 2,
		username: sap.username,
		password: pw(MANNA),
	},
	// B1if makes the purchase order and Hi-Tech's order; PASS P and H only find them (4 Nov 2026).
	// Stage 4 (5 Nov 2026): pick lists made on or after --pick-since go to Hi-Tech as SAP pick lists (PASS K).
	order_flow: { mode: "manna_first", since, ...(pickSince ? { pick_lists_since: pickSince } : {}) },
	log_dir: path.join(SYNC_DIR, "logs"),
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "order-sync-"));
const file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`\n${apply ? "APPLY" : "DRY RUN"} - passes ${passes}, orders created on or after ${since}${limit ? `, at most ${limit}` : ""}; ${HITECH} + ${MANNA}, ERPNext ${erpUrl}\n`);
try {
	const r = spawnSync("powershell.exe", [
		"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SYNC,
		"-ConfigPath", file, "-Pass", passes,
		...(limit ? ["-Limit", limit] : []),
		...(apply ? [] : ["-DryRun"]),
	], { stdio: "inherit" });
	process.exitCode = r.status ?? 1;
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}
