import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* ---------------------------------------------------------------------------
   The Payroll Home block that lives ON the ERPNext site (Workspace → Payroll
   Home), not in this dashboard. Its source is erpnext/payroll_home/ and
   tools/deploy_payroll_home.py puts it there; this runs that same source in
   jsdom against a stand-in for the desk's `frappe`, so what a person is told is
   pinned without a site.
   --------------------------------------------------------------------------- */

const dir = path.resolve(__dirname, "../../erpnext/payroll_home");
const src = fs.readFileSync(path.join(dir, "payroll_home.js"), "utf8")
	.replace('"__STYLE__"', JSON.stringify(fs.readFileSync(path.join(dir, "payroll_home.css"), "utf8")));

const calls = [];
let site;
const SLIP = (o) => ({ name: "SS-" + o.employee, payment_days: 30, leave_without_pay: 0, docstatus: 0, ...o });

function stub() {
	const answers = {
		Company: [{ name: "Manna Rubber" }],
		"Salary Component": site.components,
		"Additional Salary": site.extras,
		"Payroll Entry": site.entries,
		"Salary Slip": site.slips,
		"Salary Structure Assignment": site.ssa,
		Employee: site.people,
		"Salary Detail": site.details,
	};
	globalThis.frappe = {
		defaults: { get_default: () => "Manna Rubber" },
		call: ({ method, args }) => {
			calls.push([method, args]);
			if (method === "frappe.client.get_list") {
				const a = answers[args.doctype];
				return a === null ? Promise.reject(new Error("403")) : Promise.resolve({ message: a || [] });
			}
			return Promise.resolve({ message: {} });
		},
		confirm: (_m, yes) => yes(),
		set_route: vi.fn(),
		new_doc: vi.fn(),
		db: { get_value: () => Promise.resolve({ message: { tax_id: "32ABCDE1234F1Z5", phone_no: "0484-1" } }) },
	};
}

async function run() {
	const root = document.createElement("div");
	window.__payroll_home_test__ = {};
	// eslint-disable-next-line no-new-func
	new Function("root_element", src)(root);
	await vi.waitFor(() => expect(root.textContent).toMatch(/Getting .* paid/));
	return { root, pure: window.__payroll_home_test__.pure };
}

beforeEach(() => {
	calls.length = 0;
	site = {
		components: [{ name: "Leave Encashment", disabled: 0 }],
		extras: [{ name: "AS-1", employee: "E1", docstatus: 0 }],
		entries: [],
		slips: [],
		ssa: [{ employee: "E1" }],
		people: [{ name: "E1", employee_name: "Anil" }, { name: "E2", employee_name: "Beena" }],
		details: [],
	};
	stub();
});
afterEach(() => { delete globalThis.frappe; delete window.__payroll_home_test__; });

describe("the four steps, as the site's documents say them", () => {
	it("draws the four in order", async () => {
		const { root } = await run();
		expect([...root.querySelectorAll(".step .t b")].map((b) => b.textContent))
			.toEqual(["Check the set-up", "Advances, loans and bonuses", "Run the salary", "Check it and pay"]);
	});

	it("names the salary components the site lacks and who has no salary structure", async () => {
		const { root } = await run();
		expect(root.textContent).toContain("Salary Advance, Loan EMI");
		expect(root.textContent).toContain("1 person has no salary structure");
		expect(root.textContent).toContain("Beena");
	});

	it("says a deduction is still a draft, because nothing is taken from pay until it is submitted", async () => {
		const { root } = await run();
		expect(root.textContent).toMatch(/1 item is still a draft/);
	});

	it("does not call the set-up done when the site would not say", async () => {
		site.components = null; site.ssa = null;
		stub();
		const { root } = await run();
		expect(root.textContent).toMatch(/would not say what is set up/);
	});

	it("says the run is done only when every slip is submitted", async () => {
		site.components = ["Leave Encashment", "Salary Advance", "Loan EMI"].map((name) => ({ name, disabled: 0 }));
		site.ssa = [{ employee: "E1" }, { employee: "E2" }];
		site.extras = [];
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, status: "Submitted", creation: "2026-10-01" }];
		site.slips = [SLIP({ employee: "E1", employee_name: "Anil", gross_pay: 100, total_deduction: 10, net_pay: 90, docstatus: 1 }),
			SLIP({ employee: "E2", employee_name: "Beena", gross_pay: 100, total_deduction: 10, net_pay: 90, docstatus: 0 })];
		stub();
		let { root } = await run();
		expect(root.textContent).toMatch(/1 slip is still a draft/);
		site.slips[1].docstatus = 1;
		stub();
		({ root } = await run());
		expect(root.textContent).toContain("2 slips submitted");
		expect(root.textContent).toContain("Everything is submitted");
	});
});

describe("the salary sheet", () => {
	const lines = [
		["SS-E1", "earnings", "Basic", 1000, 1], ["SS-E1", "earnings", "Leave Encashment", 500, 2],
		["SS-E1", "deductions", "PF", 120, 1], ["SS-E1", "deductions", "Loan EMI", 200, 2], ["SS-E1", "deductions", "Salary Advance", 80, 3],
	].map(([parent, parentfield, salary_component, amount, idx]) => ({ parent, parentfield, salary_component, amount, idx }));

	it("puts leave encashment, an advance and a loan instalment in their own columns, after the ordinary ones", async () => {
		site.slips = [SLIP({ employee: "E1", employee_name: "Anil", gross_pay: 1500, total_deduction: 400, net_pay: 1100 })];
		site.details = lines;
		stub();
		const { root, pure } = await run();
		const heads = [...root.querySelectorAll("thead th")].map((th) => th.textContent);
		expect(heads.indexOf("Basic")).toBeLessThan(heads.findIndex((h) => h.startsWith("Leave Encashment")));
		expect(heads.findIndex((h) => h.startsWith("PF"))).toBeLessThan(heads.findIndex((h) => h.startsWith("Loan EMI")));
		expect(heads.findIndex((h) => h.startsWith("Salary Advance"))).toBeLessThan(heads.findIndex((h) => h.startsWith("Loan EMI")));
		expect(root.querySelector("tfoot").textContent).toContain("1,100.00");
		expect(pure.kindOf("Leave Encashment")).toBe("encash");
	});

	it("takes gross, deductions and net from the slip itself, never from adding the lines", async () => {
		site.slips = [SLIP({ employee: "E1", employee_name: "Anil", gross_pay: 1500, total_deduction: 999, net_pay: 501 })];
		site.details = lines;
		stub();
		const { pure } = await run();
		const r = pure.buildSheet(site.slips, site.details).rows[0];
		expect([r.gross, r.deduction, r.net]).toEqual([1500, 999, 501]);
	});

	it("writes a file Excel opens, with the company's details at the top and a total row", async () => {
		site.slips = [SLIP({ employee: "E1", employee_name: "Anil, K", gross_pay: 1500, total_deduction: 400, net_pay: 1100 })];
		site.details = lines;
		stub();
		const { pure } = await run();
		const text = pure.csv(pure.buildSheet(site.slips, site.details), "Manna Rubber", { tax_id: "32ABC" }, "2026-09");
		expect(text.startsWith("﻿Manna Rubber")).toBe(true);
		expect(text).toContain("GSTIN/Tax ID: 32ABC");
		expect(text).toContain("SALARY STATEMENT — SEPTEMBER 2026");
		expect(text).toContain('"Anil, K"');
		expect(text).toContain("TOTAL");
	});
});

describe("what it will and will not do", () => {
	it("reads only, until somebody presses a button that says what it makes", async () => {
		await run();
		expect(calls.every(([m]) => m === "frappe.client.get_list")).toBe(true);
	});

	it("makes the missing components when asked, each as one Salary Component", async () => {
		const { root } = await run();
		const btn = [...root.querySelectorAll("button")].find((b) => b.textContent === "Make the missing components");
		btn.click();
		await vi.waitFor(() => expect(calls.filter(([m]) => m === "frappe.client.insert")).toHaveLength(2));
		const made = calls.filter(([m]) => m === "frappe.client.insert").map(([, a]) => [a.doc.salary_component, a.doc.type]);
		expect(made).toEqual([["Salary Advance", "Deduction"], ["Loan EMI", "Deduction"]]);
	});

	it("opens the stock forms for a run, an advance and a loan instalment, filled in", async () => {
		const { root } = await run();
		const click = (t) => [...root.querySelectorAll("button")].find((b) => b.textContent === t).click();
		click("Add an advance");
		expect(frappe.new_doc).toHaveBeenCalledWith("Additional Salary", expect.objectContaining({ salary_component: "Salary Advance" }));
		click("Add a loan instalment");
		expect(frappe.new_doc).toHaveBeenCalledWith("Additional Salary", expect.objectContaining({ salary_component: "Loan EMI" }));
		click("Start the salary run");
		expect(frappe.new_doc).toHaveBeenCalledWith("Payroll Entry", expect.objectContaining({ payroll_frequency: "Monthly", company: "Manna Rubber" }));
	});

	it("keeps the three component names in step with the Python tool that also makes them", () => {
		const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/payrollsetup.py"), "utf8");
		for (const [name, abbr] of [["Leave Encashment", "LENC"], ["Salary Advance", "SADV"], ["Loan EMI", "LEMI"]]) {
			expect(src).toContain(`name: "${name}", abbr: "${abbr}"`);
			expect(py).toContain(`"name": "${name}"`);
			expect(py).toContain(`"abbr": "${abbr}"`);
		}
	});
});
