/* Reading an uploaded .xlsx or .csv into rows for lib/basepayimport.js, and the
   list HR fills in and uploads. ExcelJS is imported inside the functions, like
   lib/salarysheetxlsx.js, so the screens that never need it do not download it. */

import { plain } from "@/lib/basepayimport";

/** A File's bytes — the way the browser has of saying so, and the older one. */
const bytesOf = (file) => (file.arrayBuffer
	? file.arrayBuffer()
	: new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); }));

/** Comma-separated text → rows, with "quoted, commas" and doubled quotes. */
export function parseCsv(text) {
	const rows = []; let row = []; let cell = ""; let q = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (q) {
			if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
		} else if (ch === '"') q = true;
		else if (ch === ",") { row.push(cell); cell = ""; }
		else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell); rows.push(row); row = []; cell = "";
		} else cell += ch;
	}
	if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
	return rows;
}

/** The first sheet that has anything in it, as rows of plain values. */
export async function readTable(file) {
	if (/\.csv$/i.test(file.name || "")) return parseCsv(new TextDecoder().decode(await bytesOf(file)).replace(/^﻿/, ""));
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await bytesOf(file));
	const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
	if (!ws) return [];
	const out = [];
	ws.eachRow({ includeEmpty: true }, (row, r) => {
		const cells = [];
		row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = plain(c.value); });
		out[r - 1] = cells;
	});
	return Array.from(out, (r) => r || []);
}

/** The list of people still to set up, ready to fill in: code, name, and an empty pay column. */
export async function basePayTemplate(people, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet("Base pay");
	ws.addRow(["Employee Code", "Employee Name", "Monthly Base Pay"]);
	ws.getRow(1).font = { bold: true };
	for (const p of people) ws.addRow([p.employee_number || p.name, p.employee_name, null]);
	ws.getColumn(1).width = 18; ws.getColumn(2).width = 34; ws.getColumn(3).width = 20;
	ws.getColumn(3).numFmt = "#,##0.00";
	ws.views = [{ state: "frozen", ySplit: 1 }];
	void company;
	return wb;
}

export async function basePayTemplateXlsx(people, company) {
	const wb = await basePayTemplate(people, company);
	const buf = await wb.xlsx.writeBuffer();
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
	a.download = `base-pay-to-fill-${(company || "all").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
