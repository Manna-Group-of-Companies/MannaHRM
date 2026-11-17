import { describe, expect, it, vi } from "vitest";

/* The .xlsx a Factor HR style sheet becomes, read back the way Excel reads it. */
const saved = [];
vi.mock("../src/lib/csv.js", async (orig) => ({ ...(await orig()), save: (name, buf) => saved.push({ name, buf }) }));

import ExcelJS from "exceljs";
import { sheetsXlsx } from "../src/lib/export.js";
import { inOutSheet, shiftReportSheet } from "../src/lib/fhreport.js";

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

	it("In / Out Activities: lines in column C, heading at row 6, a bordered row per punch, by person then time", async () => {
		const byName = { E1: { employee_number: "HRI-053", employee_name: "SACHIN THITHIO" }, E2: { employee_number: "HPT-001", employee_name: "CHARLEYS JOSEPH" } };
		const sh = inOutSheet({
			punches: [
				{ employee: "E1", time: "2026-11-03 18:02:21", log_type: "IN", device_id: "BIO-CGKK211162173" },
				{ employee: "E1", time: "2026-11-03 08:25:39", log_type: "IN", device_id: "BIO-CGKK211162173" },
				{ employee: "E2", time: "2026-11-03 08:29:29", log_type: "IN", device_id: "Keezhillam_NEW", latitude: 9.5, longitude: 76.5 },
			],
			byName, places: [], from: "2026-11-03", to: "2026-11-03", company: "Hi-Tech Pretreads",
		});
		expect(sh.rows.map((r) => [r[0], r[1], r[8]])).toEqual([[1, "HPT-001", ""], [2, "HRI-053", ""], [3, "HRI-053", "09:36:42"]]);

		await sheetsXlsx([sh], "io.xlsx");
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(saved.at(-1).buf);
		const ws = wb.worksheets[0];
		expect(ws.getCell(1, 3).value).toBe("HI-TECH PRETREADS");
		expect(ws.getCell(1, 3).font.bold).toBe(true);
		expect(ws.getCell(2, 3).value).toBe("In / Out Activities Report");
		expect(ws.getCell(4, 3).value).toBe("Date From: 03-Nov-2026 - Date Till: 03-Nov-2026");
		expect(ws.getCell(6, 1).value).toBe("S#");
		expect(ws.getCell(6, 13).value).toBe("Location Link");
		expect(ws.views[0].ySplit).toBe(6);
		expect(ws.getCell(7, 7).numFmt).toBe("ddd dd-mmm-yy");
		expect(ws.getCell(7, 8).numFmt).toBe("hh:mm:ss AM/PM");
		expect(ws.getCell(7, 1).border.left.style).toBe("thin");
		expect(ws.getCell(7, 13).value.text).toBe("View Map");
	});
});
