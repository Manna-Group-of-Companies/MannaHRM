import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
	LEFT_EMPTY, esiMember, inRegister, otHoursPerDay, pfMember, previewNotes, previewRows, previewSummary, shiftHours,
} from "@/lib/registerpreview";
import { registerWorkbook } from "@/lib/registerxlsx";

/* The wages register before there are salary slips: the company's own layout,
   the site's documents placed in the input cells, and the sheet's own formulas
   in every computed cell, so Excel works the month out. Nothing here is paid
   from, and the workbook says so. Names and figures are illustrative. */

const YM = "2026-09";
const person = (name, extra = {}) => ({
	name, employee_name: `Person ${name}`, employee_number: `EX-${name.slice(-3)}`, status: "Active",
	date_of_joining: "2020-01-01", gender: "Female", branch: "", ...extra,
});
const rowsOf = (p) => previewRows({ ym: YM, company: "Example Co", ...p }).rows;

describe("who is on the preview register", () => {
	it("lists everybody active who joined by the month's last day, in employee-code order", () => {
		const rows = rowsOf({ people: [person("E-010"), person("E-002"), person("E-100")] });
		expect(rows.map((r) => r.code)).toEqual(["EX-002", "EX-010", "EX-100"]);
		expect(rows.map((r) => r.srl)).toEqual([1, 2, 3]);
	});

	it("leaves out somebody who joins after the month and keeps somebody who joins on its last day", () => {
		expect(inRegister(person("E-001", { date_of_joining: "2026-10-01" }), "2026-09-01", "2026-09-30")).toBe(false);
		expect(inRegister(person("E-001", { date_of_joining: "2026-09-30" }), "2026-09-01", "2026-09-30")).toBe(true);
	});

	it("keeps somebody relieved during the month, even once marked Left", () => {
		expect(inRegister(person("E-001", { status: "Left", relieving_date: "2026-09-01" }), "2026-09-01", "2026-09-30")).toBe(true);
		expect(inRegister(person("E-001", { status: "Left", relieving_date: "2026-09-15" }), "2026-09-01", "2026-09-30")).toBe(true);
	});

	it("leaves out somebody relieved before the month, even if the record still says Active", () => {
		expect(inRegister(person("E-001", { status: "Active", relieving_date: "2026-08-31" }), "2026-09-01", "2026-09-30")).toBe(false);
	});

	it("leaves out somebody not Active who has no relieving date", () => {
		expect(inRegister(person("E-001", { status: "Inactive" }), "2026-09-01", "2026-09-30")).toBe(false);
	});
});

describe("what the site puts in each row", () => {
	it("fills the days from attendance, the holiday list and Sundays, as the slip register does", () => {
		const [r] = rowsOf({
			people: [person("E-001")],
			attendance: new Map([["E-001", { 1: "Present", 2: "Half Day", 3: "On Leave", 4: "Absent" }]]),
			calendar: { off: new Set(), holiday: new Set([10]) },
		});
		expect(r.days).toHaveLength(30);
		expect(r.days.slice(0, 5)).toEqual([1, 0.5, "L", 0, ""]);
		expect(r.days[5]).toBe("SNDY");
		expect(r.days[9]).toBe("HOL");
	});

	it("marks everybody Salary, because the site has no field that says who earns a daily wage", () => {
		const rows = rowsOf({ people: [person("E-001"), person("E-002")] });
		expect(rows.map((r) => r.kind)).toEqual(["Salary", "Salary"]);
		expect(rows.every((r) => r.daily === "")).toBe(true);
	});

	it("makes somebody an EPF member from a UAN or a PF number, and an ESI member from an ESIC number, under any spelling", () => {
		expect(pfMember({ custom_uan: "100000000001" })).toBe(true);
		expect(pfMember({ provident_fund_account: "PF/EX/1" })).toBe(true);
		expect(pfMember({ custom_pf_no: "PF/EX/2" })).toBe(true);
		expect(pfMember({ custom_uan: " " })).toBe(false);
		expect(pfMember({})).toBe(false);
		expect(esiMember({ custom_esic_number: "3100000001" })).toBe(true);
		expect(esiMember({ esi_no: "3100000002" })).toBe(true);
		expect(esiMember({ custom_uan: "100000000001" })).toBe(false);
		const [a, b] = rowsOf({ people: [person("E-001", { custom_uan: "1" }), person("E-002", { custom_esic_no: "2" })] });
		expect([a.pfMember, a.esiMember, b.pfMember, b.esiMember]).toEqual([true, false, false, true]);
	});

	it("takes the monthly pay from the salary structure in force at the month's end, and leaves it empty without one", () => {
		const assignments = [
			{ employee: "E-001", from_date: "2026-01-01", base: 12000, docstatus: 1 },
			{ employee: "E-001", from_date: "2026-09-15", base: 15000, docstatus: 1 },
			{ employee: "E-001", from_date: "2026-10-01", base: 99000, docstatus: 1 },
		];
		const [a, b] = rowsOf({ people: [person("E-001"), person("E-002")], assignments });
		expect(a.base).toBe(15000);
		expect(b.base).toBe("");
	});

	it("adds up each person's overtime hours for the month", () => {
		const overtime = [
			{ employee: "E-001", ot_date: "2026-09-02", hours: 2.5 },
			{ employee: "E-001", ot_date: "2026-09-09", hours: 1.5 },
			{ employee: "E-002", ot_date: "2026-09-09", hours: 3 },
		];
		const [a, b, c] = rowsOf({ people: [person("E-001"), person("E-002"), person("E-003")], overtime });
		expect([a.otHours, b.otHours, c.otHours]).toEqual([4, 3, ""]);
	});

	it("measures a shift from its start to its end, past midnight for a night shift", () => {
		expect(shiftHours({ start_time: "08:00:00", end_time: "20:00:00" })).toBe(12);
		expect(shiftHours({ start_time: "20:00:00", end_time: "08:00:00" })).toBe(12);
		expect(shiftHours({ start_time: "09:00:00", end_time: "17:30:00" })).toBe(8.5);
		expect(shiftHours({ start_time: "", end_time: "17:30:00" })).toBeNull();
	});

	it("divides the OT rate by 12 for a shift of 11 hours or more, and by 8 for a shorter shift or none", () => {
		expect(otHoursPerDay(12)).toBe(12);
		expect(otHoursPerDay(11)).toBe(12);
		expect(otHoursPerDay(9)).toBe(8);
		expect(otHoursPerDay(null)).toBe(8);
		const shifts = new Map([
			["Day 12", { name: "Day 12", start_time: "08:00:00", end_time: "20:00:00" }],
			["Night 12", { name: "Night 12", start_time: "20:00:00", end_time: "08:00:00" }],
			["General", { name: "General", start_time: "09:00:00", end_time: "17:30:00" }],
		]);
		const { rows, notes } = previewRows({
			ym: YM, shifts,
			people: [person("E-001", { default_shift: "Day 12" }), person("E-002", { default_shift: "Night 12" }),
				person("E-003", { default_shift: "General" }), person("E-004")],
		});
		expect(rows.map((r) => r.otPerDay)).toEqual([12, 12, 8, 8]);
		expect(notes.join(" ")).toMatch(/1 person has no shift with its times on record \(Person E-004\)/);
	});

	it("brings Casual Leave forward from the ledger before the month, and counts what the month allocated", () => {
		const ledger = [
			{ employee: "E-001", leave_type: "Casual Leave", transaction_type: "Leave Allocation", leaves: 1, from_date: "2026-07-01" },
			{ employee: "E-001", leave_type: "Casual Leave", transaction_type: "Leave Allocation", leaves: 1, from_date: "2026-08-01" },
			{ employee: "E-001", leave_type: "Casual Leave", transaction_type: "Leave Application", leaves: -1, from_date: "2026-08-12" },
			{ employee: "E-001", leave_type: "Casual Leave", transaction_type: "Leave Allocation", leaves: 1, from_date: "2026-09-01" },
			/* This month's leave is counted from the days, not from the ledger. */
			{ employee: "E-001", leave_type: "Casual Leave", transaction_type: "Leave Application", leaves: -1, from_date: "2026-09-08" },
			{ employee: "E-001", leave_type: "Sick Leave", transaction_type: "Leave Allocation", leaves: 5, from_date: "2026-01-01" },
		];
		const [a, b] = rowsOf({ people: [person("E-001"), person("E-002")], ledger });
		expect([a.clBrought, a.clEarned]).toEqual([1, 1]);
		expect([b.clBrought, b.clEarned]).toEqual(["", ""]);
	});

	it("leaves Casual Leave empty when the ledger could not be read", () => {
		const [a] = rowsOf({ people: [person("E-001")], ledger: null });
		expect([a.clBrought, a.clEarned]).toEqual(["", ""]);
	});

	it("counts a submitted advance and not a draft, and says the draft is waiting", () => {
		const extras = [
			{ employee: "E-001", salary_component: "Salary Advance", amount: 1500, docstatus: 1 },
			{ employee: "E-001", salary_component: "Salary Advance", amount: 500, docstatus: 0 },
		];
		const { rows, notes } = previewRows({ ym: YM, people: [person("E-001")], extras });
		expect(rows[0].advance).toBe(1500);
		expect(notes.join(" ")).toMatch(/1 advance or loan instalment is still a draft/);
	});

	it("takes a loan instalment from the month's Additional Salary, else from the loan schedule, and what is owed only when the site holds it", () => {
		const extras = [{ employee: "E-001", salary_component: "Loan EMI", amount: 800, docstatus: 1 }];
		const loans = [
			{ employee: "E-001", amount: 800, outstanding: 4000 },
			{ employee: "E-002", amount: 600, outstanding: null },
		];
		const { rows, notes } = previewRows({ ym: YM, people: [person("E-001"), person("E-002"), person("E-003")], extras, loans });
		expect([rows[0].loanInstalment, rows[0].loanOutstanding]).toEqual([800, 4000]);
		expect([rows[1].loanInstalment, rows[1].loanOutstanding]).toEqual([600, ""]);
		expect([rows[2].loanInstalment, rows[2].loanOutstanding]).toEqual(["", ""]);
		expect(notes.join(" ")).toMatch(/does not hold what is still owed on the loans of Person E-002/);
	});

	it("names an addition the register has no column for, rather than leaving it out without a word", () => {
		const extras = [{ employee: "E-001", salary_component: "Leave Encashment", amount: 2000, docstatus: 1 }];
		const { notes } = previewRows({ ym: YM, people: [person("E-001")], extras });
		expect(notes.join(" ")).toMatch(/Leave Encashment is added on the site this month but has no column on this register/);
	});

	it("leaves every input the site has no field for empty", () => {
		const [r] = rowsOf({ people: [person("E-001")] });
		for (const k of ["food", "bataDays", "bataRate", "otBata", "lwf", "mess", "covid", "covidDeduction", "insurance", "foodDeduction", "incentive", "roundOff"]) {
			expect(r[k] === undefined || r[k] === "", k).toBe(true);
		}
		expect(LEFT_EMPTY).toEqual(expect.arrayContaining(["daily wage", "food allowance", "bata", "Labour Welfare Fund"]));
	});
});

describe("what the page tells HR about the preview", () => {
	it("says the kind and the memberships were assumed and can be corrected in the file", () => {
		const notes = previewNotes(rowsOf({ people: [person("E-001")] }));
		expect(notes.join(" ")).toMatch(/Everybody is marked Salary.*change Type of Remuneration to Wages/);
		expect(notes.join(" ")).toMatch(/taken from the UAN, PF and ESIC numbers on each person's record/);
		expect(notes.join(" ")).toMatch(/Nobody has a salary structure yet/);
	});

	it("says it is Excel's calculation from the sheet's formulas, not the slips', and is not to be paid from", () => {
		const rows = rowsOf({ people: [person("E-001"), person("E-002")] });
		const text = previewSummary({ label: "September 2026", rows, notes: ["A note."], warnings: ["A warning."] });
		expect(text).toMatch(/^A preview of the wages register for September 2026 was made, with 2 people\./);
		expect(text).toContain("worked out by Excel from the sheet's own formulas and the attendance, not by the salary slips, so do not pay from it");
		expect(text).toMatch(/Left empty for you to fill in the file: monthly pay, daily wage, food allowance, bata, Labour Welfare Fund, .* and round off\./);
		expect(text).toMatch(/A note\. A warning\.$/);
	});

	it("says no attendance was found rather than drawing a month of leave without a word", () => {
		const notes = previewNotes(rowsOf({ people: [person("E-001")] }), { attendance: new Map() });
		expect(notes.join(" ")).toMatch(/No attendance was found for anybody this month/);
		expect(previewNotes(rowsOf({ people: [person("E-001")] }), { attendanceRead: false }).join(" ")).not.toMatch(/No attendance/);
	});
});

/* --------------------------------------------------------------------------- */

const days30 = Array.from({ length: 30 }, (_, i) => ([5, 12, 19, 26].includes(i) ? "SNDY" : 1));
const SALARY = {
	srl: 1, code: "EX-001", name: "Person One", days: days30, kind: "Salary", base: 15000, otHours: 4, otPerDay: 12,
	clBrought: 1, clEarned: 1, pfMember: false, esiMember: true, advance: 500,
};
const WAGES = {
	srl: 2, code: "EX-002", name: "Person Two", days: days30, kind: "Wages", daily: 500, otHours: 2, otPerDay: 8,
	pfMember: true, esiMember: true, food: 1000, lwf: 7.5, loanInstalment: 300, loanOutstanding: 1200,
};

/** Written, then read back the way somebody opening the file would get it. */
async function book(rows, ym = YM) {
	const wb = await registerWorkbook(rows, { ym, company: "Example Co", address: "Example Road", preview: true });
	const back = new ExcelJS.Workbook();
	await back.xlsx.load(await wb.xlsx.writeBuffer());
	return back;
}
const formulas = (ws, r, ids) => Object.fromEntries(ids.map((id) => [id, ws.getCell(`${id}${r}`).formula]));

describe("the preview workbook", () => {
	it("says at the top that it is a preview and not from salary slips", async () => {
		const ws = (await book([SALARY])).getWorksheet("Wages Register");
		expect(ws.getCell("B1").value).toBe("Employee Salary / Wages Register-SEPTEMBER 2026 - PREVIEW, NOT FROM SALARY SLIPS");
		expect(ws.getCell("I3").value).toBe("SEPTEMBER 2026 - Example Co - (FORM NO.25) - MUSTER ROLL");
		expect(ws.getCell("H4").value).toBe(30);
	});

	it("writes the sheet's own formula in every computed cell of a Salary row, reading the row's own kind and memberships", async () => {
		const ws = (await book([SALARY, WAGES])).getWorksheet("Wages Register");
		expect(formulas(ws, 6, ["AL", "AM", "AN", "AO", "AR", "AS", "AT", "AU", "AW", "BA", "BB", "BK", "BL", "BM", "BN", "BP",
			"BU", "BV", "BW", "BX", "BY", "BZ", "CB", "CE", "CH", "CJ", "CK", "CM", "CN", "CQ", "CR", "CT"])).toEqual({
			AL: "SUM(H6:AK6)",
			AM: "COUNTIF(H6:AK6,$B$20)",
			AN: "COUNTIF(H6:AK6,$B$21)",
			AO: "(H$4)-AL6-AM6-AN6",
			AR: "AP6+AQ6",
			AS: "AR6-AO6",
			AT: 'IF(BC6="Wages",AL6,IF(AO6>=AR6,CT6-AO6+AR6,CT6))',
			AU: 'IF(BC6="Wages","",(H$4)-AT6)',
			AW: 'IF(BC6="Wages",BE6/26,BE6/$H$4)/12',
			BA: "+(AV6*AW6)+AX6",
			BB: "+(AY6*AZ6)",
			BK: 'IF(BC6="Wages",0,(BE6/$H$4)*AU6)',
			BL: 'IF(BC6="Wages",(BE6/26)*AT6,BE6-BK6)',
			BM: 'IF(BQ6="Yes",BL6*50%,0)',
			BN: "BA6+BB6",
			BP: "BL6+BN6+BO6",
			BU: "AT6",
			BV: 'IF(BQ6="Yes",IF(BM6<25000,BM6*12%,25000*12%),0)',
			BW: 'IF(BS6="Yes",BP6*0.75%,0)',
			BX: "ROUNDUP(BV6,0)",
			BY: "ROUNDUP(BW6,0)",
			BZ: "BP6-BX6-BY6",
			CB: "CA6",
			CE: "CC6-CD6",
			CH: "CF6-CG6",
			CJ: "(BE6/2)*6",
			CK: "IF(BE6=0,0,IF(CJ6<17999,320,IF(CJ6<29999,450,IF(CJ6<44999,600,IF(CJ6<99999,750,IF(CJ6<124999,1000,1250)))))/6)",
			CM: "CB6+CD6+CG6+BX6+CI6+BY6+CK6+CL6",
			CN: "BP6-CM6",
			CQ: "CN6-CO6",
			CR: "ROUNDUP(CQ6,0)+CS6",
			CT: "$H$4",
		});
		/* The inputs are values, placed where the formulas read them. */
		expect(ws.getCell("BC6").value).toBe("Salary");
		expect(ws.getCell("BE6").value).toBe(15000);
		expect(ws.getCell("BD6").value).toBeNull();
		expect([ws.getCell("AP6").value, ws.getCell("AQ6").value, ws.getCell("AV6").value]).toEqual([1, 1, 4]);
		expect([ws.getCell("BQ6").value, ws.getCell("BR6").value, ws.getCell("BS6").value]).toEqual(["No", "No", "Yes"]);
		expect(ws.getCell("CA6").value).toBe(500);
	});

	it("writes the same formulas on a Wages row, with its month as 26 days of the daily wage and its own OT divisor", async () => {
		const ws = (await book([SALARY, WAGES])).getWorksheet("Wages Register");
		expect(formulas(ws, 7, ["AL", "AT", "AU", "AW", "BE", "BK", "BL", "BM", "BV", "BW", "CK", "CM", "CR", "CT"])).toEqual({
			AL: "SUM(H7:AK7)",
			AT: 'IF(BC7="Wages",AL7,IF(AO7>=AR7,CT7-AO7+AR7,CT7))',
			AU: 'IF(BC7="Wages","",(H$4)-AT7)',
			AW: 'IF(BC7="Wages",BE7/26,BE7/$H$4)/8',
			BE: "BD7*26",
			BK: 'IF(BC7="Wages",0,(BE7/$H$4)*AU7)',
			BL: 'IF(BC7="Wages",(BE7/26)*AT7,BE7-BK7)',
			BM: 'IF(BQ7="Yes",BL7*50%,0)',
			BV: 'IF(BQ7="Yes",IF(BM7<25000,BM7*12%,25000*12%),0)',
			BW: 'IF(BS7="Yes",BP7*0.75%,0)',
			CK: "IF(BE7=0,0,IF(CJ7<17999,320,IF(CJ7<29999,450,IF(CJ7<44999,600,IF(CJ7<99999,750,IF(CJ7<124999,1000,1250)))))/6)",
			CM: "CB7+CD7+CG7+BX7+CI7+BY7+CK7+CL7",
			CR: "ROUNDUP(CQ7,0)+CS7",
			CT: "$H$4",
		});
		expect([ws.getCell("BC7").value, ws.getCell("BD7").value]).toEqual(["Wages", 500]);
		expect([ws.getCell("BO7").value, ws.getCell("CL7").value, ws.getCell("CC7").value, ws.getCell("CD7").value]).toEqual([1000, 7.5, 1200, 300]);
		expect([ws.getCell("BQ7").value, ws.getCell("BS7").value]).toEqual(["Yes", "Yes"]);
	});

	it("leaves a Wages row's month as the site's figure, or empty for HR, when no daily wage is known", async () => {
		const ws = (await book([{ ...WAGES, daily: "", base: 13000 }, { ...WAGES, srl: 3, daily: "", base: "" }])).getWorksheet("Wages Register");
		expect(ws.getCell("BE6").value).toBe(13000);
		expect(ws.getCell("BE7").value).toBeNull();
		expect(ws.getCell("BD6").value).toBeNull();
	});

	it("totals the sheet's own columns on the row under the last person", async () => {
		const ws = (await book([SALARY, WAGES])).getWorksheet("Wages Register");
		const ids = ["BA", "BL", "BN", "BO", "BP", "BV", "BW", "BX", "BY", "BZ", "CA", "CB", "CC", "CD", "CE", "CK", "CL", "CM", "CN", "CQ", "CR"];
		expect(formulas(ws, 8, ids)).toEqual(Object.fromEntries(ids.map((id) => [id, `SUM(${id}6:${id}7)`])));
		expect(ws.getCell("AT8").value).toBeNull();
		expect(ws.getCell("BL8").font.bold).toBe(true);
		expect(ws.getCell("BL8").fill.fgColor.argb).toBe("FFFFFF00");
	});

	it("lets HR choose only the words the formulas read in the kind and membership cells", async () => {
		const ws = (await book([SALARY])).getWorksheet("Wages Register");
		expect(ws.getCell("BC6").dataValidation).toMatchObject({ type: "list", formulae: ['"Salary,Wages"'] });
		expect(ws.getCell("BQ6").dataValidation).toMatchObject({ type: "list", formulae: ['"Yes,No"'] });
		expect(ws.getCell("BS6").dataValidation).toMatchObject({ type: "list", formulae: ['"Yes,No"'] });
	});

	it("has one sheet and one set of books: no cash sheet, no difference column, no pay for filing", async () => {
		const wb = await book([SALARY, WAGES]);
		expect(wb.worksheets.map((w) => w.name)).toEqual(["Wages Register"]);
		const texts = [];
		wb.getWorksheet("Wages Register").eachRow({ includeEmpty: false }, (row) => row.eachCell((cell) => {
			texts.push(String(cell.formula || (typeof cell.value === "object" && cell.value !== null ? JSON.stringify(cell.value) : cell.value)));
		}));
		const all = texts.join("\n");
		expect(all).not.toMatch(/diff|for filing|paid by cash|cash-1/i);
		/* The only cash on the register is a cash advance, taken from pay. */
		expect(texts.filter((t) => /cash/i.test(t)).every((t) => /cash advance/i.test(t))).toBe(true);
	});

	it("moves every column after the days, and every formula with it, in a month of 31 days", async () => {
		const ws = (await book([{ ...SALARY, days: Array(31).fill(1) }], "2026-10")).getWorksheet("Wages Register");
		expect(ws.getCell("H4").value).toBe(31);
		expect(ws.getCell("AL5").value).toBe("31");
		expect(ws.getCell("AM5").value).toBe("Tot.Days Worked");
		expect(formulas(ws, 6, ["AM", "AN", "AU", "BM", "CL", "CU"])).toEqual({
			AM: "SUM(H6:AL6)",
			AN: "COUNTIF(H6:AL6,$B$19)",
			AU: 'IF(BD6="Wages",AM6,IF(AP6>=AS6,CU6-AP6+AS6,CU6))',
			BM: 'IF(BD6="Wages",(BF6/26)*AU6,BF6-BL6)',
			CL: "IF(BF6=0,0,IF(CK6<17999,320,IF(CK6<29999,450,IF(CK6<44999,600,IF(CK6<99999,750,IF(CK6<124999,1000,1250)))))/6)",
			CU: "$H$4",
		});
		expect(ws.getCell("BD6").value).toBe("Salary");
		expect(ws.getCell("BM7").formula).toBe("SUM(BM6:BM6)");
		expect(ws.getCell("B19").value).toBe("SNDY");
	});

	it("moves them the other way in a month of 28 days", async () => {
		const ws = (await book([{ ...SALARY, days: Array(28).fill(1) }], "2026-02")).getWorksheet("Wages Register");
		expect(ws.getCell("AJ5").value).toBe("Tot.Days Worked");
		expect(formulas(ws, 6, ["AJ", "AR"])).toEqual({
			AJ: "SUM(H6:AI6)",
			AR: 'IF(BA6="Wages",AJ6,IF(AM6>=AP6,CR6-AM6+AP6,CR6))',
		});
	});

	it("is chosen by rows that carry a kind, and the register from slips is left as it was", async () => {
		const wb = await registerWorkbook([{ ...SALARY }], { ym: YM, company: "Example Co" });
		const ws = wb.getWorksheet("Wages Register");
		expect(ws.getCell("B1").value).toMatch(/PREVIEW, NOT FROM SALARY SLIPS$/);
		const slip = await registerWorkbook([{ srl: 1, code: "EX-1", name: "Person", days: days30, paymentDays: 30, state: "Submitted", gross: 100, deduction: 0, net: 100, due: 100 }],
			{ ym: YM, company: "Example Co" });
		const sw = slip.getWorksheet("Wages Register");
		expect(sw.getCell("B1").value).toBe("Employee Salary / Wages Register-SEPTEMBER 2026");
		expect(sw.getCell("AT6").value).toBe(30);
		expect(sw.getCell("BL7").value).toBeNull();
	});
});

describe("EPF wages on the preview, by the company's EPF calculation", () => {
	const ssa = (structure) => [{ employee: "E-001", salary_structure: structure, from_date: "2026-01-01", base: 19500, docstatus: 1 }];

	it("are the whole pay due for somebody on a Calculation 1 structure", async () => {
		const rows = rowsOf({ people: [person("E-001")], assignments: ssa("Salary PF 12 no ESI - Example Co") });
		expect(rows[0].pfShare).toBe(100);
		const ws = (await book(rows)).getWorksheet("Wages Register");
		expect(ws.getCell("BM6").formula).toBe('IF(BQ6="Yes",BL6*100%,0)');
	});

	it("are half the pay due on a Calculation 2 structure, and on a structure that does not say, as the reference sheet has it", () => {
		expect(rowsOf({ people: [person("E-001")], assignments: ssa("Salary Basic 50 PF 12 no ESI - Example Co") })[0].pfShare).toBe(50);
		expect(rowsOf({ people: [person("E-001")], assignments: ssa("Staff Monthly") })[0].pfShare).toBe(50);
	});
});
