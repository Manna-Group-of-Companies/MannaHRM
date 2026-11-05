// Makes the items listed in a file inactive, in one SAP test company.
//
//     node localdev/sap/retire_items.mjs TEST_HITECH_PRETREADS out/Items_sfg_retire.txt           dry run
//     node localdev/sap/retire_items.mjs TEST_HITECH_PRETREADS out/Items_sfg_retire.txt --apply   retire
//
// One code per line. An item is refused when it has stock, stock on order or committed, a BOM of
// its own, or a place on another item's BOM — retiring any of those would strand something.
// Inactive, not deleted: its history stays readable and a person can make it active again.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [db, file] = args.filter((a) => !a.startsWith("--"));
if (!db || !file) throw new Error("node retire_items.mjs TEST_HITECH_PRETREADS codes.txt [--apply]");
const codes = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const key = (c) => `('${encodeURIComponent(c.replace(/'/g, "''"))}')`;

const s = new SapSession(loadConfig(), db);
await s.login();
let failed = 0;
try {
	// The Service Layer refuses an any() filter on BOM lines, so every BOM is read once and searched
	// here. A failed read stops the run: "could not look" must never pass as "not used".
	const usedOn = new Map();
	for (let n = "ProductTrees?$select=TreeCode,ProductTreeLines"; n;) {
		const r = await s.get(n);
		for (const b of r.value) for (const l of b.ProductTreeLines || []) usedOn.set(l.ItemCode, (usedOn.get(l.ItemCode) || []).concat(b.TreeCode));
		const lnk = r["odata.nextLink"];
		n = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
	for (const code of codes) {
		try {
			const it = await s.get(`Items${key(code)}?$select=ItemCode,ItemName,Valid,Frozen,ItemWarehouseInfoCollection`);
			if (it.Frozen === "tYES") { console.log(`already inactive  ${code} ${it.ItemName}`); continue; }
			const busy = (it.ItemWarehouseInfoCollection || []).filter((w) => w.InStock || w.Ordered || w.Committed);
			if (busy.length) throw new Error(`has stock or orders in ${busy.map((w) => w.WarehouseCode).join(", ")}`);
			const own = await s.get(`ProductTrees?$select=TreeCode&$filter=TreeCode eq '${code.replace(/'/g, "''")}'`);
			if (own.value.length) throw new Error("has a BOM of its own");
			if (usedOn.has(code)) throw new Error(`is on the BOM of ${usedOn.get(code).join(", ")}`);
			if (!apply) { console.log(`would retire  ${code} ${it.ItemName}`); continue; }
			await s.request("PATCH", `Items${key(code)}`, { Valid: "tNO", Frozen: "tYES" });
			const back = await s.get(`Items${key(code)}?$select=Valid,Frozen`);
			if (back.Frozen !== "tYES") throw new Error(`reads back Valid ${back.Valid}, Frozen ${back.Frozen}`);
			console.log(`retired  ${code} ${it.ItemName}`);
		} catch (e) {
			failed++;
			console.log(`FAILED  ${code}: ${e.message}`);
		}
	}
} finally {
	await s.logout();
}
if (failed) process.exitCode = 1;
