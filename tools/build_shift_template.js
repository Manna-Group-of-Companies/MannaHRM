/**
 * Produce a fill-in sheet for the 23 shifts, so Manna states only what we
 * cannot read.
 *
 *     node tools/build_shift_template.js   ->  data/out/04-shifts-TO-FILL.xlsx
 *
 * The shift names come from the Factor HR employee master, with live
 * headcounts. Two timings were recovered from the attendance reports, where
 * Factor HR appends the window to the shift name for display; those are
 * pre-filled and marked. The other 21 exist nowhere in the exports and only
 * Manna knows them.
 *
 * Every column here is something the auto-attendance engine cannot work
 * without, and guessing any of them mis-states somebody's day:
 *
 *   - **Start / End** decide which punches belong to which shift at all.
 *   - **Crosses midnight** decides which *day* a night shift's hours land on.
 *     Get it wrong and a night worker reads as absent two days running: no
 *     punch-out on the first, no punch-in on the second.
 *   - **Break** comes off worked hours, and worked hours decide half-day and
 *     absent. Factor HR tracks two kinds separately, so both are asked for.
 *   - **Rotating** is the question behind the 22- and 24-hour shifts. A
 *     24-hour shift is not somebody working 24 hours; it is either a rota or a
 *     window inside which any 8 count, and those configure completely
 *     differently.
 */

import ExcelJS from "exceljs";
import { ensureDir, readFirstSheet } from "./lib/sheets.js";

const SOURCE = "data/factohr/Employee Detail Report.xlsx";
const OUT = "data/out/04-shifts-TO-FILL.xlsx";

/* Median first-IN and last-OUT actually punched, from three years of records on
   BIO-MRP-GATE1, joined to the shift each person is named against. OBSERVED,
   not defined — the gap between the two is the late-coming rule, so these are a
   starting point to correct, never a definition to adopt. */
const OBSERVED = {
	"Manna Rubber Products Pvt.Ltd-Production8hrshift1": ["08:24", "20:30", 12.1, 6282, 35],
	"Manna Rubber Products Pvt.Ltd-Production12hrshift1": ["08:26", "20:31", 12.1, 1638, 23],
	"Manna Rubber Products Pvt.Ltd-Office Shift": ["08:24", "17:42", 9.3, 1956, 5],
	"Hi-Tech Rubber Industries-Production shift1": ["08:20", "20:30", 12.1, 726, 4],
	"Hi-Tech Rubber Industries-Cook shift": ["06:40", "15:01", 8.4, 224, 1],
	"Hi-Tech Pretreads-Office shift": ["08:26", "17:34", 9.1, 212, 1],
	"Hi-Tech Pretreads-Production shift1": ["08:22", "20:32", 12.2, 91, 1],
	"Hi-Tech Rubber Industries-Production shift2": ["08:27", "20:31", 12.1, 1, 1],
};

/* Recovered from the attendance reports, where the window is appended to the
   name for display: "... -Office shift (09:30-18:30)". */
const KNOWN = {
	/* Stated outright by Factor HR, in the Shift Begin/End columns of the Daily
	   Attendance Detail report. */
	"Manna Treads Pvt.Ltd-Office shift": ["09:30", "18:30", "stated by Factor HR - please confirm"],
	// Factor HR appends the window to the shift name in some reports.
	"Hi-Tech Pretreads-Other location": ["09:30", "18:30", "read from the shift name - please confirm"],
	/* INFERRED, not stated. One person (MRP-004), 19 days, median first punch
	   08:32 and median last 17:41. Calibrated against MT-003, whose shift IS
	   known: he punches a median 09:29 against a 09:30 start and 18:50 against
	   an 18:30 end. Same offsets applied here give roughly 08:30-17:30. */
	"Manna Rubber Products Pvt.Ltd-Office Shift": ["08:30", "17:30",
		"INFERRED from one person's punches - must be confirmed, not assumed"],
};

const COLUMNS = [
	["Shift (Factor HR name)", 44],
	["People", 8],
	["Observed IN", 12],
	["Observed OUT", 12],
	["Observed hrs", 12],
	["Days seen", 10],
	["Start", 10],
	["End", 10],
	["Crosses midnight?", 18],
	["Break start", 12],
	["Break end", 12],
	["Rotating?", 12],
	["Half day below (hrs)", 20],
	["Absent below (hrs)", 18],
	["Notes", 40],
];

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Active headcount per named shift, off the Factor HR master. */
async function shiftCounts() {
	const rows = await readFirstSheet(SOURCE, { maxRows: 3000 });
	const head = rows.findIndex((r) =>
		r.some((c) => c && String(c).trim().toLowerCase() === "emp code"));
	if (head === -1) throw new Error(`No 'Emp Code' column in ${SOURCE}`);

	const headers = rows[head].map((c) => (c === null || c === undefined ? "" : String(c).trim().toLowerCase()));
	const iShift = headers.indexOf("working shift");
	const iStatus = headers.indexOf("status");

	const counts = new Map();
	for (const r of rows.slice(head + 1)) {
		if (iStatus >= r.length || !r[iStatus]) continue;
		if (String(r[iStatus]).trim().toLowerCase() !== "active") continue;
		const v = iShift < r.length ? r[iShift] : null;
		if (!v) continue;
		const name = String(v).trim();
		counts.set(name, (counts.get(name) || 0) + 1);
	}
	return counts;
}

async function main() {
	ensureDir("data/out");
	const counts = await shiftCounts();

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR tools";
	const ws = wb.addWorksheet("Shifts");

	const headFont = { bold: true, color: { argb: "FFFFFFFF" } };
	const headFill = solid("FF0E6B73");
	const knownFill = solid("FFE3EFE7");
	const askFill = solid("FFF6EDDA");

	ws.addRow(COLUMNS.map(([c]) => c));
	COLUMNS.forEach(([, width], i) => {
		ws.getColumn(i + 1).width = width;
		const cell = ws.getRow(1).getCell(i + 1);
		cell.font = headFont;
		cell.fill = headFill;
		cell.alignment = { wrapText: true, vertical: "middle" };
	});
	ws.views = [{ state: "frozen", ySplit: 1 }];

	const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	for (const [name, n] of ordered) {
		const hit = KNOWN[name];
		const [start, end] = hit ? hit : ["", ""];
		let note = hit ? hit[2] : "";

		/* The long-window shifts are the ones that need explaining, so say so on
		   the row rather than in a covering note nobody reads. */
		const low = name.toLowerCase();
		if (low.includes("24hr") || low.includes("22hr")) {
			note = "is this a rota, or a window inside which any 8 hours count?";
		} else if (low.includes("12hr") || low.includes("12hrs") || low.includes("production12")) {
			note = "does this one cross midnight?";
		}

		const o = OBSERVED[name];
		if (o && !start) {
			/* Only ever offered alongside the blank columns, never poured into
			   them: a number in the Start column reads as agreed. */
			note = note || "observed only - state the real start and end";
		}

		ws.addRow([name, n,
			o ? o[0] : "", o ? o[1] : "", o ? o[2] : "", o ? o[3] : "",
			start, end, "", "", "", "", "", "", note]);

		const r = ws.rowCount;
		const fill = name in KNOWN ? knownFill : askFill;
		for (let c = 3; c <= 10; c++) ws.getRow(r).getCell(c).fill = fill;
	}

	const ws2 = wb.addWorksheet("How to fill this in");
	const LINES = [
		["What this is", true],
		["", false],
		["The 23 shifts your 160 active staff are on, taken from the Factor HR", false],
		["employee master with live headcounts.", false],
		["", false],
		["Green rows were recovered from your attendance reports - please confirm", false],
		["rather than assume. Amber rows exist nowhere in the exports.", false],
		["", false],
		["Columns, and why each matters", true],
		["", false],
		["Start / End       which punches belong to this shift at all", false],
		["Crosses midnight  which DAY the hours land on. Wrong, and a night", false],
		["                  worker reads absent two days running.", false],
		["Break             comes off worked hours, and worked hours decide", false],
		["                  half-day and absent. Factor HR tracks two kinds.", false],
		["Rotating          the question behind the 22hr and 24hr shifts", false],
		["Half day below    hours worked under this = half day", false],
		["Absent below      hours worked under this = absent", false],
		["", false],
		["If half-day and absent thresholds are the same across every shift,", false],
		["fill the first row and say so - no need to repeat it 23 times.", false],
	];
	for (const [text, bold] of LINES) {
		ws2.addRow([text]);
		if (bold) ws2.getRow(ws2.rowCount).getCell(1).font = { bold: true };
	}
	ws2.getColumn(1).width = 76;

	await wb.xlsx.writeFile(OUT);

	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	console.log(`wrote ${OUT}`);
	console.log(`   ${counts.size} shifts, ${total} people`);
	console.log(`   pre-filled from the exports: ${Object.keys(KNOWN).length}`);
	console.log(`   needing Manna to state them: ${counts.size - Object.keys(KNOWN).length}`);
}

main();
