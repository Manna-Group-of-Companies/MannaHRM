import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Sidebar, { pagesOf } from "@/layout/Sidebar";
import GoTo, { destinations, rank } from "@/layout/GoTo";
import { MODULES } from "@/routes/registry";
import { tabsFor } from "@/data/menus";
import { isHidden, visibleSections } from "@/data/sections";
import { store, set, getState, resetStore } from "@/store";

/* ---------------------------------------------------------------------------
   The navigation of 6 October 2026: the open module's pages listed in the rail,
   and Ctrl+K to go to any page by name.

   **The rule both of these share** is that they offer exactly what the page
   strip offers — no page a login's menu would hide, and none it would show
   left out. The strip is read through `tabsFor` and `isHidden`; so are these,
   and the tests below hold them to it rather than to a list typed out here.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);

/** What the page strip would draw for this module — the reference. */
const stripOf = (section, user) =>
	tabsFor(section, MODULES[section]?.tabs || [], user, null).filter((t) => !isHidden(section, t[0]));

beforeEach(() => {
	resetStore();
	localStorage.clear();
	window.history.replaceState({}, "", "/");
});
afterEach(() => localStorage.clear());

describe("the rail's list of pages", () => {
	it("lists the open module's pages, the same ones the strip over the page would", () => {
		set({ user: HR, section: "attendance", subtab: "daily" });
		const { container } = draw(<Sidebar />);
		const listed = [...container.querySelectorAll(".navsub .navpage")].map((a) => a.textContent);
		expect(listed).toEqual(stripOf("attendance", HR).map((t) => t[1]));
		expect(listed.length).toBeGreaterThan(1);
	});

	it("lists the pages of the open module only, so the rail stays a short menu", () => {
		set({ user: HR, section: "attendance" });
		const { container } = draw(<Sidebar />);
		const groups = [...container.querySelectorAll(".navsub")];
		expect(groups).toHaveLength(1);
		expect(groups[0].getAttribute("aria-label")).toBe("Attendance pages");
	});

	it("marks the open page as current, and no other page", () => {
		set({ user: HR, section: "attendance", subtab: "daily" });
		const { container } = draw(<Sidebar />);
		const on = [...container.querySelectorAll('.navpage[aria-current="page"]')];
		expect(on).toHaveLength(1);
		expect(on[0].textContent).toBe(stripOf("attendance", HR).find((t) => t[0] === "daily")[1]);
	});

	it("does not count a page as a module, so the rail still has one link per module", () => {
		/* chrome.test.jsx counts `.nav .lab` against SECTIONS; a page drawn as a
		   `.nav` would make every module look like it had grown a dozen siblings. */
		set({ user: HR, section: "attendance" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector(".navsub .nav")).toBeNull();
		expect(container.querySelector(".navsub .lab")).toBeNull();
	});

	it("moves to the page in the store when one is clicked, without reloading", () => {
		set({ user: HR, section: "attendance", subtab: "overview" });
		const { container } = draw(<Sidebar />);
		const daily = [...container.querySelectorAll(".navpage")]
			.find((a) => a.textContent === stripOf("attendance", HR).find((t) => t[0] === "daily")[1]);
		const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
		act(() => { daily.dispatchEvent(click); });
		expect(click.defaultPrevented).toBe(true);
		expect(getState().subtab).toBe("daily");
	});

	it("draws no list for a module with a single page, whose link already goes there", () => {
		for (const m of visibleSections()) {
			const n = pagesOf(m.key, HR, null).length;
			resetStore();
			set({ user: HR, section: m.key });
			const { container, unmount } = draw(<Sidebar />);
			expect(Boolean(container.querySelector(".navsub")), m.key).toBe(n > 1);
			unmount();
		}
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
		const hit = rank(rows, "attendance daily");
		expect(hit.length).toBeGreaterThan(0);
		expect(hit.every((r) => r.section === "attendance")).toBe(true);
		expect(hit[0].label.toLowerCase()).toContain("daily");
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
		fireEvent.change(box, { target: { value: "daily detail" } });
		const first = container.querySelector('.gotolist [aria-selected="true"]');
		expect(first.textContent.toLowerCase()).toContain("daily");

		await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
		expect(getState().palette).toBe(false);
		expect(getState().section).toBe("attendance");
		expect(getState().subtab).toBe("daily");
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
