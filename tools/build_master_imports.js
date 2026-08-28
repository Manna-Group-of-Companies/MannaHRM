/**
 * Generate the ERPNext Data Import files for the HR masters.
 *
 *     node tools/build_master_imports.js
 *
 * Writes into `data/out/` (gitignored):
 *
 *     01-holiday-list.xlsx     Holiday List + its holidays, parent and child
 *     02-designation.xlsx      the designations the employee import needs
 *
 * The holiday year follows the site's fiscal year, **1 Apr 2026 - 31 Mar 2027**,
 * read from ERPNext rather than assumed.
 *
 * ## The dates, and which of them are guesses
 *
 * Four statutory holidays are fixed by law and by date. The rest move, and
 * their 2026-27 dates were looked up rather than calculated:
 *
 *   Good Friday  3 Apr 2026      moves with Easter
 *   Vishu       15 Apr 2026      Malayalam solar new year
 *   Onam        25-26 Aug 2026   Uthradam and Thiruvonam
 *   Christmas   25 Dec 2026      fixed
 *
 * **Check Onam before importing.** Thiruvonam 2026 is 26 August, and whether
 * the factory closes on Uthradam the day before is a Manna decision, not a
 * calendar fact. Getting it wrong marks everybody absent on a day they were
 * right to be at home, and that flows into pay.
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { ensureDir, parseCsv } from "./lib/sheets.js";

const OUT_DIR = "data/out";

// Read from the site: the only Fiscal Year on it is 2026-04-01 to 2027-03-31.
const YEAR_START = "2026-04-01";
const YEAR_END = "2027-03-31";

const LIST_NAME = "Manna Holidays 2026-27";
const OPTIONAL_LIST_NAME = "Manna Optional Holidays 2026-27";

/* Sunday. Confirmed as the weekly off for all 160 active employees, with no
   exceptions anywhere in the Factor HR master. `getDay()` counts from Sunday,
   so Sunday is 0 here rather than Python's 6. */
const WEEKLY_OFF_DAY = 0;

const STATUTORY = [
	["2027-01-26", "Republic Day"],
	["2026-05-01", "May Day"],
	["2026-08-15", "Independence Day"],
	["2026-10-02", "Gandhi Jayanti"],
];

// Movable, except Christmas. Dates looked up for 2026-27 — see the header.
const OPTIONAL = [
	["2026-04-03", "Good Friday"],
	["2026-04-15", "Vishu"],
	["2026-08-25", "Onam - Uthradam"],
	["2026-08-26", "Onam - Thiruvonam"],
	["2026-12-25", "Christmas"],
];

/* Dates are handled as ISO strings and only turned into a Date to ask what
   weekday they are. Arithmetic on Date objects across a DST boundary is how a
   holiday list ends up a day out, and India has no DST to protect us in
   testing. */
const asDate = (iso) => new Date(iso + "T00:00:00");
const toIso = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function* sundays(startIso, endIso) {
	const d = asDate(startIso);
	// Walk to the first Sunday rather than testing every day from April.
	d.setDate(d.getDate() + ((WEEKLY_OFF_DAY - d.getDay() + 7) % 7));
	const end = asDate(endIso);
	while (d <= end) {
		yield toIso(d);
		d.setDate(d.getDate() + 7);
	}
}

/**
 * `[date, description, isWeeklyOff]` sorted, with clashes resolved.
 *
 * A holiday landing on a Sunday is kept **once**, as the named holiday rather
 * than as the weekly off. Two rows for one date makes ERPNext count the day
 * twice, and the second one is what a payroll query trips over.
 */
function buildHolidayRows(includeOptional) {
	const named = new Map(STATUTORY);
	if (includeOptional) for (const [d, l] of OPTIONAL) named.set(d, l);

	const rows = [];
	for (const d of sundays(YEAR_START, YEAR_END)) {
		if (named.has(d)) continue;
		rows.push([d, "Sunday", 1]);
	}
	for (const [d, label] of named) {
		if (d < YEAR_START || d > YEAR_END) {
			process.stderr.write(`${label} (${d}) falls outside the holiday year\n`);
			process.exit(1);
		}
		rows.push([d, label, 0]);
	}

	rows.sort((a, b) => a[0].localeCompare(b[0]));
	return rows;
}

/* The exact header row ERPNext produces for this doctype, taken from its own
   Download Template rather than guessed. Two earlier guesses failed: the child
   column is "<Field Label> (<Child Table Label>)" — `Date (Holidays)` — and the
   child date field is labelled **Date**, not Holiday Date. */
const HOLIDAY_HEADERS = [
	"Holiday List Name", "From Date", "To Date", "Total Holidays",
	"Weekly Off", "Is Half Day", "Country", "Subdivision", "Color",
	"ID (Holidays)", "Date (Holidays)", "Description (Holidays)",
	"Is Half Day (Holidays)", "Weekly Off (Holidays)",
];

/**
 * Parent columns on the first row only; blank on every continuation.
 *
 * That blankness is how the importer knows a row belongs to the document above
 * it rather than starting a new one. `Total Holidays` is left empty throughout
 * — ERPNext computes it, and a supplied value is either ignored or wrong.
 */
const holidaySheetRows = (listName, rows) =>
	rows.map(([d, label, weekly], i) => (i === 0
		? [listName, YEAR_START, YEAR_END, "", "Sunday", 0, "India", "", "", "", d, label, 0, weekly]
		: ["", "", "", "", "", "", "", "", "", "", d, label, 0, weekly]));

async function writeHolidayList(file) {
	const rows = buildHolidayRows(true);

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR tools";
	const ws = wb.addWorksheet("Holiday List");
	ws.addRow(HOLIDAY_HEADERS);
	for (const r of holidaySheetRows(LIST_NAME, rows)) ws.addRow(r);

	const ws2 = wb.addWorksheet("Optional Only");
	ws2.addRow(HOLIDAY_HEADERS);
	for (const r of holidaySheetRows(OPTIONAL_LIST_NAME, OPTIONAL.map(([d, l]) => [d, l, 0]))) {
		ws2.addRow(r);
	}

	await wb.xlsx.writeFile(file);

	/* CSV too, matching the template ERPNext handed back, so the file can be
	   uploaded without a spreadsheet round-trip changing a date format. */
	const csvPath = file.replace(/\.[^.]+$/, "") + ".csv";
	const cell = (v) => {
		const s = v === null || v === undefined ? "" : String(v);
		return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
	};
	const lines = [HOLIDAY_HEADERS.map(cell).join(",")]
		.concat(holidaySheetRows(LIST_NAME, rows).map((r) => r.map(cell).join(",")));
	fs.writeFileSync(csvPath, "﻿" + lines.join("\r\n"), "utf8");

	return rows;
}

async function writeDesignations(file, names) {
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR tools";
	const ws = wb.addWorksheet("Designation");
	ws.addRow(["ID", "Designation"]);
	for (const n of names) ws.addRow([n, n]);
	await wb.xlsx.writeFile(file);
}

function readNeededDesignations() {
	const file = path.join(OUT_DIR, "masters-needed.csv");
	if (!fs.existsSync(file)) {
		process.stderr.write(`Run tools/build_employee_import.js first - ${file} is missing\n`);
		process.exit(1);
	}
	let text = fs.readFileSync(file, "utf8");
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
	const rows = parseCsv(text);
	const head = rows[0].map((h) => h.trim());
	const iDoc = head.indexOf("Doctype");
	const iVal = head.indexOf("Value");

	const out = new Set();
	for (const r of rows.slice(1)) {
		if (r[iDoc] === "Designation" && r[iVal]) out.add(r[iVal]);
	}
	return [...out].sort();
}

const padEnd = (s, n) => String(s).padEnd(n);

async function main() {
	ensureDir(OUT_DIR);

	const hpath = path.join(OUT_DIR, "01-holiday-list.xlsx");
	const rows = await writeHolidayList(hpath);
	const named = rows.filter((r) => !r[2]);

	console.log(`wrote ${hpath}`);
	console.log(`   holiday year      ${YEAR_START} to ${YEAR_END}`);
	console.log(`   total rows        ${rows.length}`);
	console.log(`   Sundays           ${rows.length - named.length}`);
	console.log(`   named holidays    ${named.length}`);
	console.log();
	for (const [d, label] of named) {
		console.log(`      ${d}  ${padEnd(DOW[asDate(d).getDay()], 3)} ${label}`);
	}

	const clashes = named.filter(([d]) => asDate(d).getDay() === WEEKLY_OFF_DAY);
	if (clashes.length) {
		console.log("\n   NOTE - these fall on a Sunday and are listed once, as the holiday:");
		for (const [d, l] of clashes) console.log(`      ${d}  ${l}`);
	}

	const dpath = path.join(OUT_DIR, "02-designation.xlsx");
	const names = readNeededDesignations();
	await writeDesignations(dpath, names);
	console.log(`\nwrote ${dpath}  (${names.length} designations)`);
}

main();
