import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Home from "@/features/dashboard/Home";
import { store, set, getState, resetStore } from "@/store";
import { storedLayout } from "@/lib/homelayout";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The front page: the HRDashboard reference's Dashboard, Layouts 1 and 2
   (21 October 2026). lib/home.js has its own tests for the arithmetic; these
   are the page — what it draws while the site is answering, what it draws
   once it has, and that Layout 2 still carries Start Up.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const draw = () => render(<Provider store={store}><Home /></Provider>);

beforeEach(() => {
	resetStore();
	localStorage.clear();
	window.history.replaceState({}, "", "/");
});
afterEach(() => localStorage.clear());

const loaded = (extra = {}) => act(() => set({ ...loadedState(), user: HR, connState: "live", ...extra }));

describe("the front page", () => {
	it("draws the reference's skeleton until the first load is in", () => {
		const { container } = draw();
		expect(container.querySelector('[aria-busy="true"] .k-sk')).not.toBeNull();
		expect(container.querySelector(".k-stat-v")).toBeNull();
	});

	it("greets somebody by name and says how many work here", async () => {
		await loaded();
		const { container } = draw();
		expect(container.querySelector(".k-ph h1").textContent).toMatch(/^Good (morning|afternoon|evening), Hr$/);
		const active = getState().employees.filter((e) => e.status === "Active").length;
		const total = [...container.querySelectorAll(".k-stat")].find((b) => b.textContent.includes("Total Employees"));
		expect(total.querySelector(".k-stat-v b").textContent).toBe(String(active));
	});

	it("says what is waiting, with the button to it", async () => {
		await loaded();
		const { container } = draw();
		const strip = container.querySelector(".k-alert");
		const s = getState();
		expect(strip.textContent).toContain(`${s.approvals.leave.length} time-off request`);
		expect(within(strip).getByText("Review requests").getAttribute("href")).toBe("/dashboard/approvals");
	});

	it("lists the active people five to a page, and finds one by name", async () => {
		await loaded();
		const { container } = draw();
		const card = [...container.querySelectorAll(".k-card")].find((c) => c.querySelector("h3")?.textContent === "Employees");
		const active = getState().employees.filter((e) => e.status === "Active");
		expect(card.querySelectorAll("tbody tr").length).toBe(Math.min(5, active.length));
		fireEvent.change(card.querySelector('input[aria-label="Search employees"]'),
			{ target: { value: active[0].employee_name } });
		expect(card.querySelectorAll("tbody tr").length).toBe(1);
		fireEvent.change(card.querySelector('input[aria-label="Search employees"]'), { target: { value: "zzzz" } });
		expect(card.textContent).toContain("No one matches");
	});

	it("opens a person from the table", async () => {
		await loaded();
		const { container } = draw();
		const row = container.querySelector(".k-dash-bot tbody tr");
		fireEvent.click(row);
		expect(getState().section).toBe("employees");
		expect(getState().subtab).toBe("profile");
	});

	it("switches to Layout 2, remembers it, and carries Start Up under it", async () => {
		await loaded();
		const { container } = draw();
		fireEvent.click(within(container.querySelector('[aria-label="Dashboard layout"]')).getByText("Layout 2"));
		expect(getState().homeLayout).toBe(2);
		expect(storedLayout()).toBe(2);
		expect(container.querySelector(".k-v2-band h1").textContent).toBe("Hi, Hr");
		expect(container.querySelector(".k-startup").textContent).toContain("Employee Attendance Summary");
	});

	it("keeps Add employee from a login that only reads employees", async () => {
		await loaded({ user: "mannarubber.products@mannarubber.com" });
		const { container } = draw();
		expect(container.textContent).not.toContain("Add employee");
		expect(container.textContent).toContain("Request time off");
	});
});
