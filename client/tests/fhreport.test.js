import { describe, expect, it } from "vitest";

import { daysBetween, fhDate, fhLines, shiftReportSheet } from "../src/lib/fhreport.js";

/* ---------------------------------------------------------------------------
   Attendance reports in Factor HR's Excel layout (17 November 2026). The
   shapes below are read off Factor HR's own Employee Shift Report for
   November 2026.
   --------------------------------------------------------------------------- */

const HOL = [{ holiday_date: "2026-11-01", weekly_off: 1, description: "Sunday" }];
const base = {
	companies: [{ name: "Hi-Tech Rubber Industries", default_holiday_list: "Manna Holidays 2026-27" }],
	holidays: { "Manna Holidays 2026-27": HOL },
	from: "2026-11-01",
	to: "2026-11-03",
	company: "Hi-Tech Rubber Industries",
};
const SACHIN = { name: "HR-EMP-00064", employee_number: "HRI-053", employee_name: "SACHIN THITHIO", status: "Active",
	company: "Hi-Tech Rubber Industries", date_of_joining: "2024-03-01", default_shift: "Hi-Tech Rubber Industries-Production shift1" };

describe("Factor HR's report header", () => {
	it("is the company, the title with its trailing space, the filter, and the date range", () => {
		expect(fhLines({ company: "Hi-Tech Pretreads", title: "Employee Shift Report", filters: ["Employee Status: Active"], from: "2026-11-01", to: "2026-11-30" }))
			.toEqual(["HI-TECH PRETREADS", "Employee Shift Report ", "Employee Status: Active", "Date From: 01-Nov-2026 - Date Till: 30-Nov-2026"]);
	});

	it("writes a date as 01-Nov-2026", () => {
		expect(fhDate("2026-11-01")).toBe("01-Nov-2026");
	});

	it("counts the days of a range, both ends included", () => {
		expect(daysBetween("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
	});
});

describe("Employee Shift Report, as Factor HR's", () => {
	it("has Factor HR's columns in Factor HR's order, then a column per day", () => {
		const sh = shiftReportSheet({ ...base, emps: [SACHIN], assignments: [] });
		expect(sh.head.slice(0, 13)).toEqual(["S/No", "Employee Code", "Employee Name", "Date Of Joining", "WeekOff",
			"Company Name", "Gratuity Applicable", "LWF Applicable", "Shift Pattern", "Effective Date",
			"Work Schedule Name", "Attendance Policy Name", "Remarks"]);
		expect(sh.head.slice(13).map((d) => d.getDate())).toEqual([1, 2, 3]);
		expect(sh.factohr).toBe(true);
	});

	it("marks a weekly off W/Off and names the weekday under WeekOff", () => {
		const [row] = shiftReportSheet({ ...base, emps: [SACHIN], assignments: [] }).rows;
		expect(row.slice(0, 3)).toEqual([1, "HRI-053", "SACHIN THITHIO"]);
		expect(row[4]).toBe("Sunday");
		expect(row[5]).toBe("HI-TECH RUBBER INDUSTRIES");
		expect(row.slice(13)).toEqual(["W/Off", "Hi-Tech Rubber Industries-Production shift1", "Hi-Tech Rubber Industries-Production shift1"]);
	});

	it("a dated shift beats the working time on its days only, as a rotation does", () => {
		const night = [{ employee: SACHIN.name, shift_type: "Night", start_date: "2026-11-03", end_date: "2026-11-07" }];
		const [row] = shiftReportSheet({ ...base, emps: [SACHIN], assignments: night }).rows;
		expect(row.slice(14)).toEqual(["Hi-Tech Rubber Industries-Production shift1", "Night"]);
	});

	it("leaves Factor HR's own fields empty rather than guessing them", () => {
		const [row] = shiftReportSheet({ ...base, emps: [SACHIN], assignments: [] }).rows;
		expect([row[6], row[7], row[9], row[11], row[12]]).toEqual(["", "", "", "", ""]);
	});

	it("lists only active people, by Employee Code, numbered from one", () => {
		const left = { ...SACHIN, name: "X", employee_number: "HRI-001", status: "Left" };
		const other = { ...SACHIN, name: "Y", employee_number: "HRI-003" };
		const rows = shiftReportSheet({ ...base, emps: [SACHIN, left, other], assignments: [] }).rows;
		expect(rows.map((r) => [r[0], r[1]])).toEqual([[1, "HRI-003"], [2, "HRI-053"]]);
	});
});
