import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   Payroll → Payroll, drawn. The reads are answered here; what is pinned is what
   a person sees and where each step sends them, and that nothing is written.
   --------------------------------------------------------------------------- */

const calls = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	api: (path, params) => {
		calls.push([path, params]);
		if (path.endsWith("get_count")) return Promise.resolve({ message: 3 });
		if (path.includes("Salary%20Slip")) return Promise.resolve({ data: [] });
		return Promise.resolve({ data: [] });
	},
	listAll: (label) => {
		calls.push(["listAll", label]);
		if (label === "Salary Component") return Promise.resolve([{ name: "Loan EMI", disabled: 0 }]);
		if (label === "Additional Salary") return Promise.resolve([{ name: "AS-1", docstatus: 0, employee: "E1" }]);
		return Promise.resolve([]);
	},
}));

/* The registry before the page, as the app loads them — the page imports Link,
   Link the router, the router the registry, which imports the page. */
import { MODULES, pageFor } from "@/routes/registry";
import PayrollHome from "@/features/payroll/PayrollHome";
import PayrollRun from "@/features/payroll/PayrollRun";
import { hiddenUnder, isHidden } from "@/data/sections";
import { pathFor } from "@/routes/router";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

beforeEach(() => {
	calls.length = 0;
	resetStore();
	set({ ...loadedState(), site: "https://erp.example.invalid", section: "payroll", subtab: "overview" });
});

const draw = async () => {
	let view;
	await act(async () => { view = render(<Provider store={store}><PayrollHome /></Provider>); });
	return view;
};

describe("Payroll opens on its own page", () => {
	/* PayrollHome, the read-only steps page it replaced, stays as code and keeps its tests below. */
	it("is the first tab, and the page the website runs payroll from", () => {
		expect(MODULES.payroll.tabs[0][0]).toBe("overview");
		expect(pageFor("payroll", "overview")).toBe(PayrollRun);
	});

	it("is on the rail", () => {
		expect(isHidden("payroll")).toBe(false);
	});

	it("shows its custom pages on the strip, the run first, in the order a month is worked", () => {
		/* Increments joined on 5 Oct 2026, beside Salary Setup: January's raises.
		   Actual Salary on 14 Oct 2026, beside it too: kept apart from payroll. */
		const shown = MODULES.payroll.tabs.map((t) => t[0]).filter((k) => !hiddenUnder({}, "payroll", k));
		/* Employee Payroll and Payroll Settings joined on 21 Oct 2026 and left
		   on 22 Oct, asked for by HR. */
		/* Festival Bonus on 22 Oct, beside Actual Salary: paid apart from the salary. */
		expect(shown).toEqual(["overview", "setup", "actualsalary", "festivalbonus", "increments", "advances", "slips", "transfer"]);
	});

	it("no longer has Employee Payroll, Payroll Detail or Payroll Settings, and their old addresses open Payroll", () => {
		const keys = MODULES.payroll.tabs.map((t) => t[0]);
		for (const k of ["employees", "slip", "settings"]) {
			expect(keys, k).not.toContain(k);
			expect(pageFor("payroll", k), k).toBe(pageFor("payroll", "overview"));
		}
	});

	it("still has every other page, hidden and not deleted, at its own address", () => {
		for (const k of ["adhoc", "process", "sheet", "payslip", "register", "bank", "frappe", "fnf", "itdec", "bonus", "ptax", "all"]) {
			expect(pageFor("payroll", k), k).toBeTruthy();
			expect(hiddenUnder({}, "payroll", k), k).toBe(true);
		}
	});
});

describe("the page", () => {
	it("draws the four steps in order", async () => {
		const { container } = await draw();
		const titles = [...container.querySelectorAll("ol > li > b")].map((b) => b.textContent);
		expect(titles).toEqual(["Check the set-up", "Advances, loans and bonuses", "Run the salary", "Check it and pay"]);
	});

	it("names the salary components the site lacks, and says how to make them", async () => {
		const { container } = await draw();
		expect(container.textContent).toContain("Leave Encashment, Salary Advance");
		expect(container.textContent).toContain("python tools/setup_payroll.py");
	});

	it("says a deduction is still a draft and points at Additional Salary on the desk", async () => {
		const { container } = await draw();
		expect(container.textContent).toMatch(/still a draft/);
		const link = [...container.querySelectorAll("a")].find((a) => a.textContent === "Submit them in Frappe");
		expect(link.getAttribute("href")).toBe("https://erp.example.invalid/app/additional-salary");
	});

	it("sends each step to the page that does it", async () => {
		const { container } = await draw();
		const href = (text) => [...container.querySelectorAll("a")].find((a) => a.textContent === text)?.getAttribute("href");
		expect(href("Adhoc Payments/Deductions")).toBe(pathFor("payroll", "adhoc"));
		expect(href("Salary Process")).toBe(pathFor("payroll", "process"));
		expect(href("Salary Sheet")).toBe(pathFor("payroll", "sheet"));
		expect(href("Bank Transfer")).toBe(pathFor("payroll", "bank"));
	});

	it("re-reads the month it is asked about", async () => {
		const { container } = await draw();
		const before = calls.length;
		const pick = container.querySelector("#phmonth");
		const other = [...pick.options].map((o) => o.value).find((v) => v !== pick.value);
		await act(async () => { fireEvent.change(pick, { target: { value: other } }); });
		expect(calls.length).toBeGreaterThan(before);
	});

	it("writes nothing", async () => {
		await draw();
		expect(calls.every(([p]) => !/frappe\.client\.(insert|save|submit|delete|set_value)/.test(String(p)))).toBe(true);
	});
});
