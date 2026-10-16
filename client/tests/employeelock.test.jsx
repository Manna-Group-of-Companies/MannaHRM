import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeMaster from "@/features/employees/EmployeeMaster";
import EmployeeProfile from "@/features/employees/EmployeeProfile";
import { SALARY_VIEW_ONLY, employeesLocked, landingFor } from "@/data/menus";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* The four company logins read employees and change nothing about them
   (16 October 2026) — data/menus.js employeesLocked. */

const COMPANY = "hitechrubber@mannarubber.com";

/** One Employee as the document endpoint returns it — see profileedit.test.jsx. */
const DOC = {
	name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001", status: "Active",
	company: "Manna Rubber", department: "Production - MR", designation: "Operator", reports_to: null,
	date_of_joining: "2019-04-01", date_of_birth: "1988-02-11", cell_number: "9000000001",
	doctype: "Employee", docstatus: 0, modified: "2026-08-25 11:12:13",
};

async function draw(Page, user, extra = {}) {
	act(() => set({ ...loadedState(), user, empSel: DOC.name, empDoc: { [DOC.name]: DOC }, proftab: "about", ...extra }));
	let view;
	await act(async () => { view = render(<Provider store={store}><Page /></Provider>); });
	return view;
}

const texts = (view) => [...view.container.querySelectorAll("button, label")].map((b) => b.textContent.trim());

beforeEach(() => resetStore());

describe("a company login on Employees", () => {
	it("is the same four logins that may not change a salary", () => {
		for (const u of SALARY_VIEW_ONLY) expect(employeesLocked(u)).toBe(true);
		expect(employeesLocked("hr@mannarubber.com")).toBe(false);
	});

	it("cannot open Create Employee by its address, which every other login can", () => {
		expect(landingFor("employees", "new", COMPANY, true)).toBe("overview");
		expect(landingFor("employees", "new", "hr@mannarubber.com", true)).toBe("new");
	});

	it("gets no Add New Employee and no import on Employee Master, and keeps the export", async () => {
		const view = await draw(EmployeeMaster, COMPANY);
		const t = texts(view).join(" | ");
		expect(t).not.toContain("Add New Employee");
		expect(t).not.toContain("Import From Onboarding");
		expect(t).toContain("Export Employees Data");
	});

	it("gets no Edit, no pencil, no Deactivate and no photograph control on a profile", async () => {
		const view = await draw(EmployeeProfile, COMPANY);
		expect(view.container.querySelector(".prohead")).not.toBeNull();
		const t = texts(view).join(" | ");
		expect(t).not.toContain("✎ Edit");
		expect(t).not.toContain("Deactivate");
		expect(view.container.querySelector('[aria-label="Edit this record"]')).toBeNull();
		expect(view.container.querySelector('.proava input[type="file"]')).toBeNull();
	});

	it("leaves HR's own login every control it had", async () => {
		const view = await draw(EmployeeProfile, "hr@mannarubber.com");
		expect(texts(view).join(" | ")).toContain("✎ Edit");
		const master = await draw(EmployeeMaster, "hr@mannarubber.com");
		expect(texts(master).join(" | ")).toContain("Add New Employee");
	});
});
