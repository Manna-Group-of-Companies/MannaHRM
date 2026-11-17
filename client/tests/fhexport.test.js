import { describe, expect, it, vi } from "vitest";

/* The .xlsx a Factor HR style sheet becomes, read back the way Excel reads it. */
const saved = [];
vi.mock("../src/lib/csv.js", async (orig) => ({ ...(await orig()), save: (name, buf) => saved.push({ name, buf }) }));

import ExcelJS from "exceljs";
import { sheetsXlsx } from "../src/lib/export.js";
import { shiftReportSheet } from "../src/lib/fhreport.js";

describe("a Factor HR style sheet in Excel", () => {
	it("is four bold lines, two empty rows, a bold centred heading at row 7 frozen under it, and no fills", async () => {
		const sh = shiftReportSheet({
			emps: [{ name: "E", employee_number: "HRI-053", employee_name: "SACHIN THITHIO", status: "Active",
				company: "Hi-Tech Rubber Industries", date_of_joining: "2024-03-01", default_shift: "Day" }],
			companies: [], holidays: {}, assignments: [], from: "2026-11-01", to: "2026-11-02", company: "Hi-Tech Pretreads",
		});
		await sheetsXlsx([sh], "t.xlsx");
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(saved.at(-1).buf);
		const ws = wb.worksheets[0];

		expect([1, 2, 3, 4].map((r) => ws.getCell(r, 1).value)).toEqual([
			"HI-TECH PRETREADS", "Employee Shift Report ", "Employee Status: Active", "Date From: 01-Nov-2026 - Date Till: 02-Nov-2026"]);
		expect(ws.getCell(1, 1).font.bold).toBe(true);
		expect(ws.getCell(6, 1).value).toBeNull();
		expect(ws.getCell(7, 1).value).toBe("S/No");
		expect(ws.getCell(7, 1).font.bold).toBe(true);
		expect(ws.getCell(7, 1).alignment.horizontal).toBe("center");
		expect(ws.getCell(7, 14).numFmt).toBe("ddd dd-mmm-yy");
		expect(ws.views[0].ySplit).toBe(7);
		expect(ws.getCell(8, 2).value).toBe("HRI-053");
		expect(ws.getCell(8, 4).numFmt).toBe("dd-mmm-yyyy");
		expect(ws.getCell(8, 2).fill?.fgColor).toBeUndefined();
		expect(ws.getCell(8, 2).border?.left).toBeUndefined();
	});
});
