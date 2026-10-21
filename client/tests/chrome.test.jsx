import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import AppShell from "@/layout/AppShell";
import Sidebar from "@/layout/Sidebar";
import TopBar from "@/layout/TopBar";
import BottomBar from "@/layout/BottomBar";
import { visibleSections } from "@/data/sections";
import { sectionFor } from "@/data/menus";
import { NAV, DASHBOARD, FOOT, HEADER_LINKS, groupsFor } from "@/data/nav";
import { avatarTone } from "@/components/kit/KitAvatar";
import { store, set, getState, resetStore } from "@/store";
import { DEFAULT_RAIL, saveRail, storedRail } from "@/lib/rail";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The chrome: the side menu, the header, the phone's bottom bar, and the two
   preferences that outlive a tab.

   The rest of the suite renders pages without the shell — see the note at the
   top of pages.test.jsx — which is right, and leaves exactly this uncovered.

   **Rebuilt on 21 October 2026 with the menu** (docs/kit-pages.md, D2): the
   HRDashboard reference's groups in place of Factor HR's nine modules in a
   row. What these tests held the old rail to still holds of the new one — a
   login sees exactly its own menu, one page is lit, the drawer shuts on the
   way out — and they say it of the new markup.

   **The failure this file exists to catch** is one that looks fine on screen
   until somebody is on the wrong device: `rail` is remembered and `drawer` is
   not, because a rail remembered as "wide" on a desktop means "over the page"
   on a phone. They are two keys for that reason and the test says so.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
const groupLabels = (c) => [...c.querySelectorAll(".nav-g > button .lbl")].map((el) => el.textContent);

beforeEach(() => {
	resetStore();
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

describe("the side menu", () => {
	it("draws the reference's groups this login is shown, in the reference's order", () => {
		set({ user: HR });
		const { container } = draw(<Sidebar />);
		const labels = groupLabels(container);
		expect(labels).toEqual(groupsFor(HR, null).map((g) => g.label));
		/* In NAV's order, whatever is left out. */
		const order = NAV.map((g) => g.label);
		expect(labels.map((l) => order.indexOf(l))).toEqual([...labels.map((l) => order.indexOf(l))].sort((a, b) => a - b));
		expect(labels.length).toBeGreaterThan(3);
	});

	/* Notifications since 21 October 2026: the header's bell, whose See all
	   opens it (tests/settingshelpkit.test.jsx). */
	it("reaches every module a login is shown — from a group, the Dashboard button, the foot, the header or the bell", () => {
		for (const user of [HR, "mannarubber.products@mannarubber.com", "someone@mannarubber.com"]) {
			const inGroups = new Set(groupsFor(user, null).flatMap((g) => g.items.map((i) => i.section)));
			for (const m of visibleSections().filter((s) => sectionFor(s.key, null, user))) {
				const reached = inGroups.has(m.key) || m.key === DASHBOARD || FOOT.includes(m.key)
					|| HEADER_LINKS.some((l) => l.section === m.key) || m.key === "notifications";
				expect(reached, `${user}: ${m.key}`).toBe(true);
			}
		}
	});

	it("leaves On Board out for any login but the HR one, and puts it under Checklist for that one", () => {
		set({ user: "someone@mannarubber.com" });
		const other = draw(<Sidebar />).container;
		expect(other.querySelector('a[href^="/onboard"]')).toBeNull();

		const hr = groupsFor(HR, null).find((g) => g.key === "checklist");
		expect(hr.items.some((i) => i.section === "onboard")).toBe(true);
	});

	it("lights the open page and its group, and nothing else", () => {
		set({ user: HR, section: "attendance", subtab: "monthly" });
		const { container } = draw(<Sidebar />);
		const lit = [...container.querySelectorAll(".nav-g.has-on")];
		expect(lit).toHaveLength(1);
		expect(lit[0].textContent).toContain("Attendance");
		const on = [...container.querySelectorAll('.sidenav a[aria-current="page"]')];
		expect(on).toHaveLength(1);
		expect(on[0].getAttribute("href")).toBe("/attendance/monthly");
		expect(container.querySelector('.dash-btn[aria-current="page"]')).toBeNull();
	});

	it("makes the Dashboard button the current page on the dashboard, with its own pages under it", () => {
		set({ user: HR, section: "dashboard", subtab: "overview" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector('.dash-btn[aria-current="page"]')).not.toBeNull();
		expect(container.querySelector(".nav-g.has-on")).toBeNull();
		const sub = container.querySelector(".dash-sub");
		expect(sub).not.toBeNull();
		expect(within(sub).getByText("Approvals")).toBeTruthy();
	});

	it("opens and shuts a group on its button, and opens the current one by itself", () => {
		set({ user: HR, section: "attendance", subtab: "overview" });
		const { container } = draw(<Sidebar />);
		const att = container.querySelector('[data-group="attendance"] > button');
		expect(att.getAttribute("aria-expanded")).toBe("true");

		const emp = container.querySelector('[data-group="employees"] > button');
		expect(emp.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(emp);
		expect(emp.getAttribute("aria-expanded")).toBe("true");
		fireEvent.click(emp);
		expect(emp.getAttribute("aria-expanded")).toBe("false");
	});

	it("keeps a shut group's pages out of the tab order", () => {
		set({ user: HR, section: "attendance" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector('[data-group="employees"] .sub-in').hasAttribute("inert")).toBe(true);
		expect(container.querySelector('[data-group="attendance"] .sub-in').hasAttribute("inert")).toBe(false);
	});

	it("goes to a group's first page on the collapsed strip, where there is no room to open it", () => {
		set({ user: HR, section: "dashboard", rail: "slim" });
		const { container } = draw(<Sidebar />);
		fireEvent.click(container.querySelector('[data-group="attendance"] > button'));
		const first = groupsFor(HR, null).find((g) => g.key === "attendance").items[0];
		expect(getState().section).toBe(first.section);
		expect(getState().subtab).toBe(first.subtab);
	});

	it("never carries a class a page already uses for something else", () => {
		/* `skip` is the skip-to-content link, a fixed pill parked off the top of
		   the page. The old rail's coverage dot once carried it as a class and
		   inherited all of it; nothing in the menu may. */
		set({ user: HR });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector(".skip")).toBeNull();
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

	it("switches between light and dark from its foot", () => {
		const { container } = draw(<Sidebar />);
		fireEvent.click(container.querySelector('.theme-sw button[title="Dark"]'));
		expect(getState().mode).toBe("dark");
		fireEvent.click(container.querySelector('.theme-sw button[title="Light"]'));
		expect(getState().mode).toBe("light");
	});

	it("says whether the site is answering, and leaves who is signed in to the header", () => {
		set({ user: HR, conn: "live", connState: "live" });
		const { container } = draw(<Sidebar />);
		expect(container.querySelector(".railconn").textContent).toContain("live");
		expect(container.textContent).not.toContain(HR);

		const header = draw(<TopBar />).container;
		expect(header.querySelector(".tbme").getAttribute("title")).toBe(HR);
	});

	it("names the company it is scoped to where the reference names its own", () => {
		act(() => set({ ...loadedState(), user: HR }));
		const first = getState().companies[0].name;
		const { container, rerender } = draw(<Sidebar />);
		expect(container.querySelector(".brand-name").textContent).toBe("Manna Group");
		act(() => set({ company: first }));
		rerender(<Provider store={store}><Sidebar /></Provider>);
		expect(container.querySelector(".brand-name").textContent).toBe(first);
	});
});

describe("the bottom bar", () => {
	it("keeps four destinations and Menu for a phone, and lights Menu for a page it does not hold", () => {
		set({ user: HR, section: "payroll" });
		const { container } = draw(<BottomBar />);
		const labels = [...container.querySelectorAll(".bnav > a, .bnav > button")].map((el) => el.textContent);
		expect(labels).toEqual(["Home", "People", "Time off", "Attendance", "Menu"]);

		const menu = container.querySelector(".bmenu");
		expect(menu.classList.contains("on")).toBe(true);
		fireEvent.click(menu);
		expect(getState().drawer).toBe(true);
	});

	it("lights the destination of the module that is open", () => {
		set({ user: HR, section: "leave" });
		const { container } = draw(<BottomBar />);
		const on = [...container.querySelectorAll(".bnav .on")];
		expect(on).toHaveLength(1);
		expect(on[0].textContent).toBe("Time off");
	});

	it("tops itself up from the menu for a login shown fewer than four", () => {
		/* A login that is not an admin is shown Employees and nothing else
		   (data/menus.js USER_ONLY); its bar still has something to press. */
		set({ user: "someone@mannarubber.com", admin: false, section: "employees" });
		const { container } = draw(<BottomBar />);
		const labels = [...container.querySelectorAll(".bnav > a")].map((el) => el.textContent);
		expect(labels).toContain("People");
		expect(labels).not.toContain("Home");
	});
});

describe("the drawer", () => {
	it("is shut when the app opens, however wide the rail was left", () => {
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
		   navigation handler — and a menu link with no handler is a link the
		   browser follows, which reloads the app and re-reads the whole site.
		   `defaultPrevented` is what says the move stayed in the page. */
		set({ user: HR, drawer: true, section: "dashboard" });
		const { container } = draw(<Sidebar />);
		const link = container.querySelector('.sidenav a[href="/employees"]');

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

	it("carries the company picker for a screen too narrow for the header's", () => {
		act(() => set(loadedState()));
		const { container } = draw(<Sidebar />);
		const first = getState().companies[0].name;
		fireEvent.change(container.querySelector(".sideco"), { target: { value: first } });
		expect(getState().company).toBe(first);
	});
});

describe("the header", () => {
	it("lights the link of the page that is open", () => {
		set({ user: HR, section: "reports", subtab: "overview" });
		const { container } = draw(<TopBar />);
		const on = container.querySelector('.toplinks a[aria-current="page"]');
		expect(on.textContent).toBe("Report");
	});

	it("finds people, pages and actions as somebody types", async () => {
		await act(async () => set({ ...loadedState(), user: HR }));
		const { container } = draw(<TopBar />);
		const box = container.querySelector(".tbfind input");
		const someone = getState().employees.find((e) => e.employee_name);
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: someone.employee_name.split(" ")[0] } });
		const res = container.querySelector(".search-res");
		expect(res.classList.contains("show")).toBe(true);
		expect(within(res).getByText("People")).toBeTruthy();
		expect(res.textContent).toContain(someone.employee_name);

		fireEvent.change(box, { target: { value: "monthly basic" } });
		expect(within(res).getByText("Pages")).toBeTruthy();
		expect(res.textContent).toContain("Monthly Basic Attendance");

		fireEvent.change(box, { target: { value: "sign out" } });
		expect(within(res).getByText("Actions")).toBeTruthy();
	});

	it("goes to a page from the search with the arrows and Enter", async () => {
		await act(async () => set({ ...loadedState(), user: HR }));
		const { container } = draw(<TopBar />);
		const box = container.querySelector(".tbfind input");
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "monthly basic" } });
		fireEvent.keyDown(box, { key: "Enter" });
		expect(getState().section).toBe("attendance");
		expect(getState().subtab).toBe("monthly");
		expect(box.value).toBe("");
	});

	it("says plainly when nothing matches, and Escape empties the box", () => {
		const { container } = draw(<TopBar />);
		const box = container.querySelector(".tbfind input");
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "zzzz" } });
		expect(container.querySelector(".search-res").textContent).toContain("Nothing matches");
		fireEvent.keyDown(box, { key: "Escape" });
		expect(box.value).toBe("");
	});

	it("puts the caret in the search on \"/\", but not while somebody is typing in a box", () => {
		const { container } = draw(<><TopBar /><input data-other="" /></>);
		const box = container.querySelector(".tbfind input");
		fireEvent.keyDown(document.body, { key: "/" });
		expect(document.activeElement).toBe(box);

		const other = container.querySelector("[data-other]");
		other.focus();
		fireEvent.keyDown(other, { key: "/" });
		expect(document.activeElement).toBe(other);
	});

	it("scopes the app to one company", () => {
		act(() => set(loadedState()));
		const { container } = draw(<TopBar />);
		const pick = container.querySelector(".tbco");
		const first = getState().companies[0].name;
		fireEvent.change(pick, { target: { value: first } });
		expect(getState().company).toBe(first);
	});

	it("says how many are waiting, and shows its dot only when something is", async () => {
		const { container, rerender } = draw(<TopBar />);
		const bell = () => container.querySelector('.tbicon[aria-haspopup="menu"]');
		expect(bell().getAttribute("aria-label")).toBe("Nothing waiting");
		expect(container.querySelector(".dot-n")).toBeNull();

		await act(async () => set(loadedState()));
		rerender(<Provider store={store}><TopBar /></Provider>);
		const s = getState();
		const waiting = s.approvals.attendance.length + s.approvals.leave.length;
		expect(waiting).toBeGreaterThan(0);
		expect(bell().getAttribute("aria-label")).toBe(`${waiting} waiting`);
		expect(container.querySelector(".dot-n")).not.toBeNull();
	});

	it("lists what is waiting under it, and says so plainly when nothing is", async () => {
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
		   press. The waiting button by what it is, not by where it sits. */
		const { container, rerender } = draw(<TopBar />);
		fireEvent.click(container.querySelector('.tbicon[aria-haspopup="menu"]'));
		expect(getState().tbnotif).toBe(true);

		rerender(<Provider store={store}><TopBar /></Provider>);
		fireEvent.click(container.querySelector(".tbme"));
		expect(getState().tbme).toBe(true);
		expect(getState().tbnotif).toBe(false);
	});
});

describe("the avatar", () => {
	it("colours one name the same every time, as the reference's hash does", () => {
		/* The reference's `av()`: h = h * 31 + code, unsigned, then mod 7. */
		const ref = (name) => {
			let h = 0;
			for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
			return (h % 7) + 1;
		};
		for (const n of ["Pristia Candra", "Raghav Menon", "hr@mannarubber.com", "?"]) {
			expect(avatarTone(n)).toBe(ref(n));
			expect(avatarTone(n)).toBe(avatarTone(n));
		}
	});
});
