import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";
import fs from "node:fs";
import path from "node:path";

import EmployeePayroll from "@/features/payroll/EmployeePayroll";
import PayslipDetail from "@/features/payroll/PayslipDetail";
import PayrollSettings, { PAYROLL_EXPECTS } from "@/features/payroll/PayrollSettings";
import { payKey } from "@/api/payroll";
import { periodOf } from "@/lib/payroll";
import { lastMonth } from "@/lib/payrollrun";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Payroll as the HRDashboard reference draws it (21 October 2026): Employee
   Payroll, which opens the run and pays nobody (D14); one payslip as Payroll
   Detail; and Payroll Settings, read and not written (D6).
   --------------------------------------------------------------------------- */

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
const ym = lastMonth();
const [start, end] = periodOf(ym).iso;
const SLIPS = [
	{ name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", docstatus: 1, gross_pay: 30000, total_deduction: 3600, net_pay: 26400, start_date: start, end_date: end, payment_days: 30, total_working_days: 30 },
	{ name: "SAL-2", employee: "HR-EMP-00002", employee_name: "Beena Thomas", docstatus: 0, gross_pay: 20000, total_deduction: 2400, net_pay: 17600, start_date: start, end_date: end },
];
const LINES = [
	{ parent: "SAL-1", parentfield: "earnings", salary_component: "Basic", amount: 30000, idx: 1 },
	{ parent: "SAL-1", parentfield: "deductions", salary_component: "Provident Fund", amount: 3600, idx: 1 },
];
const withPay = () => ({
	...loadedState(),
	pay: { [payKey("", start, end)]: { state: "ok", entries: [], slips: SLIPS, assignments: [], details: LINES, err: "" } },
});

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("Employee Payroll", () => {
	it("lists the month's slips with their totals, Draft or Submitted as the site says", async () => {
		await act(async () => set(withPay()));
		const { container } = draw(<EmployeePayroll />);
		expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
		expect(container.textContent).toContain("₹44,000");
		expect(container.textContent).toContain("Submitted");
		expect(container.textContent).toContain("Draft");
		expect(container.textContent).toContain("60% submitted");
	});

	it("pays nobody: no Pay or Pay all, and Open the run goes to the Payroll page", async () => {
		await act(async () => set(withPay()));
		const { container } = draw(<EmployeePayroll />);
		const words = [...container.querySelectorAll("button")].map((b) => b.textContent);
		expect(words.some((w) => /^Pay( all)?\b/.test(w))).toBe(false);
		await act(async () => { [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Open the run")).click(); });
		expect(getState().section).toBe("payroll");
		expect(getState().subtab).toBe("overview");
	});

	it("opens a slip as Payroll Detail", async () => {
		await act(async () => set(withPay()));
		const { container } = draw(<EmployeePayroll />);
		await act(async () => { container.querySelector("tbody tr").click(); });
		expect(getState().payView).toEqual({ emp: "HR-EMP-00001", ym });
		expect(getState().subtab).toBe("slip");
	});
});

describe("Payroll Detail", () => {
	it("draws the slip's own earnings and deductions and its net pay", async () => {
		await act(async () => set({ ...withPay(), payView: { emp: "HR-EMP-00001", ym } }));
		const { container } = draw(<PayslipDetail />);
		expect(container.textContent).toContain("Basic");
		expect(container.textContent).toContain("Provident Fund");
		expect(container.textContent).toContain("₹26,400");
		expect(container.textContent).toContain("Submitted on the site");
	});
});

describe("Payroll Settings", () => {
	it("expects what manna_hr/payrollsetup.py expects", () => {
		const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/payrollsetup.py"), "utf8");
		/* The tuple's own body, to its closing bracket on a line of its own —
		   the file has Windows line endings. */
		const block = /PAYROLL_SETTINGS = \(([\s\S]*?)\r?\n\)/.exec(py)[1];
		const pairs = [...block.matchAll(/\("([a-z_]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
		expect(PAYROLL_EXPECTS.map(([f, v]) => [f, v])).toEqual(pairs);
	});

	it("says when Payroll Based On is not Attendance, and writes nothing", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({
			data: { data: { name: "Payroll Settings", payroll_based_on: "Leave", consider_unmarked_attendance_as: "Present" } },
		}));
		const put = vi.spyOn(http, "put");
		const post = vi.spyOn(http, "post");
		let view;
		await act(async () => { view = draw(<PayrollSettings />); });
		await vi.waitFor(() => expect(view.container.textContent).toContain("Should be Attendance"));
		expect(view.container.textContent).toContain("1 setting differs");
		expect(view.container.querySelector("form, input, select")).toBeNull();
		expect(put).not.toHaveBeenCalled();
		expect(post).not.toHaveBeenCalled();
	});
});
