/**
 * Profile a Factor HR export without printing its contents.
 *
 * Reports structure — sheets, where the real header row is, column names, row
 * counts — and masks every sample value. That distinction is the point: knowing
 * a file has an `Aadhaar` column is what tells us how to map it, and the numbers
 * themselves are nobody's business until the load actually runs.
 *
 *     node tools/inspect_export.js data/factohr/
 *     node tools/inspect_export.js data/factohr/employee-master.xlsx
 *
 * Reads .xlsx and .csv.
 */

import fs from "node:fs";
import path from "node:path";
import { readCsv, readXlsx } from "./lib/sheets.js";

/* Columns whose sample values are never shown, however harmless one row looks.
   Matched loosely on purpose — an export column called "Emp PAN No." should
   hit. */
const SENSITIVE = new RegExp(
	"aadha|pan\\b|uan|account|ifsc|bank|salary|ctc|gross|net|basic|pf\\b|esi|"
	+ "password|dob|birth|mobile|phone|email|address|nominee",
	"i",
);

/* A header row is the first row that looks like labels rather than a title
   banner: several non-empty cells, none of them absurdly long. */
const MIN_HEADER_CELLS = 3;
const MAX_HEADER_LEN = 60;

/** A value rendered as its shape, never its content. */
function mask(value, column) {
	if (value === null || value === undefined || String(value).trim() === "") return "—";
	const text = String(value).trim();
	if (SENSITIVE.test(column || "")) return `<${text.length} chars>`;
	if (text.length > 18) return text.slice(0, 15) + "...";
	return text;
}

function looksLikeHeader(cells) {
	const filled = cells.filter((c) => c !== null && c !== undefined && String(c).trim());
	if (filled.length < MIN_HEADER_CELLS) return false;
	return filled.every((c) => String(c).length <= MAX_HEADER_LEN);
}

/**
 * Index of the real header row.
 *
 * Factor HR reports carry a title, a logo row and a date range above the
 * columns. Scanning for the first row that looks like labels beats assuming row
 * 0 and reading the report's own name as a column.
 */
function findHeader(rows, limit = 15) {
	for (let i = 0; i < Math.min(rows.length, limit); i++) {
		if (looksLikeHeader(rows[i])) return i;
	}
	return 0;
}

const padEnd = (s, n) => String(s).padEnd(n);

function report(header, rows) {
	console.log(`    header row : ${header.index + 1}`);
	console.log(`    columns    : ${header.columns.length}`);
	console.log(`    data rows  : ${rows.length}`);
	console.log("    ---");

	const longest = Math.max(10, ...header.columns.map((c) => String(c).length));
	const width = Math.min(Math.max(longest, 12), 38);

	header.columns.forEach((column, i) => {
		const samples = rows.slice(0, 3)
			.filter((r) => i < r.length)
			.map((r) => mask(r[i], column));
		const flag = SENSITIVE.test(String(column)) ? "  [sensitive]" : "";
		console.log(`    ${padEnd(String(column).slice(0, width), width)}  ${samples.join(" | ") || "—"}${flag}`);
	});
}

async function inspectXlsx(file) {
	// Capped rather than whole: this is a profile, and a 50k-row export does not
	// need to be in memory to say what its columns are.
	const sheets = await readXlsx(file, { maxRows: 400 });
	for (const sheet of sheets) {
		console.log(`  sheet: ${sheet.name}`);
		if (!sheet.rows.length) { console.log("    empty"); continue; }

		const index = findHeader(sheet.rows);
		const columns = sheet.rows[index].map((c) => (c === null || c === undefined ? "" : c));
		const body = sheet.rows.slice(index + 1);
		report({ index, columns }, body);

		const total = sheet.totalRows - index - 1;
		if (total > body.length) {
			console.log(`    (first 400 rows scanned; sheet holds about ${total})`);
		}
		console.log();
	}
}

function inspectCsv(file) {
	const { rows, encoding } = readCsv(file, { maxRows: 400 });
	if (!rows.length) { console.log("    empty"); return; }
	const index = findHeader(rows);
	console.log(`  (csv, decoded as ${encoding})`);
	report({ index, columns: rows[index] }, rows.slice(index + 1));
	console.log();
}

async function main() {
	const target = process.argv[2] || "data/factohr";

	let paths;
	if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
		paths = fs.readdirSync(target)
			.filter((n) => /\.(xlsx|xls|csv)$/i.test(n))
			.sort()
			.map((n) => path.join(target, n));
		if (!paths.length) {
			console.log(`Nothing to inspect in ${target} — drop the exports there first.`);
			return;
		}
	} else {
		paths = [target];
	}

	for (const file of paths) {
		const kb = fs.statSync(file).size / 1024;
		console.log("=".repeat(72));
		console.log(`${path.basename(file)}  (${kb.toFixed(0)} KB)`);
		console.log("=".repeat(72));

		const lower = file.toLowerCase();
		if (lower.endsWith(".csv")) inspectCsv(file);
		else if (lower.endsWith(".xlsx")) await inspectXlsx(file);
		else if (lower.endsWith(".xls")) {
			/* The old binary format. ExcelJS cannot read it and pulling in
			   another library for one file is not worth it — Excel will re-save
			   as .xlsx. */
			console.log("  .xls is the old binary format. Open it and Save As .xlsx.\n");
		} else console.log("  unsupported file type\n");
	}
}

main();
