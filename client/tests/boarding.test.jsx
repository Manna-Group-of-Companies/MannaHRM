import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Checklist from "@/features/checklist/Checklist";
import { http } from "@/api/client";
import { store, set, resetStore } from "@/store";
import {
	activitiesFrom, checkOnboarding, checkSeparation, checkTemplate, onboardingDoc, separationDoc, templateDoc,
} from "@/lib/boarding";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Onboarding and offboarding started here, on hrms's own doctypes (29 October
   2026). What is pinned: a checklist is made submitted — hrms makes the Tasks
   on submit — its tasks are the template's copied and edited, and an
   onboarding has the Job Applicant and Job Offer hrms will not do without.
   --------------------------------------------------------------------------- */

const EMP = { name: "HR-EMP-00001", employee_name: "Anand Raghavan", company: "Manna Rubber", department: "Stores", designation: "Operator" };
const TASK = { activity_name: "Return the laptop", user: "it@manna.com", role: "", begin_on: "2", duration: "3" };

describe("the rules", () => {
	it("an offboarding is an Employee Separation for that person, with each task's who and when", () => {
		const doc = separationDoc({ employee: EMP.name, begins: "2026-11-01", resigned: "2026-10-15", template: "Exit", activities: [TASK] }, EMP);
		expect(doc).toEqual({
			employee: EMP.name, employee_name: "Anand Raghavan", company: "Manna Rubber", department: "Stores", designation: "Operator",
			boarding_begins_on: "2026-11-01", resignation_letter_date: "2026-10-15", employee_separation_template: "Exit",
			activities: [{ activity_name: "Return the laptop", user: "it@manna.com", begin_on: 2, duration: 3 }],
		});
	});

	it("refuses a checklist with no person, no tasks, a nameless task or a login that is not an email", () => {
		expect(checkSeparation({ begins: "2026-11-01", activities: [TASK] }, null)).toMatch(/Pick the person/);
		expect(checkSeparation({ employee: EMP.name, begins: "2026-11-01", activities: [] }, EMP)).toMatch(/at least one task/);
		expect(checkSeparation({ employee: EMP.name, begins: "2026-11-01", activities: [{ activity_name: " " }] }, EMP)).toMatch(/Task 1 has no name/);
		expect(checkSeparation({ employee: EMP.name, begins: "2026-11-01", activities: [{ activity_name: "x", user: "anand" }] }, EMP)).toMatch(/not a login email/);
		expect(checkSeparation({ employee: EMP.name, begins: "2026-11-01", activities: [TASK] }, EMP)).toBe("");
	});

	it("an onboarding begins on the joining date and needs the email hrms keys an applicant on", () => {
		const f = { name: "Meera", email: "meera@x.com", company: "Manna Rubber", joining: "2026-11-03", activities: [TASK] };
		expect(checkOnboarding({ ...f, email: "" })).toMatch(/email/);
		expect(checkOnboarding(f)).toBe("");
		expect(onboardingDoc(f)).toMatchObject({ employee_name: "Meera", custom_personal_email: "meera@x.com", date_of_joining: "2026-11-03", boarding_begins_on: "2026-11-03" });
	});

	it("copies a template's tasks, and a template is named and has tasks", () => {
		expect(activitiesFrom({ activities: [{ activity_name: "ID card", role: "HR User", begin_on: 0, duration: 0, name: "row1" }] }))
			.toEqual([{ activity_name: "ID card", role: "HR User", begin_on: 0, duration: 1 }]);
		expect(checkTemplate({ title: "", activities: [TASK] })).toMatch(/Name the template/);
		expect(templateDoc({ title: "Exit — staff", activities: [TASK] })).toMatchObject({ title: "Exit — staff", company: "", department: "", designation: "" });
	});
});

describe("starting an offboarding on the page", () => {
	beforeEach(() => resetStore());
	afterEach(() => vi.restoreAllMocks());

	it("makes the Employee Separation submitted from the checklist, with no ticks on it, never opening the desk", async () => {
		const sent = [];
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [] } }));
		vi.spyOn(http, "post").mockImplementation((url, body) => { sent.push([decodeURIComponent(url), body]); return Promise.resolve({ data: { data: { name: "HR-EMP-SEP-1" } } }); });
		const state = loadedState();
		await act(async () => set({ ...state, company: "", section: "checklist", subtab: "overview", boarding: { state: "ok", Onboarding: [], Offboarding: [] } }));
		const { container, getByText } = render(<Provider store={store}><Checklist /></Provider>);
		expect(container.querySelector('a[href*="/app/"]')).toBeNull();
		await act(async () => { getByText("Start offboarding").click(); });
		const who = state.employees.find((e) => !e.status || e.status === "Active");
		fireEvent.change(container.ownerDocument.querySelector("#sb-emp"), { target: { value: who.name } });
		const doc = container.ownerDocument;
		expect(doc.querySelectorAll(".k-check input")).toHaveLength(0);
		while (doc.querySelectorAll(".k-check-x").length > 1) {
			await act(async () => { doc.querySelectorAll(".k-check-x")[1].click(); });
		}
		fireEvent.change(doc.querySelector('[aria-label="Add a checklist item"]'), { target: { value: "Return the laptop bag" } });
		await act(async () => { [...doc.querySelectorAll(".k-modal button")].find((b) => b.textContent === "Add").click(); });
		await act(async () => { fireEvent.submit(doc.querySelector("#sb-emp").closest("form")); });
		const sep = sent.find(([u]) => u === "/api/resource/Employee Separation");
		expect(sep[1]).toMatchObject({ employee: who.name, docstatus: 1, activities: [
			{ activity_name: "Laptop received", begin_on: 0, duration: 1 },
			{ activity_name: "Return the laptop bag", begin_on: 0, duration: 1 },
		] });
	});
});
