import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import AppShell from "@/layout/AppShell";
import Sidebar from "@/layout/Sidebar";
import TopBar from "@/layout/TopBar";
import { SECTIONS, NAV_GROUPS } from "@/data/sections";
import { store, set, getState, resetStore } from "@/store";
import { DEFAULT_RAIL, saveRail, storedRail } from "@/lib/rail";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The chrome: the rail, the header, and the two preferences that outlive a tab.

   The rest of the suite renders pages without the shell — see the note at the
   top of pages.test.jsx — which is right, and leaves exactly this uncovered:
   the nine links, the collapse control, the drawer, the bell's count, and the
   two things written to `localStorage`.

   **The failure this file exists to catch** is one that looks fine on screen
   until somebody is on the wrong device: `rail` is remembered and `drawer` is
   not, because a rail remembered as "wide" on a desktop means "over the page"
   at 820px — which opened a tablet on a menu covering a grey screen. They are
   two keys for that reason and the test says so.
   --------------------------------------------------------------------------- */

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);

beforeEach(() => {
	resetStore();
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

describe("the rail", () => {
	it("draws every module in SECTIONS, in that order", () => {
		/* Read off the same table the router reads, so a module added to the app
		   is a case here without anybody remembering to add one. */
		const { container } = draw(<Sidebar />);
		const labels = [...container.querySelectorAll(".nav .lab")].map((el) => el.textContent);
		expect(labels).toEqual(SECTIONS.map((s) => s.label));
	});

	it("puts a heading over each group without moving an item out of Factor HR's order", () => {
		const { container } = draw(<Sidebar />);
		const headings = [...container.querySelectorAll(".navgroup")].map((el) => el.textContent);
		expect(headings).toEqual(NAV_GROUPS.map((g) => g.title));
	});

	it("marks the open module as the current page and nothing else", () => {
		set({ section: "attendance" });
		const { container } = draw(<Sidebar />);
		const on = [...container.querySelectorAll('.nav[aria-current="page"]')];
		expect(on).toHaveLength(1);
		expect(on[0].textContent).toContain("Attendance");
	});

	it("carries each module's coverage as an attribute, never as a class", () => {
		/* `skip` is one of the four coverage states *and* the name of this app's
		   skip-to-content link — a fixed pill parked off the top of the page. A
		   dot carrying that as a class inherited all of it. */
		const { container } = draw(<Sidebar />);
		const dots = [...container.querySelectorAll(".nav .cdot")];
		expect(dots.map((d) => d.dataset.cov)).toEqual(SECTIONS.map((s) => s.cov));
		expect(container.querySelector(".cdot.skip")).toBeNull();
	});

	it("collapses and expands, and remembers which", () => {
		const { container } = draw(<Sidebar />);
		const toggle = container.querySelector(".railtoggle");
		expect(getState().rail).toBe(DEFAULT_RAIL);

		fireEvent.click(toggle);
		expect(getState().rail).toBe("slim");
		expect(storedRail()).toBe("slim");

		fireEvent.click(container.querySelector(".railtoggle"));
		expect(getState().rail).toBe("wide");
		expect(storedRail()).toBe("wide");
	});

	it("says who is signed in and whether the site is answering", () => {
		set({ user: "hr@mannarubber.com", conn: "live", connState: "live" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector(".railwho").textContent).toContain("hr@mannarubber.com");
		expect(container.querySelector(".railconn").textContent).toContain("live");
	});
});

describe("the drawer", () => {
	it("is shut when the app opens, however wide the rail was left", () => {
		/* The one that mattered: `rail` outlives the tab and `drawer` does not,
		   because "wide" remembered from a desktop means "over the page" at
		   820px. A tablet that opens on a menu over a grey screen is what
		   happens when these are one key. */
		saveRail("wide");
		resetStore();
		expect(getState().rail).toBe("wide");
		expect(getState().drawer).toBe(false);
	});

	it("opens from the header and closes again", () => {
		const { container } = draw(<TopBar />);
		const burger = container.querySelector(".tbrail");
		fireEvent.click(burger);
		expect(getState().drawer).toBe(true);
		fireEvent.click(container.querySelector(".tbrail"));
		expect(getState().drawer).toBe(false);
	});

	it("closes when somebody follows a link out of it, without reloading the page", () => {
		/* The second half is the one that bit: `Link` spreads `{...rest}` after
		   its own `onClick`, so a caller passing one used to replace the
		   navigation handler — and a rail link with no handler is a link the
		   browser follows, which reloads the app and re-reads the whole site.
		   `defaultPrevented` is what says the move stayed in the page. */
		set({ drawer: true, section: "dashboard" });
		const { container } = draw(<Sidebar />);
		const link = [...container.querySelectorAll(".nav")]
			.find((a) => a.textContent.includes("Employees"));

		const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
		act(() => { link.dispatchEvent(click); });

		expect(getState().drawer).toBe(false);
		expect(click.defaultPrevented).toBe(true);
		expect(getState().section).toBe("employees");
	});

	it("closes on Escape, and the scrim is only reachable while it is open", async () => {
		set({ user: "hr@x", drawer: true });
		const { container } = draw(<AppShell />);
		expect(container.querySelector(".railscrim").hidden).toBe(false);

		await act(async () => {
			fireEvent.keyDown(document, { key: "Escape" });
		});
		expect(getState().drawer).toBe(false);

		const scrim = container.querySelector(".railscrim");
		expect(scrim.hidden).toBe(true);
		expect(scrim.tabIndex).toBe(-1);
	});
});

describe("the header", () => {
	it("says which module and which page is open", () => {
		set({ section: "employees", subtab: "salary" });
		const { container } = draw(<TopBar />);
		expect(container.querySelector(".tbwhere").textContent).toContain("Employees");
		expect(container.querySelector(".tbwhere").textContent).toContain("Salary Master");
	});

	it("takes typing in the search box and hands it to the store", () => {
		const { container } = draw(<TopBar />);
		const box = container.querySelector('.tbfind input[type="search"]');
		fireEvent.change(box, { target: { value: "raghav" } });
		expect(getState().q).toBe("raghav");
	});

	it("offers a way to clear the search only once there is something to clear", () => {
		const { container, rerender } = draw(<TopBar />);
		expect(container.querySelector(".tbfind .clear")).toBeNull();

		fireEvent.change(container.querySelector('.tbfind input[type="search"]'), {
			target: { value: "raghav" },
		});
		rerender(<Provider store={store}><TopBar /></Provider>);
		fireEvent.click(container.querySelector(".tbfind .clear"));
		expect(getState().q).toBe("");
	});

	it("scopes the app to one company", () => {
		act(() => set(loadedState()));
		const { container } = draw(<TopBar />);
		const pick = container.querySelector(".tbco");
		const first = getState().companies[0].name;
		fireEvent.change(pick, { target: { value: first } });
		expect(getState().company).toBe(first);
	});

	it("counts what is waiting, and counts nothing when nothing is", async () => {
		const { container, rerender } = draw(<TopBar />);
		expect(container.querySelector(".tbicon .n")).toBeNull();

		await act(async () => set(loadedState()));
		rerender(<Provider store={store}><TopBar /></Provider>);
		const s = getState();
		const waiting = s.approvals.attendance.length + s.approvals.leave.length;
		expect(Number(container.querySelector(".tbicon .n").textContent)).toBe(waiting);
	});

	it("lists what is waiting under the bell, and says so plainly when nothing is", async () => {
		set({ tbnotif: true });
		const { container, rerender } = draw(<TopBar />);
		const menu = container.querySelector(".tbmenu");
		expect(menu.hidden).toBe(false);
		expect(menu.textContent).toContain("Nothing is waiting");

		await act(async () => set({ ...loadedState(), tbnotif: true }));
		rerender(<Provider store={store}><TopBar /></Provider>);
		expect(within(container.querySelector(".tbmenu")).getAllByRole("menuitem").length)
			.toBeGreaterThan(0);
	});

	it("opens one menu at a time", () => {
		/* Two panels hanging off one bar, both anchored right — open together
		   they overlap, and the one underneath is a menu you can see and cannot
		   press. */
		const { container, rerender } = draw(<TopBar />);
		fireEvent.click(container.querySelectorAll(".tbicon")[0]);
		expect(getState().tbnotif).toBe(true);

		rerender(<Provider store={store}><TopBar /></Provider>);
		fireEvent.click(container.querySelector(".tbme"));
		expect(getState().tbme).toBe(true);
		expect(getState().tbnotif).toBe(false);
	});
});
