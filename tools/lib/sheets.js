/**
 * Reading and writing the spreadsheets these scripts live on.
 *
 * One module because all eight tools need the same three things — rows out of
 * an .xlsx, rows out of a .csv, and a styled .xlsx back — and eight copies of
 * `getRow(i).values` slicing off ExcelJS's leading null is eight chances to get
 * it wrong once.
 */

import fs from "node:fs";
import ExcelJS from "exceljs";

/* ExcelJS returns a row as a 1-indexed array with `null` at [0], because
   spreadsheet columns start at 1 and JavaScript arrays do not. Every read here
   goes through this, so that off-by-one exists in exactly one place. */
const rowValues = (row, width) => {
	const v = row.values || [];
	const out = [];
	for (let i = 1; i <= width; i++) {
		const cell = v[i];
		if (cell === null || cell === undefined) { out.push(null); continue; }
		// A formula cell arrives as {formula, result}; the result is the value.
		if (typeof cell === "object" && !(cell instanceof Date)) {
			out.push(cell.result ?? cell.text ?? cell.hyperlink ?? null);
			continue;
		}
		out.push(cell);
	}
	return out;
};

/** Every sheet in a workbook, as `{name, rows}` with rows as plain arrays. */
export async function readXlsx(path, { maxRows = 0 } = {}) {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.readFile(path);
	return wb.worksheets.map((ws) => {
		const width = ws.columnCount;
		const rows = [];
		const limit = maxRows ? Math.min(maxRows, ws.rowCount) : ws.rowCount;
		for (let i = 1; i <= limit; i++) rows.push(rowValues(ws.getRow(i), width));
		return { name: ws.name, rows, totalRows: ws.rowCount };
	});
}

/** The first sheet's rows, which is what most of these exports carry. */
export async function readFirstSheet(path, opts) {
	const sheets = await readXlsx(path, opts);
	return sheets.length ? sheets[0].rows : [];
}

/* Factor HR exports from an Indian tenant are usually cp1252, occasionally
   utf-8-sig. Trying in order beats failing on one stray rupee sign. */
const ENCODINGS = ["utf-8", "latin1"];

/** Rows out of a .csv, with the encoding it decoded as. */
export function readCsv(path, { maxRows = 0 } = {}) {
	const buf = fs.readFileSync(path);
	let text = null;
	let encoding = null;
	for (const enc of ENCODINGS) {
		const t = buf.toString(enc);
		// U+FFFD is what a bad decode leaves behind.
		if (!t.includes("�")) { text = t; encoding = enc; break; }
	}
	if (text === null) { text = buf.toString("latin1"); encoding = "latin1"; }
	if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

	const rows = parseCsv(text, maxRows);
	return { rows, encoding };
}

/** A CSV parser that understands quotes, embedded commas and embedded
    newlines. Hand-written rather than pulled in: it is thirty lines, and these
    files decide what gets imported into a payroll system. */
export function parseCsv(text, maxRows = 0) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
			} else field += c;
			continue;
		}
		if (c === '"') { quoted = true; continue; }
		if (c === ",") { row.push(field); field = ""; continue; }
		if (c === "\r") continue;
		if (c === "\n") {
			row.push(field); field = "";
			rows.push(row); row = [];
			if (maxRows && rows.length >= maxRows) return rows;
			continue;
		}
		field += c;
	}
	if (field !== "" || row.length) { row.push(field); rows.push(row); }
	return rows;
}

const needsQuote = (s) => /[",\n\r]/.test(s);

export const csvCell = (v) => {
	const s = v === null || v === undefined ? "" : String(v);
	return needsQuote(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Header plus body, CRLF-terminated because that is what Excel expects. */
export const toCsv = (cols, rows) =>
	[cols.map(csvCell).join(",")].concat(rows.map((r) => r.map(csvCell).join(","))).join("\r\n");

/** A BOM so Excel reads it as UTF-8 rather than as Latin-1, which is what turns
    every name with an accent in it into mojibake. */
export function writeCsv(path, cols, rows) {
	fs.writeFileSync(path, "﻿" + toCsv(cols, rows), "utf8");
}

/* The header style these import files carry. ERPNext does not care, but a human
   checking one before pressing Import does, and these get checked. */
const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E2DE" } };

/**
 * Write one or more sheets to a styled .xlsx.
 *
 * @param {string} path
 * @param {{name: string, cols: string[], rows: any[][], widths?: number[]}[]} sheets
 */
export async function writeXlsx(path, sheets) {
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR tools";
	wb.created = new Date();

	for (const sheet of sheets) {
		const ws = wb.addWorksheet(sheet.name);
		ws.addRow(sheet.cols);
		for (const r of sheet.rows) ws.addRow(r);

		const head = ws.getRow(1);
		head.font = { bold: true };
		head.fill = HEAD_FILL;
		head.alignment = { vertical: "middle", horizontal: "left" };
		// Frozen so a 500-row import file can still be read at row 400.
		ws.views = [{ state: "frozen", ySplit: 1 }];

		sheet.cols.forEach((c, i) => {
			const explicit = sheet.widths?.[i];
			if (explicit) { ws.getColumn(i + 1).width = explicit; return; }
			const longest = Math.max(
				String(c).length,
				...sheet.rows.slice(0, 200).map((r) => String(r[i] ?? "").length),
			);
			ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 42);
		});
	}

	await wb.xlsx.writeFile(path);
}

/** `mkdir -p` for an output directory, so a tool can be run from a clean clone. */
export const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
