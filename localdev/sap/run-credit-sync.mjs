// The SAP credit sync (SALES_DASHBOARD/sap-credit-sync/Sync-SapCreditLimits.ps1), run from this PC against the
// local ERPNext copy and TEST_MANNA_TREADS only: credit limits, outstanding and ageing, payment terms, and the
// SAP Invoice mirror the credit history under Team Targets reads.
//
//     node localdev/sap/run-credit-sync.mjs                              dry run: what would change
//     node localdev/sap/run-credit-sync.mjs --apply                      write it to the local ERPNext
//     node localdev/sap/run-credit-sync.mjs --limit 5 --apply            at most 5 customer and 5 invoice writes
//     node localdev/sap/run-credit-sync.mjs --invoices-since 2026-04-01  the mirror's start (default: 1 April)
//
// Before it starts, this:
//
//   1. refuses unless the CMMS's .env points at an ERPNext on this PC (its key is the local site's Administrator);
//   2. refuses the company unless sapguard allows it (in test_dbs, never a _LIVE name);
//   3. hands the sync the Service Layer's pinned fingerprint as sap.pinned_cert_sha256, so it sends the SAP
//      password to nothing else;
//   4. writes the sync a config in the temp folder and deletes it when the sync ends.
//
// The sync itself refuses a TEST_ company with an ERPNext that is not on this PC (Assert-SapErpPairing). It never
// creates customers from here (create_customers false): TEST's customers are the live ones of the day it was copied,
// and the local copy already has them. Its log is SALES_DASHBOARD/sap-credit-sync/logs/sap-credit-sync-<date>.log.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, refusalFor } from "./sapguard.mjs";
import { CMMS_ENV, SALES_DASHBOARD } from "../paths.mjs";

const SYNC_DIR = path.join(SALES_DASHBOARD, "sap-credit-sync");
const SYNC = path.join(SYNC_DIR, "Sync-SapCreditLimits.ps1");
const MANNA = "TEST_MANNA_TREADS";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || "") : ""; };
const apply = args.includes("--apply");
const limit = opt("--limit");
const since = opt("--invoices-since");
if (limit && !/^\d+$/.test(limit)) throw new Error(`--limit must be a number (got ${limit})`);
if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--invoices-since must be yyyy-mm-dd (got ${since})`);

// 1. The local ERPNext, from the CMMS's own .env.
const env = Object.fromEntries(
	fs.readFileSync(CMMS_ENV, "utf8").split(/\r?\n/)
		.filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const erpUrl = (env.ERPNEXT_URL || "").replace(/\/$/, "");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(erpUrl)) throw new Error(`Refusing: ${CMMS_ENV} points at ${erpUrl}, not an ERPNext on this PC`);
const ping = await fetch(`${erpUrl}/api/method/ping`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
if (!ping?.ok) throw new Error(`The local ERPNext at ${erpUrl} is not answering - start it with localdev/start.sh`);

// 2. The company, through sapguard's rule.
const sap = loadConfig();
const why = refusalFor(MANNA, sap.test_dbs);
if (why) throw new Error(`Refusing ${MANNA}: ${why}`);

// 3 and 4. The sync's config, for this run only.
const config = {
	erpnext: { site: erpUrl, api_key: env.ERPNEXT_API_KEY, api_secret: env.ERPNEXT_API_SECRET },
	sap: {
		url: sap.url.replace(/\/+$/, ""),
		username: sap.username,
		password: sap.password_overrides?.[MANNA] ?? sap.password,
		verify_ssl: false,
		pinned_cert_sha256: sap.fingerprint256,
		page_size: 200,
		companies: [{ name: "Manna Treads", company_db: MANNA }],
	},
	// As the live config.example.json has them, except no new customers from a test company.
	write_mode: "overwrite",
	sync_credit_limit: true,
	sync_outstanding: true,
	ageing_basis: "posting_date",
	outstanding_total: "account_balance",
	skip_codes: [],
	create_customers: false,
	sync_invoices: true,
	...(since ? { invoices_since: since } : {}),
	log_dir: path.join(SYNC_DIR, "logs"),
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credit-sync-"));
const file = path.join(dir, "config.json");
fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`\n${apply ? "APPLY" : "DRY RUN"} - credit figures and SAP invoices${since ? ` since ${since}` : ""}${limit ? `, at most ${limit} writes each` : ""}; ${MANNA}, ERPNext ${erpUrl}\n`);
try {
	const r = spawnSync("powershell.exe", [
		"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SYNC,
		"-ConfigPath", file,
		...(limit ? ["-Limit", limit] : []),
		...(apply ? [] : ["-DryRun"]),
	], { stdio: "inherit" });
	process.exitCode = r.status ?? 1;
} finally {
	fs.rmSync(dir, { recursive: true, force: true });
}
