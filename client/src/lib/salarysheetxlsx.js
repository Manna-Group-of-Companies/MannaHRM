/* The Salary Sheet as a real .xlsx — the company's heading, one row per person,
   every earning and deduction in a column of its own, and the month's totals.

   ExcelJS is imported inside the function, like lib/xlsx.js, so the screens that
   never export do not download it.

   Gross, Total Deductions and Net Pay are the Salary Slip's own figures, not
   formulas over the columns beside them: hrms lets a component opt out of the
   totals, and a sheet that quietly re-added the columns would disagree with the
   slip the person was given. The totals row *is* formulas, so the workbook still
   adds up when somebody edits a cell. A note under the table says so. */

import { HEAD_FILL, ZEBRA_FILL } from "@/lib/fills";
import { periodLabel } from "@/lib/salarysheet";
import { settleFormulas } from "@/lib/xlsxsettle";

const FONT = "Calibri";
const INK = "FF1F2937";
const MUTED = "FF6B7280";
const WHITE = "FFFFFFFF";
const SLATE = "FF374151";
const NET_FILL = "FFE2EFDA";
const TOTAL_FILL = "FFF3F4F6";
/* The two kinds of column worth being able to find across the room. */
const KIND_FILL = { encash: "FFD9F2E3", advance: "FFFCE4D6", loan: "FFFCE4D6" };
const KIND_TAG = { encash: "Leave encashment", advance: "Advance", loan: "Loan EMI" };

/* Lakh-and-crore grouping, which is how every rupee figure in an Indian payroll
   is read: 1,25,000.00 and not 125,000.00. Three conditions are all Excel allows,
   so a zero falls through to the last section and reads 0.00. */
const INR = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00";

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (argb) => ({ style: "thin", color: { argb } });
const grid = () => ({ top: side("FFD0D0D0"), left: side("FFD0D0D0"), bottom: side("FFD0D0D0"), right: side("FFD0D0D0") });

/** A column's letter, for the totals formulas. */
function letter(i) {
	let s = "";
	for (let c = i; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
	return s;
}

/**
 * Build the workbook. Separate from the download so a test can read it back.
 *
 * @param {object} sheet   buildSheet's return
 * @param {object} opts
 * @param {string} opts.ym          "2026-09"
 * @param {string} [opts.company]   the company the sheet is for; empty is the whole group
 * @param {object} [opts.info]      loadCompanyInfo's return
 * @param {string} [opts.address]   a line of address typed on the page
 * @param {object[]} [opts.loans]   groupForPosting's groups, each with `state`, for the second sheet
 */
export async function salarySheetWorkbook(sheet, opts) {
	const ExcelJS = (await import("exceljs")).default;
	const { ym, company = "", info = null, address = "", loans = [] } = opts;
	const { rows, earnCols, dedCols, totals } = sheet;

	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	const ws = wb.addWorksheet("Salary Sheet", {
		properties: { defaultRowHeight: 16 },
		pageSetup: {
			paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
			margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
		},
		headerFooter: { oddFooter: "&L&8Manna HR — Salary Sheet&R&8Page &P of &N" },
	});

	/* Columns, left to right. `key` is what the cell holds; the rest is how it
	   is drawn. Built as a list so the heading, the rows and the totals cannot
	   disagree about which column is which. */
	const cols = [
		{ head: "Emp ID", w: 11, left: true, val: (r) => r.employee },
		{ head: "Employee Name", w: 26, left: true, val: (r) => r.name },
		{ head: "Department", w: 18, left: true, val: (r) => r.department },
		{ head: "Designation", w: 18, left: true, val: (r) => r.designation },
		{ head: "Payment Days", w: 9, val: (r) => r.paymentDays, plain: true },
		{ head: "LWP Days", w: 8, val: (r) => r.lwp, plain: true },
		...earnCols.map((c) => ({ head: c.name, kind: c.kind, w: 15, money: true, sum: true, val: (r) => r.earn[c.name] || null })),
		{ head: "GROSS SALARY", w: 15, money: true, sum: true, strong: true, val: (r) => r.gross },
		...dedCols.map((c) => ({ head: c.name, kind: c.kind, w: 15, money: true, sum: true, val: (r) => r.ded[c.name] || null })),
		{ head: "TOTAL DEDUCTIONS", w: 15, money: true, sum: true, strong: true, val: (r) => r.deduction },
		{ head: "NET PAY", w: 15, money: true, sum: true, strong: true, net: true, val: (r) => r.net },
		{ head: "Slip", w: 11, val: (r) => r.state },
	];
	const width = cols.length;

	const band = (text, { size = 10, bold = false, fill, color = INK, italic = false, height = 16 } = {}) => {
		const r = ws.addRow([text]);
		ws.mergeCells(r.number, 1, r.number, width);
		const cell = r.getCell(1);
		cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
		cell.font = { name: FONT, size, bold, italic, color: { argb: color } };
		if (fill) cell.fill = solid(fill);
		r.height = height;
	};

	const heading = info?.name || company || "MANNA GROUP";
	band(heading, { size: 15, bold: true, fill: HEAD_FILL, color: WHITE, height: 26 });
	if (address) band(address);
	const ids = [
		info?.tax_id && `GSTIN / Tax ID: ${info.tax_id}`,
		info?.registration && String(info.registration).replace(/\s+/g, " ").trim(),
		info?.phone && `Phone: ${info.phone}`,
		info?.email && `Email: ${info.email}`,
		info?.website && info.website,
	].filter(Boolean);
	if (ids.length) band(ids.join("   |   "), { size: 9, color: MUTED });
	band(`SALARY STATEMENT — ${periodLabel(ym).toUpperCase()}`, { size: 12, bold: true, height: 22 });
	ws.addRow([]).height = 6;

	const head = ws.addRow(cols.map((c) => (c.kind ? `${c.head}\n(${KIND_TAG[c.kind]})` : c.head)));
	head.height = 46;
	head.eachCell((cell, i) => {
		const c = cols[i - 1];
		cell.font = { name: FONT, bold: true, size: 10, color: { argb: c.kind ? INK : WHITE } };
		cell.fill = solid(c.kind ? KIND_FILL[c.kind] : c.strong ? SLATE : HEAD_FILL);
		cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
		cell.border = grid();
	});
	ws.views = [{ state: "frozen", xSplit: 2, ySplit: head.number, showGridLines: false }];
	ws.pageSetup.printTitlesRow = `${head.number}:${head.number}`;

	const first = head.number + 1;
	rows.forEach((r, i) => {
		const row = ws.addRow(cols.map((c) => { const v = c.val(r); return v == null ? "" : v; }));
		row.height = 18;
		row.eachCell({ includeEmpty: true }, (cell, k) => {
			const c = cols[k - 1];
			cell.border = grid();
			cell.font = { name: FONT, size: 10, bold: Boolean(c.strong), color: { argb: INK } };
			cell.alignment = { vertical: "middle", horizontal: c.left ? "left" : c.money ? "right" : "center", indent: c.left ? 1 : 0 };
			if (c.money) cell.numFmt = INR;
			if (c.plain) cell.numFmt = "0.##";
			if (c.net) cell.fill = solid(NET_FILL);
			else if (i % 2) cell.fill = solid(ZEBRA_FILL);
		});
	});
	const last = first + rows.length - 1;

	/* The totals are live formulas over the rows above. Nothing to total with no
	   rows, and a SUM over an empty range would print a row of zeros under a
	   table that says nobody was paid. */
	if (rows.length) {
		const t = ws.addRow(cols.map((c, i) => (c.sum ? { formula: `SUM(${letter(i + 1)}${first}:${letter(i + 1)}${last})` } : "")));
		t.getCell(2).value = `TOTAL — ${rows.length} ${rows.length === 1 ? "person" : "people"}`;
		t.height = 20;
		t.eachCell({ includeEmpty: true }, (cell, k) => {
			const c = cols[k - 1];
			cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
			cell.fill = solid(c.net ? NET_FILL : TOTAL_FILL);
			cell.border = grid();
			cell.alignment = { vertical: "middle", horizontal: c.left ? "left" : "right", indent: c.left ? 1 : 0 };
			if (c.money) cell.numFmt = INR;
		});
	}

	ws.addRow([]).height = 6;
	band(
		"Gross Salary, Total Deductions and Net Pay are the figures on each Frappe HR salary slip. "
		+ "Columns tinted green are leave encashment; columns tinted orange are advance and loan instalments recovered this month. "
		+ `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
		{ size: 8, italic: true, color: MUTED, height: 28 },
	);

	cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
	settleFormulas(ws);

	if (loans.length) {
		const ls = wb.addWorksheet("Loans & Advances", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
		ls.mergeCells(1, 1, 1, 6);
		const title = ls.getCell(1, 1);
		title.value = `${heading} — Loan & advance deductions, ${periodLabel(ym)}`;
		title.font = { name: FONT, size: 13, bold: true, color: { argb: WHITE } };
		title.fill = solid(HEAD_FILL);
		title.alignment = { horizontal: "center", vertical: "middle" };
		ls.getRow(1).height = 24;
		const lh = ls.getRow(3);
		["Emp ID", "Employee", "Salary component", "Loan(s)", "Deducted this month", "Salary slip"]
			.forEach((h, i) => {
				const cell = lh.getCell(i + 1);
				cell.value = h;
				cell.font = { name: FONT, bold: true, size: 10, color: { argb: WHITE } };
				cell.fill = solid(HEAD_FILL);
				cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
				cell.border = grid();
			});
		lh.height = 32;
		const WORDS = { on: "On the slip", missing: "Not on the slip — make it again", noslip: "No slip yet" };
		loans.forEach((g, i) => {
			const row = ls.getRow(4 + i);
			[g.employee, g.employee_name, g.component, g.loans.join(", "), g.amount, WORDS[g.state] || ""]
				.forEach((v, k) => {
					const cell = row.getCell(k + 1);
					cell.value = v;
					cell.font = { name: FONT, size: 10, color: { argb: INK } };
					cell.border = grid();
					if (k === 4) { cell.numFmt = INR; cell.alignment = { horizontal: "right" }; }
					if (i % 2) cell.fill = solid(ZEBRA_FILL);
				});
		});
		[11, 26, 22, 28, 18, 32].forEach((w, i) => { ls.getColumn(i + 1).width = w; });
	}

	return wb;
}

/** Build and download. */
export async function salarySheetXlsx(sheet, opts) {
	const wb = await salarySheetWorkbook(sheet, opts);
	const buf = await wb.xlsx.writeBuffer();
	const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = `salary-sheet-${(opts.company || "group").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${opts.ym}.xlsx`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
