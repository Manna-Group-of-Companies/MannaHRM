/* ---------------------------------------------------------------------------
   Any report as an .xlsx or a .pdf — one table per report, several reports per
   file.

   `lib/xlsx.js` builds two hand-laid sheets that HR compares cell for cell
   against Factor HR's; this is the other kind, a plain table with a title
   over it, which is what every other report here is. A "sheet" is:

     { title, sub, head: [string], rows: [[string|number]], note, color?, tint? }

   `color` and `tint` are optional `[r, g, b]` for the PDF's header and zebra
   stripe — Export Employees Data gives each of its sections its own.

   and the same list goes to both writers, so an Excel and a PDF of the same
   report cannot disagree about a column.

   Both libraries are imported inside the function that needs them, for the
   reason `lib/xlsx.js` gives: every screen that never exports should not pay to
   parse ExcelJS or jsPDF.
   --------------------------------------------------------------------------- */

import { save } from "./csv.js";
import { rgbOf } from "@/lib/fills";
import { nowStamp } from "@/lib/format";

/** Tags and entities off a spec's HTML note, for a file that cannot draw them. */
export const plain = (html) => String(html || "")
	.replace(/<[^>]+>/g, "")
	.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
	.replace(/\s+/g, " ").trim();

/** A file name from a title: `Present Report` → `present-report`. */
export const slug = (t) => String(t || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Excel's own limits on a sheet name — 31 characters, none of `[]:*?/\`, and
 * unique in the workbook. Breaking any of them is not an error ExcelJS raises
 * but a file Excel offers to "repair" by deleting the sheet.
 */
export function sheetNames(titles) {
	const used = new Set();
	return titles.map((t) => {
		const base = String(t || "Sheet").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
		let n = base;
		for (let i = 2; used.has(n.toLowerCase()); i++) n = base.slice(0, 31 - String(i).length - 1) + " " + i;
		used.add(n.toLowerCase());
		return n;
	});
}

/* Local time, not toISOString: at UTC+5:30 that stamped every file five and a
   half hours early, with no zone to say so. */
const stamp = nowStamp;

/** One workbook, one worksheet per sheet. */
export async function sheetsXlsx(sheets, name) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	const names = sheetNames(sheets.map((s) => s.title));

	sheets.forEach((sh, si) => {
		const width = Math.max(sh.head.length, 1);
		const ws = wb.addWorksheet(names[si], {
			pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
		});
		const banner = (text, font) => {
			const r = ws.addRow([text]);
			if (width > 1) ws.mergeCells(r.number, 1, r.number, width);
			r.getCell(1).font = font;
			r.getCell(1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
			return r;
		};
		banner("MANNA GROUP", { bold: true, size: 14 });
		banner(sh.title, { bold: true, size: 12 });
		if (sh.sub) banner(sh.sub, { size: 10 });
		ws.addRow([]);

		const head = ws.addRow(sh.head);
		head.eachCell((c) => {
			c.font = { bold: true, color: { argb: "FFFFFFFF" } };
			c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sh.headFill || "FF2F5496" } };
			c.alignment = { vertical: "middle", wrapText: true };
			c.border = thin();
		});
		ws.views = [{ state: "frozen", ySplit: head.number }];
		if (sh.rows.length) ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: width } };

		/* `zebra` bands every other row; `cellFill(value, heading, cells, row,
		   col)` colours a single cell, and wins over the band. Both optional, so
		   every other report's file is unchanged. */
		const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
		sh.rows.forEach((cells, ri) => {
			ws.addRow(cells).eachCell({ includeEmpty: true }, (c, ci) => {
				c.border = thin();
				const t = sh.cellFill ? sh.cellFill(cells[ci - 1], sh.head[ci - 1], cells, ri, ci - 1) : null;
				if (t) c.fill = solid(t);
				else if (sh.zebra && ri % 2) c.fill = solid(sh.zebra);
			});
		});
		if (!sh.rows.length) banner("No rows.", { italic: true, size: 10 });

		ws.addRow([]);
		if (sh.note) {
			const r = banner(sh.note, { italic: true, size: 9 });
			/* A merged, wrapped cell does not grow on its own in Excel; the note
			   is the report's caveat, so it is given the height to be read. */
			r.height = Math.min(120, 14 * Math.ceil(sh.note.length / 140));
		}
		banner(`Generated ${stamp()} from Manna HR.`, { italic: true, size: 8, color: { argb: "FF808080" } });

		/* Widths off the content, capped: a long address should wrap rather than
		   push every column after it off the page. */
		sh.head.forEach((h, i) => {
			let w = String(h).length;
			for (const r of sh.rows) w = Math.max(w, String(r[i] ?? "").length);
			ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 8), 45);
		});
	});

	const buf = await wb.xlsx.writeBuffer();
	save(name, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/** One PDF, each sheet starting on a page of its own. Landscape, because
    every report here is wider than it is long. */
export async function sheetsPdf(sheets, name) {
	const { jsPDF } = await import("jspdf");
	const { autoTable } = await import("jspdf-autotable");
	const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
	const W = doc.internal.pageSize.getWidth();
	const M = 36;

	sheets.forEach((sh, si) => {
		if (si > 0) doc.addPage();
		let y = M;
		doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90);
		doc.text("MANNA GROUP", M, y);
		y += 18;
		doc.setFontSize(14);
		if (sh.color) doc.setTextColor(...sh.color);
		else doc.setTextColor(20);
		doc.text(pdfText(sh.title), M, y);
		y += 14;
		if (sh.sub) {
			doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
			doc.text(pdfText(sh.sub), M, y);
			y += 10;
		}

		autoTable(doc, {
			startY: y + 6,
			margin: { left: M, right: M, bottom: M + 10 },
			head: [sh.head.map(pdfText)],
			body: sh.rows.length ? sh.rows.map((r) => r.map(pdfText)) : [[{ content: "No rows.", colSpan: Math.max(sh.head.length, 1) }]],
			styles: { fontSize: sh.head.length > 10 ? 6.5 : 8, cellPadding: 3, overflow: "linebreak" },
			headStyles: { fillColor: sh.color || rgbOf(sh.headFill) || [47, 84, 150], textColor: 255 },
			alternateRowStyles: { fillColor: sh.tint || rgbOf(sh.zebra) || [245, 247, 250] },
			/* The same cell colours the spreadsheet gets, so the two files agree. */
			didParseCell: sh.cellFill && sh.rows.length ? (h) => {
				if (h.section !== "body") return;
				const cells = sh.rows[h.row.index];
				const c = sh.cellFill(cells[h.column.index], sh.head[h.column.index], cells, h.row.index, h.column.index);
				if (c) h.cell.styles.fillColor = rgbOf(c);
			} : undefined,
		});

		let end = doc.lastAutoTable ? doc.lastAutoTable.finalY + 14 : y + 20;
		if (sh.note) {
			doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(90);
			const lines = doc.splitTextToSize(pdfText(sh.note), W - 2 * M);
			if (end + lines.length * 10 > doc.internal.pageSize.getHeight() - M) { doc.addPage(); end = M; }
			doc.text(lines, M, end);
		}
	});

	/* Page numbers last, once the count is known. */
	const n = doc.getNumberOfPages();
	for (let p = 1; p <= n; p++) {
		doc.setPage(p);
		doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(130);
		const H = doc.internal.pageSize.getHeight();
		doc.text(`Generated ${stamp()} from Manna HR`, M, H - 18);
		doc.text(`Page ${p} of ${n}`, W - M, H - 18, { align: "right" });
	}

	save(name, doc.output("arraybuffer"), "application/pdf");
}

/* jsPDF's built-in fonts are WinAnsi only. A character outside it — an emoji,
   a Tamil or Malayalam name — prints as a run of garbage glyphs rather than
   failing, so it is swapped for `?`, which at least reads as "not shown". */
function pdfText(v) {
	return String(v ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
		.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff–—•…]/g, "?");
}

function thin() {
	const side = { style: "thin", color: { argb: "FFD0D0D0" } };
	return { top: side, left: side, bottom: side, right: side };
}
