// Items_semi_rename.txt (dtw_semi.py, from the semi-finished workbook) applied through the Service
// Layer instead of DTW, in one SAP test company.
//
//     node localdev/sap/apply_semi.mjs TEST_HITECH_PRETREADS "%USERPROFILE%/Downloads/Items_semi_rename.txt"           dry run
//     node localdev/sap/apply_semi.mjs TEST_HITECH_PRETREADS "%USERPROFILE%/Downloads/Items_semi_rename.txt" --apply   rename
//
// The same file DTW would import — so the workbook stays the one place the decisions are made,
// and dtw_semi.py's checks (no empty or clashing names) have already passed. Each row sets
// ItemName and U_Quality and nothing else, is skipped when the item already has them, and is
// read back. BOM name copies are refreshed afterwards by semirename.mjs --bom-names --apply.
// SapSession refuses any company outside test_dbs.

import fs from "node:fs";
import { loadConfig, SapSession } from "./sapguard.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const [db, file] = args.filter((a) => !a.startsWith("--"));
if (!db || !file) throw new Error('node apply_semi.mjs TEST_HITECH_PRETREADS "path/Items_semi_rename.txt" [--apply]');

// DTW's text template: two header rows, then RecordKey, ItemCode, ItemName, U_Quality, tab-separated.
const buf = fs.readFileSync(file);
const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString("utf16le").slice(1) : buf.toString("latin1");
const [head, , ...rows] = text.split(/\r?\n/).filter((l) => l.length);
const col = Object.fromEntries(head.split("\t").map((h, i) => [h, i]));
for (const k of ["ItemCode", "ItemName", "U_Quality"]) if (!(k in col)) throw new Error(`${file} has no ${k} column`);
const want = rows.map((r) => r.split("\t")).map((c) => ({ code: c[col.ItemCode], name: c[col.ItemName], quality: c[col.U_Quality] || null }));

const q = (v) => String(v).replace(/'/g, "''");
const s = new SapSession(loadConfig(), db);
await s.login();
let done = 0, same = 0, failed = 0;
try {
	console.log(`${apply ? "APPLY" : "DRY RUN"} ${db}: ${want.length} rows from ${file}`);
	for (const w of want) {
		try {
			const it = await s.get(`Items('${encodeURIComponent(q(w.code))}')?$select=ItemName,U_Quality`);
			if (it.ItemName === w.name && (it.U_Quality ?? null) === w.quality) { same++; continue; }
			if (!apply) { done++; continue; }
			await s.request("PATCH", `Items('${encodeURIComponent(q(w.code))}')`, { ItemName: w.name, U_Quality: w.quality });
			const back = await s.get(`Items('${encodeURIComponent(q(w.code))}')?$select=ItemName,U_Quality`);
			if (back.ItemName !== w.name || (back.U_Quality ?? null) !== w.quality) throw new Error(`reads back as "${back.ItemName}" / ${back.U_Quality}`);
			done++;
		} catch (e) {
			failed++;
			console.log(`FAILED  ${w.code} "${w.name}": ${e.message}`);
		}
	}
} finally {
	await s.logout();
}
console.log(`${apply ? "renamed" : "to rename"} ${done}, already so ${same}, failed ${failed}`);
if (failed) process.exitCode = 1;
