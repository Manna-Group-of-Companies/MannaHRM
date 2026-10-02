import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import SalaryProcess from "@/features/payroll/SalaryProcess";
import SalaryRegister from "@/features/payroll/SalaryRegister";
import Payslip from "@/features/payroll/Payslip";
import { entryFor, periodOf, runState, slipLines, structureFor, withoutStructure } from "@/lib/payroll";
import { payKey } from "@/api/payroll";
import { fyOf } from "@/data/payroll";
import { fmt, todayIso } from "@/lib/format";
import { store, set, patch, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Payroll, run from the dashboard: Start Salary Process makes the month's
   draft Payroll Entry and hrms picks the people; Create Salary Slips submits
   it and hrms makes the draft slips; Finalize — which pays — stays on the
   desk. Every amount on these screens is hrms's, off the slips.
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
					: dt === "Salary Structure Assignment" ? site.ssa : [],
		),
		api: (path) => Promise.resolve({ data: path.includes("Salary Detail") ? site.details : [] }),
		getDoc: (dt) => Promise.resolve(dt === "Company" ? site.company : null),
		apiCreate: (dt, doc) => { calls.push(["create", dt, doc]); return Promise.resolve({ name: "HR-PRUN-1", ...doc }); },
		apiDocMethod: (dt, name, method) => {
			calls.push(["method", dt, name, method]);
			return Promise.resolve({ docs: [{ employees: site.picked }] });
		},
		apiWrite: (dt, name, p) => { calls.push(["write", dt, name, p]); return Promise.resolve({ ok: true }); },
		apiSubmitDraft: (dt, name) => { calls.push(["submit", dt, name]); return Promise.resolve({}); },
	};
});

const YM = todayIso().slice(0, 7);
const [START, END] = periodOf(YM).iso;
const CO = { default_payroll_payable_account: "Payroll Payable - MR", cost_center: "Main - MR", default_currency: "INR" };
const slip = (employee, net, docstatus = 0, more = {}) => ({
	name: "SAL-" + employee, employee, company: "Manna Rubber", start_date: START, end_date: END,
	docstatus, gross_pay: net + 500, total_deduction: 500, net_pay: net, payment_days: 30, ...more,
});

beforeEach(() => {
	calls.length = 0;
	site = { entries: [], slips: [], ssa: [], details: [], company: CO, picked: [] };
	resetStore();
	act(() => set(loadedState()));
	act(() => set({ company: "Manna Rubber" }));
});

async function draw(Page) {
	let view;
	await act(async () => { view = render(<Provider store={store}><Page /></Provider>); });
	await act(async () => {});
	return view;
}

const button = (v, text) => [...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const click = (el) => act(async () => { el.click(); });

describe("what a month's documents mean", () => {
	it("walks a month from nothing to finalized", () => {
		expect(runState(null, [])).toBe("none");
		expect(runState({ docstatus: 0 }, [])).toBe("draft");
		expect(runState({ docstatus: 1 }, [])).toBe("queued");
		expect(runState({ docstatus: 1 }, [{ docstatus: 0 }, { docstatus: 1 }])).toBe("slips");
		expect(runState({ docstatus: 1 }, [{ docstatus: 1 }])).toBe("final");
		expect(runState({ docstatus: 1, status: "Failed" }, [])).toBe("failed");
	});

	it("takes the submitted entry over a draft of the same month", () => {
		expect(entryFor([{ name: "A", docstatus: 0, creation: "2" }, { name: "B", docstatus: 1, creation: "1" }]).name).toBe("B");
	});

	it("finds the structure in force at the month's end, not one that starts after it", () => {
		const ssa = [{ employee: "E", from_date: "2026-01-01", salary_structure: "Old" },
			{ employee: "E", from_date: "2026-04-01", salary_structure: "New" },
			{ employee: "E", from_date: "2099-01-01", salary_structure: "Later" }];
		expect(structureFor(ssa, "E", "2026-09-30").salary_structure).toBe("New");
		expect(withoutStructure([{ name: "E" }, { name: "F" }], ssa, "2026-09-30").map((e) => e.name)).toEqual(["F"]);
	});

	it("splits a slip's lines into earnings and deductions", () => {
		const rows = [{ parent: "S1", parentfield: "earnings", salary_component: "Basic", amount: 12000 },
			{ parent: "S1", parentfield: "deductions", salary_component: "PF", amount: 1440 },
			{ parent: "S2", parentfield: "earnings", salary_component: "Basic", amount: 9 }];
		expect(slipLines(rows, "S1")).toEqual({ earnings: [["Basic", 12000]], deductions: [["PF", 1440]] });
	});
});

describe("Salary Process", () => {
	it("starts a month's run: a draft Payroll Entry with the Company's accounts, and hrms picks who is on it", async () => {
		site.picked = [{ employee: "HR-EMP-00001", employee_name: "Anand", department: "P", designation: "O", name: "x1", idx: 1 }];
		const v = await draw(SalaryProcess);
		await click(button(v, "Start Salary Process"));
		await act(async () => {});

		const made = calls.find((c) => c[0] === "create");
		expect(made[1]).toBe("Payroll Entry");
		expect(made[2]).toMatchObject({ company: "Manna Rubber", start_date: START, end_date: END,
			payroll_frequency: "Monthly", payroll_payable_account: "Payroll Payable - MR", cost_center: "Main - MR" });
		expect(calls.find((c) => c[0] === "method")).toEqual(["method", "Payroll Entry", "HR-PRUN-1", "fill_employee_details"]);
		/* Only the child table's own fields — its name and index are the site's. */
		expect(calls.find((c) => c[0] === "write")[3]).toEqual({ employees: [
			{ employee: "HR-EMP-00001", employee_name: "Anand", department: "P", designation: "O", is_salary_withheld: 0 }] });
		expect(v.container.textContent).toContain("HR-PRUN-1 made");
	});

	it("will not start without the Company's payroll accounts, and says which is missing", async () => {
		site.company = { cost_center: "Main - MR", default_currency: "INR" };
		const v = await draw(SalaryProcess);
		await click(button(v, "Start Salary Process"));
		await act(async () => {});
		expect(calls.some((c) => c[0] === "create")).toBe(false);
		expect(v.container.textContent).toContain("Default Payroll Payable Account");
	});

	it("starts nothing for all companies at once, since a run is one company's month", async () => {
		act(() => set({ company: "" }));
		const v = await draw(SalaryProcess);
		expect(button(v, "Start Salary Process").disabled).toBe(true);
	});

	it("starts nothing a second time over a month that already has its entry", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01" }];
		const v = await draw(SalaryProcess);
		expect(button(v, "Start Salary Process").disabled).toBe(true);
	});

	it("creates the slips only after a confirm, by submitting the entry", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01", number_of_employees: 3 }];
		const v = await draw(SalaryProcess);
		expect(v.container.textContent).toContain("PEOPLE PICKED");
		await click(button(v, "Create Salary Slips"));
		expect(calls.some((c) => c[0] === "submit")).toBe(false);
		await click(button(v, "Yes, create 3 slips"));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Payroll Entry", "HR-PRUN-1"]);
	});

	it("adds up hrms's own figures and says a draft slip pays nobody", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, company: "Manna Rubber", creation: "2026-09-01" }];
		site.slips = [slip("HR-EMP-00001", 1000), slip("HR-EMP-00002", 2000)];
		const v = await draw(SalaryProcess);
		const text = v.container.textContent;
		expect(text).toContain("SLIPS IN DRAFT");
		expect(text).toContain(fmt(3000));
		expect(text).toContain("A draft slip pays nobody");
	});

	it("names who has no salary structure, since hrms leaves them off the run without a word", async () => {
		site.ssa = [{ employee: "HR-EMP-00001", from_date: "2026-01-01", docstatus: 1 }];
		const v = await draw(SalaryProcess);
		expect(v.container.textContent).toContain("have no salary structure");
		expect(v.container.textContent).toContain("Priya Menon");
	});
});

describe("Salary Register", () => {
	it("fills the money columns from each person's slip, and says no slip rather than zero", async () => {
		site.slips = [slip("HR-EMP-00001", 12000, 1)];
		act(() => patch("sreg", { run: true, year: fyOf(todayIso()), month: YM }));
		const v = await draw(SalaryRegister);
		const text = v.container.textContent;
		expect(text).toContain(fmt(12000));
		expect(text).toContain(fmt(12500));
		expect(text).toContain("no slip");
	});
});

describe("Salary Payslip", () => {
	it("prints the slip's own lines, and marks a draft as a draft", async () => {
		const key = payKey("Manna Rubber", START, END);
		act(() => set({
			pay: { [key]: { state: "ok", entries: [], assignments: [], err: "",
				slips: [slip("HR-EMP-00001", 10560)],
				details: [
					{ parent: "SAL-HR-EMP-00001", parentfield: "earnings", salary_component: "Basic", amount: 11060, idx: 1 },
					{ parent: "SAL-HR-EMP-00001", parentfield: "deductions", salary_component: "Provident Fund", amount: 500, idx: 1 },
				] } },
			pslMailState: "ok", pslMail: {},
		}));
		act(() => patch("psl", { run: true, year: fyOf(todayIso()), month: YM, emp: "HR-EMP-00001", noemail: true }));
		const v = await draw(Payslip);
		expect(v.container.textContent).toContain(fmt(10560) + " (draft)");
		await click(button(v, "🖨 Open the payslips"));
		const html = store.getState().app.pslDoc;
		expect(html).toContain("Basic");
		expect(html).toContain(fmt(11060));
		expect(html).toContain("DRAFT");
	});
});
