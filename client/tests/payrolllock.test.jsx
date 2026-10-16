import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import PayrollRun from "@/features/payroll/PayrollRun";
import { MODULES } from "@/routes/registry";
import { SALARY_VIEW_ONLY, landingFor, salaryLocked, tabsFor } from "@/data/menus";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* The four company logins run payroll and download it, and change no pay
   (16 October 2026) — data/menus.js. */

const COMPANY = "mannatreads@mannarubber.com";

async function draw(user) {
	act(() => set({ ...loadedState(), user, section: "payroll", subtab: "overview" }));
	let view;
	await act(async () => { view = render(<Provider store={store}><PayrollRun /></Provider>); });
	return view;
}

beforeEach(() => resetStore());

describe("a company login on Payroll", () => {
	it("is shown the Payroll page, Advances & Loans and Payslips, and no page that changes a salary", () => {
		for (const user of SALARY_VIEW_ONLY) {
			expect(tabsFor("payroll", MODULES.payroll.tabs, user, true).map((t) => t[0])).toEqual(["overview", "advances", "slips"]);
		}
	});

	it("is shown Manage Shift, where several people are given a shift at once", () => {
		for (const user of SALARY_VIEW_ONLY) {
			expect(tabsFor("attendance", MODULES.attendance.tabs, user, true).map((t) => t[0])).toContain("shifts");
			expect(landingFor("attendance", "shifts", user, true)).toBe("shifts");
		}
	});

	it("lands on the Payroll page from the address of a page that changes a salary", () => {
		for (const page of ["setup", "increments", "actualsalary"]) {
			expect(landingFor("payroll", page, COMPANY, true)).toBe("overview");
		}
	});

	it("is the four company logins and nobody else, whatever the case of the address", () => {
		expect(SALARY_VIEW_ONLY).toHaveLength(4);
		expect(salaryLocked("MannaTreads@MannaRubber.com")).toBe(true);
		expect(salaryLocked("hr@mannarubber.com")).toBe(false);
	});

	it("keeps the downloads and loses every control that adds or submits pay", async () => {
		const view = await draw(COMPANY);
		const labels = [...view.container.querySelectorAll("button")].map((b) => b.textContent);
		expect(labels).toContain("Download Excel");
		expect(labels).toContain("Download 5-tab Excel");
		expect(view.container.querySelector("#pr-amt")).toBeNull();
		expect(view.container.querySelector("#pr-person")).toBeNull();
		expect(labels.some((l) => /^Add to |^Add loan instalments|^Submit \d+ draft|^Make /.test(l))).toBe(false);
	});

	it("leaves HR's own login every control it had", async () => {
		const view = await draw("hr@mannarubber.com");
		expect(view.container.querySelector("#pr-amt")).not.toBeNull();
	});
});
