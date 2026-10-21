import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Sidebar, { pagesOf } from "@/layout/Sidebar";
import SubNav from "@/layout/SubNav";
import GoTo, { destinations, rank } from "@/layout/GoTo";
import { MODULES } from "@/routes/registry";
import { tabsFor } from "@/data/menus";
import { isHidden, visibleSections } from "@/data/sections";
import { groupsFor, inRail } from "@/data/nav";
import { store, set, getState, resetStore } from "@/store";

/* ---------------------------------------------------------------------------
   The navigation: the pages listed in the side menu, and Ctrl+K to go to any
   page by name.

   **The rule both of these share** is that they offer exactly what the page
   strip offers — no page a login's menu would hide, and none it would show
   left out. The strip is read through `tabsFor` and `isHidden`; so are these,
   and the tests below hold them to it rather than to a list typed out here.

   Since 21 October 2026 the menu is the HRDashboard reference's groups, and a
   group lists the pages of every module it holds (data/nav.js) where the old
   rail listed the open module's only. The rule did not move.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const COMPANY = "mannarubber.products@mannarubber.com";
const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);

/** What the page strip would draw for this module — the reference. */
const stripOf = (section, user) =>
	tabsFor(section, MODULES[section]?.tabs || [], user, null).filter((t) => !isHidden(section, t[0]));

/** The pages a group lists for one of its modules, by name. */
const listed = (container, group, section) =>
	[...container.querySelectorAll(`[data-group="${group}"] .sub-in a`)]
		.filter((a) => a.getAttribute("href").split("/")[1] === section)
		.map((a) => a.textContent);

beforeEach(() => {
	resetStore();
	localStorage.clear();
	window.history.replaceState({}, "", "/");
});
afterEach(() => localStorage.clear());

describe("the menu's list of pages", () => {
	it("lists each module's pages in its group, the same ones the strip over the page would", () => {
		set({ user: HR, section: "attendance", subtab: "monthly" });
		const { container } = draw(<Sidebar />);
		expect(listed(container, "attendance", "attendance")).toEqual(stripOf("attendance", HR).map((t) => t[1]));
		expect(listed(container, "timeoff", "leave")).toEqual(stripOf("leave", HR).map((t) => t[1]));
		expect(listed(container, "checklist", "onboard")).toEqual(stripOf("onboard", HR).map((t) => t[1]));
	});

	it("lists only what a login's own menu shows it", () => {
		/* The company login is shown eight Attendance pages and three of
		   Payroll (data/menus.js); its menu must not offer the rest. */
		set({ user: COMPANY, section: "attendance" });
		const { container } = draw(<Sidebar />);
		expect(listed(container, "attendance", "attendance")).toEqual(stripOf("attendance", COMPANY).map((t) => t[1]));
		expect(listed(container, "payroll", "payroll")).toEqual(stripOf("payroll", COMPANY).map((t) => t[1]));
		expect(listed(container, "attendance", "attendance").length)
			.toBeLessThan(stripOf("attendance", HR).length);
	});

	it("marks the open page as current, and no other page", () => {
		set({ user: HR, section: "attendance", subtab: "monthly" });
		const { container } = draw(<Sidebar />);
		const on = [...container.querySelectorAll('.sub-in a[aria-current="page"]')];
		expect(on).toHaveLength(1);
		expect(on[0].textContent).toBe(stripOf("attendance", HR).find((t) => t[0] === "monthly")[1]);
	});

	it("does not count a page as a group, so the menu still has one button per group", () => {
		set({ user: HR, section: "attendance" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector(".sub-in .nav-g")).toBeNull();
		expect(container.querySelectorAll(".nav-g > button")).toHaveLength(groupsFor(HR, null).length);
	});

	it("moves to the page in the store when one is clicked, without reloading", () => {
		set({ user: HR, section: "attendance", subtab: "overview" });
		const { container } = draw(<Sidebar />);
		const monthly = [...container.querySelectorAll(".sub-in a")]
			.find((a) => a.textContent === stripOf("attendance", HR).find((t) => t[0] === "monthly")[1]);
		const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
		act(() => { monthly.dispatchEvent(click); });
		expect(click.defaultPrevented).toBe(true);
		expect(getState().subtab).toBe("monthly");
	});

	it("leaves the strip over the page to the modules the menu does not list", () => {
		/* Reports and Settings are the header's link and the menu's foot, not
		   groups, so their pages are switched by the strip; every other module's
		   strip says it is in the menu, and a desktop with the menu open hides it. */
		for (const m of visibleSections()) {
			if (stripOf(m.key, HR).length < 2) continue;
			resetStore();
			set({ user: HR, section: m.key, subtab: stripOf(m.key, HR)[0][0] });
			const { container, unmount } = draw(<SubNav />);
			const bar = container.querySelector("nav.subbar");
			expect(bar, m.key).not.toBeNull();
			expect(bar.hasAttribute("data-inrail"), m.key).toBe(inRail(m.key));
			unmount();
		}
		expect(inRail("settings")).toBe(false);
		expect(inRail("reports")).toBe(false);
		expect(inRail("attendance")).toBe(true);
	});

	it("keeps pagesOf on the menu, where GoTo has always found it", () => {
		expect(pagesOf("attendance", HR, null)).toEqual(stripOf("attendance", HR));
	});
});

describe("go to a page", () => {
	it("offers every page the strip would, and nothing it would not", () => {
		const offered = new Set(destinations(HR, null).filter((d) => !d.top).map((d) => d.id));
		const expected = new Set();
		for (const m of visibleSections()) {
			for (const [sub] of stripOf(m.key, HR)) expected.add(m.key + "/" + sub);
		}
		expect([...offered].sort()).toEqual([...expected].sort());
	});

	it("leaves out a module a login is not shown", () => {
		/* On Board is the HR login's alone — see ONLY_FOR in data/menus.js. */
		const mine = destinations("someone@mannarubber.com", null).map((d) => d.section);
		expect(mine).not.toContain("onboard");
		expect(destinations(HR, null).map((d) => d.section)).toContain("onboard");
	});

	it("finds a page from a word of its module and a word of its name", () => {
		const rows = destinations(HR, null);
		const hit = rank(rows, "attendance monthly");
		expect(hit.length).toBeGreaterThan(0);
		expect(hit.every((r) => r.section === "attendance")).toBe(true);
		expect(hit[0].label.toLowerCase()).toContain("monthly");
	});

	it("puts a page whose name starts with the first word above one that only contains it", () => {
		const rows = [
			{ id: "a", module: "X", label: "Release Notes" },
			{ id: "b", module: "X", label: "Leave Balance" },
		];
		expect(rank(rows, "lea").map((r) => r.id)).toEqual(["b", "a"]);
	});

	it("returns every row for an empty box rather than none", () => {
		const rows = destinations(HR, null);
		expect(rank(rows, "   ")).toHaveLength(rows.length);
	});

	it("opens on Ctrl+K, and Enter goes to the highlighted page and closes it", async () => {
		set({ user: HR, section: "dashboard", subtab: "overview" });
		const { container } = draw(<GoTo />);
		expect(container.querySelector(".goto")).toBeNull();

		await act(async () => { fireEvent.keyDown(document, { key: "k", ctrlKey: true }); });
		expect(getState().palette).toBe(true);

		const box = container.querySelector(".gotofind input");
		fireEvent.change(box, { target: { value: "monthly basic" } });
		const first = container.querySelector('.gotolist [aria-selected="true"]');
		expect(first.textContent.toLowerCase()).toContain("monthly");

		await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
		expect(getState().palette).toBe(false);
		expect(getState().section).toBe("attendance");
		expect(getState().subtab).toBe("monthly");
	});

	it("closes on Escape and goes nowhere", async () => {
		set({ user: HR, section: "dashboard", subtab: "overview", palette: true });
		const { container } = draw(<GoTo />);
		const box = container.querySelector(".gotofind input");
		await act(async () => { fireEvent.keyDown(box, { key: "Escape" }); });
		expect(getState().palette).toBe(false);
		expect(getState().section).toBe("dashboard");
	});

	it("says so when nothing matches, rather than drawing an empty box", async () => {
		set({ user: HR, palette: true });
		const { container } = draw(<GoTo />);
		fireEvent.change(container.querySelector(".gotofind input"), { target: { value: "zzqx" } });
		expect(container.querySelector(".gotonone").textContent).toContain("No page");
	});
});
