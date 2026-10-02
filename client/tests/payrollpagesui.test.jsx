import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   The four custom Payroll pages beside Payroll: Salary Setup, Advances & Loans,
   Payslips and Bank Transfer. The site is answered here; what is pinned is
   what a person sees, what each button writes, and that no Salary Slip is ever
   written.
   --------------------------------------------------------------------------- */

let site;
const calls = [];
const printed = [];

vi.mock("@/lib/doc", async (importOriginal) => ({ ...(await importOriginal()), printPaper: (html) => printed.push(html) }));
vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		listAll: (dt) => Promise.resolve(site[dt] || []),
		api: (path) => Promise.resolve({ data: path.includes("Salary Detail") ? site.details : [] }),
		getDoc: (dt) => Promise.resolve(dt === "Company" ? site.company : null),
		apiCreate: (dt, doc) => { calls.push(["create", dt, doc]); return Promise.resolve({ name: "NEW-" + calls.length, ...doc }); },
		apiCreateSubmitted: (dt, doc) => {
			calls.push(["created+submitted", dt, doc]);
			return site.refuse && site.refuse(doc) ? Promise.reject(new Error("refused")) : Promise.resolve({ name: dt === "Salary Structure" ? doc.name : "NEW-" + calls.length });
		},
		apiSubmitDraft: (dt, name) => { calls.push(["submit", dt, name]); return Promise.resolve({}); },
	};
});

import { pageFor } from "@/routes/registry";
import SalarySetup from "@/features/payroll/SalarySetup";
import AdvancesLoans from "@/features/payroll/AdvancesLoans";
import Payslips from "@/features/payroll/Payslips";
import BankSheet from "@/features/payroll/BankSheet";
import { bankSheetWorkbook } from "@/lib/banksheetxlsx";
import { bankSheet } from "@/lib/banksheet";
import { lastMonth } from "@/lib/payrollrun";
import { periodOf } from "@/lib/payroll";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

const YM = lastMonth();
const [START, END] = periodOf(YM).iso;
const COMPS = [
	{ name: "Basic", type: "Earning", salary_component_abbr: "B", disabled: 0 },
	{ name: "Provident Fund", type: "Deduction", salary_component_abbr: "PF", disabled: 0 },
	{ name: "Salary Advance", type: "Deduction", salary_component_abbr: "SADV", disabled: 0 },
];
const SLIP = { name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", company: "Manna Rubber", start_date: START, end_date: END, docstatus: 1, gross_pay: 13000, total_deduction: 2500, net_pay: 10500, payment_days: 30 };

beforeEach(() => {
	calls.length = 0; printed.length = 0;
	site = {
		"Salary Component": COMPS, "Salary Structure": [], "Salary Structure Assignment": [], "Additional Salary": [], "Payroll Entry": [],
		"Salary Slip": [], Employee: [], details: [], company: { company_name: "Manna Rubber", tax_id: "32ABC" },
	};
	resetStore();
	act(() => set({ ...loadedState(), site: "https://erp.example.invalid", company: "Manna Rubber" }));
});

const draw = async (Page) => {
	let view;
	await act(async () => { view = render(<Provider store={store}><Page /></Provider>); });
	await act(async () => {});
	return view;
};
const button = (v, text) => [...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const startsWith = (v, text) => [...v.container.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(text));
const click = (el) => act(async () => { el.click(); });
const type = (v, sel, value) => act(async () => { fireEvent.change(v.container.querySelector(sel), { target: { value } }); });

describe("the module", () => {
	it("opens each custom page", () => {
		expect(pageFor("payroll", "setup")).toBe(SalarySetup);
		expect(pageFor("payroll", "advances")).toBe(AdvancesLoans);
		expect(pageFor("payroll", "slips")).toBe(Payslips);
		expect(pageFor("payroll", "transfer")).toBe(BankSheet);
	});
});

describe("Salary Setup", () => {
	it("says who has no structure and that there are no structures yet", async () => {
		const v = await draw(SalarySetup);
		expect(v.container.textContent).toContain("none yet");
		expect(v.container.textContent).toMatch(/Still to set up/);
		expect(v.container.textContent).toContain("Make a salary structure above first.");
	});

	it("makes a structure only after a confirm, with HR's own rates, and submits it", async () => {
		const v = await draw(SalarySetup);
		await type(v, "#su-name", "Staff Monthly");
		await type(v, "#su-earnings-v0", "50");
		await click(button(v, "Make the structure"));
		expect(calls.length).toBe(0);
		await click(button(v, "Yes, make Staff Monthly"));
		await act(async () => {});
		expect(calls[0][0]).toBe("created+submitted");
		expect(calls[0][1]).toBe("Salary Structure");
		expect(calls[0][2]).toMatchObject({ name: "Staff Monthly", company: "Manna Rubber", is_active: "Yes",
			earnings: [{ salary_component: "Basic", amount_based_on_formula: 1, formula: "base * 0.5" }] });
		expect(v.container.textContent).toContain("Staff Monthly is made");
	});

	it("will not make a structure with a rate missing, and says which", async () => {
		const v = await draw(SalarySetup);
		await type(v, "#su-name", "Staff");
		await click(button(v, "Make the structure"));
		expect(v.container.textContent).toContain("Type the percentage for Basic");
		expect(calls.length).toBe(0);
	});

	it("gives ticked people a structure and a base pay, one document each", async () => {
		site["Salary Structure"] = [{ name: "Staff Monthly", company: "Manna Rubber", docstatus: 1 }];
		const v = await draw(SalarySetup);
		await type(v, "#su-struct", "Staff Monthly");
		await type(v, "#su-from", "2026-09-01");
		await act(async () => { fireEvent.click(v.container.querySelector("[aria-label='Tick Anand Raghavan']")); });
		await act(async () => { fireEvent.click(v.container.querySelector("[aria-label='Tick Priya Menon']")); });
		await type(v, "#su-bulk", "20000");
		await click(button(v, "Fill"));
		await type(v, "#su-base-HR-EMP-00002", "25000");
		await click(startsWith(v, "Give the structure to"));
		expect(calls.length).toBe(0);
		await click(startsWith(v, "Yes, give it to 2"));
		await act(async () => {});
		const made = calls.filter((c) => c[1] === "Salary Structure Assignment").map((c) => c[2]);
		expect(made).toEqual([
			{ employee: "HR-EMP-00001", salary_structure: "Staff Monthly", from_date: "2026-09-01", base: 20000, company: "Manna Rubber" },
			{ employee: "HR-EMP-00002", salary_structure: "Staff Monthly", from_date: "2026-09-01", base: 25000, company: "Manna Rubber" },
		]);
	});

	it("asks for a base pay before it makes anything", async () => {
		site["Salary Structure"] = [{ name: "S", company: "Manna Rubber", docstatus: 1 }];
		const v = await draw(SalarySetup);
		await type(v, "#su-struct", "S");
		await act(async () => { fireEvent.click(v.container.querySelector("[aria-label='Tick Anand Raghavan']")); });
		await click(startsWith(v, "Give the structure to"));
		expect(v.container.textContent).toContain("Type a base pay for Anand Raghavan");
		expect(calls.length).toBe(0);
	});

	it("says which person the site refused and still does the rest", async () => {
		site["Salary Structure"] = [{ name: "S", company: "Manna Rubber", docstatus: 1 }];
		site.refuse = (doc) => doc.employee === "HR-EMP-00001";
		const v = await draw(SalarySetup);
		await type(v, "#su-struct", "S");
		for (const n of ["Anand Raghavan", "Priya Menon"]) await act(async () => { fireEvent.click(v.container.querySelector(`[aria-label='Tick ${n}']`)); });
		await type(v, "#su-bulk", "100");
		await click(button(v, "Fill"));
		await click(startsWith(v, "Give the structure to"));
		await click(startsWith(v, "Yes, give it to 2"));
		await act(async () => {});
		expect(calls.filter((c) => c[1] === "Salary Structure Assignment")).toHaveLength(2);
		expect(v.container.textContent).toContain("Anand Raghavan — refused");
	});

	it("shows who already has one", async () => {
		site["Salary Structure Assignment"] = [{ name: "SSA-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", salary_structure: "S", from_date: "2026-01-01", base: 20000, docstatus: 1 }];
		const v = await draw(SalarySetup);
		await click(v.container.querySelector("[aria-label='Open Already set up — 1']"));
		expect(v.container.textContent).toContain("₹20,000");
	});
});

describe("Advances & Loans", () => {
	it("makes one deduction a month, each submitted, and says so", async () => {
		const v = await draw(AdvancesLoans);
		await type(v, "#al-person", "HR-EMP-00001");
		await type(v, "#al-kind", "loan");
		await type(v, "#al-amt", "3000");
		await type(v, "#al-n", "3");
		await type(v, "#al-from", "2026-11");
		expect(v.container.textContent).toContain("3 deductions of ₹1,000");
		await click(button(v, "Make the deductions"));
		expect(calls.length).toBe(0);
		await click(button(v, "Yes, make 3"));
		await act(async () => {});
		const made = calls.filter((c) => c[0] === "create");
		expect(made.map((c) => [c[2].payroll_date, c[2].amount, c[2].salary_component])).toEqual([
			["2026-11-30", 1000, "Loan EMI"], ["2026-12-31", 1000, "Loan EMI"], ["2027-01-31", 1000, "Loan EMI"]]);
		expect(calls.filter((c) => c[0] === "submit")).toHaveLength(3);
		expect(v.container.textContent).toContain("3 deductions made and submitted");
	});

	it("refuses an incomplete form and says what is missing", async () => {
		const v = await draw(AdvancesLoans);
		await click(button(v, "Make the deductions"));
		expect(v.container.textContent).toContain("Pick the person.");
		expect(calls.length).toBe(0);
	});

	it("reads the ledger back: taken so far, still to come, and the months", async () => {
		const day = new Date(); day.setMonth(day.getMonth() - 2);
		const past = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-28`;
		const fut = new Date(); fut.setMonth(fut.getMonth() + 2);
		const ahead = `${fut.getFullYear()}-${String(fut.getMonth() + 1).padStart(2, "0")}-28`;
		site["Additional Salary"] = [
			{ name: "A1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", salary_component: "Salary Advance", amount: 1000, payroll_date: past, docstatus: 1 },
			{ name: "A2", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", salary_component: "Salary Advance", amount: 1000, payroll_date: ahead, docstatus: 1 },
		];
		const v = await draw(AdvancesLoans);
		const row = [...v.container.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("Anand Raghavan"));
		expect(row.textContent).toContain("₹2,000");
		expect(row.textContent).toContain("Advance");
		await click(row.querySelector("button"));
		expect(v.container.textContent).toContain(ahead.slice(0, 7));
	});
});

describe("Payslips", () => {
	beforeEach(() => {
		site["Salary Slip"] = [SLIP, { ...SLIP, name: "SAL-2", employee: "HR-EMP-00002", employee_name: "Priya Menon", docstatus: 0, net_pay: 8000 }];
		site.details = [
			{ parent: "SAL-1", parentfield: "earnings", salary_component: "Basic", amount: 13000, idx: 1 },
			{ parent: "SAL-1", parentfield: "deductions", salary_component: "Salary Advance", amount: 2500, idx: 1 },
		];
	});

	it("lists the month's slips and says how many are still drafts", async () => {
		const v = await draw(Payslips);
		expect(v.container.textContent).toContain("Anand Raghavan");
		expect(v.container.textContent).toContain("Priya Menon");
		expect(v.container.textContent).toContain("1 still in draft");
	});

	it("prints one slip", async () => {
		const v = await draw(Payslips);
		const row = [...v.container.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("Anand Raghavan"));
		await click([...row.querySelectorAll("button")].find((b) => b.textContent === "Print"));
		expect(printed).toHaveLength(1);
		expect(printed[0]).toContain("Anand Raghavan");
		expect(printed[0]).not.toContain("Priya Menon");
		expect(printed[0]).toContain("Salary Advance");
	});

	it("prints the whole month, one to a page, and marks a draft", async () => {
		const v = await draw(Payslips);
		await click(startsWith(v, "Print all"));
		expect(printed[0].match(/<section class="slip">/g)).toHaveLength(2);
		expect(printed[0]).toContain("DRAFT");
	});

	it("shows a slip in a frame to read before printing", async () => {
		const v = await draw(Payslips);
		const row = [...v.container.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("Anand Raghavan"));
		await click([...row.querySelectorAll("button")].find((b) => b.textContent === "View"));
		expect(v.container.querySelector("iframe").getAttribute("srcdoc")).toContain("Rupees Ten Thousand Five Hundred Only");
	});

	it("writes nothing", async () => {
		await draw(Payslips);
		expect(calls).toEqual([]);
	});
});

describe("Bank Transfer", () => {
	beforeEach(() => {
		site["Salary Slip"] = [SLIP, { ...SLIP, name: "SAL-2", employee: "HR-EMP-00002", employee_name: "Priya Menon", net_pay: 8000 }];
		site.Employee = [
			{ name: "HR-EMP-00001", employee_number: "MR001", bank_name: "SBI", bank_ac_no: "123456", ifsc_code: "SBIN0001", salary_mode: "Bank" },
			{ name: "HR-EMP-00002", employee_number: "MR002", bank_name: "", bank_ac_no: "", ifsc_code: "", salary_mode: "" },
		];
	});

	it("lists each person's whole net pay, and flags who has no bank details without dropping them from the total", async () => {
		const v = await draw(BankSheet);
		const text = v.container.textContent;
		expect(text).toContain("123456");
		expect(text).toContain("No bank details");
		expect(text).toContain("₹18,500");
		expect(text).toContain("18,500.00");
		expect(text).toMatch(/1 person has no bank account/);
	});

	it("writes nothing", async () => {
		await draw(BankSheet);
		expect(calls).toEqual([]);
	});

	it("puts the same sheet into Excel under the company's heading, with a total", async () => {
		const sheet = bankSheet(site["Salary Slip"], site.Employee);
		const wb = await bankSheetWorkbook(sheet, { ym: YM, company: "Manna Rubber", info: { name: "Manna Rubber", tax_id: "32ABC", registration: "" }, address: "Perumbavoor" });
		const ws = wb.getWorksheet("Bank transfer");
		const text = [];
		ws.eachRow((r) => text.push(r.values.filter((x) => x !== undefined && x !== null).map((x) => (typeof x === "object" ? x.result ?? x.formula : x)).join("|")));
		expect(text[0].startsWith("Manna Rubber")).toBe(true);
		expect(text.join("\n")).toContain("GSTIN/Tax ID: 32ABC");
		expect(text.join("\n")).toContain("Anand Raghavan");
		expect(text.find((l) => l.includes("TOTAL"))).toContain("18500");
	});
});
