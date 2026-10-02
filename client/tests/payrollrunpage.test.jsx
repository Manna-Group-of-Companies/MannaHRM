import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   Payroll → Payroll, the page the website runs payroll from. The site is
   answered here; what is pinned is what a person sees, what each button
   writes, and that nothing on the pay side is written that should not be.
   --------------------------------------------------------------------------- */

let site;
const calls = [];

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		listAll: (dt) => Promise.resolve(
			dt === "Payroll Entry" ? site.entries
				: dt === "Salary Slip" ? site.slips
					: dt === "Salary Structure Assignment" ? site.ssa
						: dt === "Salary Component" ? site.components
							: dt === "Additional Salary" ? site.extras : [],
		),
		/* The loan doctypes are not on the site this was written for. */
		api: (path) => (path.includes("Loan")
			? Promise.reject(Object.assign(new Error("not found"), { status: 404 }))
			: Promise.resolve({ data: path.includes("Salary Detail") ? site.details : [] })),
		getDoc: (dt) => Promise.resolve(dt === "Company" ? site.company : null),
		apiCreate: (dt, doc) => { calls.push(["create", dt, doc]); return Promise.resolve({ name: dt === "Additional Salary" ? "HR-ADD-1" : "HR-PRUN-1", ...doc }); },
		apiDocMethod: (dt, name, method) => { calls.push(["method", dt, name, method]); return Promise.resolve({ docs: [{ employees: site.picked }] }); },
		apiWrite: (dt, name, p) => { calls.push(["write", dt, name, p]); return Promise.resolve({ ok: true }); },
		apiSubmitDraft: (dt, name) => { calls.push(["submit", dt, name]); return Promise.resolve({}); },
	};
});

import { pageFor } from "@/routes/registry";
import PayrollRun from "@/features/payroll/PayrollRun";
import { payKey } from "@/api/payroll";
import { periodOf } from "@/lib/payroll";
import { lastMonth } from "@/lib/payrollrun";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

const YM = lastMonth();
const [START, END] = periodOf(YM).iso;
const CO = { default_payroll_payable_account: "Payroll Payable - MR", cost_center: "Main - MR", default_currency: "INR" };
const ALL3 = [
	{ name: "Leave Encashment", type: "Earning", disabled: 0 },
	{ name: "Salary Advance", type: "Deduction", disabled: 0 },
	{ name: "Loan EMI", type: "Deduction", disabled: 0 },
];

beforeEach(() => {
	calls.length = 0;
	site = { entries: [], slips: [], ssa: [], details: [], components: ALL3, extras: [], company: CO, picked: [] };
	resetStore();
	act(() => set({ ...loadedState(), site: "https://erp.example.invalid", company: "Manna Rubber" }));
});

const draw = async () => {
	let view;
	await act(async () => { view = render(<Provider store={store}><PayrollRun /></Provider>); });
	await act(async () => {});
	return view;
};
const button = (v, text) => [...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const click = (el) => act(async () => { el.click(); });
const pick = (v, id, value) => act(async () => { fireEvent.change(v.container.querySelector(id), { target: { value } }); });

describe("the page", () => {
	it("is the Payroll module's page", () => {
		expect(pageFor("payroll", "overview")).toBe(PayrollRun);
	});

	it("goes down four steps in order, each one done on this page", async () => {
		const v = await draw();
		const titles = [...v.container.querySelectorAll(".panel h3")].map((h) => h.textContent);
		const want = ["Check the set-up", "Advances, loans and bonuses", "Run the salary", "Check it and pay"];
		expect(titles).toHaveLength(4);
		want.forEach((w, i) => expect(titles[i], w).toContain(w));
	});

	it("opens the first step that is not done and folds the rest", async () => {
		const v = await draw();
		/* Nobody has a salary structure, so step 1 needs somebody. */
		const shut = [...v.container.querySelectorAll(".panel")].map((p) => p.classList.contains("shut"));
		expect(shut).toEqual([false, true, true, true]);
	});

	it("re-reads when the month is changed", async () => {
		const v = await draw();
		const sel = v.container.querySelector("#prmonth");
		expect(sel.value).toBe(YM);
		await pick(v, "#prmonth", [...sel.options].map((o) => o.value).find((x) => x !== YM));
		expect(v.container.querySelector("#prmonth").value).not.toBe(YM);
	});
});

describe("step 1 — the set-up", () => {
	it("makes the missing salary components, each as hrms's own Salary Component", async () => {
		site.components = [ALL3[0]];
		const v = await draw();
		await click(button(v, "Make Salary Advance, Loan EMI"));
		const made = calls.filter((c) => c[0] === "create");
		expect(made.map((c) => c[1])).toEqual(["Salary Component", "Salary Component"]);
		expect(made.map((c) => [c[2].salary_component, c[2].type, c[2].salary_component_abbr])).toEqual(
			[["Salary Advance", "Deduction", "SADV"], ["Loan EMI", "Deduction", "LEMI"]]);
	});

	it("offers nothing to make when the components are all there", async () => {
		const v = await draw();
		expect([...v.container.querySelectorAll("button")].some((b) => /^Make /.test(b.textContent))).toBe(false);
	});

	it("says who has no salary structure and sends them to Frappe to be given one", async () => {
		const v = await draw();
		expect(v.container.textContent).toContain("no salary structure");
		const a = [...v.container.querySelectorAll("a")].find((x) => x.textContent === "Assign salary structures");
		expect(a.getAttribute("href")).toBe("https://erp.example.invalid/app/bulk-salary-structure-assignment/new");
	});
});

describe("step 2 — advances, loans and bonuses", () => {
	it("adds an advance as an Additional Salary dated the month's last day, then submits it", async () => {
		const v = await draw();
		await pick(v, "#pr-person", "HR-EMP-00001");
		await pick(v, "#pr-kind", "advance");
		await pick(v, "#pr-amt", "5000");
		await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
		await act(async () => {});
		const made = calls.find((c) => c[0] === "create" && c[1] === "Additional Salary");
		expect(made[2]).toMatchObject({ employee: "HR-EMP-00001", company: "Manna Rubber", salary_component: "Salary Advance",
			amount: 5000, payroll_date: END, overwrite_salary_structure_amount: 1 });
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Additional Salary", "HR-ADD-1"]);
		expect(v.container.textContent).toContain("Advance taken of ₹5,000");
	});

	it("travels a loan instalment through Loan EMI and leave encashment through Leave Encashment", async () => {
		const v = await draw();
		for (const [kind, component] of [["loan", "Loan EMI"], ["encash", "Leave Encashment"]]) {
			await pick(v, "#pr-person", "HR-EMP-00002");
			await pick(v, "#pr-kind", kind);
			await pick(v, "#pr-amt", "1200");
			await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
			await act(async () => {});
			const last = calls.filter((c) => c[0] === "create" && c[1] === "Additional Salary").pop();
			expect(last[2].salary_component, kind).toBe(component);
		}
	});

	it("lets a bonus choose its component from what the site has", async () => {
		site.components = [...ALL3, { name: "Bonus", type: "Earning", disabled: 0 }];
		const v = await draw();
		await pick(v, "#pr-kind", "other");
		expect([...v.container.querySelector("#pr-comp").options].map((o) => o.value)).toContain("Bonus");
		await pick(v, "#pr-person", "HR-EMP-00001");
		await pick(v, "#pr-comp", "Bonus");
		await pick(v, "#pr-amt", "2000");
		await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "create" && c[1] === "Additional Salary")[2].salary_component).toBe("Bonus");
	});

	it("will not add without a person or an amount, and says which", async () => {
		const v = await draw();
		const add = () => [...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to "));
		await click(add());
		expect(v.container.textContent).toContain("Pick the person.");
		await pick(v, "#pr-person", "HR-EMP-00001");
		await click(add());
		expect(v.container.textContent).toContain("Type the amount");
		expect(calls.some((c) => c[0] === "create")).toBe(false);
	});

	it("submits the drafts of the month only after a confirm", async () => {
		site.extras = [{ name: "HR-ADD-7", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", salary_component: "Loan EMI", amount: 800, docstatus: 0 }];
		const v = await draw();
		expect(v.container.textContent).toContain("Anand Raghavan");
		await click(button(v, "Submit 1 draft"));
		expect(calls.some((c) => c[0] === "submit")).toBe(false);
		await click(button(v, "Yes, submit 1"));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Additional Salary", "HR-ADD-7"]);
	});

	it("says loans are not on the site rather than inventing any", async () => {
		const v = await draw();
		expect(v.container.textContent).toContain("Loans are not on this site");
	});
});

describe("step 3 — the salary run", () => {
	it("starts the month's run: a draft Payroll Entry, and hrms picks who is on it", async () => {
		site.picked = [{ employee: "HR-EMP-00001", employee_name: "Anand", department: "P", designation: "O", name: "x1", idx: 1 }];
		const v = await draw();
		await click(button(v, "Start the salary run"));
		await act(async () => {});
		const made = calls.find((c) => c[0] === "create" && c[1] === "Payroll Entry");
		expect(made[2]).toMatchObject({ company: "Manna Rubber", start_date: START, end_date: END, payroll_frequency: "Monthly" });
		expect(calls.find((c) => c[0] === "method")).toEqual(["method", "Payroll Entry", "HR-PRUN-1", "fill_employee_details"]);
		expect(v.container.textContent).toContain("HR-PRUN-1 made");
	});

	it("starts nothing for all companies at once", async () => {
		act(() => set({ company: "" }));
		const v = await draw();
		expect(button(v, "Start the salary run").disabled).toBe(true);
		expect(v.container.textContent).toContain("Pick a company");
	});

	it("starts nothing over a month that already has its run", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01" }];
		const v = await draw();
		expect(button(v, "Start the salary run")).toBeUndefined();
	});

	it("makes the slips only after a confirm, by submitting the entry", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01", number_of_employees: 3 }];
		const v = await draw();
		await click(button(v, "Create salary slips"));
		expect(calls.some((c) => c[0] === "submit")).toBe(false);
		await click(button(v, "Yes, create 3 salary slips"));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Payroll Entry", "HR-PRUN-1"]);
	});

	it("leaves submitting the slips — the step that pays — to Frappe", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, company: "Manna Rubber", creation: "2026-09-01" }];
		site.slips = [{ name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", docstatus: 0, gross_pay: 13000, total_deduction: 500, net_pay: 12500, payment_days: 30 }];
		const v = await draw();
		const a = [...v.container.querySelectorAll("a")].find((x) => x.textContent === "Submit the slips in Frappe");
		expect(a.getAttribute("href")).toBe("https://erp.example.invalid/app/payroll-entry/HR-PRUN-1");
		expect([...v.container.querySelectorAll("button")].some((b) => /submit the slips/i.test(b.textContent))).toBe(false);
	});

	it("never writes a Salary Slip", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01" }];
		const v = await draw();
		await click(button(v, "Create salary slips"));
		await click(button(v, "Yes, create salary slips"));
		await act(async () => {});
		expect(calls.some((c) => c.includes("Salary Slip"))).toBe(false);
	});
});

describe("step 4 — the sheet", () => {
	const slips = () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, company: "Manna Rubber", creation: "2026-09-01" }];
		site.slips = [{ name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", docstatus: 1, gross_pay: 13000, total_deduction: 2500, net_pay: 10500, payment_days: 30 }];
		site.details = [
			{ parent: "SAL-1", parentfield: "earnings", salary_component: "Basic", amount: 12000, idx: 1 },
			{ parent: "SAL-1", parentfield: "earnings", salary_component: "Leave Encashment", amount: 1000, idx: 2 },
			{ parent: "SAL-1", parentfield: "deductions", salary_component: "Salary Advance", amount: 2000, idx: 1 },
			{ parent: "SAL-1", parentfield: "deductions", salary_component: "Loan EMI", amount: 500, idx: 2 },
		];
	};

	it("lays the slip's own figures out with leave encashment, the advance and the loan as columns", async () => {
		slips();
		const v = await draw();
		const heads = [...v.container.querySelectorAll("table[aria-label^='Salary sheet'] th")].map((h) => h.textContent);
		expect(heads.join("|")).toMatch(/Leave Encashment.*leave encashment/);
		expect(heads.join("|")).toMatch(/Salary Advance.*advance/);
		expect(heads.join("|")).toMatch(/Loan EMI.*loan EMI/);
		expect(v.container.textContent).toContain("12,000.00");
		expect(v.container.textContent).toContain("10,500.00");
	});

	it("has an Excel button that is off until there is something to put in it", async () => {
		const v = await draw();
		expect(button(v, "Download Excel").disabled).toBe(true);
	});

	it("tiles the month from the slips", async () => {
		slips();
		const v = await draw();
		expect(v.container.textContent).toContain("₹13,000");
		expect(v.container.textContent).toContain("₹10,500");
	});
});

describe("reading", () => {
	it("keys the month on company and period like the rest of payroll", async () => {
		await draw();
		expect(store.getState().app.pay[payKey("Manna Rubber", START, END)].state).toBe("ok");
	});
});
