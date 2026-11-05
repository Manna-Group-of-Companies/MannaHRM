// Read-only: can this PC sign in to each SAP test company, and what is in it?
//
//     node localdev/sap/probe.mjs              every database in test_dbs
//     node localdev/sap/probe.mjs SBODEMO_TEST one of them
//
// Signs in, reads the company's name and a few item and item-group rows, signs
// out. Writes nothing — every call after Login is a GET.

import { loadConfig, SapSession } from "./sapguard.mjs";

const cfg = loadConfig();
const dbs = process.argv.slice(2).length ? process.argv.slice(2) : cfg.test_dbs;

let failed = 0;
for (const db of dbs) {
	console.log(`\n== ${db}`);
	let s;
	try {
		s = new SapSession(cfg, db);
	} catch (e) {
		console.log(`  REFUSED  ${e.message}`);
		failed++;
		continue;
	}
	try {
		const login = await s.login();
		console.log(`  signed in   Service Layer ${login?.Version ?? "?"}, session timeout ${login?.SessionTimeout ?? "?"} min`);
		const admin = await s.get("AdminInfo?$select=CompanyName,LocalCurrency").catch(() => null);
		const info = admin?.value?.[0] ?? admin;
		if (info?.CompanyName) console.log(`  company     ${info.CompanyName} (${info.LocalCurrency ?? "?"})`);
		const items = await s.get("Items?$top=3&$select=ItemCode,ItemName&$orderby=ItemCode");
		console.log(`  items       ${items.value.map((i) => `${i.ItemCode} ${i.ItemName}`).join(" | ") || "(none)"}`);
		const groups = await s.get("ItemGroups?$top=5&$select=Number,GroupName");
		console.log(`  item groups ${groups.value.map((g) => `${g.Number} ${g.GroupName}`).join(" | ") || "(none)"}`);
		const count = await s.get("Items/$count").catch(() => "?");
		console.log(`  item count  ${count}`);
	} catch (e) {
		failed++;
		// Not retried: SAP locks the user after three wrong passwords.
		console.log(`  FAILED      ${e.message}${e.sapCode ? ` (SAP code ${e.sapCode})` : ""}`);
	} finally {
		await s.logout();
	}
}
process.exitCode = failed ? 1 : 0;
