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
			if (site.refuse && site.refuse(doc)) return Promise.reject(new Error("refused"));
			if (site.keep && dt === "Salary Structure Assignment") site[dt].push({ ...doc, docstatus: 1, name: "SSA-" + calls.length });
			return Promise.resolve({ name: dt === "Salary Structure" ? doc.name : "NEW-" + calls.length });
		},
		apiWrite: (dt, name, patch) => {
			calls.push(["write", dt, name, patch]);
			if (site.keep) site[dt] = site[dt].map((d) => (d.name === name ? { ...d, ...patch } : d));
			return Promise.resolve({ ok: true });
		},
		apiSubmitDraft: (dt, name) => { calls.push(["submit", dt, name]); return Promise.resolve({}); },
	};
});

/* The run's three steps are api/payroll.js's own, each tested there; here only
   which of them a page takes, and when. */
vi.mock("@/api/payroll", async (importOriginal) => ({
	...(await importOriginal()),
	startSalaryProcess: (company, start, end) => {
		calls.push(["start", company, start, end]);
		if (site.refuseRun) return Promise.reject(new Error("Manna Rubber has no Payroll Payable Account"));
		return Promise.resolve("PE-NEW");
	},
	createSalarySlips: (name) => { calls.push(["slips", name]); return Promise.resolve({}); },
	submitSalarySlips: (name) => { calls.push(["payslips", name]); return Promise.resolve({}); },
}));

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
	it("says who has no structure", async () => {
		const v = await draw(SalarySetup);
		expect(v.container.textContent).toMatch(/Still to set up/);
	});

	it("has no hand-made structure and no ticking people one by one — the salary sheet does both", async () => {
		const v = await draw(SalarySetup);
		expect(v.container.textContent).not.toMatch(/1\. Salary structure|2\. Give people their salary/);
		expect(button(v, "Make the structure")).toBeUndefined();
		expect(v.container.querySelector("#su-name")).toBeNull();
	});

	it("saves an uploaded sheet only after a confirm: a structure for each PF and ESI pair, the salary, and the bank and cash split", async () => {
		site.keep = true;
		site.Employee = loadedState().employees.map((e) => ({ ...e }));
		const v = await draw(SalarySetup);
		const csv = "Emp Code,Name,Actual Salary,Bank ₹,Cash ₹,PF %,ESI %\n"
			+ "MR001,Anand,20000,15000,5000,12,0.75\nMR002,Priya,30000,30000,,12,\nNOPE,Nobody,5000,,,,\nMTU001,Rahul,9000,,,,\n";
		await act(async () => { fireEvent.change(v.container.querySelector("#su-up-file"), { target: { files: [new File([csv], "salaries.csv", { type: "text/csv" })] } }); });
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
		const text = v.container.textContent;
		expect(text).toContain("2 to save, 2 left out");
		expect(text).toContain("nobody on this site has that code");
		expect(text).toContain("is on Manna Tyre UAE's payroll");
		expect(text).toContain("Salary PF 12 ESI 0.75 - Manna Rubber (1), Salary PF 12 no ESI - Manna Rubber (1)");
		expect(text).toContain("The site has no Employee State Insurance salary component, so it will be made too.");
		expect(text).toContain("₹15,000 bank, ₹5,000 cash");
		expect(calls.length).toBe(0);

		await click(button(v, "Save 2"));
		expect(calls.length).toBe(0);
		await click(button(v, "Yes, save 2"));
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });

		expect(calls.map((c) => [c[0], c[1]])).toEqual([
			["create", "Salary Component"],
			["created+submitted", "Salary Structure"], ["created+submitted", "Salary Structure"],
			["created+submitted", "Salary Structure Assignment"], ["write", "Employee"],
			["created+submitted", "Salary Structure Assignment"], ["write", "Employee"],
		]);
		expect(calls[0][2]).toMatchObject({ salary_component: "Employee State Insurance", type: "Deduction", depends_on_payment_days: 1 });
		expect(calls[1][2].deductions.map((d) => d.formula)).toEqual(["(base if base < 25000 else 25000) * 0.12", "(base * 0.0075 if base <= 21000 else 0)"]);
		expect(calls[3][2]).toMatchObject({ employee: "HR-EMP-00001", salary_structure: "Salary PF 12 ESI 0.75 - Manna Rubber", base: 20000 });
		expect(calls[4].slice(2)).toEqual(["HR-EMP-00001", { salary_mode: "Bank", custom_bank_amount: 15000 }]);
		expect(calls[6].slice(2)).toEqual(["HR-EMP-00002", { salary_mode: "Bank", custom_bank_percent: 100 }]);
		expect(calls.some((c) => c[1] === "Salary Slip")).toBe(false);
		expect(v.container.textContent).toContain("2 people are saved.");
		expect(v.container.textContent).not.toContain("Read back from the site and different");
	});

	it("does not ask for the EPF calculation on upload — the 5-tab Excel asks — and follows the company's own structures", async () => {
		site.Employee = loadedState().employees.map((e) => ({ ...e }));
		const first = await draw(SalarySetup);
		expect(first.container.textContent).not.toContain("EPF calculation");
		const csv = "Emp Code,Actual Salary,PF %,ESI %\nMR001,20000,12,0\n";
		await act(async () => { fireEvent.change(first.container.querySelector("#su-up-file"), { target: { files: [new File([csv], "s.csv", { type: "text/csv" })] } }); });
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
		expect(first.container.textContent).toContain("Salary PF 12 no ESI - Manna Rubber");
		first.unmount();

		site["Salary Structure"] = [{ name: "Salary Basic 50 PF 12 no ESI - Manna Rubber", company: "Manna Rubber", docstatus: 1 }];
		const v = await draw(SalarySetup);
		expect(v.container.querySelector("input[type='radio']")).toBe(null);
		await act(async () => { fireEvent.change(v.container.querySelector("#su-up-file"), { target: { files: [new File([csv], "s.csv", { type: "text/csv" })] } }); });
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
		expect(v.container.textContent).toContain("Salary Basic 50 PF 12 no ESI - Manna Rubber");
		expect(calls.length).toBe(0);
	});

	it("says which saved salary did not read back the way the sheet had it", async () => {
		site.Employee = loadedState().employees.map((e) => ({ ...e }));
		const v = await draw(SalarySetup);
		const csv = "Emp Code,Actual Salary,PF %,ESI %\nMR001,20000,12,0\n";
		await act(async () => { fireEvent.change(v.container.querySelector("#su-up-file"), { target: { files: [new File([csv], "s.csv", { type: "text/csv" })] } }); });
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
		await click(button(v, "Save 1"));
		await click(button(v, "Yes, save 1"));
		await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
		expect(v.container.textContent).toContain("Read back from the site and different: Anand Raghavan has no Salary PF 12 no ESI - Manna Rubber on the site");
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

describe("Bank Transfer moves the month along", () => {
	const ENTRY = { name: "PE-1", company: "Manna Rubber", start_date: START, end_date: END, docstatus: 1, creation: "2026-10-01" };
	const DRAFT = { ...SLIP, docstatus: 0 };
	const transferred = (v) => button(v, "Transferred");

	it("works out a month that is over as soon as it is opened: the run, then its slips", async () => {
		await draw(BankSheet);
		await act(async () => {});
		expect(calls).toEqual([["start", "Manna Rubber", START, END], ["slips", "PE-NEW"]]);
	});

	it("submits a run already made but not yet run, rather than making a second one", async () => {
		site["Payroll Entry"] = [{ ...ENTRY, docstatus: 0 }];
		await draw(BankSheet);
		await act(async () => {});
		expect(calls).toEqual([["slips", "PE-1"]]);
	});

	it("says a refusal and does not try again on the same visit", async () => {
		site.refuseRun = true;
		const v = await draw(BankSheet);
		await act(async () => {});
		await act(async () => {});
		expect(calls.filter((c) => c[0] === "start")).toHaveLength(1);
		expect(v.container.textContent).toContain("could not be worked out: Manna Rubber has no Payroll Payable Account");
	});

	it("works out nothing with all companies in the top bar, and says to pick one", async () => {
		act(() => set({ company: "" }));
		const v = await draw(BankSheet);
		expect(calls).toEqual([]);
		expect(v.container.textContent).toContain("Pick a company in the top bar");
	});

	it("works out nothing for a login kept from changing pay", async () => {
		act(() => set({ user: "hitechrubber@mannarubber.com" }));
		await draw(BankSheet);
		await act(async () => {});
		expect(calls).toEqual([]);
	});

	it("offers Transferred on draft slips, asks first, and only then makes the payslips through the run", async () => {
		site["Payroll Entry"] = [ENTRY];
		site["Salary Slip"] = [DRAFT];
		const v = await draw(BankSheet);
		expect(calls).toEqual([]);
		await click(transferred(v));
		expect(calls).toEqual([]);
		expect(v.container.textContent).toContain("₹10,500 to 1 person");
		await click(button(v, "Yes, transferred"));
		expect(calls).toEqual([["payslips", "PE-1"]]);
		expect(v.container.textContent).toContain("marked transferred");
	});

	it("lets Cancel take the question back without making anything", async () => {
		site["Payroll Entry"] = [ENTRY];
		site["Salary Slip"] = [DRAFT];
		const v = await draw(BankSheet);
		await click(transferred(v));
		await click(button(v, "Cancel"));
		expect(calls).toEqual([]);
		expect(transferred(v)).toBeTruthy();
	});

	it("has no Transferred once the payslips are made, and says they are", async () => {
		site["Payroll Entry"] = [ENTRY];
		site["Salary Slip"] = [SLIP];
		const v = await draw(BankSheet);
		expect(transferred(v)).toBeUndefined();
		expect(v.container.textContent).toContain("the payslips are made");
	});
});
