/**
 * Turn the Factor HR employee master into an ERPNext Data Import file.
 *
 *     node tools/build_employee_import.js                 # active staff only
 *     node tools/build_employee_import.js --include-left  # everyone, leavers too
 *
 * Writes `data/out/employee-import.csv`, which is gitignored along with
 * everything else under `data/`.
 *
 * Two things this deliberately does **not** do:
 *
 *   - **It never guesses a company.** Six spellings in Factor HR map onto five
 *     ERPNext companies through the table below, and a row whose company is not
 *     in that table is rejected rather than defaulted. A guessed company is a
 *     person in the wrong payroll, discovered at month end.
 *   - **It does not set `reports_to`.** A manager has to exist before anyone can
 *     report to them, so that is a second pass — see backfill_employee_links.js.
 */

import path from "node:path";
import { parseArgs } from "node:util";
import ExcelJS from "exceljs";
import { ensureDir, readFirstSheet, writeCsv } from "./lib/sheets.js";
import { col, columnsOf, findHeader, get } from "./lib/factohr.js";

const SOURCE = "data/factohr/Employee Detail Report.xlsx";
const OUT_DIR = "data/out";

/* Factor HR spelling -> ERPNext Company. Confirmed with Manna on 22 Aug 2026.
 *
 * Note the two rows that collapse onto Manna Treads: HI-TECH PRETREADS is the
 * same company, not a separate one, so its 112 people join the 4 already there. */
const COMPANY = {
	"MANNA RUBBER PRODUCTS PVT.LTD.": "Manna Rubber Products Private Limited",
	"HI-TECH PRETREADS": "Manna Treads",
	"MANNA TREADS PVT.LTD": "Manna Treads",
	"HI-TECH RUBBER INDUSTRIES": "Hi-Tech Rubber Industries",
	"MANNA TYRE RETREADS": "Manna Tyre Retreads",
	"MANNA GROUP H-QTRS": "Manna Group Headquarters",
};

/* ERPNext names a Department "<name> - <company abbr>", so a bare "Production"
   links to nothing and the import fails a row at a time. Designation is not
   suffixed. This caught us on the first build. */
const ABBR = {
	"Manna Rubber Products Private Limited": "MRPPL",
	"Manna Treads": "MT",
	"Manna Tyre Retreads": "MTR",
	"Hi-Tech Rubber Industries": "HRI",
	"Manna Group Headquarters": "MGHQ",
	"Manna Tyre UAE": "MRU",
};

// ERPNext's Employee.status is a Select with exactly these options.
const STATUS = { active: "Active", inactive: "Left" };

const GENDER = { male: "Male", female: "Female" };

// Columns written, in the order ERPNext's importer likes to see them.
const HEADERS = [
	"ID",
	"Employee Name",
	"First Name",
	"Last Name",
	"Gender",
	"Date of Birth",
	"Date of Joining",
	"Relieving Date",
	"Status",
	"Company",
	"Department",
	"Designation",
	"Employment Type",
	"Attendance Device ID (Biometric/RF tag ID)",
	"Cell Number",
	"Factor HR ID",
];

const MONTHS = {
	jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
	jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Factor HR emits '1966-12-04 00:00:00'. ERPNext wants '1966-12-04'. */
function asDate(value) {
	if (!value) return "";
	let m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
	if (m) return m[1];
	m = /^(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(value);
	if (m) {
		const mon = MONTHS[m[2].toLowerCase()];
		if (mon) return `${m[3]}-${mon}-${m[1]}`;
	}
	return "";
}

/**
 * ERPNext requires `first_name`; `last_name` is optional.
 *
 * Many rows here are a single word, and several are a full name in one field
 * with no reliable split. Putting everything in `first_name` and letting
 * `employee_name` carry the display form is honest — inventing a surname from
 * the last token would corrupt names that do not work that way.
 */
function splitName(full) {
	const s = full.split(/\s+/).filter(Boolean);
	if (!s.length) return ["", ""];
	if (s.length === 1) return [s[0], ""];
	return [s.slice(0, -1).join(" "), s[s.length - 1]];
}

const capitalize = (w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

/** Factor HR shouts everything. Title-case it, but leave initialisms alone. */
function tidy(value) {
	const words = String(value || "").split(/\s+/).filter(Boolean);
	if (!words.length) return "";
	return words.map((word) => {
		/* Q.C., H.R, PVT — anything with a dot, or 3 letters or fewer that is
		   all caps, is almost certainly an initialism rather than a shouted
		   word. */
		const allCaps = word === word.toUpperCase() && /[A-Z]/.test(word);
		if (word.includes(".") || (allCaps && word.length <= 3)) return word;
		return capitalize(word);
	}).join(" ");
}

const departmentName = (raw, company) => (raw ? `${tidy(raw)} - ${ABBR[company]}` : "");

const padEnd = (s, n) => String(s).padEnd(n);

async function main() {
	const { values } = parseArgs({
		options: {
			source: { type: "string", default: SOURCE },
			"include-left": { type: "boolean", default: false },
		},
	});

	const rows = await readFirstSheet(values.source, { maxRows: 3000 });
	const index = findHeader(rows, "Emp Code");
	if (index === null) {
		process.stderr.write(`Could not find an 'Emp Code' column in ${values.source}\n`);
		process.exit(1);
	}
	const headers = columnsOf(rows[index]);

	const ix = {
		code: col(headers, "Emp Code"),
		name: col(headers, "Full Name"),
		company: col(headers, "Company Name"),
		status: col(headers, "Status"),
		machine: col(headers, "Machine Code"),
		dob: col(headers, "Birth Date"),
		doj: col(headers, "Joining Date"),
		left: col(headers, "Leaving Date"),
		gender: col(headers, "Gender"),
		dept: col(headers, "Department"),
		desig: col(headers, "Designation"),
		etype: col(headers, "Employment Type"),
		mobile: col(headers, "Mobile No"),
	};
	const missing = Object.keys(ix).filter((k) => ix[k] === null);
	if (missing.length) {
		process.stderr.write("Columns not found in the export: " + missing.join(", ") + "\n");
		process.exit(1);
	}

	const needed = { Department: new Set(), Designation: new Set(), "Employment Type": new Set() };
	const outRows = [];
	const rejected = [];
	const seenCodes = new Set();
	const stats = new Map();
	const bump = (k) => stats.set(k, (stats.get(k) || 0) + 1);

	for (const row of rows.slice(index + 1)) {
		const code = get(row, ix.code);
		if (!code) continue;

		const statusRaw = get(row, ix.status).toLowerCase();
		const status = STATUS[statusRaw];
		if (!status) { rejected.push([code, `unrecognised status '${statusRaw}'`]); continue; }

		if (status === "Left" && !values["include-left"]) { bump("skipped_leaver"); continue; }

		if (seenCodes.has(code)) { rejected.push([code, "duplicate employee code"]); continue; }
		seenCodes.add(code);

		const company = COMPANY[get(row, ix.company).toUpperCase()];
		if (!company) {
			rejected.push([code, `company not in the mapping: '${get(row, ix.company)}'`]);
			continue;
		}

		const doj = asDate(get(row, ix.doj));
		if (!doj) {
			/* ERPNext refuses an Employee with no joining date, and a guessed one
			   would quietly change somebody's length of service and gratuity. */
			rejected.push([code, "no usable joining date"]);
			continue;
		}

		const full = get(row, ix.name);
		const [first, last] = splitName(full);
		const gender = GENDER[get(row, ix.gender).toLowerCase()] || "";
		if (!gender) bump("blank_gender");

		const device = get(row, ix.machine);
		if (status === "Active" && !device) bump("active_without_device_id");

		const dept = departmentName(get(row, ix.dept), company);
		const desig = tidy(get(row, ix.desig));
		const etype = get(row, ix.etype);

		outRows.push({
			"ID": "",
			"Employee Name": full,
			"First Name": first,
			"Last Name": last,
			"Gender": gender,
			"Date of Birth": asDate(get(row, ix.dob)),
			"Date of Joining": doj,
			"Relieving Date": asDate(get(row, ix.left)),
			"Status": status,
			"Company": company,
			"Department": dept,
			"Designation": desig,
			"Employment Type": etype,
			"Attendance Device ID (Biometric/RF tag ID)": device,
			"Cell Number": get(row, ix.mobile),
			/* No Holiday List column on purpose. It is set once on each Company
			   as `default_holiday_list`, and Employee falls back to it. Repeating
			   the name on 160 rows means 160 rows to edit next April. */
			"Factor HR ID": code,
		});
		bump("exported");
		bump("company:" + company);
		needed.Department.add(dept);
		needed.Designation.add(desig);
		needed["Employment Type"].add(etype);
	}

	ensureDir(OUT_DIR);
	const outPath = path.join(OUT_DIR, "employee-import.csv");
	writeCsv(outPath, HEADERS, outRows.map((r) => HEADERS.map((h) => r[h])));

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR tools";
	const ws = wb.addWorksheet("Employee");
	ws.addRow(HEADERS);
	for (const r of outRows) ws.addRow(HEADERS.map((h) => r[h]));
	const xlsxPath = path.join(OUT_DIR, "03-employee.xlsx");
	await wb.xlsx.writeFile(xlsxPath);
	console.log(`wrote ${xlsxPath}`);

	console.log(`wrote ${outPath}  (${outRows.length} rows)`);
	console.log();
	for (const key of [...stats.keys()].sort()) {
		console.log(`  ${padEnd(key, 44)} ${stats.get(key)}`);
	}

	/* Every Link value the import will need. A missing one fails that row at
	   import time, one row at a time, which is a slow way to find out. */
	const mastersPath = path.join(OUT_DIR, "masters-needed.csv");
	const masterRows = [];
	for (const dt of Object.keys(needed).sort()) {
		for (const value of [...needed[dt]].filter(Boolean).sort()) masterRows.push([dt, value]);
	}
	writeCsv(mastersPath, ["Doctype", "Value"], masterRows);
	console.log("");
	console.log(`masters the import will need -> ${mastersPath}`);
	for (const dt of Object.keys(needed).sort()) {
		console.log(`  ${padEnd(dt, 18)} ${[...needed[dt]].filter(Boolean).length} distinct`);
	}

	if (rejected.length) {
		const rejPath = path.join(OUT_DIR, "employee-rejected.csv");
		writeCsv(rejPath, ["Emp Code", "Why"], rejected);
		console.log(`\n  *** ${rejected.length} row(s) rejected -> ${rejPath}`);
		for (const [code, why] of rejected.slice(0, 10)) {
			console.log(`      ${padEnd(code, 12)} ${why}`);
		}
	}
}

main();
