import { describe, expect, it } from "vitest";
import {
	assignmentDoc, basicAbbrMissing, checkAssign, checkStructure, formulaOf, lineSaid, needsStructure, newLine, structureComponents, structureDoc,
} from "@/lib/salarysetup";
import { addMonths, checkPlan, ledger, ledgerTotals, planDocs, planSaid, split } from "@/lib/advances";
import { rupeesInWords, slipBlock, slipsHtml } from "@/lib/payslipdoc";
import { bankSheet, payMode } from "@/lib/banksheet";

const COMPS = [
	{ name: "Basic", type: "Earning", salary_component_abbr: "B", disabled: 0 },
	{ name: "House Rent Allowance", type: "Earning", salary_component_abbr: "HRA", disabled: 0 },
	{ name: "Provident Fund", type: "Deduction", salary_component_abbr: "PF", disabled: 0 },
	{ name: "Salary Advance", type: "Deduction", salary_component_abbr: "SADV", disabled: 0 },
	{ name: "Loan EMI", type: "Deduction", salary_component_abbr: "LEMI", disabled: 0 },
	{ name: "Old", type: "Earning", salary_component_abbr: "O", disabled: 1 },
];

describe("salary setup", () => {
	it("offers the components a structure may hold, and not the ones that only arrive as an Additional Salary", () => {
		const c = structureComponents(COMPS);
		expect(c.earnings.map((x) => x.name)).toEqual(["Basic", "House Rent Allowance"]);
		expect(c.deductions.map((x) => x.name)).toEqual(["Provident Fund"]);
	});

	it("writes hrms's own formula for each way a line can be said", () => {
		expect(formulaOf({ how: "pct_base", value: "50" }, "B")).toBe("base * 0.5");
		expect(formulaOf({ how: "pct_basic", value: "12" }, "B")).toBe("B * 0.12");
		expect(formulaOf({ how: "pct_base", value: "7.5" }, "B")).toBe("base * 0.075");
		expect(formulaOf({ how: "fixed", value: "800" }, "B")).toBeNull();
	});

	it("says a line in words", () => {
		expect(lineSaid({ component: "Basic", how: "pct_base", value: "50" })).toBe("Basic: 50% of base pay");
		expect(lineSaid({ component: "Professional Tax", how: "fixed", value: "200" })).toBe("Professional Tax: ₹200 a month");
		expect(lineSaid({ component: "Basic", how: "pct_base", value: "" })).toBe("");
	});

	it("says what is wrong with a structure, in the order a person would fix it", () => {
		const ok = { name: "Staff", company: "C", earnings: [{ component: "Basic", how: "pct_base", value: "50" }], deductions: [] };
		expect(checkStructure(ok)).toBe("");
		expect(checkStructure({ ...ok, name: " " })).toMatch(/name/);
		expect(checkStructure({ ...ok, company: "" })).toMatch(/Pick a company/);
		expect(checkStructure({ ...ok, earnings: [newLine("")] })).toMatch(/at least one earning/);
		expect(checkStructure({ ...ok, earnings: [newLine("Basic")] })).toMatch(/Type the percentage for Basic/);
		expect(checkStructure({ ...ok, earnings: [{ component: "Basic", how: "fixed", value: "" }] })).toMatch(/Type the amount for Basic/);
		expect(checkStructure({ ...ok, earnings: [{ component: "Basic", how: "pct_base", value: "150" }] })).toMatch(/more than 100%/);
		expect(checkStructure({ ...ok, earnings: [ok.earnings[0], ok.earnings[0]] })).toMatch(/twice/);
		expect(checkStructure({ ...ok, deductions: [{ component: "Provident Fund", how: "pct_basic", value: "12" }], earnings: [{ component: "House Rent Allowance", how: "pct_base", value: "20" }] }))
			.toMatch(/Basic has to be one of the earnings/);
	});

	it("builds the Salary Structure with formulas where it was a percentage and an amount where it was fixed", () => {
		const doc = structureDoc({
			name: " Staff Monthly ", company: "Manna Treads",
			earnings: [{ component: "Basic", how: "pct_base", value: "50" }, { component: "House Rent Allowance", how: "fixed", value: "1500" }],
			deductions: [{ component: "Provident Fund", how: "pct_basic", value: "12" }, newLine("")],
		}, COMPS);
		expect(doc).toEqual({
			name: "Staff Monthly", company: "Manna Treads", is_active: "Yes", payroll_frequency: "Monthly",
			earnings: [
				{ salary_component: "Basic", amount_based_on_formula: 1, formula: "base * 0.5" },
				{ salary_component: "House Rent Allowance", amount_based_on_formula: 0, amount: 1500 },
			],
			deductions: [{ salary_component: "Provident Fund", amount_based_on_formula: 1, formula: "B * 0.12" }],
		});
	});

	it("notices a % of Basic when Basic has no abbreviation to refer to", () => {
		const f = { earnings: [], deductions: [{ component: "Provident Fund", how: "pct_basic", value: "12" }] };
		expect(basicAbbrMissing(f, [{ name: "Basic", salary_component_abbr: "" }])).toBe(true);
		expect(basicAbbrMissing(f, COMPS)).toBe(false);
	});

	it("finds who still needs a structure in this company, at the month's end, and not who has not joined yet", () => {
		const people = [
			{ name: "E1", company: "C", date_of_joining: "2020-01-01" }, { name: "E2", company: "C", date_of_joining: "2020-01-01" },
			{ name: "E3", company: "D", date_of_joining: "2020-01-01" }, { name: "E4", company: "C", date_of_joining: "2030-01-01" },
		];
		const ssa = [{ employee: "E1", from_date: "2026-01-01", salary_structure: "S" }];
		expect(needsStructure(people, ssa, "2026-09-30", "C").map((p) => p.name)).toEqual(["E2"]);
	});

	it("checks an assignment and shapes it", () => {
		const rows = [{ employee: "E1", name: "Anand", base: "25000" }];
		expect(checkAssign({ structure: "", from: "2026-09-01", rows })).toMatch(/Choose the salary structure/);
		expect(checkAssign({ structure: "S", from: "", rows })).toMatch(/applies from/);
		expect(checkAssign({ structure: "S", from: "2026-09-01", rows: [] })).toMatch(/Tick the people/);
		expect(checkAssign({ structure: "S", from: "2026-09-01", rows: [{ employee: "E1", name: "Anand", base: "" }] })).toBe("Type a base pay for Anand.");
		expect(checkAssign({ structure: "S", from: "2026-09-01", rows })).toBe("");
		expect(assignmentDoc(rows[0], "S", "2026-09-01", "C")).toEqual({ employee: "E1", salary_structure: "S", from_date: "2026-09-01", base: 25000, company: "C" });
	});
});

describe("advances and loans", () => {
	it("walks months across a year end", () => {
		expect(addMonths("2026-11", 3)).toBe("2027-02");
		expect(addMonths("2026-01", 0)).toBe("2026-01");
	});

	it("splits an amount into instalments that add back to the whole, the last taking the odd paise", () => {
		const parts = split(1000, 3, "2026-10");
		expect(parts).toEqual([["2026-10", 333.33], ["2026-11", 333.33], ["2026-12", 333.34]]);
		expect(Math.round(parts.reduce((t, p) => t + p[1], 0) * 100)).toBe(100000);
		expect(split(24000, 12, "2026-10").every((p) => p[1] === 2000)).toBe(true);
	});

	it("checks the form", () => {
		const f = { employee: "E1", kind: "advance", principal: "5000", instalments: "5", from: "2026-10" };
		expect(checkPlan(f)).toBe("");
		expect(checkPlan({ ...f, employee: "" })).toMatch(/Pick the person/);
		expect(checkPlan({ ...f, principal: "0" })).toMatch(/amount given/);
		expect(checkPlan({ ...f, instalments: "0" })).toMatch(/whole number/);
		expect(checkPlan({ ...f, instalments: "2.5" })).toMatch(/whole number/);
		expect(checkPlan({ ...f, instalments: "61" })).toMatch(/1 to 60/);
		expect(checkPlan({ ...f, from: "" })).toMatch(/first instalment/);
		expect(checkPlan({ ...f, principal: "0.02", instalments: "5" })).toMatch(/too small/);
	});

	it("makes one Additional Salary a month, dated the month's last day, through the right component", () => {
		const docs = planDocs({ employee: "E1", kind: "loan", principal: "3000", instalments: "3", from: "2026-11" }, "Manna Treads");
		expect(docs.map((d) => [d.payroll_date, d.amount, d.salary_component])).toEqual([
			["2026-11-30", 1000, "Loan EMI"], ["2026-12-31", 1000, "Loan EMI"], ["2027-01-31", 1000, "Loan EMI"]]);
		expect(docs[0]).toMatchObject({ employee: "E1", company: "Manna Treads", overwrite_salary_structure_amount: 1 });
		expect(planDocs({ employee: "E1", kind: "advance", principal: "10", instalments: "1", from: "2026-11" })[0].salary_component).toBe("Salary Advance");
	});

	it("says what is about to be made", () => {
		expect(planSaid({ employee: "E1", kind: "loan", principal: "1000", instalments: "3", from: "2026-10" })).toContain("3 deductions of ₹333.33 (the last ₹333.34)");
		expect(planSaid({ employee: "E1", kind: "advance", principal: "500", instalments: "1", from: "2026-10" })).toBe("One deduction of ₹500 in 2026-10.");
		expect(planSaid({})).toBe("");
	});

	const rows = [
		{ name: "A1", employee: "E1", employee_name: "Anand", salary_component: "Loan EMI", amount: 1000, payroll_date: "2026-09-30", docstatus: 1 },
		{ name: "A2", employee: "E1", employee_name: "Anand", salary_component: "Loan EMI", amount: 1000, payroll_date: "2026-10-31", docstatus: 1 },
		{ name: "A3", employee: "E1", employee_name: "Anand", salary_component: "Loan EMI", amount: 1000, payroll_date: "2026-11-30", docstatus: 0 },
		{ name: "A4", employee: "E2", employee_name: "Priya", salary_component: "Salary Advance", amount: 500, payroll_date: "2026-08-31", docstatus: 1 },
		{ name: "A5", employee: "E2", employee_name: "Priya", salary_component: "Provident Fund", amount: 99, payroll_date: "2026-08-31", docstatus: 1 },
		{ name: "A6", employee: "E3", employee_name: "Cancelled", salary_component: "Loan EMI", amount: 99, payroll_date: "2026-08-31", docstatus: 2 },
	];

	it("reads a ledger: taken so far, still to come, not yet submitted — advances and loans only, never a cancelled one", () => {
		const l = ledger(rows, "2026-10-02");
		expect(l.map((g) => g.name)).toEqual(["Anand", "Priya"]);
		expect(l[0]).toMatchObject({ kind: "Loan", total: 3000, due: 1000, ahead: 1000, drafts: 1000, count: 3, next: { date: "2026-10-31", amount: 1000 } });
		expect(l[1]).toMatchObject({ kind: "Advance", total: 500, due: 500, ahead: 0, drafts: 0, next: null });
		expect(l[0].items.map((i) => i.name)).toEqual(["A1", "A2", "A3"]);
		expect(ledgerTotals(l)).toEqual({ people: 2, total: 3500, due: 1500, ahead: 1000, drafts: 1000 });
	});
});

describe("payslips", () => {
	it("puts an amount in words, the lakh and crore way", () => {
		expect(rupeesInWords(0)).toBe("Rupees Zero Only");
		expect(rupeesInWords(12550)).toBe("Rupees Twelve Thousand Five Hundred Fifty Only");
		expect(rupeesInWords(125000)).toBe("Rupees One Lakh Twenty Five Thousand Only");
		expect(rupeesInWords(10000000)).toBe("Rupees One Crore Only");
		expect(rupeesInWords(1500.5)).toBe("Rupees One Thousand Five Hundred and Fifty Paise Only");
		expect(rupeesInWords(0.25)).toBe("Rupees Twenty Five Paise Only");
	});

	const slip = { name: "SAL-1", employee: "E1", employee_name: "Anand <Raghavan>", company: "Manna Treads", docstatus: 1, gross_pay: 13000, total_deduction: 2500, net_pay: 10500, payment_days: 30, leave_without_pay: 0, designation: "Operator", department: "Production" };
	const details = [
		{ parent: "SAL-1", parentfield: "earnings", salary_component: "Basic", amount: 12000, idx: 1 },
		{ parent: "SAL-1", parentfield: "earnings", salary_component: "Leave Encashment", amount: 1000, idx: 2 },
		{ parent: "SAL-1", parentfield: "deductions", salary_component: "Salary Advance", amount: 2000, idx: 1 },
		{ parent: "SAL-2", parentfield: "earnings", salary_component: "Basic", amount: 7, idx: 1 },
	];
	const info = { name: "Manna Treads", registration: "U123", tax_id: "32ABC", phone: "", email: "" };

	it("prints the slip's own lines and totals, the company's heading and the net in words", () => {
		const html = slipBlock(slip, details, info, { name: "E1", employee_number: "MT001" }, "2026-09");
		expect(html).toContain("PAYSLIP — SEPTEMBER 2026");
		expect(html).toContain("Manna Treads");
		expect(html).toContain("GSTIN/Tax ID: 32ABC");
		expect(html).toContain("12,000.00");
		expect(html).toContain("Leave Encashment");
		expect(html).toContain("Salary Advance");
		expect(html).toContain("13,000.00");
		expect(html).toContain("10,500.00");
		expect(html).toContain("Rupees Ten Thousand Five Hundred Only");
		expect(html).toContain("MT001");
		expect(html).not.toContain(">7.00<");
		expect(html).not.toContain("DRAFT");
	});

	it("escapes a name, and marks a draft", () => {
		const html = slipBlock({ ...slip, docstatus: 0 }, details, null, null, "2026-09");
		expect(html).toContain("Anand &lt;Raghavan&gt;");
		expect(html).toContain("DRAFT");
	});

	it("makes one page of a slip each", () => {
		const doc = slipsHtml([slip, { ...slip, name: "SAL-2", employee: "E2", employee_name: "Priya" }], details, info, [], "2026-09");
		expect(doc.match(/<section class="slip">/g)).toHaveLength(2);
		expect(doc).toContain("<!doctype html>");
	});
});

describe("bank transfer", () => {
	const emps = [
		{ name: "E1", employee_number: "MT001", bank_name: "SBI", bank_ac_no: "123", ifsc_code: "SBIN0001", salary_mode: "Bank" },
		{ name: "E2", employee_number: "MT002", bank_name: "", bank_ac_no: "", ifsc_code: "", salary_mode: "" },
		{ name: "E3", employee_number: "MT003", bank_name: "", bank_ac_no: "", ifsc_code: "", salary_mode: "Cash" },
		{ name: "E4", employee_number: "MT004", bank_name: "Fed", bank_ac_no: "999", ifsc_code: "", salary_mode: "" },
	];
	const slips = [
		{ name: "S1", employee: "E1", employee_name: "Anand", docstatus: 1, net_pay: 10000 },
		{ name: "S2", employee: "E2", employee_name: "Priya", docstatus: 0, net_pay: 8000.5 },
		{ name: "S3", employee: "E3", employee_name: "Rahul", docstatus: 1, net_pay: 6000 },
		{ name: "S4", employee: "E4", employee_name: "Sunitha", docstatus: 1, net_pay: 5000 },
		{ name: "S5", employee: "E1", employee_name: "Cancelled", docstatus: 2, net_pay: 77 },
	];

	it("decides how each person is paid from their own record", () => {
		expect(payMode(emps[0])).toBe("Bank");
		expect(payMode(emps[1])).toBe("No bank details");
		expect(payMode(emps[2])).toBe("Cash");
		expect(payMode(emps[3])).toBe("Bank");
		expect(payMode(undefined)).toBe("No bank details");
	});

	it("lists each person's whole net pay, once, and totals the bank and the rest apart — never dropping anybody", () => {
		const b = bankSheet(slips, emps);
		expect(b.rows.map((r) => r.name)).toEqual(["Anand", "Priya", "Rahul", "Sunitha"]);
		expect(b.rows.map((r) => r.net)).toEqual([10000, 8000.5, 6000, 5000]);
		expect(b.totals).toEqual({ count: 4, net: 29000.5, bankCount: 2, bank: 15000, otherCount: 2, other: 14000.5 });
		expect(b.rows[0]).toMatchObject({ code: "MT001", bank: "SBI", account: "123", ifsc: "SBIN0001", state: "Submitted" });
		expect(b.rows[1].state).toBe("Draft");
	});
});
