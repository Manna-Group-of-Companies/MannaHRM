/**
 * Answer the migration questions from the Factor HR exports.
 *
 * Counts and coverage, never a person's details. The questions it exists to
 * answer, in order of how much they decide:
 *
 *   1. How many people, per company, and how many are still employed?
 *   2. **How many have a biometric machine code?** Without one, that person's
 *      fingerprint punches have nowhere to land, and they look absent every day.
 *   3. What shifts and week-offs are actually in use?
 *   4. What terminals do the punch reports name — i.e. how many devices exist?
 *
 *     node tools/analyse_factohr.js
 */

import fs from "node:fs";
import path from "node:path";
import { readFirstSheet } from "./lib/sheets.js";
import { col, columnsOf, counter, findHeader, get, show } from "./lib/factohr.js";

const FOLDER = process.argv[2] || "data/factohr";

const padEnd = (s, n) => String(s).padEnd(n);

// ----------------------------------------------------------------- master ---

async function analyseEmployees(file) {
	console.log("=".repeat(74));
	console.log(`EMPLOYEE MASTER  —  ${path.basename(file)}`);
	console.log("=".repeat(74));

	const rows = await readFirstSheet(file, { maxRows: 3000 });
	const index = findHeader(rows, "Emp Code");
	if (index === null) {
		console.log("  could not find an 'Emp Code' column");
		return;
	}

	const headers = columnsOf(rows[index]);
	const data = rows.slice(index + 1)
		.filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""));

	const iCode = col(headers, "Emp Code");
	const iCompany = col(headers, "Company Name");
	const iStatus = col(headers, "Status");
	const iMachine = col(headers, "Machine Code");
	const iShift = col(headers, "Working Shift");
	const iWeekoff = col(headers, "Week-off", "Week off");
	const iDept = col(headers, "Department");
	const iMgr = col(headers, "Reporting Manager");
	const iType = col(headers, "Employment Type");
	const iPaygroup = col(headers, "Payroll Group");
	const iLeaving = col(headers, "Leaving Date");

	// A row is a person only if it carries a code; Factor HR pads the sheet.
	const people = data.filter((r) => get(r, iCode));
	console.log(`\n  rows with an employee code : ${people.length}`);

	const active = people.filter((r) => get(r, iStatus).toLowerCase() === "active");
	console.log(`  active                     : ${active.length}`);
	console.log(`  not active                 : ${people.length - active.length}`);

	show("Company", counter(people.map((r) => get(r, iCompany))), people.length);
	show("Status", counter(people.map((r) => get(r, iStatus))), people.length);

	// ---- the one that decides the biometric leg ----
	console.log("\n  " + "-".repeat(70));
	console.log("  BIOMETRIC MACHINE CODE — active employees only");
	console.log("  " + "-".repeat(70));

	const withCode = active.filter((r) => get(r, iMachine));
	const without = active.filter((r) => !get(r, iMachine));
	console.log(`    have a Machine Code      : ${withCode.length} of ${active.length}`);
	console.log(`    MISSING a Machine Code   : ${without.length}`);

	if (without.length) {
		show("    missing, by company", counter(without.map((r) => get(r, iCompany))));
	}

	const dupes = counter(withCode.map((r) => get(r, iMachine)).filter(Boolean));
	const clashing = dupes.filter(([, n]) => n > 1);
	if (clashing.length) {
		console.log(`\n    *** ${clashing.length} machine code(s) used by more than one active person:`);
		for (const [code, n] of clashing.slice(0, 15)) {
			const owners = [...new Set(withCode.filter((r) => get(r, iMachine) === code)
				.map((r) => get(r, iCompany)))].sort();
			console.log(`        code ${padEnd(code, 8)} used ${n}x  ${owners.join(", ").slice(0, 44)}`);
		}
		console.log("        A shared code means those punches cannot be told apart.");
	} else {
		console.log("\n    every machine code is unique among active staff");
	}

	show("Working Shift (active)", counter(active.map((r) => get(r, iShift))), active.length);
	show("Week-off (active)", counter(active.map((r) => get(r, iWeekoff))), active.length);
	show("Employment Type (active)", counter(active.map((r) => get(r, iType))), active.length);
	show("Payroll Group (active)", counter(active.map((r) => get(r, iPaygroup))), active.length);
	show("Department (active)", counter(active.map((r) => get(r, iDept))), active.length, 15);

	const noMgr = active.filter((r) => !get(r, iMgr));
	console.log(`\n  active with no Reporting Manager : ${noMgr.length}`);

	const leftNoDate = people.filter(
		(r) => get(r, iStatus).toLowerCase() !== "active" && !get(r, iLeaving),
	);
	console.log(`  inactive with no Leaving Date    : ${leftNoDate.length}`);
}

// ------------------------------------------------------------- terminals ---

async function analysePunches(file) {
	console.log("\n" + "=".repeat(74));
	console.log(`PUNCH SOURCE  —  ${path.basename(file)}`);
	console.log("=".repeat(74));

	const rows = await readFirstSheet(file, { maxRows: 5000 });
	const index = findHeader(rows, "Emp Code");
	if (index === null) {
		console.log("  could not find an 'Emp Code' column");
		return;
	}

	const headers = columnsOf(rows[index]);
	const data = rows.slice(index + 1);

	const iCode = col(headers, "Emp Code");
	const iTerm = col(headers, "Terminal");
	const iLoc = col(headers, "Location");
	const iInfo = col(headers, "Punch Info");
	const iSelfie = col(headers, "Selfie Image");

	const punches = data.filter((r) => get(r, iCode));
	console.log(`\n  punch rows        : ${punches.length}`);
	console.log(`  distinct people   : ${new Set(punches.map((r) => get(r, iCode))).size}`);

	show("Terminal", counter(punches.map((r) => get(r, iTerm))), punches.length);

	const count = (i) => punches.filter((r) => get(r, i)).length;
	console.log(`\n  punches carrying a Location  : ${count(iLoc)}`);
	console.log(`  punches carrying Punch Info  : ${count(iInfo)}`);
	console.log(`  punches carrying a Selfie    : ${count(iSelfie)}`);

	/* `Punch Info` is where the mobile app records GPS quality. Worth seeing the
	   shape of, because it decides whether a geofence can be reconstructed. */
	const samples = punches.map((r) => get(r, iInfo)).filter(Boolean).slice(0, 3);
	for (const s of samples) console.log(`    punch info sample : ${s.slice(0, 88)}`);
}

async function main() {
	if (!fs.existsSync(FOLDER)) {
		console.log(`No such folder: ${FOLDER} — drop the exports there first.`);
		return;
	}
	const files = fs.readdirSync(FOLDER).sort();

	for (const name of files) {
		if (!name.toLowerCase().endsWith(".xlsx")) continue;
		if (name.toLowerCase().includes("employee detail")) {
			await analyseEmployees(path.join(FOLDER, name));
		}
	}
	for (const name of files) {
		const low = name.toLowerCase();
		if (low.endsWith(".xlsx") && low.includes("attendance report")) {
			await analysePunches(path.join(FOLDER, name));
		}
	}
}

main();
