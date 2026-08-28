/**
 * Backfill `employee_number` and `reports_to` on the imported employees.
 *
 *     node tools/backfill_employee_links.js            # dry run, writes nothing
 *     node tools/backfill_employee_links.js --apply
 *
 * Two passes, and the order is forced: `reports_to` is expressed in Factor HR as
 * an employee *code* ("HPT-072 - AJITH S"), so the codes have to be on the
 * records before anybody can be pointed at their manager.
 *
 * ## Why `employee_number` and not a custom field
 *
 * The Factor HR code is exactly what `employee_number` is for — the employer's
 * own identifier for a person. A custom field would mean the same fact in two
 * places, and `employee_number` is already indexed, already on the standard
 * form, and already what every future import will match on.
 *
 * ## Matching, and why it refuses rather than guesses
 *
 * ERPNext assigns its own names (`HR-EMP-00042`), so the two systems share no
 * key. Rows are matched on **name + company + joining date** together. Any
 * employee matching zero or more than one Factor HR row is reported and skipped
 * — never resolved by picking the first. A wrong match here writes one person's
 * code onto another, and everything downstream inherits it silently.
 */

import { parseArgs } from "node:util";
import { readFirstSheet } from "./lib/sheets.js";
import { listAll, requireKey, updateDoc } from "./lib/erp.js";

const SOURCE = "data/factohr/Employee Detail Report.xlsx";

const COMPANY = {
	"MANNA RUBBER PRODUCTS PVT.LTD.": "Manna Rubber Products Private Limited",
	"HI-TECH PRETREADS": "Manna Treads",
	"MANNA TREADS PVT.LTD": "Manna Treads",
	"HI-TECH RUBBER INDUSTRIES": "Hi-Tech Rubber Industries",
	"MANNA TYRE RETREADS": "Manna Tyre Retreads",
	"MANNA GROUP H-QTRS": "Manna Group Headquarters",
};

function cell(row, i) {
	if (i === null || i === undefined || i >= row.length) return "";
	const v = row[i];
	if (v === null || v === undefined) return "";
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
}

const asDate = (v) => {
	const m = /^(\d{4}-\d{2}-\d{2})/.exec(v || "");
	return m ? m[1] : "";
};

async function readSource() {
	const rows = await readFirstSheet(SOURCE, { maxRows: 3000 });
	const head = rows.findIndex((r) =>
		r.some((c) => c && String(c).trim().toLowerCase() === "emp code"));
	if (head === -1) {
		process.stderr.write(`no 'Emp Code' column in ${SOURCE}\n`);
		process.exit(1);
	}

	const headers = rows[head].map((c) => (c === null || c === undefined ? "" : String(c).trim().toLowerCase()));
	const col = (...names) => {
		for (const n of names) {
			const i = headers.indexOf(n.toLowerCase());
			if (i !== -1) return i;
		}
		return null;
	};

	const ix = {
		code: col("emp code"), name: col("full name"), company: col("company name"),
		doj: col("joining date"), mgr: col("reporting manager"), status: col("status"),
	};

	const out = [];
	for (const r of rows.slice(head + 1)) {
		const code = cell(r, ix.code);
		if (!code) continue;
		out.push({
			code,
			name: cell(r, ix.name).split(/\s+/).filter(Boolean).join(" "),
			company: COMPANY[cell(r, ix.company).toUpperCase()] || "",
			doj: asDate(cell(r, ix.doj)),
			managerRaw: cell(r, ix.mgr),
			status: cell(r, ix.status).toLowerCase(),
		});
	}
	return out;
}

/** 'HPT-072 - AJITH S' -> 'HPT-072'. Blank when there is no manager. */
const managerCode = (raw) => (raw ? raw.split(" - ")[0].trim() : "");

// ------------------------------------------------------------------- match ---

const key = (name, company, doj) =>
	[String(name || "").toUpperCase().split(/\s+/).filter(Boolean).join(" "),
		company || "", doj || ""].join("|");

async function main() {
	const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
	requireKey();

	const source = await readSource();
	const employees = await listAll("Employee",
		["name", "employee_name", "company", "date_of_joining", "employee_number",
			"reports_to", "status"]);
	console.log(`factor hr rows ${source.length}   erpnext employees ${employees.length}\n`);

	const byKey = new Map();
	for (const s of source) {
		const k = key(s.name, s.company, s.doj);
		if (!byKey.has(k)) byKey.set(k, []);
		byKey.get(k).push(s);
	}

	const matched = new Map();
	const unmatched = [];
	const ambiguous = [];
	for (const e of employees) {
		const k = key(e.employee_name, e.company, String(e.date_of_joining || "").slice(0, 10));
		const hits = byKey.get(k) || [];
		if (hits.length === 1) matched.set(e.name, { e, s: hits[0] });
		else if (!hits.length) unmatched.push(e);
		else ambiguous.push([e, hits]);
	}

	console.log("PASS 1 — employee_number");
	console.log(`   matched     ${matched.size}`);
	console.log(`   unmatched   ${unmatched.length}`);
	console.log(`   ambiguous   ${ambiguous.length}`);
	for (const e of unmatched.slice(0, 10)) {
		console.log(`      no source row: ${e.name}  ${String(e.employee_name).slice(0, 24)}`
			+ `  ${String(e.company).slice(0, 22)}`);
	}
	for (const [e, hits] of ambiguous.slice(0, 10)) {
		console.log(`      ${String(e.employee_name).slice(0, 24)} matches ${hits.length} rows: `
			+ hits.map((h) => h.code).join(", "));
	}

	const pending = [...matched.entries()].filter(([, { e, s }]) => e.employee_number !== s.code);
	if (values.apply) {
		let wrote = 0;
		for (const [erpName, { s }] of pending) {
			await updateDoc("Employee", erpName, { employee_number: s.code });
			wrote++;
		}
		console.log(`   written     ${wrote}`);
	} else {
		console.log(`   would write ${pending.length}`);
	}

	// ---- pass 2 ----
	const codeToErp = new Map();
	for (const [erpName, { s }] of matched) codeToErp.set(s.code, erpName);

	console.log("\nPASS 2 — reports_to");
	const plan = [];
	const missingMgr = [];
	let noMgr = 0;
	let selfRef = 0;

	for (const [erpName, { s }] of matched) {
		const mcode = managerCode(s.managerRaw);
		if (!mcode) { noMgr++; continue; }
		const target = codeToErp.get(mcode);
		if (!target) { missingMgr.push([s.code, mcode]); continue; }
		if (target === erpName) {
			/* Factor HR lets somebody be their own reporting manager. ERPNext
			   rejects it, and it would make an approval chain that never ends. */
			selfRef++;
			continue;
		}
		plan.push([erpName, target]);
	}

	console.log(`   to set             ${plan.length}`);
	console.log(`   no manager named   ${noMgr}`);
	console.log(`   manager not loaded ${missingMgr.length}`);
	console.log(`   self-reporting     ${selfRef}  (skipped)`);
	for (const [code, mcode] of missingMgr.slice(0, 10)) {
		console.log(`      ${code} reports to ${mcode}, which is not among the loaded employees`);
	}

	if (values.apply) {
		let done = 0;
		for (const [erpName, target] of plan) {
			await updateDoc("Employee", erpName, { reports_to: target });
			done++;
		}
		console.log(`   written            ${done}`);
	}
}

main();
