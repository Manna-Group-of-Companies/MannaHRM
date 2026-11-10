// Read-only: every BOM in one TEST company, header and lines, for dtw_bom.py.
//
//     node localdev/sap/bom_read.mjs TEST_HITECH_PRETREADS
//
// Writes out/<DB>-boms-full.json. Every call after Login is a GET.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2];
if (!db) throw new Error("node bom_read.mjs TEST_HITECH_PRETREADS");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const s = new SapSession(loadConfig(), db);
await s.login();
const boms = [];
try {
	for (let next = "ProductTrees"; next;) {
		const r = await s.get(next);
		boms.push(...r.value);
		if (boms.length % 500 < 20) console.log(boms.length);
		const lnk = r["odata.nextLink"];
		next = lnk ? lnk.replace(/^.*\/b1s\/v\d\//, "") : null;
	}
} finally {
	await s.logout();
}
const file = path.join(OUT, `${db}-boms-full.json`);
fs.writeFileSync(file, JSON.stringify(boms));
console.log(`${db}: ${boms.length} BOMs → ${file}`);
