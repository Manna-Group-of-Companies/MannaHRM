/* The Bank Transfer sheet as a real .xlsx — the company's heading, one row per
   person with where they are paid, each person's whole net pay, and a total.
   ExcelJS is imported inside the function so the screens that never export do
   not download it. Net pay is the Salary Slip's own figure; the totals row is
   formulas, so the workbook still adds up if somebody edits a cell. */

import { HEAD_FILL } from "@/lib/fills";
import { bankColumns, bankLine } from "@/lib/banksheet";
import { periodLabel } from "@/lib/salarysheet";

const INR = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00";

/* `title` and `amountHead` (22 October 2026) are a festival bonus's: the same
   sheet for the bank, headed with the festival and its amount called Bonus. */
export async function bankSheetWorkbook(sheet, { ym, company = "", info = null, address = "", title = "", amountHead = "" }) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Bank transfer");
	const cols = bankColumns.length;
	const line = (text, font) => {
		const r = ws.addRow([text]);
		ws.mergeCells(r.number, 1, r.number, cols);
		r.getCell(1).font = font;
		r.getCell(1).alignment = { horizontal: "center" };
	};
	line((info && info.name) || company || "All companies", { name: "Calibri", size: 14, bold: true });
	const sub = [address, info && info.registration && `Reg: ${info.registration}`, info && info.tax_id && `GSTIN/Tax ID: ${info.tax_id}`].filter(Boolean).join("   ");
	if (sub) line(sub, { name: "Calibri", size: 10, color: { argb: "FF6B7280" } });
	line(title || `BANK TRANSFER — ${periodLabel(ym).toUpperCase()}`, { name: "Calibri", size: 12, bold: true });
	ws.addRow([]);

	const head = ws.addRow(amountHead ? [...bankColumns.slice(0, -1), amountHead] : bankColumns);
	head.eachCell((c) => {
		c.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	const first = head.number + 1;
	for (const r of sheet.rows) {
		const x = ws.addRow(bankLine(r));
		x.getCell(cols).numFmt = INR;
		if (r.mode !== "Bank") x.getCell(6).font = { name: "Calibri", color: { argb: "FFB45309" } };
	}
	const last = first + sheet.rows.length - 1;
	const tot = ws.addRow(["", "TOTAL", "", "", "", "", sheet.rows.length ? { formula: `SUM(${"G"}${first}:${"G"}${last})`, result: sheet.totals.net } : 0]);
	tot.font = { name: "Calibri", bold: true };
	tot.getCell(cols).numFmt = INR;
	ws.addRow([]);
	const note = ws.addRow([`Paid by bank: ${sheet.totals.bankCount} people. No bank details or paid another way: ${sheet.totals.otherCount} people.`]);
	ws.mergeCells(note.number, 1, note.number, cols);
	note.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF6B7280" } };
	[12, 26, 22, 22, 14, 18, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	return wb;
}

export async function bankSheetXlsx(sheet, opts) {
	const wb = await bankSheetWorkbook(sheet, opts);
	const buf = await wb.xlsx.writeBuffer();
	const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = opts.filename || `bank-transfer-${(opts.company || "group").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${opts.ym}.xlsx`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
