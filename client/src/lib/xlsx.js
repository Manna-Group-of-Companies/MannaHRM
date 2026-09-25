/* Real .xlsx files — formatted, the way Factor HR's own attendance sheets
   are, rather than the CSV `lib/csv.js` writes. `lib/csv.js` says why a
   parser or a writer for the real format was never worth carrying for one
   screen: "the moment a caller needs merged cells or a second sheet, the
   answer is a library, not more lines here." Monthly Basic and Monthly
   Summary are that caller — HR compares these files against Factor HR's
   side by side — so this is that library, loaded only when somebody
   actually asks for one of them.

   ExcelJS is dynamically imported inside each export function for exactly
   that reason: every other screen in this app still downloads a CSV, and
   none of them should pay to parse a library they never call. */

import { HEAD_FILL, LETTER_FILL, PUNCH_FILL, ZEBRA_FILL } from "@/lib/fills";

/** Counts a row's own letters into the legend Monthly Basic already shows on
    screen (WO/P/A/HD/L/H/LA/MP) — nothing invented, nothing Factor HR's sheet
    holds that this site does not yet compute (their OT, LC, EG columns are a
    policy engine this app does not have; see CLAUDE.md §"Known-incomplete"). */
function letterCounts(letters) {
	const c = { P: 0, A: 0, WO: 0, HD: 0, L: 0, H: 0, LA: 0, MP: 0 };
	for (const l of letters) if (c[l] != null) c[l]++;
	return c;
}

/* The muster's ink, beside the fills in lib/fills.js: the fill says which kind
   of day it was from across the room, the text colour says it again for
   somebody who printed the sheet in black and white and then photocopied it. */
const LETTER_INK = {
	P: "FF1E7B45", A: "FFB42318", HD: "FF8A5A00", L: "FF1F5FA8", LA: "FF1F5FA8",
	WO: "FF667085", H: "FF3B6FA0", MP: "FFC2410C",
};
const LEGEND = [
	["P", "Present"], ["A", "Absent"], ["HD", "Half day"], ["L", "On leave"],
	["LA", "Leave applied"], ["WO", "Weekly off"], ["H", "Holiday"], ["MP", "One punch only"],
];

const INK = "FF1F2937";
const MUTED = "FF6B7280";
const WHITE = "FFFFFFFF";
/* Sunday's header is the brand orange a shade darker, so the weeks read at a
   glance without a second colour that would mean something. */
const SUNDAY_FILL = "FFB84A0E";
/* The totals block is a different kind of number from the days — payroll
   reads it — so it is set apart in slate rather than in another orange. */
const TOTAL_HEAD = "FF374151";
const TOTAL_FILL = "FFF3F4F6";
const SECTION_FILL = ["FFFBD5BC", "FFFDE9DC"];
const FONT = "Calibri";

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/* A punched day reads `08:32-17:05`. Stacked in and out, it fits a column a
   third narrower, so a month of 31 days fits the width of one landscape page
   at a readable size rather than at 40%. */
const stack = (v) => (typeof v === "string" && /^[\d:?]+-[\d:?]+$/.test(v) ? v.replace("-", "\n") : v);

/* Payable is a string on screen; a number here, so HR can total a column
   without retyping it. Hours stay `h:mm` text — Excel would read `8:30` as a
   time of day, and 190 hours is not one. */
const numeric = (v) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

/** Wide enough for the longest thing in the column, within limits — a name
    column sized to the one person called "Thekkekara Puthenpurayil ..." makes
    everybody else's row a screen wide. */
function fitWidth(values, min, max) {
	let n = 0;
	for (const v of values) n = Math.max(n, String(v == null ? "" : v).length);
	return Math.max(min, Math.min(max, n + 2));
}

/**
 * Build and download the Monthly Basic muster as a formatted .xlsx.
 *
 * @param {object} g - `mbGrid(s)`'s own return: { from, till, days, people, cats, cols, rows, letters }
 * @param {object} opts - { company, shift, logo, crit, name, heads }
 *   `heads[i]` is the section headings that open above row `i` — the same ones
 *   the grid and the printed copy draw, so the three break in the same places.
 */
export async function monthlyBasicXlsx(g, opts) {
	const ExcelJS = (await import("exceljs")).default;
	const { days, cats, rows, letters } = g;
	const { company, shift, logo, crit, name, heads = [] } = opts;

	const dayFrom = 2 + cats.length + (shift ? 1 : 0);
	const trailing = 6; // Payable, Actual Hrs, Standard Hrs, Deficit Hrs, Actual/Day, Standard/Day
	const dayTo = dayFrom + days.length;
	const totalCols = dayTo + trailing;
	const isDay = (c) => c > dayFrom && c <= dayTo;
	const isTotal = (c) => c > dayTo;

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	const ws = wb.addWorksheet("Monthly Basic Attendance", {
		properties: { defaultRowHeight: 16 },
		pageSetup: {
			paperSize: 9, orientation: "landscape",
			/* Fit to one page wide and as many tall as it takes. fitToPage alone
			   also means one page tall, which shrinks a 300-person month to a
			   sheet nobody can read. */
			fitToPage: true, fitToWidth: 1, fitToHeight: 0,
			margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
		},
		headerFooter: { oddFooter: "&L&8Manna HR — Monthly Basic Attendance&R&8Page &P of &N" },
	});

	const band = (text, { fill, font, height }) => {
		const r = ws.addRow([]);
		ws.mergeCells(r.number, 1, r.number, totalCols);
		const cell = ws.getCell(r.number, 1);
		cell.value = text;
		cell.alignment = { horizontal: "center", vertical: "middle" };
		cell.font = { name: FONT, ...font };
		if (fill) cell.fill = solid(fill);
		if (height) r.height = height;
		return r;
	};

	if (logo) band("MANNA GROUP", { fill: HEAD_FILL, font: { bold: true, size: 18, color: { argb: WHITE } }, height: 30 });
	band(`MONTHLY BASIC ATTENDANCE REPORT${company ? "  ·  " + company : ""}`, {
		fill: logo ? ZEBRA_FILL : HEAD_FILL,
		font: { bold: true, size: 14, color: { argb: logo ? INK : WHITE } }, height: 24,
	});
	band(`Date from ${g.from} to ${g.till}`, { fill: ZEBRA_FILL, font: { size: 10, color: { argb: INK } }, height: 18 });
	if (crit) band(crit, { fill: ZEBRA_FILL, font: { italic: true, size: 9, color: { argb: MUTED } }, height: 16 });
	ws.addRow([]).height = 6;

	/* Two header rows: the date over its weekday. The fixed and total columns
	   are merged down both, so their headings sit centred beside the pair. */
	const fixedHeads = ["Emp Code", "Name", ...cats.map((c) => c[0]), ...(shift ? ["Shift"] : [])];
	const totalHeads = ["Payable", "Actual Hrs", "Standard Hrs", "Deficit Hrs", "Actual /Day", "Standard /Day"];
	const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const h1 = ws.addRow([...fixedHeads, ...days.map((d) => d.getDate()), ...totalHeads]);
	const h2 = ws.addRow([...fixedHeads.map(() => ""), ...days.map((d) => WD[d.getDay()]), ...totalHeads.map(() => "")]);
	for (let c = 1; c <= totalCols; c++) {
		if (!isDay(c)) ws.mergeCells(h1.number, c, h2.number, c);
		const sunday = isDay(c) && days[c - dayFrom - 1].getDay() === 0;
		const fill = isTotal(c) ? TOTAL_HEAD : sunday ? SUNDAY_FILL : HEAD_FILL;
		for (const r of [h1, h2]) {
			const cell = ws.getCell(r.number, c);
			cell.fill = solid(fill);
			cell.font = { name: FONT, bold: true, color: { argb: WHITE }, size: r === h2 && isDay(c) ? 8 : 10 };
			cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
			cell.border = headBorder();
		}
	}
	h1.height = 18;
	h2.height = 16;
	ws.views = [{ state: "frozen", xSplit: dayFrom, ySplit: h2.number, showGridLines: false }];
	ws.pageSetup.printTitlesRow = `${h1.number}:${h2.number}`;

	/* Fill colour and the dot for an unmeasured day both key off `letters`, not
	   the cell's own value — a punched day's cell holds `08:32-17:05` now, and
	   only the underlying status (WO/A/H/…) says how to colour it. */
	let band2 = 0;
	rows.forEach((cells, ri) => {
		for (const h of heads[ri] || []) {
			const r = ws.addRow([`${h.text}  —  ${h.n} ${h.n === 1 ? "person" : "people"}`]);
			ws.mergeCells(r.number, 1, r.number, totalCols);
			const cell = ws.getCell(r.number, 1);
			cell.fill = solid(SECTION_FILL[Math.min(h.level, 1)]);
			cell.font = { name: FONT, bold: true, size: h.level ? 10 : 11, color: { argb: SUNDAY_FILL } };
			cell.alignment = { vertical: "middle", indent: h.level };
			cell.border = thinBorder();
			r.height = 20;
			band2 = 0;
		}
		const zebra = band2++ % 2 === 1;
		const row = ws.addRow(cells.map((v, j) => (isDay(j + 1) ? stack(v) || "·" : isTotal(j + 1) ? numeric(v) : v)));
		row.height = 26;
		for (let c = 1; c <= totalCols; c++) {
			const cell = row.getCell(c);
			cell.border = thinBorder();
			cell.font = { name: FONT, size: 10, color: { argb: INK } };
			cell.alignment = { vertical: "middle", horizontal: c <= dayFrom ? "left" : "center", indent: c <= dayFrom ? 1 : 0 };
			if (isDay(c)) {
				const letter = letters[ri][c - dayFrom - 1];
				const fill = LETTER_FILL[letter];
				if (fill) cell.fill = solid(fill);
				else if (zebra) cell.fill = solid(ZEBRA_FILL);
				const punched = typeof cell.value === "string" && cell.value.includes("\n");
				cell.font = {
					name: FONT, size: punched ? 8 : 9,
					bold: !punched && !!letter, color: { argb: LETTER_INK[letter] || MUTED },
				};
				cell.alignment = { ...cell.alignment, wrapText: true };
			} else if (isTotal(c)) {
				cell.fill = solid(TOTAL_FILL);
				if (c === dayTo + 1) cell.font = { ...cell.font, bold: true };
				/* Deficit is actual less standard: short of the shift is red, over it green. */
				if (c === dayTo + 4 && typeof cell.value === "string" && /^-?\d/.test(cell.value)) {
					cell.font = { ...cell.font, bold: true, color: { argb: cell.value.startsWith("-") ? LETTER_INK.A : LETTER_INK.P } };
				}
				if (c === dayTo + 1 && typeof cell.value === "number") cell.numFmt = "0.0";
			} else {
				if (zebra) cell.fill = solid(ZEBRA_FILL);
				if (c === 1) cell.font = { ...cell.font, color: { argb: MUTED } };
				if (c === 2) cell.font = { ...cell.font, bold: true };
			}
		}
	});

	/* The legend, one kind of day to a row, each drawn in its own colours and
	   counted across the sheet — a key that looks like the cells it explains. */
	ws.addRow([]);
	const counts = rows.reduce((acc, cells, ri) => {
		const c = letterCounts(letters[ri]);
		for (const k in c) acc[k] = (acc[k] || 0) + c[k];
		return acc;
	}, {});
	const lh = ws.addRow(["Legend"]);
	ws.mergeCells(lh.number, 1, lh.number, 2);
	lh.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
	for (const [k, label] of LEGEND) {
		const r = ws.addRow([k, `${label} — ${counts[k] || 0} ${counts[k] === 1 ? "day" : "days"}`]);
		const sw = r.getCell(1);
		sw.fill = solid(LETTER_FILL[k]);
		sw.font = { name: FONT, bold: true, size: 9, color: { argb: LETTER_INK[k] } };
		sw.alignment = { horizontal: "center", vertical: "middle" };
		sw.border = thinBorder();
		r.getCell(2).font = { name: FONT, size: 9, color: { argb: INK } };
		r.getCell(2).alignment = { vertical: "middle", indent: 1 };
	}
	const note = ws.addRow([
		`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}. A punched day shows in over out; `
		+ "a dot (·) is a day not yet over or not yet measured. Payable adds up what the grid holds — it applies no policy.",
	]);
	ws.mergeCells(note.number, 1, note.number, totalCols);
	note.getCell(1).font = { name: FONT, italic: true, size: 8, color: { argb: MUTED } };
	note.getCell(1).alignment = { vertical: "middle", wrapText: true };
	note.height = 22;

	const col = (j) => rows.map((r) => r[j]);
	ws.getColumn(1).width = fitWidth(["Emp Code", ...col(0)], 10, 16);
	ws.getColumn(2).width = fitWidth(["Name", ...col(1), ...LEGEND.map(([, l]) => l + " — 0000 days")], 20, 34);
	cats.forEach((c, i) => { ws.getColumn(3 + i).width = fitWidth([c[0], ...col(2 + i)], 10, 26); });
	if (shift) ws.getColumn(3 + cats.length).width = fitWidth(["Shift", ...col(2 + cats.length)], 10, 26);
	for (let i = 0; i < days.length; i++) ws.getColumn(dayFrom + 1 + i).width = 6.4;
	[9, 10, 10.5, 10, 9, 10].forEach((w, i) => { ws.getColumn(dayTo + 1 + i).width = w; });

	await downloadWorkbook(wb, name);
}

/**
 * Build and download the Monthly Summary muster as a formatted .xlsx — one
 * row per person, the columns `lib/monthlysummary.js` computes.
 *
 * @param {object[]} rows - `monthlySummaryRows(...)`'s own return
 * @param {object} opts - { from, till, company, name }
 */
export async function monthlySummaryXlsx(rows, opts) {
	const ExcelJS = (await import("exceljs")).default;
	const { from, till, company, name } = opts;

	const cols = [
		["Emp Code", 12], ["Name", 24], ["Department", 18], ["Shift In", 9], ["Shift Out", 9],
		["Days", 6], ["P", 5], ["HD", 5], ["WO", 5], ["HO", 5], ["AB", 5], ["LC", 5], ["EG", 5],
		["OT", 8], ["CL", 5], ["LWP", 6],
		["Actual Hrs", 11], ["Standard Hrs", 12], ["Deficit Hrs", 11],
		["Actual/Day", 10], ["Standard/Day", 12],
	];

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	const ws = wb.addWorksheet("Monthly Summary Attendance", {
		pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
	});

	const mergeCenter = (text, opt = {}) => {
		const r = ws.addRow([]);
		ws.mergeCells(r.number, 1, r.number, cols.length);
		const cell = ws.getCell(r.number, 1);
		cell.value = text;
		cell.alignment = { horizontal: "center", vertical: "middle" };
		cell.font = { bold: true, size: 11, ...(opt.font || {}) };
		return r;
	};

	mergeCenter("MANNA GROUP", { font: { size: 16 } });
	mergeCenter(`Monthly Summary Attendance Report${company ? " — " + company : ""}`, { font: { size: 13 } });
	mergeCenter(`For the period ${from} to ${till}`, { font: { bold: false, size: 10 } });
	ws.addRow([]);

	const headerRow = ws.addRow(cols.map((c) => c[0]));
	headerRow.eachCell((cell) => {
		cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
		cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
		cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
		cell.border = thinBorder();
	});
	ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow.number }];

	for (const r of rows) {
		const cells = [
			r.emp.employee_number || r.emp.name, r.emp.employee_name || "", r.emp.department || "",
			r.shiftIn, r.shiftOut, r.daysInMonth, r.P, r.HD, r.WO, r.HO, r.AB, r.LC, r.EG,
			r.OT, r.CL, r.LWP, r.actualHours, r.standardHours, r.deficitHours, r.actualPerDay, r.standardPerDay,
		];
		const row = ws.addRow(cells);
		row.eachCell((cell, colNumber) => {
			cell.border = thinBorder();
			cell.alignment = { horizontal: colNumber <= 3 ? "left" : "center" };
		});
	}

	ws.addRow([]);
	mergeCenter(
		`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")}. `
		+ "P present · HD half day · WO weekly off · HO holiday · AB absent · LC late coming (days) · "
		+ "EG early going (days) · OT overtime · CL casual leave (days) · LWP leave without pay (days). "
		+ "Standard Working Hours is the shift's own span times Present days plus half of any Half Day — "
		+ "this site has no payroll policy engine yet to weight leave or holiday into it.",
		{ font: { bold: false, size: 8, italic: true } },
	);

	cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });

	await downloadWorkbook(wb, name);
}

async function downloadWorkbook(wb, name) {
	const buf = await wb.xlsx.writeBuffer();
	const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function thinBorder() {
	const side = { style: "thin", color: { argb: "FFD0D0D0" } };
	return { top: side, left: side, bottom: side, right: side };
}

/* White between header cells, so a run of orange reads as columns rather than as one bar. */
function headBorder() {
	const side = { style: "thin", color: { argb: "FFFFFFFF" } };
	return { top: side, left: side, bottom: side, right: side };
}

/* A title band over a table, the way every sheet in these workbooks opens. */
function titleBands(ws, width, lines) {
	lines.forEach(([text, kind], i) => {
		const r = ws.addRow([text]);
		ws.mergeCells(r.number, 1, r.number, width);
		const cell = r.getCell(1);
		cell.alignment = { horizontal: "center", vertical: "middle" };
		if (kind === "title") {
			cell.fill = solid(HEAD_FILL);
			cell.font = { name: FONT, bold: true, size: 14, color: { argb: WHITE } };
			r.height = 24;
		} else {
			cell.fill = solid(ZEBRA_FILL);
			cell.font = { name: FONT, size: kind === "note" ? 9 : 10, italic: kind === "note", color: { argb: kind === "note" ? MUTED : INK } };
			r.height = i ? 16 : 18;
		}
	});
	ws.addRow([]).height = 6;
}

const sheetSetup = (name) => ({
	pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
		margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
	headerFooter: { oddFooter: `&L&8Manna HR — ${name}&R&8Page &P of &N` },
});

/**
 * One sheet of a plain table: an orange header, zebra rows, a filter on every
 * column, and widths fitted to what the columns hold.
 *
 * @param {Array} cols - `[heading, value(row), { width: [min, max], align, style(cell, row) }]`
 */
function tableSheet(wb, sheetName, title, cols, rows) {
	const ws = wb.addWorksheet(sheetName, sheetSetup(sheetName));
	titleBands(ws, cols.length, title);
	const head = ws.addRow(cols.map((c) => c[0]));
	head.height = 22;
	head.eachCell((cell) => {
		cell.fill = solid(HEAD_FILL);
		cell.font = { name: FONT, bold: true, size: 10, color: { argb: WHITE } };
		cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
		cell.border = headBorder();
	});
	ws.views = [{ state: "frozen", xSplit: 0, ySplit: head.number, showGridLines: false }];
	ws.pageSetup.printTitlesRow = `${head.number}:${head.number}`;

	const values = rows.map((r) => cols.map((c) => c[1](r)));
	values.forEach((vals, i) => {
		const row = ws.addRow(vals.map((v) => (v == null ? "" : v)));
		row.height = 18;
		cols.forEach((c, j) => {
			const cell = row.getCell(j + 1);
			const o = c[2] || {};
			const align = o.align || "left";
			cell.border = thinBorder();
			cell.font = { name: FONT, size: 10, color: { argb: INK } };
			cell.alignment = { vertical: "middle", horizontal: align, indent: align === "left" ? 1 : 0 };
			if (i % 2) cell.fill = solid(ZEBRA_FILL);
			if (o.style) o.style(cell, rows[i]);
		});
	});
	if (rows.length) ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: cols.length } };

	cols.forEach((c, j) => {
		const [min, max] = (c[2] && c[2].width) || [8, 30];
		ws.getColumn(j + 1).width = fitWidth([c[0], ...values.map((v) => v[j])], min, max);
	});
	return ws;
}

/** A cell in a status's own fill and ink — the same pair the muster uses. */
const paint = (cell, key) => {
	if (LETTER_FILL[key]) cell.fill = solid(LETTER_FILL[key]);
	cell.font = { ...cell.font, bold: true, color: { argb: LETTER_INK[key] || INK } };
};
const bold = (cell) => { cell.font = { ...cell.font, bold: true }; };
/* Red, bold, and only when the count is not zero: a column of red zeros
   would be read as a column of problems. */
const warnIf = (test) => (cell, r) => {
	if (test(r)) cell.font = { ...cell.font, bold: true, color: { argb: LETTER_INK.A } };
};
const inOut = (cell, dir) => {
	const d = String(dir || "").toUpperCase();
	if (!PUNCH_FILL[d]) return;
	cell.fill = solid(PUNCH_FILL[d]);
	cell.font = { ...cell.font, bold: true, color: { argb: d === "IN" ? LETTER_INK.P : LETTER_INK.MP } };
};
const flagged = (r) => r.custom_geofence_result === "outside" || r.custom_geofence_result === "no_location";

/**
 * App Punches as one workbook: the per-person totals, the day-by-day summary,
 * the month as a grid, and every punch — four sheets off the same rows, so
 * HR can check any total against the punches that make it.
 *
 * @param {object} data - { from, till, company, daily, totals, grid, punches }, from lib/apppunches.js
 * @param {object} opts - { name, empOf(employee) → Employee, whereOf(punch) → text, hm(ms) → "8:33", fenceText(day) }
 */
export async function appPunchesXlsx(data, opts) {
	const ExcelJS = (await import("exceljs")).default;
	const { from, till, company, daily, totals, grid, punches } = data;
	const { name, empOf, whereOf, hm, fenceText } = opts;
	const code = (id) => empOf(id).employee_number || id;
	const who = (id, fallback) => empOf(id).employee_name || fallback || "";
	const clockOf = (t) => (t ? String(t).slice(11, 16) : "");
	const heading = (t) => [
		[`${t}${company ? "  ·  " + company : ""}`, "title"],
		[`App punches from ${from} to ${till}`, "sub"],
		["The phone app's punches only — a day with no app punch is not an absence; the person may have used the machine.", "note"],
	];

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();

	const num = { align: "center", width: [7, 12] };
	const date = { align: "center", width: [11, 12] };
	const nameCol = (get) => ["Name", get, { width: [18, 34], style: bold }];

	tableSheet(wb, "Summary", heading("APP PUNCHES — PER PERSON"), [
		["Emp Code", (t) => code(t.employee), { width: [10, 16] }],
		nameCol((t) => who(t.employee, t.employee_name)),
		["Department", (t) => empOf(t.employee).department || "", { width: [12, 28] }],
		["Days", (t) => t.days, num],
		["Punches", (t) => t.punches, num],
		["Full Days", (t) => t.complete, { ...num, style: (c) => paint(c, "P") }],
		["Missing In", (t) => t.missingIn, { ...num, style: warnIf((t) => t.missingIn) }],
		["Missing Out", (t) => t.missingOut, { ...num, style: warnIf((t) => t.missingOut) }],
		["Outside Fence", (t) => t.outside, { ...num, style: warnIf((t) => t.outside) }],
		["No Location", (t) => t.noLocation, { ...num, style: warnIf((t) => t.noLocation) }],
		["Total Hrs", (t) => hm(t.workMs), { ...num, width: [9, 12], style: bold }],
		["Avg Hrs/Day", (t) => hm(t.avgMs), { ...num, width: [9, 12] }],
		["First", (t) => t.first, date],
		["Last", (t) => t.last, date],
	], totals);

	tableSheet(wb, "Daily", heading("APP PUNCHES — DAILY SUMMARY"), [
		["Date", (d) => d.date, date],
		["Day", (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d.date + "T00:00:00").getDay()], { align: "center", width: [5, 6] }],
		["Emp Code", (d) => code(d.employee), { width: [10, 16] }],
		nameCol((d) => who(d.employee, d.employee_name)),
		["First In", (d) => clockOf(d.firstIn), { align: "center", width: [8, 9], style: (c, d) => d.firstIn && inOut(c, "IN") }],
		["Last Out", (d) => clockOf(d.lastOut), { align: "center", width: [8, 9], style: (c, d) => d.lastOut && inOut(c, "OUT") }],
		["Hours", (d) => hm(d.workMs), { align: "center", width: [7, 9], style: bold }],
		["Punches", (d) => d.punches.length, { align: "center", width: [8, 9] }],
		["Status", (d) => (d.complete ? "Full day" : `Missing ${d.missing}`), { align: "center", width: [12, 14], style: (c, d) => paint(c, d.complete ? "P" : "MP") }],
		["Geofence", (d) => fenceText(d), {
			align: "center", width: [10, 22],
			style: (c, d) => {
				if (d.outside || d.noLocation) paint(c, "A");
				else if (d.inside) c.font = { ...c.font, color: { argb: LETTER_INK.P } };
			},
		}],
	], daily);

	gridSheet(wb, grid, { heading: heading("APP PUNCHES — MONTHLY GRID"), code, who, clockOf, hm });

	const coord = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : "");
	tableSheet(wb, "Punches", heading("APP PUNCHES — EVERY PUNCH"), [
		["Date", (r) => String(r.time || "").slice(0, 10), date],
		["Time", (r) => clockOf(r.time), { align: "center", width: [7, 8] }],
		["Emp Code", (r) => code(r.employee), { width: [10, 16] }],
		["Name", (r) => who(r.employee, r.employee_name), { width: [18, 34] }],
		["In / Out", (r) => r.log_type || "", { align: "center", width: [8, 9], style: (c, r) => inOut(c, r.log_type) }],
		["Latitude", (r) => coord(r.latitude), { align: "right", width: [11, 12], style: (c) => { c.numFmt = "0.000000"; } }],
		["Longitude", (r) => coord(r.longitude), { align: "right", width: [11, 12], style: (c) => { c.numFmt = "0.000000"; } }],
		["Where", (r) => whereOf(r), { width: [14, 44], style: warnIf(flagged) }],
		["Company", (r) => empOf(r.employee).company || "", { width: [12, 30] }],
	], punches);

	await downloadWorkbook(wb, name);
}

/* The month: a row per person, a column per date, in over out in each cell —
   Monthly Basic's layout, for the app's punches alone. */
function gridSheet(wb, grid, { heading, code, who, clockOf, hm }) {
	const { dates, people } = grid;
	const fixed = 2;
	const dayTo = fixed + dates.length;
	const width = dayTo + 2;
	const ws = wb.addWorksheet("Monthly Grid", sheetSetup("Monthly Grid"));
	titleBands(ws, width, heading);

	const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
	const dow = dates.map((d) => new Date(d + "T00:00:00").getDay());
	const isDay = (c) => c > fixed && c <= dayTo;
	const h1 = ws.addRow(["Emp Code", "Name", ...dates.map((d) => Number(d.slice(8))), "Full Days", "Total Hrs"]);
	const h2 = ws.addRow(["", "", ...dow.map((w) => WD[w]), "", ""]);
	for (let c = 1; c <= width; c++) {
		if (!isDay(c)) ws.mergeCells(h1.number, c, h2.number, c);
		const fill = c > dayTo ? TOTAL_HEAD : isDay(c) && dow[c - fixed - 1] === 0 ? SUNDAY_FILL : HEAD_FILL;
		for (const r of [h1, h2]) {
			const cell = ws.getCell(r.number, c);
			cell.fill = solid(fill);
			cell.font = { name: FONT, bold: true, color: { argb: WHITE }, size: r === h2 && isDay(c) ? 8 : 10 };
			cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
			cell.border = headBorder();
		}
	}
	h1.height = 18;
	h2.height = 16;
	ws.views = [{ state: "frozen", xSplit: fixed, ySplit: h2.number, showGridLines: false }];
	ws.pageSetup.printTitlesRow = `${h1.number}:${h2.number}`;

	people.forEach((p, i) => {
		const full = p.cells.filter((d) => d && d.complete);
		const row = ws.addRow([
			code(p.employee), who(p.employee, p.employee_name),
			...p.cells.map((d) => (!d ? "·" : `${clockOf(d.firstIn) || "?"}\n${clockOf(d.lastOut) || "?"}`)),
			full.length, hm(full.reduce((a, d) => a + d.workMs, 0)),
		]);
		row.height = 26;
		for (let c = 1; c <= width; c++) {
			const cell = row.getCell(c);
			cell.border = thinBorder();
			cell.font = { name: FONT, size: 10, color: { argb: INK } };
			cell.alignment = { vertical: "middle", horizontal: c <= fixed ? "left" : "center", indent: c <= fixed ? 1 : 0, wrapText: true };
			if (!isDay(c)) {
				if (c > dayTo) { cell.fill = solid(TOTAL_FILL); bold(cell); } else if (i % 2) cell.fill = solid(ZEBRA_FILL);
				if (c === 1) cell.font = { ...cell.font, color: { argb: MUTED } };
				if (c === 2) bold(cell);
				continue;
			}
			const d = p.cells[c - fixed - 1];
			if (!d) {
				cell.font = { name: FONT, size: 9, color: { argb: MUTED } };
				if (dow[c - fixed - 1] === 0) cell.fill = solid(LETTER_FILL.WO);
				else if (i % 2) cell.fill = solid(ZEBRA_FILL);
				continue;
			}
			const k = d.complete ? "P" : "MP";
			const off = d.outside || d.noLocation;
			cell.fill = solid(LETTER_FILL[k]);
			/* Red text, whatever the fill, for a day the server put outside the fence. */
			cell.font = { name: FONT, size: 8, bold: !!off, color: { argb: off ? LETTER_INK.A : LETTER_INK[k] } };
		}
	});

	ws.addRow([]);
	const legend = [
		["P", "P", "Full day — an In and an Out from the app"],
		["MP", "MP", "One punch missing"],
		["A", "!", "Red text — a punch outside the fence, or sent with no location"],
	];
	for (const [k, mark, label] of legend) {
		const r = ws.addRow([mark, label]);
		const sw = r.getCell(1);
		sw.fill = solid(k === "A" ? WHITE : LETTER_FILL[k]);
		sw.font = { name: FONT, bold: true, size: 9, color: { argb: LETTER_INK[k] } };
		sw.alignment = { horizontal: "center", vertical: "middle" };
		sw.border = thinBorder();
		r.getCell(2).font = { name: FONT, size: 9, color: { argb: INK } };
		r.getCell(2).alignment = { vertical: "middle", indent: 1 };
	}

	ws.getColumn(1).width = fitWidth(["Emp Code", ...people.map((p) => code(p.employee))], 10, 16);
	ws.getColumn(2).width = fitWidth(["Name", ...people.map((p) => who(p.employee, p.employee_name))], 20, 34);
	for (let i = 0; i < dates.length; i++) ws.getColumn(fixed + 1 + i).width = 6.4;
	ws.getColumn(dayTo + 1).width = 9;
	ws.getColumn(dayTo + 2).width = 10;
}
