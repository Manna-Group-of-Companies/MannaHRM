import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Home, { PIECES, previewAsked } from "@/features/dashboard/Home";
import { store, set, getState, resetStore } from "@/store";
import { storedLayout } from "@/lib/homelayout";
import { loadedState } from "./fixture";
import { todayIso } from "@/lib/format";

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

	it("opens New Employees on Reports → Onboarding, where New Joining is", async () => {
		await loaded();
		const { container } = draw();
		const tile = [...container.querySelectorAll(".k-stat")].find((b) => b.textContent.includes("New Employees"));
		await act(async () => { fireEvent.click(tile); });
		expect(getState().section).toBe("reports");
		expect(getState().subtab).toBe("onboarding");
	});

	/* 21 October 2026, asked for by HR. */
	it("opens with today's birthdays once a day, and the button shows them again", async () => {
		const st = loadedState();
		const md = todayIso().slice(5, 10);
		const who = st.employees.find((e) => e.status === "Active");
		const employees = st.employees.map((e) => (e.name === who.name
			? { ...e, date_of_birth: `1990-${md}`, custom_needs_details: 0 }
			: { ...e, date_of_birth: e.date_of_birth && String(e.date_of_birth).slice(5, 10) === md ? "1990-01-15" : e.date_of_birth }));
		await loaded({ employees });
		const first = draw();
		const dialog = document.querySelector('.k-modal[role="dialog"]');
		expect(dialog.getAttribute("aria-label")).toBe("Birthday today");
		expect(dialog.textContent).toContain(who.employee_name);
		/* The popper and its confetti, hidden from a screen reader. */
		expect(dialog.querySelector('.k-bday-burst[aria-hidden="true"] .k-bday-pop').textContent).toBe("🎉");
		expect(dialog.querySelectorAll(".k-bday-burst i")).toHaveLength(PIECES.length);
		await act(async () => { within(dialog).getAllByRole("button", { name: "Close" }).at(-1).click(); });
		expect(document.querySelector('.k-modal[role="dialog"]')).toBeNull();
		first.unmount();

		/* The same day again: no pop-up, the button instead. */
		const again = draw();
		expect(document.querySelector('.k-modal[role="dialog"]')).toBeNull();
		await act(async () => { within(again.container).getByRole("button", { name: "1 birthday today" }).click(); });
		expect(document.querySelector('.k-modal[role="dialog"]').textContent).toContain(who.employee_name);
	});

	it("previews the birthday pop-up only on the dev server, and only when asked", () => {
		expect(previewAsked("?birthday=test", true)).toBe(true);
		expect(previewAsked("?birthday=test", false)).toBe(false);
		expect(previewAsked("", true)).toBe(false);
		expect(previewAsked("?birthday=yes", true)).toBe(false);
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
