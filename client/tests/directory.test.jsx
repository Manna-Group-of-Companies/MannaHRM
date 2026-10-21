import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Directory from "@/features/employees/Directory";
import OrgChart, { orgTree } from "@/features/employees/OrgChart";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Directory and Org chart, shown again as the HRDashboard reference's
   (21 October 2026, D15). Both read the active people in the company picked
   and nothing else; the chart is built from Reports To.
   --------------------------------------------------------------------------- */

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
const p = (name, reports_to = "", extra = {}) => ({
	name, employee_name: name, reports_to, status: "Active", company: "Manna Rubber", department: "Production", ...extra,
});

beforeEach(() => resetStore());

describe("the reporting tree", () => {
	it("heads a line with whoever reports to nobody here, and sets aside who manages nobody", () => {
		const t = orgTree([p("MD"), p("Plant head", "MD"), p("Operator", "Plant head"), p("Driver"), p("Stray", "Somebody gone")]);
		expect(t.roots.map((e) => e.name)).toEqual(["MD"]);
		expect(t.kids.get("MD").map((e) => e.name)).toEqual(["Plant head"]);
		expect(t.alone.map((e) => e.name).sort()).toEqual(["Driver", "Stray"]);
	});

	it("does not loop on somebody marked as reporting to themselves", () => {
		const t = orgTree([p("Self", "Self")]);
		expect(t.roots).toEqual([]);
		expect(t.alone.map((e) => e.name)).toEqual(["Self"]);
	});
});

describe("the org chart page", () => {
	it("folds a team away and back from the count under its manager", async () => {
		const employees = [p("MD"), p("Plant head", "MD"), p("Operator", "Plant head")];
		await act(async () => set({ ...loadedState(), employees, byName: Object.fromEntries(employees.map((e) => [e.name, e])) }));
		const { container } = draw(<OrgChart />);
		const fold = container.querySelector('[aria-label="Hide 1 reports"]');
		await act(async () => { fold.click(); });
		expect(fold.closest("li").classList.contains("k-closed")).toBe(true);
		expect(container.textContent).toContain("Expand all");
	});

	it("says there are no reporting lines on a site where nobody has a manager", async () => {
		const employees = [p("A"), p("B")];
		await act(async () => set({ ...loadedState(), employees, byName: Object.fromEntries(employees.map((e) => [e.name, e])) }));
		const { container } = draw(<OrgChart />);
		expect(container.textContent).toContain("No reporting lines yet");
		expect(container.textContent).toContain("Not in a reporting line · 2");
	});
});

describe("the directory", () => {
	it("draws everybody active, narrows by department and by name, and opens a profile", async () => {
		await act(async () => set(loadedState()));
		const active = getState().employees.filter((e) => e.status === "Active");
		const { container } = draw(<Directory />);
		const cards = () => [...container.querySelectorAll(".k-job")];
		expect(cards().length).toBe(active.length);

		const dept = active.find((e) => e.department).department;
		const tabs = container.querySelector('[role="tablist"]');
		await act(async () => { [...within(tabs).getAllByRole("tab")].find((b) => b.textContent.startsWith(dept.split(" - ")[0])).click(); });
		expect(cards().length).toBe(active.filter((e) => e.department === dept).length);

		const someone = active.find((e) => e.department === dept);
		fireEvent.change(container.querySelector('input[aria-label="Search directory"]'), { target: { value: someone.employee_name } });
		expect(cards().length).toBe(1);
		await act(async () => { within(cards()[0]).getByText("Profile").click(); });
		expect(getState().subtab).toBe("profile");
	});
});
