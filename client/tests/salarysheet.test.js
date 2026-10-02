import { describe, expect, it } from "vitest";

import {
	additionalSalaryDoc, buildSheet, groupForPosting, kindOf, loanInstalmentsDue, periodLabel, postingState,
} from "@/lib/salarysheet";
import { salarySheetWorkbook } from "@/lib/salarysheetxlsx";

/* ---------------------------------------------------------------------------
   The Salary Sheet: what a month of slips looks like laid side by side, and
   which loan instalments have to be on them. Pure — no site, no screen.
   --------------------------------------------------------------------------- */

const slip = (o) => ({ docstatus: 1, total_working_days: 30, payment_days: 30, leave_without_pay: 0, ...o });
const line = (parent, parentfield, salary_component, amount, idx) => ({ parent, parentfield, salary_component, amount, idx });

const SLIPS = [
	slip({ name: "S2", employee: "E2", employee_name: "Mary Joseph", gross_pay: 38000, total_deduction: 7400, net_pay: 30600 }),
	slip({ name: "S1", employee: "E1", employee_name: "Anil Kumar", gross_pay: 21000, total_deduction: 4100, net_pay: 16900, docstatus: 0 }),
	slip({ name: "S3", employee: "E3", employee_name: "Cancelled Person", gross_pay: 9, total_deduction: 9, net_pay: 0, docstatus: 2 }),
];
const LINES = [
	line("S1", "earnings", "Basic", 12000, 1), line("S1", "earnings", "House Rent Allowance", 6000, 2),
	line("S1", "earnings", "Special Allowance", 3000, 3),
	line("S1", "deductions", "Provident Fund", 1440, 1), line("S1", "deductions", "Staff Loan", 2000, 2),
	line("S1", "deductions", "Professional Tax", 660, 3),
	line("S2", "earnings", "Basic", 20000, 1), line("S2", "earnings", "House Rent Allowance", 10000, 2),
	line("S2", "earnings", "Leave Encashment", 8000, 9),
	line("S2", "deductions", "Provident Fund", 2400, 1), line("S2", "deductions", "Salary Advance", 5000, 2),
	line("S3", "earnings", "Basic", 9, 1),
];

describe("naming the columns that need pointing out", () => {
	it("calls leave encashment, an advance and a loan by what they are", () => {
		expect(kindOf("Leave Encashment")).toBe("encash");
		expect(kindOf("Salary Advance")).toBe("advance");
		expect(kindOf("Staff Loan")).toBe("loan");
		expect(kindOf("Provident Fund")).toBe("");
	});

	it("takes a loan scheme's own component as a loan even when its name does not say so", () => {
		expect(kindOf("Recovery - Vehicle", ["Recovery - Vehicle"])).toBe("loan");
		expect(kindOf("Recovery - Vehicle")).toBe("");
	});

	it("writes a month in words", () => {
		expect(periodLabel("2026-09")).toBe("September 2026");
	});
});

describe("one month's slips as a table", () => {
	const sheet = buildSheet({ slips: SLIPS, details: LINES });

	it("has a row for each live slip, by name, and none for a cancelled one", () => {
		expect(sheet.rows.map((r) => r.name)).toEqual(["Anil Kumar", "Mary Joseph"]);
	});

	it("takes gross, deductions and net from the slip, not from adding its lines", () => {
		const anil = sheet.rows[0];
		expect(anil).toMatchObject({ gross: 21000, deduction: 4100, net: 16900, state: "Draft" });
		expect(sheet.rows[1].state).toBe("Submitted");
	});

	it("puts leave encashment after the ordinary earnings, and the advance and the loan last among the deductions", () => {
		expect(sheet.earnCols.map((c) => c.name)).toEqual(["Basic", "House Rent Allowance", "Special Allowance", "Leave Encashment"]);
		expect(sheet.dedCols.map((c) => c.name)).toEqual(["Provident Fund", "Professional Tax", "Salary Advance", "Staff Loan"]);
	});

	it("leaves a component a person does not have empty rather than zero", () => {
		expect(sheet.rows[0].earn["Leave Encashment"]).toBeUndefined();
		expect(sheet.rows[1].ded["Staff Loan"]).toBeUndefined();
	});

	it("adds each column and the three slip figures, over live slips only", () => {
		expect(sheet.totals).toMatchObject({ count: 2, submitted: 1, gross: 59000, deduction: 11500, net: 47500 });
		expect(sheet.totals.earn["Basic"]).toBe(32000);
		expect(sheet.totals.earn["Leave Encashment"]).toBe(8000);
		expect(sheet.totals.ded["Staff Loan"]).toBe(2000);
		expect(sheet.totals.ded["Salary Advance"]).toBe(5000);
	});

	it("says when a slip's lines do not add to its own gross, instead of hiding it", () => {
		expect(sheet.rows[0].off).toBe(false);
		const odd = buildSheet({ slips: [slip({ name: "S9", employee: "E9", gross_pay: 5000, total_deduction: 0, net_pay: 5000 })],
			details: [line("S9", "earnings", "Basic", 4000, 1)] });
		expect(odd.rows[0].off).toBe(true);
	});

	it("adds two lines of one component on one slip", () => {
		const s = buildSheet({ slips: [slip({ name: "S9", employee: "E9", gross_pay: 300, total_deduction: 0, net_pay: 300 })],
			details: [line("S9", "earnings", "Bonus", 100.1, 1), line("S9", "earnings", "Bonus", 199.9, 2)] });
		expect(s.rows[0].earn.Bonus).toBe(300);
	});

	it("is empty, and says it has no lines, on a month with no slips", () => {
		const none = buildSheet({});
		expect(none.rows).toEqual([]);
		expect(none.hasLines).toBe(false);
		expect(none.totals.gross).toBe(0);
	});
});

describe("what the loans ask of a month", () => {
	const loan = (o) => ({ name: "HR-LOAN-1", employee: "E1", employee_name: "Anil Kumar", company: "Manna Rubber", loan_type: "Staff Loan",
		loan_status: "Running", salary_component: "", outstanding_amount: 0, ...o });
	const ln = (o) => ({ parent: "HR-LOAN-1", period: "2026-09", total_amount: 2000, paid_amount: 0, status: "Pending", ...o });
	const types = [{ name: "Staff Loan", salary_component: "Staff Loan" }];

	it("asks for the instalment, through the scheme's component", () => {
		expect(loanInstalmentsDue({ loans: [loan()], lines: [ln()], types })).toMatchObject([
			{ loan: "HR-LOAN-1", employee: "E1", amount: 2000, component: "Staff Loan", problem: "" },
		]);
	});

	it("prefers the component on the loan itself", () => {
		const [d] = loanInstalmentsDue({ loans: [loan({ salary_component: "Salary Advance" })], lines: [ln()], types });
		expect(d.component).toBe("Salary Advance");
	});

	it("asks only for what is left of an instalment part paid", () => {
		const [d] = loanInstalmentsDue({ loans: [loan()], lines: [ln({ paid_amount: 500, status: "Partly Paid" })], types });
		expect(d.amount).toBe(1500);
	});

	it("never asks for more than the loan still owes", () => {
		const [d] = loanInstalmentsDue({ loans: [loan({ outstanding_amount: 700 })], lines: [ln()], types });
		expect(d.amount).toBe(700);
	});

	it("does not read an outstanding figure of zero as 'nothing owed', because the site may never have worked it out", () => {
		const [d] = loanInstalmentsDue({ loans: [loan({ outstanding_amount: 0 })], lines: [ln()], types });
		expect(d.amount).toBe(2000);
	});

	it("leaves out a loan not yet handed over, a closed one, and an instalment already paid or skipped", () => {
		for (const loan_status of ["Applied", "Sanctioned", "Closed"]) {
			expect(loanInstalmentsDue({ loans: [loan({ loan_status })], lines: [ln()], types })).toEqual([]);
		}
		for (const status of ["Paid", "Skipped"]) {
			expect(loanInstalmentsDue({ loans: [loan()], lines: [ln({ status })], types })).toEqual([]);
		}
		expect(loanInstalmentsDue({ loans: [loan()], lines: [ln({ paid_amount: 2000 })], types })).toEqual([]);
	});

	it("names the problem when there is no component to deduct through, and does not post it", () => {
		const due = loanInstalmentsDue({ loans: [loan({ loan_type: "Other" })], lines: [ln()], types });
		expect(due[0].component).toBe("");
		expect(due[0].problem).toMatch(/no salary component/i);
		expect(groupForPosting(due)).toEqual([]);
	});

	it("makes one deduction of two loans on the same component, and keeps the reference only when there is one loan", () => {
		const loans = [loan(), loan({ name: "HR-LOAN-2" })];
		const lines = [ln(), ln({ parent: "HR-LOAN-2", total_amount: 1000 })];
		const groups = groupForPosting(loanInstalmentsDue({ loans, lines, types }));
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({ amount: 3000, loans: ["HR-LOAN-1", "HR-LOAN-2"] });
		expect(additionalSalaryDoc(groups[0], "2026-09").ref_docname).toBeUndefined();

		const one = groupForPosting(loanInstalmentsDue({ loans: [loan()], lines: [ln()], types }))[0];
		expect(additionalSalaryDoc(one, "2026-09")).toMatchObject({
			employee: "E1", salary_component: "Staff Loan", amount: 2000, payroll_date: "2026-09-30",
			overwrite_salary_structure_amount: 1, ref_doctype: "Employee Loan Application", ref_docname: "HR-LOAN-1",
		});
		expect(additionalSalaryDoc(one, "2026-09", { withRef: false }).ref_docname).toBeUndefined();
	});

	it("dates the deduction on the month's real last day", () => {
		const g = { employee: "E1", component: "Staff Loan", amount: 1, loans: ["L"] };
		expect(additionalSalaryDoc(g, "2026-02").payroll_date).toBe("2026-02-28");
		expect(additionalSalaryDoc(g, "2028-02").payroll_date).toBe("2028-02-29");
	});

	it("never builds a document that submits itself", () => {
		const doc = additionalSalaryDoc({ employee: "E1", component: "C", amount: 1, loans: ["L"] }, "2026-09");
		expect(doc.docstatus).toBeUndefined();
	});
});

describe("whether a deduction has reached the slip", () => {
	const sheet = buildSheet({ slips: SLIPS, details: LINES });
	const g = (employee, component, amount) => ({ employee, component, amount, loans: ["L"] });

	it("is on the slip when the slip carries the component for at least that much", () => {
		expect(postingState(g("E1", "Staff Loan", 2000), sheet.rows)).toBe("on");
	});

	it("is missing when the slip was made without it", () => {
		expect(postingState(g("E1", "Staff Loan", 3000), sheet.rows)).toBe("missing");
		expect(postingState(g("E2", "Staff Loan", 100), sheet.rows)).toBe("missing");
	});

	it("is waiting when the person has no slip yet", () => {
		expect(postingState(g("E7", "Staff Loan", 100), sheet.rows)).toBe("noslip");
	});
});

describe("the workbook", () => {
	const sheet = buildSheet({ slips: SLIPS, details: LINES });
	const info = { name: "Manna Rubber Products", tax_id: "32AAAAA0000A1Z5", registration: "PF: KR/123  ESI: 4400", phone: "0484 000000", email: "hr@example.invalid", website: "" };

	const build = (over = {}) => salarySheetWorkbook(sheet, { ym: "2026-09", company: "Manna Rubber", info, address: "Perumbavoor, Kerala", ...over });

	it("opens with the company, its address and its registration numbers, then the month", async () => {
		const ws = (await build()).getWorksheet("Salary Sheet");
		expect(ws.getCell("A1").value).toBe("Manna Rubber Products");
		expect(ws.getCell("A2").value).toBe("Perumbavoor, Kerala");
		expect(ws.getCell("A3").value).toContain("32AAAAA0000A1Z5");
		expect(ws.getCell("A3").value).toContain("PF: KR/123");
		expect(ws.getCell("A4").value).toBe("SALARY STATEMENT — SEPTEMBER 2026");
	});

	it("has every earning and deduction as its own column, with the leave, advance and loan ones tagged", async () => {
		const ws = (await build()).getWorksheet("Salary Sheet");
		const head = ws.getRow(6).values.slice(1).map(String);
		for (const h of ["Emp ID", "Employee Name", "Basic", "House Rent Allowance", "GROSS SALARY", "Provident Fund",
			"TOTAL DEDUCTIONS", "NET PAY"]) expect(head).toContain(h);
		expect(head.some((h) => h.startsWith("Leave Encashment") && h.includes("(Leave encashment)"))).toBe(true);
		expect(head.some((h) => h.startsWith("Salary Advance") && h.includes("(Advance)"))).toBe(true);
		expect(head.some((h) => h.startsWith("Staff Loan") && h.includes("(Loan EMI)"))).toBe(true);
	});

	it("holds each person's figures, and the slip's own net", async () => {
		const ws = (await build()).getWorksheet("Salary Sheet");
		const head = Array.from(ws.getRow(6).values, (v) => String(v ?? ""));
		const col = (name) => head.findIndex((h) => h.startsWith(name));
		expect(ws.getRow(7).getCell(2).value).toBe("Anil Kumar");
		expect(ws.getRow(7).getCell(col("Staff Loan")).value).toBe(2000);
		expect(ws.getRow(8).getCell(col("Leave Encashment")).value).toBe(8000);
		expect(ws.getRow(8).getCell(col("NET PAY")).value).toBe(30600);
	});

	it("totals every money column with a live formula over exactly the people's rows", async () => {
		const ws = (await build()).getWorksheet("Salary Sheet");
		const head = Array.from(ws.getRow(6).values, (v) => String(v ?? ""));
		const net = head.findIndex((h) => h.startsWith("NET PAY"));
		const cell = ws.getRow(9).getCell(net);
		expect(cell.value.formula).toMatch(/^SUM\([A-Z]+7:[A-Z]+8\)$/);
		expect(ws.getRow(9).getCell(2).value).toBe("TOTAL — 2 people");
	});

	it("has a second sheet for the loans only when there are some", async () => {
		expect((await build()).getWorksheet("Loans & Advances")).toBeUndefined();
		const wb = await build({ loans: [{ employee: "E1", employee_name: "Anil Kumar", component: "Staff Loan", loans: ["HR-LOAN-1"], amount: 2000, state: "on" }] });
		const ls = wb.getWorksheet("Loans & Advances");
		expect(ls.getRow(4).getCell(2).value).toBe("Anil Kumar");
		expect(ls.getRow(4).getCell(5).value).toBe(2000);
		expect(ls.getRow(4).getCell(6).value).toBe("On the slip");
	});

	it("falls back to the group's name, and prints no total row for a month with nobody in it", async () => {
		const wb = await salarySheetWorkbook(buildSheet({}), { ym: "2026-09" });
		const ws = wb.getWorksheet("Salary Sheet");
		expect(ws.getCell("A1").value).toBe("MANNA GROUP");
		expect(JSON.stringify(ws.getRows(1, 20).map((r) => r.values))).not.toContain("TOTAL —");
	});

	it("survives a round trip through the file format", async () => {
		const ExcelJS = (await import("exceljs")).default;
		const buf = await (await build()).xlsx.writeBuffer();
		const back = new ExcelJS.Workbook();
		await back.xlsx.load(buf);
		expect(back.getWorksheet("Salary Sheet").getCell("A1").value).toBe("Manna Rubber Products");
	});
});
