import { describe, expect, it } from "vitest";

import { LEGEND, columnsOf, dayCell, daysIn, fillFromPunches, registerChecks, registerRows, weekday } from "@/lib/register";
import { letter, registerBook, registerWorkbook, sheetName } from "@/lib/registerxlsx";
import { buildSheet } from "@/lib/salarysheet";

/* A formula cell as it is saved: the formula and the answer beside it. ExcelJS
   keeps an answer of 0 in the file but leaves it off `.value`, so read the model. */
const saved = (cell) => ({ formula: cell.model.formula, result: cell.model.result });
import { structureFor } from "@/lib/payroll";

/* The wages register: the company's own Form 25 layout, laid over a month's real
   slips. Every figure is the slip's; there is no second "for filing" pay. */

const slip = (employee, name, gross, ded, net, extra = {}) => ({
	name: "SAL-" + employee, employee, employee_name: name, docstatus: 1, payment_days: 30,
	gross_pay: gross, total_deduction: ded, net_pay: net, ...extra,
});
const line = (parent, parentfield, salary_component, amount, idx) => ({ parent, parentfield, salary_component, amount, idx });

const slips = [slip("E1", "Anand", 21000, 1600, 19400), slip("E2", "Bindu", 30000, 2000, 28000)];
const details = [
	line("SAL-E1", "earnings", "Basic", 12000, 1), line("SAL-E1", "earnings", "House Rent Allowance", 5000, 2),
	line("SAL-E1", "earnings", "Overtime", 1000, 3), line("SAL-E1", "earnings", "Special Allowance", 3000, 4),
	line("SAL-E1", "deductions", "Provident Fund", 1200, 1), line("SAL-E1", "deductions", "Professional Tax", 200, 2),
	line("SAL-E1", "deductions", "Salary Advance", 200, 3),
	line("SAL-E2", "earnings", "Basic", 30000, 1), line("SAL-E2", "deductions", "Employee State Insurance", 2000, 1),
];
const sheet = buildSheet({ slips, details });

describe("the register's days", () => {
	it("counts the days of the month and finds Sundays", () => {
		expect(daysIn("2026-09")).toBe(30);
		expect(daysIn("2026-10")).toBe(31);
		expect(daysIn("2028-02")).toBe(29);
		expect(weekday("2026-09", 6)).toBe(0);
	});

	it("says what a day was", () => {
		expect(dayCell("Present")).toBe(1);
		expect(dayCell("Work From Home")).toBe(1);
		expect(dayCell("Half Day")).toBe(0.5);
		expect(dayCell("On Leave")).toBe("L");
		expect(dayCell(undefined, { sunday: true })).toBe("SNDY");
		expect(dayCell(undefined, { holiday: true })).toBe("HOL");
		expect(dayCell("Absent")).toBe(0);
		expect(dayCell(undefined)).toBe("");
		/* Somebody who came in on a Sunday is present, not off. */
		expect(dayCell("Present", { sunday: true })).toBe(1);
		expect(LEGEND).toEqual([1, 0.5, "L", "SNDY", "HOL"]);
	});
});

describe("which slip lines go in which column", () => {
	it("sorts earnings and deductions by what they are, and adds nothing the slip did not say", () => {
		const r = sheet.rows[0];
		const c = columnsOf(r, { "Salary Advance": "advance" });
		expect(c).toMatchObject({ basic: 12000, hra: 5000, overtime: 1000, other: 3000, due: 20000, pf: 1200, ptax: 200, advance: 200, esi: 0 });
		expect(r.gross).toBe(21000);
	});
});

describe("the register's rows", () => {
	const rows = registerRows({
		sheet, ym: "2026-09", company: "Manna Rubber Products Pvt.Ltd",
		people: new Map([["E1", { gender: "Male", date_of_joining: "2020-01-15", employee_number: "MRP-056", branch: "Plant 1" }]]),
		attendance: new Map([["E1", { 1: "Present", 2: "Half Day", 3: "On Leave" }]]),
		calendar: { off: new Set(), holiday: new Set([10]) },
		assignments: [{ employee: "E1", from_date: "2026-01-01", base: 21000, salary_structure: "S" }], structureFor,
	});

	it("is one row a slip, with the slip's own totals", () => {
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ srl: 1, code: "MRP-056", name: "Anand", branch: "Plant 1", gross: 21000, deduction: 1600, net: 19400, agreed: 21000, pfMember: true, esiMember: false });
		expect(rows[1]).toMatchObject({ code: "E2", branch: "Manna Rubber Products Pvt.Ltd", esiMember: true, pfMember: false });
	});

	it("fills the days from attendance, the calendar and Sundays", () => {
		const d = rows[0].days;
		expect(d).toHaveLength(30);
		expect(d.slice(0, 3)).toEqual([1, 0.5, "L"]);
		expect(d[5]).toBe("SNDY");
		expect(d[9]).toBe("HOL");
		expect(d[3]).toBe("");
	});
});

describe("the workbook", () => {
	const make = (ym, n = 2) => {
		const rows = registerRows({ sheet, ym, company: "Manna Rubber Products Pvt.Ltd" }).slice(0, n);
		return registerWorkbook(rows, { ym, company: "Manna Rubber Products Pvt.Ltd", address: "Rubber Park, Airapuram." });
	};

	it("keeps the company's headings, bands and colours", async () => {
		const ws = (await make("2026-09")).getWorksheet("Wages Register");
		expect(ws.getCell("B1").value).toBe("Employee Salary / Wages Register-SEPTEMBER 2026");
		expect(ws.getCell("B1").fill.fgColor.argb).toBe("FFC2D69B");
		expect(ws.getCell("B2").fill.fgColor.argb).toBe("FFFFFF00");
		expect(ws.getCell("C2").value).toBe("Manna Rubber Products Pvt.Ltd");
		expect(ws.getCell("C3").value).toBe("Rubber Park, Airapuram.");
		expect(ws.getCell("I3").value).toBe("SEPTEMBER 2026 - Manna Rubber Products Pvt.Ltd - (FORM NO.25) - MUSTER ROLL");
		expect(ws.getCell("H4").value).toBe(30);
		expect(ws.getCell("AL4").value).toBe("ATTENDANCE DETAILS");
		expect(ws.getCell("AL4").fill.fgColor.argb).toBe("FFCCC0D9");
		expect(ws.getCell("BC4").fill.fgColor.argb).toBe("FFD6E3BC");
		expect(ws.getCell("CM4").value).toBe("NET PAYABLE AMOUNT AFTER FINAL DEDUCTION");
		expect(ws.getCell("AK5").value).toBe("30");
		expect(ws.getCell("AL5").value).toBe("Tot.Days Worked");
		expect(ws.getCell("CR5").value).toBe("Net Payable After Round up");
		expect(ws.getColumn("A").width).toBeCloseTo(3.43, 1);
		expect(ws.getColumn("E").hidden).toBe(true);
		expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 7, ySplit: 5 });
		expect(ws.model.merges).toEqual(expect.arrayContaining(["AL4:AU4", "AV4:BB4", "BC4:BP4", "BQ4:BY4", "CA4:CH4", "CM4:CR4", "I3:AU3", "BC3:BZ3"]));
	});

	it("puts the slip's figures in the person's row, and formulas where the original has them", async () => {
		const ws = (await make("2026-09")).getWorksheet("Wages Register");
		expect(ws.getCell("D6").value).toBe("Anand");
		expect(saved(ws.getCell("AL6"))).toEqual({ formula: "SUM(H6:AK6)", result: 0 });
		expect(ws.getCell("AO6").value).toEqual({ formula: "(H$4)-AL6-AM6-AN6", result: 26 });
		expect(ws.getCell("AT6").value).toBe(30);
		expect(ws.getCell("BP6").value).toBe(21000);
		expect(ws.getCell("BV6").value).toBe(1200);
		expect(ws.getCell("CK6").value).toBe(200);
		expect(ws.getCell("CM6").value).toBe(1600);
		expect(ws.getCell("CR6").value).toBe(19400);
		expect(ws.getCell("BQ6").value).toBe("Yes");
		expect(ws.getCell("BS7").value).toBe("Yes");
		expect(ws.getCell("AL6").fill.fgColor.argb).toBe("FF92D050");
		expect(ws.getCell("CR6").fill.fgColor.argb).toBe("FFB6DDE8");
	});

	it("has no second pay for filing and no cash difference", async () => {
		const ws = (await make("2026-09")).getWorksheet("Wages Register");
		const text = JSON.stringify(ws.model.rows.map((r) => r.cells.map((c) => c.value)));
		expect(text).not.toMatch(/for filing|diff to be paid/i);
	});

	it("has a day column for each day, and the columns after move with them", async () => {
		const a = (await make("2026-09")).getWorksheet("Wages Register");
		const b = (await make("2026-10")).getWorksheet("Wages Register");
		const c = (await make("2026-02")).getWorksheet("Wages Register");
		expect(a.getCell("AL5").value).toBe("Tot.Days Worked");
		expect(b.getCell("AM5").value).toBe("Tot.Days Worked");
		expect(b.getCell("AL5").value).toBe("31");
		expect(c.getCell("AJ5").value).toBe("Tot.Days Worked");
		expect(b.getCell("AM6").value).toMatchObject({ formula: "SUM(H6:AL6)" });
		expect(letter(39)).toBe("AM");
	});

	it("lists the legend below the register, which the day counts read", async () => {
		const ws = (await make("2026-09")).getWorksheet("Wages Register");
		expect(ws.getCell("B12").value).toBe("DO NOT DELETE");
		expect(ws.getCell("B17").value).toBe(1);
		expect(ws.getCell("B20").value).toBe("SNDY");
		expect(ws.getCell("B21").value).toBe("HOL");
		expect(ws.getCell("AM6").value).toEqual({ formula: "COUNTIF(H6:AK6,$B$20)", result: 4 });
	});
});

describe("the attendance details on a month with slips", () => {
	const ym = "2026-09";
	/* Anand: present the 1st, half a day the 2nd, on leave the 3rd, the rest of
	   the weekdays not marked; four Sundays. Casual Leave: 2 brought forward from
	   August, 1 earned in September, 1 taken in September. */
	const attendance = new Map([["E1", { 1: "Present", 2: "Half Day", 3: "On Leave" }]]);
	const ledger = [
		{ employee: "E1", leave_type: "Casual Leave", leaves: 2, from_date: "2026-08-01", transaction_type: "Leave Allocation" },
		{ employee: "E1", leave_type: "Casual Leave", leaves: 1, from_date: "2026-09-01", transaction_type: "Leave Allocation" },
		{ employee: "E1", leave_type: "Casual Leave", leaves: -1, from_date: "2026-09-03", transaction_type: "Leave Application" },
		{ employee: "E1", leave_type: "Sick Leave", leaves: 5, from_date: "2026-09-01", transaction_type: "Leave Allocation" },
	];
	const sheetOf = async (opts) => {
		const rows = registerRows({ sheet, ym, company: "C", attendance, ...opts });
		return (await registerWorkbook(rows, { ym, company: "C" })).getWorksheet("Wages Register");
	};

	it("fills the Casual Leave columns off the leave ledger, as the preview does", async () => {
		const ws = await sheetOf({ ledger });
		expect([ws.getCell("AP6").value, ws.getCell("AQ6").value]).toEqual([2, 1]);
		expect(ws.getCell("AR6").value).toEqual({ formula: "AP6+AQ6", result: 3 });
		expect(ws.getCell("AS6").value).toEqual({ formula: "AR6-AO6", result: 3 - 24.5 });
	});

	it("saves each attendance formula's answer, so the numbers show before Excel works the sheet out", async () => {
		const ws = await sheetOf({ ledger });
		expect(ws.getCell("AL6").value).toEqual({ formula: "SUM(H6:AK6)", result: 1.5 });
		expect(ws.getCell("AM6").value).toEqual({ formula: "COUNTIF(H6:AK6,$B$20)", result: 4 });
		expect(saved(ws.getCell("AN6"))).toEqual({ formula: "COUNTIF(H6:AK6,$B$21)", result: 0 });
		expect(ws.getCell("AO6").value).toEqual({ formula: "(H$4)-AL6-AM6-AN6", result: 24.5 });
		expect(ws.getCell("AT6").value).toBe(30);
		expect(saved(ws.getCell("AU6"))).toEqual({ formula: "(H$4)-AT6", result: 0 });
	});

	it("leaves the Casual Leave columns empty when the ledger was not read, rather than showing no leave", async () => {
		const ws = await sheetOf({});
		expect([ws.getCell("AP6").value, ws.getCell("AQ6").value, ws.getCell("AR6").value, ws.getCell("AS6").value]).toEqual([null, null, null, null]);
	});

	it("leaves the Casual Leave columns empty for somebody who earns none, as the preview does", async () => {
		const ws = await sheetOf({ ledger });
		expect([ws.getCell("AP7").value, ws.getCell("AQ7").value, ws.getCell("AR7").value, ws.getCell("AS7").value]).toEqual([null, null, null, null]);
	});
});

describe("the days are drawn the same in every month", () => {
	it("colours a weekly off by what the cell says, not by where September's Sundays fell", async () => {
		const rows = registerRows({ sheet, ym: "2026-10", company: "C" }).slice(0, 1);
		const ws = (await registerWorkbook(rows, { ym: "2026-10", company: "C" })).getWorksheet("Wages Register");
		/* 4 October 2026 is a Sunday; 6 September's column (M) is not special in October. */
		expect(ws.getCell("K6").value).toBe("SNDY");
		expect(ws.getCell("K6").fill.fgColor.argb).toBe("FFFCD5B5");
		expect(ws.getCell("M6").fill.fgColor.argb).toBe("FFFFFFFF");
	});
});

describe("the checks before anybody pays from the register", () => {
	const mk = (extra, state = 1) => {
		const sl = [slip("E1", "Anand", 21000, 1600, 19400, { docstatus: state })];
		const dt = [
			line("SAL-E1", "earnings", "Basic", 21000, 1),
			line("SAL-E1", "deductions", "Provident Fund", 1200, 1), line("SAL-E1", "deductions", "Income Tax", 400, 2), ...extra,
		];
		const sh = buildSheet({ slips: sl, details: dt });
		const marks = new Map([["E1", { 1: "Present" }]]);
		return { sh, rows: registerRows({ sheet: sh, ym: "2026-09", attendance: marks }) };
	};

	it("names a deduction that has no column, and keeps it in the total", () => {
		const { sh, rows } = mk([]);
		expect(rows[0].unmapped).toEqual([["Income Tax", 400]]);
		expect(rows[0].deduction).toBe(1600);
		expect(registerChecks(rows, sh.rows).join(" ")).toMatch(/Income Tax is deducted/);
	});

	it("says a draft slip is not final", () => {
		const { sh, rows } = mk([], 0);
		expect(registerChecks(rows, sh.rows).join(" ")).toMatch(/still drafts/);
	});

	it("says when gross less deductions is not the slip's net", () => {
		const { sh, rows } = mk([]);
		rows[0].net = 19000;
		expect(registerChecks(rows, sh.rows).join(" ")).toMatch(/gross minus deductions/);
	});

	it("says when nobody's attendance was found", () => {
		const sl = [slip("E1", "Anand", 21000, 1600, 19400)];
		const sh = buildSheet({ slips: sl, details: [line("SAL-E1", "earnings", "Basic", 21000, 1)] });
		const rows = registerRows({ sheet: sh, ym: "2026-09" });
		expect(registerChecks(rows, sh.rows).join(" ")).toMatch(/No attendance was found for Anand/);
	});

	it("is quiet when everything agrees", () => {
		const sl = [slip("E1", "Anand", 21000, 1600, 19400)];
		const dt = [line("SAL-E1", "earnings", "Basic", 21000, 1), line("SAL-E1", "deductions", "Provident Fund", 1600, 1)];
		const sh = buildSheet({ slips: sl, details: dt });
		const rows = registerRows({ sheet: sh, ym: "2026-09", attendance: new Map([["E1", { 1: "Present" }]]) });
		expect(registerChecks(rows, sh.rows)).toEqual([]);
	});

	it("marks the workbook when it stands on draft slips, and notes the unmapped deduction", async () => {
		const { rows } = mk([], 0);
		const ws = (await registerWorkbook(rows, { ym: "2026-09", company: "C" })).getWorksheet("Wages Register");
		expect(ws.getCell("B1").value).toMatch(/DRAFT SLIPS INCLUDED, NOT FINAL/);
		expect(String(ws.getCell("CM6").note)).toMatch(/Income Tax 400\.00/);
	});
});

describe("a sheet per company in one file", () => {
	it("names each sheet within Excel's limits: 31 characters, no forbidden characters, no repeat ignoring case", async () => {
		const wb = await registerBook([], { ym: "2026-09" });
		expect(sheetName(wb, "A very long company name that runs past Excel's limit")).toHaveLength(31);
		expect(sheetName(wb, "Soorya [Rubbers]: A/B")).toBe("Soorya Rubbers A B");
		wb.addWorksheet("Manna Rubber");
		expect(sheetName(wb, "MANNA RUBBER")).toBe("MANNA RUBBER (2)");
	});

	it("keeps each company's own register on its own sheet, with its own title", async () => {
		const days = Array.from({ length: 30 }, () => 1);
		const row = { srl: 1, code: "X1", name: "Person", days, paymentDays: 30, state: "Submitted", gross: 1000, deduction: 0, net: 1000 };
		const wb = await registerBook([{ company: "First Co", rows: [row] }, { company: "Second Co", rows: [{ ...row, code: "Y1" }] }], { ym: "2026-09" });
		expect(wb.worksheets.map((w) => w.name)).toEqual(["First Co", "Second Co"]);
		expect(wb.getWorksheet("Second Co").getCell("C2").value).toBe("Second Co");
		expect(wb.getWorksheet("Second Co").getCell("C6").value).toBe("Y1");
	});
});

describe("days Frappe has not marked, from the punches", () => {
	const ym = "2026-09";
	const people = new Map([
		["E1", { name: "E1", default_shift: "General" }],
		["N1", { name: "N1", default_shift: "Night" }],
	]);
	const shifts = new Map([["General", { start_time: "09:00:00", end_time: "17:30:00" }], ["Night", { start_time: "20:00:00", end_time: "08:00:00" }]]);
	const punch = (employee, time, log_type) => ({ employee, time, log_type });

	it("marks a day with an In and an Out Present", () => {
		const { attendance, filled } = fillFromPunches(new Map(), [punch("E1", "2026-09-02 08:58:00", "IN"), punch("E1", "2026-09-02 17:31:00", "OUT")], { people, ym, shifts });
		expect(attendance.get("E1")).toEqual({ 2: "Present" });
		expect(filled).toBe(1);
		expect(dayCell(attendance.get("E1")[2])).toBe(1);
	});

	it("marks a day with only an In Present too, since somebody who was there is the one not to miss", () => {
		expect(fillFromPunches(new Map(), [punch("E1", "2026-09-04 09:10:00", "IN")], { people, ym, shifts }).attendance.get("E1")).toEqual({ 4: "Present" });
	});

	it("keeps Frappe's own mark for a day it has marked, punches or not", () => {
		const marked = new Map([["E1", { 2: "Absent", 5: "Half Day" }]]);
		const { attendance, filled } = fillFromPunches(marked, [punch("E1", "2026-09-02 09:00:00", "IN"), punch("E1", "2026-09-05 09:00:00", "IN")], { people, ym, shifts });
		expect(attendance.get("E1")).toEqual({ 2: "Absent", 5: "Half Day" });
		expect(filled).toBe(0);
	});

	it("counts a night shift's morning leaving on the night it began", () => {
		const { attendance } = fillFromPunches(new Map(), [punch("N1", "2026-09-10 20:05:00", "IN"), punch("N1", "2026-09-11 08:02:00", "OUT")], { people, ym, shifts });
		expect(attendance.get("N1")).toEqual({ 10: "Present" });
	});

	it("takes nobody else's punches, and no day outside the month", () => {
		const { attendance, filled } = fillFromPunches(new Map(), [punch("X9", "2026-09-02 09:00:00", "IN"), punch("E1", "2026-10-01 09:00:00", "IN")], { people, ym, shifts });
		expect(attendance.size).toBe(0);
		expect(filled).toBe(0);
	});

	it("leaves the Attendance it was given as it was", () => {
		const marked = new Map([["E1", { 1: "Present" }]]);
		fillFromPunches(marked, [punch("E1", "2026-09-02 09:00:00", "IN")], { people, ym, shifts });
		expect(marked.get("E1")).toEqual({ 1: "Present" });
	});
});
