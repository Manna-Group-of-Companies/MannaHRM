/* The wages register (Form 25, muster roll) as a real .xlsx, in the layout and
   colours of the company's own register: the title band, the days across, then
   Attendance, OT & Bata, Salary / Wages, PF / ESI, Cash Advance & Loan and Net
   Payable, each its own colour. Only the data changes from month to month and
   from company to company.

   data/registerlayout.js is that register's styling read cell by cell (every
   fill, width, border and number format); this file lays the month's rows over
   it. lib/register.js says what each cell holds and where it comes from.

   The day columns are as many as the month has days, so the columns after them
   move; every formula and merged band is therefore worked out from the column's
   name in the layout rather than written as a fixed address.

   **Before there are slips it is a preview** (lib/registerpreview.js): the same
   layout, but every computed cell carries the sheet's own formula, so Excel works
   the month out from the attendance and the inputs, and the title says PREVIEW,
   NOT FROM SALARY SLIPS. Nobody is paid from that one; it is how HR sees the
   calculation before hrms has made the slips that are paid from.

   ExcelJS is imported inside the function, like lib/salarysheetxlsx.js, so the
   screens that never export do not download it. */

import { DAYS, LEFT, RIGHT, ROW_HEIGHTS, STYLES } from "@/data/registerlayout";
import { LEGEND, daysIn } from "@/lib/register";
import { MONTHS } from "@/lib/format";

const ORIGINAL_DAYS = 30;
/* The orange a weekly off is drawn in, as in the original. */
const SUNDAY_FILL = "FCD5B5";
const FIRST_DAY_COL = LEFT.length + 1;

/** A column number's letter. */
export function letter(i) {
	let s = "";
	for (let c = i; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
	return s;
}
const number = (s) => [...s].reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);

const argb = (hex) => "FF" + hex;

/** Put one of the layout's styles on a cell. */
function paint(cell, s) {
	if (!s) return;
	if (s.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(s.fill) } };
	if (s.font) {
		const [name, size, bold, color] = s.font;
		cell.font = { name, size, bold, ...(color ? { color: { argb: argb(color) } } : {}) };
	}
	if (s.al) {
		const [horizontal, vertical, wrap] = s.al;
		cell.alignment = { horizontal: horizontal || undefined, vertical: vertical === "center" ? "middle" : vertical || undefined, wrapText: wrap || undefined };
	}
	if (s.bd) {
		const edge = (style) => (style ? { style, color: { argb: "FF000000" } } : undefined);
		const [left, right, top, bottom] = s.bd;
		cell.border = { left: edge(left), right: edge(right), top: edge(top), bottom: edge(bottom) };
	}
	if (s.nf && s.nf !== "General") cell.numFmt = s.nf;
}

/** The columns the preview totals under its last row — the sheet's own. */
const TOTALS = ["BA", "BL", "BN", "BO", "BP", "BV", "BW", "BX", "BY", "BZ", "CA", "CB", "CC", "CD", "CE", "CK", "CL", "CM", "CN", "CQ", "CR"];
const YELLOW = "FFFF00";

/** A preview is asked for, or its rows say so: only the preview's rows carry a kind. */
const isPreview = (rows, opts) => Boolean(opts.preview) || rows.some((r) => r && r.kind);

/** "SEPTEMBER 2026". */
const round2 = (v) => Number(Number(v).toFixed(2));

/** What the attendance block's formulas come to for one row, worked the way
    Excel will work them: SUM counts the 1s and 0.5s, COUNTIF the SNDY and HOL
    marks, and leave is whatever of the month is left. */
export function attendanceOf(p, monthDays) {
	const cells = p.days || [];
	const worked = cells.reduce((t, v) => t + (typeof v === "number" ? v : 0), 0);
	const sundays = cells.filter((v) => v === "SNDY").length;
	const holidays = cells.filter((v) => v === "HOL").length;
	const leave = monthDays - worked - sundays - holidays;
	const available = (Number(p.clBrought) || 0) + (Number(p.clEarned) || 0);
	return {
		worked: round2(worked), sundays, holidays, leave: round2(leave),
		available: round2(available), balance: round2(available - leave),
	};
}

const monthWords = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1].toUpperCase()} ${ym.slice(0, 4)}`;

/**
 * Build the workbook. Separate from the download so a test can read it back.
 *
 * @param {object[]} rows   lib/register.js registerRows' return, or lib/registerpreview.js previewRows' rows
 * @param {object} opts
 * @param {string} opts.ym        "2026-09"
 * @param {string} opts.company   the company the register is for
 * @param {string} [opts.address] the branch line under the company
 * @param {boolean} [opts.preview] the formulas' register, before slips
 */
export async function registerWorkbook(rows, opts) {
	const wb = await newBook();
	addRegisterSheet(wb, rows, opts);
	return wb;
}

async function newBook() {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	wb.calcProperties = { fullCalcOnLoad: true };
	return wb;
}

/** A sheet name Excel will take: 31 characters, none of \ / ? * [ ] :, and not
    one the workbook already has — Excel compares them ignoring case, and a
    repeat is a file it refuses to open rather than one with a renamed tab. */
export function sheetName(wb, wanted) {
	const base = String(wanted || "Sheet").replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
	const taken = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
	let name = base;
	for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 3)} (${n})`;
	return name;
}

/**
 * One company's register, as a sheet of `wb`. The same sheet whether it is the
 * only one in the file or one company's of several.
 *
 * @param {object} wb  an ExcelJS workbook
 * @param {object[]} rows
 * @param {object} opts  as registerWorkbook's, and `sheet`, the tab's name
 */
export function addRegisterSheet(wb, rows, opts) {
	const { ym, company = "", address = "" } = opts;
	const preview = isPreview(rows, opts);
	const days = daysIn(ym);
	const shift = days - ORIGINAL_DAYS;

	/* Where a column of the original layout is now. */
	const at = (id) => (number(id) < FIRST_DAY_COL ? number(id) : number(id) + shift);
	const L = (id) => letter(at(id));

	const dayCols = Array.from({ length: days }, (_, i) => DAYS[Math.min(i, DAYS.length - 1)]);
	const cols = [...LEFT, ...dayCols, ...RIGHT];
	const firstDay = letter(FIRST_DAY_COL);
	const lastDay = letter(FIRST_DAY_COL + days - 1);

	const ws = wb.addWorksheet(sheetName(wb, opts.sheet || "Wages Register"), {
		views: [{ state: "frozen", xSplit: LEFT.length, ySplit: 5, topLeftCell: `${firstDay}6`, zoomScale: 100 }],
		pageSetup: { orientation: "landscape", paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
	});

	/* Widths, and the columns the original keeps hidden. */
	cols.forEach((c, i) => {
		const col = ws.getColumn(i + 1);
		col.width = c.w;
		if (c.h) col.hidden = true;
	});

	/* The first five rows: styled across every column, then written to. */
	const lastCol = cols.length;
	for (let r = 1; r <= 5; r++) {
		ws.getRow(r).height = ROW_HEIGHTS[r];
		for (let c = 1; c <= lastCol; c++) paint(ws.getCell(r, c), STYLES[cols[c - 1].st[r - 1]]);
	}

	const title = `${monthWords(ym)} - ${company} - (FORM NO.25) - MUSTER ROLL`;
	/* A register built on draft slips, or on no slips at all, says so at the top,
	   where it cannot be missed. */
	const draft = rows.some((r) => r.state !== "Submitted");
	const mark = preview ? " - PREVIEW, NOT FROM SALARY SLIPS" : draft ? " - DRAFT SLIPS INCLUDED, NOT FINAL" : "";
	ws.getCell("B1").value = `Employee Salary / Wages Register-${monthWords(ym)}${mark}`;
	ws.getCell("B2").value = "Company(s)";
	ws.getCell("C2").value = company;
	ws.getCell("B3").value = "Branch";
	ws.getCell("C3").value = address;
	ws.getCell(`${letter(FIRST_DAY_COL + 1)}3`).value = title;
	ws.getCell(`${L("BC")}3`).value = title;
	ws.getCell("B4").value = "Month";
	ws.getCell("C4").value = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1));
	ws.getCell("D4").value = "Days in the month";
	ws.getCell("F4").value = "Days in the Month";
	ws.getCell(`${firstDay}4`).value = days;
	const bands = [
		["AL", "AU", "ATTENDANCE DETAILS"], ["AV", "BB", "OT & BATA DATA"], ["BC", "BP", "SALARY / WAGES"],
		["BQ", "BY", "PF / ESI - CONTRIBUTION"], ["CA", "CH", "CASH ADVANCE & LOAN DEDUCTION"],
		["CM", "CR", "NET PAYABLE AMOUNT AFTER FINAL DEDUCTION"],
	];
	for (const [a, b, text] of bands) {
		ws.mergeCells(`${L(a)}4:${L(b)}4`);
		ws.getCell(`${L(a)}4`).value = text;
	}
	ws.getCell(`${L("CI")}4`).value = "Mess";
	ws.mergeCells(`${letter(FIRST_DAY_COL + 1)}3:${L("AU")}3`);
	ws.mergeCells(`${L("BC")}3:${L("BZ")}3`);

	/* The column headings. */
	const headOf = [...LEFT, ...RIGHT];
	for (const c of headOf) {
		const v = c.head;
		if (v === null || v === undefined) continue;
		ws.getCell(5, at(c.id)).value = v;
	}
	let splitCols = null;
	if (opts.paymentSplit) {
		const firstSplit = lastCol + 1;
		splitCols = [letter(firstSplit), letter(firstSplit + 1), letter(firstSplit + 2)];
		const [netCol, bankCol, cashCol] = splitCols;
		ws.mergeCells(`${netCol}1:${cashCol}1`);
		ws.getCell(`${netCol}1`).value = "PAYMENT SPLIT REVIEW";
		ws.getCell(`${netCol}1`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
		ws.getCell(`${netCol}1`).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
		ws.getCell(`${netCol}1`).alignment = { horizontal: "center", vertical: "middle" };
		/* Cash-1 has nobody the limit applies to — each of its people has their
		   own split — so it carries no limit cell to mislead anybody. */
		if (!opts.cashTab) {
			ws.getCell(`${netCol}2`).value = "Bank transfer cap (₹)";
			ws.getCell(`${bankCol}2`).value = Number.isFinite(Number(opts.bankCap)) ? Number(opts.bankCap) : 20000;
			ws.getCell(`${netCol}2`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
			ws.getCell(`${bankCol}2`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
			ws.getCell(`${bankCol}2`).numFmt = '₹#,##0.00';
		}
		ws.mergeCells(`${netCol}3:${cashCol}3`);
		ws.getCell(`${netCol}3`).value = opts.cashTab
			? "Cash take-home by each person's salary structure (Salary Setup). Gross wages, PF, ESI and PT remain the full Salary Slip figures."
			: "Shows full net pay and the payment split. Gross wages, statutory deductions and ESI remain the full Salary Slip figures.";
		ws.getCell(`${netCol}3`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
		ws.getCell(`${netCol}3`).font = { name: "Calibri", size: 9, color: { argb: "FF7F4125" } };
		ws.getCell(`${netCol}3`).alignment = { wrapText: true, vertical: "middle" };
		ws.getRow(3).height = Math.max(ws.getRow(3).height || 0, 30);
		/* Diff Cash is laid out as HR's own reference sheet (14 October 2026):
		   net in the register's light blue, and the cash difference in bold
		   on yellow. One row a person, every figure the real one — no second
		   "For Filing" row with a lower wage, which would be a false register. */
		const DIFF = !opts.cashTab;
		[
			[netCol, DIFF ? "Net Payable After Round up" : "Full net payable (₹)", "FFDAEEF3"],
			[bankCol, DIFF ? "Paid by Bank" : "Bank transfer (₹)", "FFDAEEF3"],
			[cashCol, DIFF ? "Diff to be paid by Cash" : "Cash take-home (₹)", "FFFFFF00"],
		].forEach(([col, head, fill]) => {
			const h = ws.getCell(`${col}5`);
			h.value = head;
			ws.getColumn(col).width = 18;
			if (DIFF) {
				h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
				h.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
				h.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
				h.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
			}
		});
	}
	for (let d = 1; d <= days; d++) {
		const cell = ws.getCell(5, FIRST_DAY_COL + d - 1);
		cell.numFmt = "@";
		cell.value = String(d).padStart(2, "0");
	}

	/* Where the legend sits, which the day counts point at. */
	const first = 6;
	const lastRow = first + Math.max(rows.length, 1) - 1;
	const legendTop = lastRow + 5;
	const legendRow = (i) => legendTop + 5 + i;
	const SNDY = `$B$${legendRow(3)}`;
	const HOL = `$B$${legendRow(4)}`;

	/* The preview's computed cells: the sheet's own formula in each, on every row
	   rather than only on the rows the sheet happened to fill. Where the sheet
	   chose a formula by the person's kind (Salary or Wages) or by EPF or ESI
	   membership, one formula reads that row's own cell instead — so HR can
	   correct a Wages or a Yes in Excel and the row follows. For the same inputs
	   each gives the sheet's own answer. */
	const previewRow = (p, r, put, calc, range) => {
		const c = (id) => `${L(id)}${r}`;
		const D = `${firstDay}$4`;
		const DD = `$${firstDay}$4`;
		const wages = `${c("BC")}="Wages"`;
		const yes = (v) => (v === true || v === "Yes" ? "Yes" : "No");
		const a = attendanceOf(p, days);
		const eligible = p.kind === "Wages" ? a.worked : a.leave >= a.available ? round2(days - a.leave + a.available) : days;

		calc("AL", `SUM(${range})`, a.worked);
		calc("AM", `COUNTIF(${range},${SNDY})`, a.sundays);
		calc("AN", `COUNTIF(${range},${HOL})`, a.holidays);
		calc("AO", `(${D})-${c("AL")}-${c("AM")}-${c("AN")}`, a.leave);
		put("AP", p.clBrought);
		put("AQ", p.clEarned);
		calc("AR", `${c("AP")}+${c("AQ")}`, a.available);
		calc("AS", `${c("AR")}-${c("AO")}`, a.balance);
		/* A wage worker is paid the days worked; a salaried person the month, less
		   the leave beyond the Casual Leave they have. */
		calc("AT", `IF(${wages},${c("AL")},IF(${c("AO")}>=${c("AR")},${c("CT")}-${c("AO")}+${c("AR")},${c("CT")}))`, eligible);
		calc("AU", `IF(${wages},"",(${D})-${c("AT")})`, p.kind === "Wages" ? "" : round2(days - eligible));

		put("AV", p.otHours);
		/* The divisor is the person's hours in a day, written as the number itself
		   as the sheet does — see otHoursPerDay in lib/registerpreview.js. */
		calc("AW", `IF(${wages},${c("BE")}/26,${c("BE")}/${DD})/${p.otPerDay === 12 ? 12 : 8}`);
		put("AX", p.otBata);
		put("AY", p.bataDays);
		put("AZ", p.bataRate);
		calc("BA", `+(${c("AV")}*${c("AW")})+${c("AX")}`);
		calc("BB", `+(${c("AY")}*${c("AZ")})`);

		put("BC", p.kind === "Wages" ? "Wages" : "Salary");
		put("BD", p.daily);
		/* A wage worker's month is 26 days of the daily wage — written so only
		   when the daily wage is known, or the monthly figure read from the site
		   (or nothing, for HR to type) would be overwritten by a zero. */
		if (p.kind === "Wages" && p.daily !== "" && p.daily !== null && p.daily !== undefined) calc("BE", `${c("BD")}*26`);
		else put("BE", p.base);
		calc("BK", `IF(${wages},0,(${c("BE")}/${DD})*${c("AU")})`);
		calc("BL", `IF(${wages},(${c("BE")}/26)*${c("AT")},${c("BE")}-${c("BK")})`);
		calc("BM", `IF(${c("BQ")}="Yes",${c("BL")}*${p.pfShare === 100 ? 100 : 50}%,0)`);
		calc("BN", `${c("BA")}+${c("BB")}`);
		put("BO", p.food);
		calc("BP", `${c("BL")}+${c("BN")}+${c("BO")}`);

		put("BQ", yes(p.pfMember));
		put("BR", p.pfGovt || "No");
		put("BS", yes(p.esiMember));
		put("BT", p.insurance);
		calc("BU", c("AT"));
		calc("BV", `IF(${c("BQ")}="Yes",IF(${c("BM")}<25000,${c("BM")}*12%,25000*12%),0)`);
		calc("BW", `IF(${c("BS")}="Yes",${c("BP")}*0.75%,0)`);
		calc("BX", `ROUNDUP(${c("BV")},0)`);
		calc("BY", `ROUNDUP(${c("BW")},0)`);
		calc("BZ", `${c("BP")}-${c("BX")}-${c("BY")}`);

		put("CA", p.advance);
		calc("CB", c("CA"));
		put("CC", p.loanOutstanding);
		put("CD", p.loanInstalment);
		calc("CE", `${c("CC")}-${c("CD")}`);
		put("CF", p.covid);
		put("CG", p.covidDeduction);
		calc("CH", `${c("CF")}-${c("CG")}`);
		put("CI", p.mess);
		calc("CJ", `(${c("BE")}/2)*6`);
		/* The sheet's slab ends IF(CJ<125000,1250) with no else, which is FALSE —
		   no Professional Tax at all — from a half-year of 1,25,000 up. HR's rule
		   is 1,250 for everything above the last slab, so the last IF is that.
		   And no monthly pay is no tax: the sheet writes the slab only on rows
		   with a pay, and a row still waiting for HR to type one would otherwise
		   be charged the lowest slab and show a net of less than nothing. */
		calc("CK", `IF(${c("BE")}=0,0,IF(${c("CJ")}<17999,320,IF(${c("CJ")}<29999,450,IF(${c("CJ")}<44999,600,IF(${c("CJ")}<99999,750,IF(${c("CJ")}<124999,1000,1250)))))/6)`);
		put("CL", p.lwf);
		calc("CM", ["CB", "CD", "CG", "BX", "CI", "BY", "CK", "CL"].map(c).join("+"));
		calc("CN", `${c("BP")}-${c("CM")}`);
		put("CO", p.foodDeduction);
		put("CP", p.incentive);
		calc("CQ", `${c("CN")}-${c("CO")}`);
		calc("CR", `ROUNDUP(${c("CQ")},0)+${c("CS")}`);
		put("CS", p.roundOff);
		calc("CT", DD);

		/* The three cells HR is told to correct, kept to the words the formulas read. */
		const pick = (id, list) => { ws.getCell(c(id)).dataValidation = { type: "list", allowBlank: true, formulae: [list] }; };
		pick("BC", '"Salary,Wages"');
		pick("BQ", '"Yes,No"');
		pick("BS", '"Yes,No"');
	};

	rows.forEach((p, i) => {
		const r = first + i;
		ws.getRow(r).height = ROW_HEIGHTS[6];
		for (let c = 1; c <= lastCol; c++) {
			/* Every day is drawn as the first day is: the original's own Sunday columns are
			   September's, and are coloured here, per cell, by what the cell says. */
			const day = c >= FIRST_DAY_COL && c < FIRST_DAY_COL + days;
			paint(ws.getCell(r, c), STYLES[(day ? cols[FIRST_DAY_COL - 1] : cols[c - 1]).st[5]]);
		}
		const put = (id, v) => { if (v !== "" && v !== null && v !== undefined) ws.getCell(`${L(id)}${r}`).value = v; };
		/* `result` is the formula's answer, saved with it where it is known, so the
		   cell shows a number before Excel has worked the sheet out — in Protected
		   View, in a preview pane, on a phone. Excel still recalculates on open. */
		const calc = (id, formula, result) => {
			ws.getCell(`${L(id)}${r}`).value = result === undefined ? { formula } : { formula, result };
		};
		const ref = (id) => `${L(id)}${r}`;
		const money = (v) => (Number(v) ? Number(v) : undefined);
		const writePaymentSplit = (row) => {
			if (!splitCols) return;
			const [netCol, bankCol, cashCol] = splitCols;
			/* The person's own share when their record has one — half, say, or a
			   fixed sum — and the limit at the top of the sheet when it has not.
			   Written as the formula itself, so the file shows which rule paid whom. */
			const net = `MAX(0,${ref("CR")})`;
			/* Salary Mode Cash is all cash: nothing by bank, never the limit. */
			const allCash = String(p.salaryMode || "").trim().toLowerCase() === "cash";
			/* A person's own split is of the *salary*, as Salary Setup's sheet has
			   it (₹29,000 = ₹21,000 bank + ₹8,000 cash), so the cash part is that
			   share of the salary due and PF, ESI and the rest come out of the bank
			   part (HR, 13 October 2026). Cut for days not worked like the salary,
			   and never more than the net. A row with no monthly salary to take the
			   share of falls back to the net less the bank sum. */
			const due = ref("BL");
			const pct = Number(p.bankPercent);
			const amt = Number(p.bankAmount);
			const ownCash = allCash ? null
				: pct > 0 ? `MIN(${net},ROUND(${due}*${Number((100 - Math.min(pct, 100)).toFixed(4))}%,2))`
				: amt > 0 ? `IF(${ref("BE")}>0,MIN(${net},ROUND(${due}*MAX(0,${ref("BE")}-${amt})/${ref("BE")},2)),MAX(0,${net}-${amt}))`
					: null;
			const bank = allCash ? "0"
				: ownCash ? `MAX(0,${net}-${cashCol}${row})`
					: `MIN(${net},$${bankCol}$2)`;
			/* The Cash field on the Salary Structure Assignment (14 October 2026)
			   is paid beside the payroll salary, not out of it: the whole net goes
			   by bank and this is the cash, cut for days not worked like the
			   salary. It wins over the shares above, which split the net. */
			const extra = Number(p.cashPay) > 0 ? `ROUND(${Number(p.cashPay)}*IF(${ref("BE")}>0,MIN(1,${due}/${ref("BE")}),1),2)` : null;
			/* On Diff Cash only (HR, 14 October 2026): with an actual salary
			   (Employee Actual Salary), Net Payable is that, cut for days not
			   worked like the salary; the payroll net goes by bank and the cash is
			   the rest, so bank and cash add up to the actual salary. Cash-1 keeps
			   the payroll net and the Cash field. */
			const actual = !opts.cashTab && Number(p.actualSalary) > 0 ? `ROUND(${Number(p.actualSalary)}*IF(${ref("BE")}>0,MIN(1,${due}/${ref("BE")}),1),2)` : null;
			if (actual) {
				ws.getCell(`${netCol}${row}`).value = { formula: actual };
				ws.getCell(`${bankCol}${row}`).value = { formula: allCash ? "0" : `MIN(${net},${netCol}${row})` };
				ws.getCell(`${cashCol}${row}`).value = { formula: `MAX(0,${netCol}${row}-${bankCol}${row})` };
			} else {
				ws.getCell(`${netCol}${row}`).value = { formula: ref("CR") };
				ws.getCell(`${bankCol}${row}`).value = { formula: extra ? (allCash ? "0" : net) : bank };
				ws.getCell(`${cashCol}${row}`).value = { formula: extra ? (allCash ? `${net}+${extra}` : extra) : ownCash || `MAX(0,${ref("CR")}-${bankCol}${row})` };
			}
			for (const col of splitCols) {
				ws.getCell(`${col}${row}`).numFmt = '₹#,##0.00';
				ws.getCell(`${col}${row}`).alignment = { horizontal: "right", vertical: "middle" };
				ws.getCell(`${col}${row}`).border = { bottom: { style: "thin", color: { argb: "FFD9E1F2" } } };
			}
			if (!opts.cashTab) {
				ws.getCell(`${netCol}${row}`).font = { name: "Calibri", size: 10, bold: true };
				ws.getCell(`${cashCol}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
				ws.getCell(`${cashCol}${row}`).font = { name: "Calibri", size: 10, bold: true };
			}
		};

		put("A", p.srl);
		put("B", p.branch);
		put("C", p.code);
		put("D", p.name);
		put("E", p.gender);
		put("F", p.father);
		if (p.joined) put("G", new Date(`${String(p.joined).slice(0, 10)}T00:00:00Z`));

		p.days.forEach((v, k) => {
			const cell = ws.getCell(r, FIRST_DAY_COL + k);
			if (v !== "") cell.value = v;
			if (v === "SNDY") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(SUNDAY_FILL) } };
			cell.dataValidation = { type: "list", allowBlank: true, formulae: [`$B$${legendRow(0)}:$B$${legendRow(4)}`] };
		});

		const range = `${firstDay}${r}:${lastDay}${r}`;
		if (preview) {
			previewRow(p, r, put, calc, range);
			writePaymentSplit(r);
			return;
		}
		const a = attendanceOf(p, days);
		calc("AL", `SUM(${range})`, a.worked);
		calc("AM", `COUNTIF(${range},${SNDY})`, a.sundays);
		calc("AN", `COUNTIF(${range},${HOL})`, a.holidays);
		calc("AO", `(${firstDay}$4)-${ref("AL")}-${ref("AM")}-${ref("AN")}`, a.leave);
		/* Casual Leave off the ledger (registerRows `ledger`), as on the preview.
		   Without a ledger read the four stay empty — a balance worked out from
		   nothing would read as somebody having no leave. */
		if (p.clBrought !== "" && p.clBrought !== undefined) {
			put("AP", p.clBrought);
			put("AQ", p.clEarned);
			calc("AR", `${ref("AP")}+${ref("AQ")}`, a.available);
			calc("AS", `${ref("AR")}-${ref("AO")}`, a.balance);
		}
		put("AT", p.paymentDays);
		calc("AU", `(${firstDay}$4)-${ref("AT")}`, round2(days - (Number(p.paymentDays) || 0)));

		put("BA", money(p.overtime));
		put("BB", money(p.bata));
		put("BC", "Salary");
		put("BE", money(p.agreed));
		put("BF", money(p.basic));
		put("BG", money(p.da));
		put("BH", money(p.hra));
		put("BI", money(p.conveyance));
		put("BJ", money(p.other));
		calc("BK", `IF(${ref("BE")}>${ref("BL")},${ref("BE")}-${ref("BL")},0)`);
		put("BL", p.due);
		calc("BN", `${ref("BA")}+${ref("BB")}`);
		put("BO", money(p.food));
		put("BP", p.gross);

		put("BQ", p.pfMember ? "Yes" : "No");
		/* EPF wages by the calculation the 5-tab download was asked for. The PF
		   beside it stays the slip's own; this is what it was worked out on. */
		if (p.pfShare === 100 || p.pfShare === 50) {
			calc("BM", `IF(${ref("BQ")}="Yes",${ref("BL")}*${p.pfShare}%,0)`, p.pfMember ? round2((Number(p.due) || 0) * p.pfShare / 100) : 0);
		}
		put("BR", "No");
		put("BS", p.esiMember ? "Yes" : "No");
		calc("BU", ref("AT"));
		put("BV", money(p.pf));
		put("BW", money(p.esi));
		calc("BX", ref("BV"));
		calc("BY", ref("BW"));
		calc("BZ", `${ref("BP")}-${ref("BX")}-${ref("BY")}`);

		put("CB", money(p.advance));
		put("CD", money(p.loan));
		put("CK", money(p.ptax));
		put("CL", money(p.lwf));
		put("CM", p.deduction);
		if (p.unmapped && p.unmapped.length) {
			ws.getCell(`${L("CM")}${r}`).note = "Includes " + p.unmapped.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ") + " — no column of its own on this register.";
		}
		calc("CN", `${ref("BP")}-${ref("CM")}`);
		calc("CQ", `${ref("CN")}-${ref("CO")}`);
		put("CR", p.net);
		calc("CT", `$${firstDay}$4`);
		writePaymentSplit(r);
	});

	if (splitCols && rows.length) {
		const t = lastRow + 1;
		const [netCol, bankCol, cashCol] = splitCols;
		ws.getCell(`${netCol}${t}`).value = { formula: `SUM(${netCol}${first}:${netCol}${lastRow})` };
		ws.getCell(`${bankCol}${t}`).value = { formula: `SUM(${bankCol}${first}:${bankCol}${lastRow})` };
		ws.getCell(`${cashCol}${t}`).value = { formula: `SUM(${cashCol}${first}:${cashCol}${lastRow})` };
		for (const col of splitCols) {
			ws.getCell(`${col}${t}`).numFmt = '₹#,##0.00';
			ws.getCell(`${col}${t}`).font = { name: "Calibri", size: 10, bold: true };
			ws.getCell(`${col}${t}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
		}
	}

	/* The preview's totals, on the row under the last person, as in the sheet. */
	if (preview && rows.length) {
		const t = lastRow + 1;
		ws.getRow(t).height = ROW_HEIGHTS[6];
		for (let c = 1; c <= lastCol; c++) {
			const day = c >= FIRST_DAY_COL && c < FIRST_DAY_COL + days;
			paint(ws.getCell(t, c), STYLES[(day ? cols[FIRST_DAY_COL - 1] : cols[c - 1]).st[5]]);
		}
		for (const id of TOTALS) {
			const cell = ws.getCell(`${L(id)}${t}`);
			cell.value = { formula: `SUM(${L(id)}${first}:${L(id)}${lastRow})` };
			cell.font = { ...(cell.font || {}), bold: true };
			cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(YELLOW) } };
			cell.numFmt = "#,##0.00";
		}
	}

	/* Anything but 1, a half or nothing in a day's cell is a leave or a holiday, and
	   shows as it does in the original: pink with dark red writing. */
	if (rows.length) {
		const flag = (text) => ({
			type: "containsText", operator: "containsText", text,
			style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" } } },
		});
		ws.addConditionalFormatting({ ref: `${firstDay}${first}:${lastDay}${lastRow}`, rules: [flag("H"), flag("L")] });
	}

	/* The legend and the months, below the register, as in the original. */
	const redCentre = (cell) => {
		cell.font = { name: "Calibri", size: 11, color: { argb: "FFFF0000" } };
		cell.alignment = { horizontal: "center", vertical: "middle" };
		const edge = { style: "thin", color: { argb: "FF000000" } };
		cell.border = { left: edge, right: edge, top: edge, bottom: edge };
	};
	ws.getCell(`B${legendTop}`).value = "DO NOT DELETE";
	redCentre(ws.getCell(`B${legendTop}`));
	LEGEND.forEach((v, i) => {
		const cell = ws.getCell(`B${legendRow(i)}`);
		cell.value = v;
		redCentre(cell);
	});
	MONTHS.forEach((m, i) => { ws.getCell(`D${legendTop + 1 + i}`).value = m; });

	return ws;
}

/**
 * Every company's register in one workbook, a sheet each, as the company's own
 * file keeps them. Each sheet is what that company's month holds — the slips'
 * register, or the preview where there are no slips — and says which at its top.
 *
 * @param {{company: string, sheet?: string, rows: object[], preview?: boolean}[]} parts
 * @param {{ym: string, address?: string}} opts
 */
export async function registerBook(parts, { ym, address = "", bankCap = 20000 }) {
	const wb = await newBook();
	for (const p of parts) addRegisterSheet(wb, p.rows, {
		ym, company: p.company, address, preview: p.preview, sheet: p.sheet || p.company,
		paymentSplit: p.paymentSplit, cashTab: p.cashTab, bankCap: p.bankCap ?? bankCap,
	});
	return wb;
}

async function save(wb, filename) {
	const buf = await wb.xlsx.writeBuffer();
	const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Build and download. */
export async function registerXlsx(rows, opts) {
	const wb = await registerWorkbook(rows, opts);
	await save(wb, `wages-register-${isPreview(rows, opts) ? "preview-" : ""}${(opts.company || "group").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${opts.ym}.xlsx`);
}

/** Every company's register in one file, and download it. */
export async function registerBookXlsx(parts, opts) {
	const wb = await registerBook(parts, opts);
	await save(wb, `wages-register-all-companies-${opts.ym}.xlsx`);
}

/** The five-tab payroll design workbook, shaped on the attached register. */
export async function registerDesignBookXlsx(parts, opts) {
	const wb = await registerBook(parts, opts);
	await save(wb, `payroll-design-workbook-${opts.ym}.xlsx`);
}

