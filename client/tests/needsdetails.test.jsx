import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import EmployeeCard from "@/components/EmployeeCard";
import EmployeeMaster from "@/features/employees/EmployeeMaster";
import { needsDetails, PLACEHOLDER_BIRTH } from "@/lib/scope";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Records the bridge makes for somebody who punches and is on no record
   (bridge/mannabridge/autoenrol.py, 3 October 2026). Their gender and date of
   birth are placeholders, and the dashboard has to say so wherever the person
   is drawn until HR has put it right.
   --------------------------------------------------------------------------- */

const wrote = [];
vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, apiWrite: (...a) => { wrote.push(a); return Promise.resolve({ ok: true }); } };
});

const MADE = {
	name: "HR-EMP-09001", employee_name: "AJIT BORAH", employee_number: null, status: "Active",
	company: "Manna Rubber", gender: "Prefer not to say", date_of_birth: PLACEHOLDER_BIRTH,
	date_of_joining: "2026-10-02", attendance_device_id: "860", custom_needs_details: 1,
	doctype: "Employee", docstatus: 0,
};

beforeEach(() => {
	wrote.length = 0;
	resetStore();
	const base = loadedState();
	const employees = base.employees.concat([MADE]);
	set({ ...base, employees, byName: Object.fromEntries(employees.map((e) => [e.name, e])) });
});

describe("which records need details", () => {
	it("is_the_tick_wherever_the_site_has_the_field", () => {
		expect(needsDetails({ custom_needs_details: 1, date_of_birth: "1990-01-01" })).toBe(true);
		expect(needsDetails({ custom_needs_details: 0, date_of_birth: PLACEHOLDER_BIRTH })).toBe(false);
	});

	it("is_the_placeholder_birth_date_only_on_a_site_without_the_field", () => {
		expect(needsDetails({ date_of_birth: PLACEHOLDER_BIRTH })).toBe(true);
		expect(needsDetails({ date_of_birth: "1994-04-12" })).toBe(false);
		expect(needsDetails({})).toBe(false);
	});
});

describe("on Employee Master", () => {
	it("says_how_many_were_added_from_punches_and_shows_only_them_when_asked", async () => {
		let v;
		await act(async () => { v = render(<Provider store={store}><EmployeeMaster /></Provider>); });
		expect(v.container.textContent).toContain("added automatically from fingerprint punches");
		const cards = () => [...v.container.querySelectorAll("[data-emp], article.ecard")];
		expect(cards().length).toBeGreaterThan(1);

		await act(async () => { [...v.container.querySelectorAll("button")].find((b) => b.textContent === "Show them").click(); });
		expect(cards().map((c) => c.textContent.includes("AJIT BORAH"))).toEqual([true]);
	});

	it("marks_the_card", () => {
		const v = render(<EmployeeCard e={MADE} onOpen={() => {}} />);
		expect(v.container.querySelector(".eneeds").textContent).toBe("Needs details");
	});
});

describe("on the profile", () => {
	const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);

	it("says_what_is_made_up_and_clears_the_tick_when_hr_says_it_is_correct", async () => {
		set({ empSel: MADE.name, empDoc: { [MADE.name]: MADE }, proftab: "about" });
		const v = draw();
		expect(v.container.textContent).toContain("Added automatically from a fingerprint punch");
		await act(async () => {
			[...v.container.querySelectorAll("button")].find((b) => b.textContent === "Details are correct").click();
		});
		expect(wrote).toEqual([["Employee", MADE.name, { custom_needs_details: 0 }]]);
		expect(getState().byName[MADE.name].custom_needs_details).toBe(0);
	});

	it("offers_no_button_on_a_site_without_the_field", () => {
		const { custom_needs_details: _gone, ...bare } = MADE;
		set({ empSel: MADE.name, empDoc: { [MADE.name]: bare }, proftab: "about" });
		const v = draw();
		expect(v.container.textContent).toContain("Added automatically from a fingerprint punch");
		expect([...v.container.querySelectorAll("button")].some((b) => b.textContent === "Details are correct")).toBe(false);
	});

	it("says_nothing_on_an_ordinary_record", () => {
		const one = loadedState().employees[0];
		set({ empSel: one.name, empDoc: { [one.name]: { ...one, doctype: "Employee" } }, proftab: "about" });
		const v = draw();
		expect(v.container.textContent).not.toContain("Added automatically");
	});
});
