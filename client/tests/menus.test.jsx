import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import { allowedFor, landingFor, sectionFor, tabsFor } from "@/data/menus";
import { MODULES } from "@/routes/registry";
import { isHidden } from "@/data/sections";
import SubNav from "@/layout/SubNav";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";
import { OtReport, WeeklyReport, AbsentReport } from "@/features/attendance/RangeReports";
import { reportsFor } from "@/features/attendance/DownloadReport";

const MRP = "mannarubber.products@mannarubber.com";

describe("the Manna Rubber Products login's Attendance menu", () => {
	beforeEach(() => resetStore());

	it("is exactly the register, In Out, Monthly, OT, Daily, Absent, Weekly and Manage Shift, in that order", () => {
		const tabs = tabsFor("attendance", MODULES.attendance.tabs, MRP);
		expect(tabs.map((t) => t[1])).toEqual([
			"Employee Attendance Regularization", "In Out Activities Report", "Monthly Basic Attendance", "OT Report",
			"Daily Detail Attendance Report", "Absent Report", "Weekly Report", "Manage Shift",
		]);
	});

	it("every page on it exists", () => {
		for (const k of allowedFor("attendance", MRP)) expect(MODULES.attendance.pages[k]).toBeTruthy();
	});

	it("opening Attendance lands on the register, and a page off the menu lands there too", () => {
		expect(landingFor("attendance", "overview", MRP)).toBe("overview");
		expect(landingFor("attendance", "summary", MRP)).toBe("overview");
		expect(landingFor("attendance", "daily", MRP)).toBe("daily");
		expect(landingFor("attendance", "shifts", MRP)).toBe("shifts");
	});

	it("leaves everybody else's menu and the modules it does not name whole", () => {
		expect(tabsFor("attendance", MODULES.attendance.tabs, "it@mannarubber.com")).toBe(MODULES.attendance.tabs);
		expect(allowedFor("leave", MRP)).toBeNull();
	});

	/* Since 21 October 2026 the five reports on that menu are files from
	   Download report rather than pages on the strip (data/sections.js). */
	/* 21 October 2026, asked for by HR: Manage Shift moved to Settings, where
	   this login keeps it, the site calling it an admin; Monthly Basic is a box
	   on Reports. So the register is its one Attendance page, and one page
	   draws no strip. */
	it("is the register alone, Monthly Basic on Reports and Manage Shift in Settings, and the dialog offers its five reports", async () => {
		set({ ...loadedState(), user: MRP, section: "attendance", subtab: "overview" });
		await act(async () => { render(<Provider store={store}><SubNav /></Provider>); });
		expect(screen.queryAllByRole("link")).toHaveLength(0);
		expect(allowedFor("attendance", MRP, true)).toContain("monthly");
		expect(sectionFor("settings", true, MRP)).toBe(true);
		expect(tabsFor("settings", MODULES.settings.tabs, MRP, true).map((t) => t[0])).toContain("shifts");
		expect(reportsFor(MRP, true).map((r) => r[0]).sort()).toEqual(["absent", "daily", "inout", "ot", "weekly"]);
	});

	it("finds Manage Shift under Settings and not under Attendance, for HR as well", () => {
		expect(isHidden("attendance", "shifts")).toBe(true);
		expect(MODULES.settings.pages.shifts).toBeTruthy();
		expect(tabsFor("settings", MODULES.settings.tabs, "hr@mannarubber.com", true).map((t) => t[0])).toContain("shifts");
	});

	it.each([["OT", OtReport], ["Weekly", WeeklyReport], ["Absent", AbsentReport]])("%s report draws", async (_, C) => {
		set(loadedState());
		await act(async () => { render(<Provider store={store}><C /></Provider>); });
		expect(document.body.textContent.length).toBeGreaterThan(0);
	});
});

describe.each([MRP, "hitechrubber@mannarubber.com", "mannatreads@mannarubber.com", "mannatyreretreads@mannarubber.com"])(
	"the company login %s's Employees module", (login) => {
	beforeEach(() => resetStore());

	it("is Employee Master, Calendar and New Joining even when the site calls it an admin", () => {
		for (const admin of [true, null, false]) {
			expect(tabsFor("employees", MODULES.employees.tabs, login, admin).map((t) => t[0]))
				.toEqual(["overview", "calendar", "joining"]);
		}
	});

	it("sends a hidden Employees page to Employee Master", () => {
		expect(landingFor("employees", "detail", login, true)).toBe("overview");
	});

	it("opens Employee Profile from a person, though it is not on the strip", () => {
		expect(landingFor("employees", "profile", login, true)).toBe("profile");
	});

	it("draws no strip over Employee Master, New Joining being Reports → Onboarding and Calendar Settings → Calendar", async () => {
		expect(isHidden("employees", "joining")).toBe(true);
		expect(isHidden("employees", "calendar")).toBe(true);
		expect(tabsFor("settings", MODULES.settings.tabs, login, true).map((t) => t[0])).toContain("calendar");
		set({ ...loadedState(), user: login, admin: true, section: "employees", subtab: "overview" });
		await act(async () => { render(<Provider store={store}><SubNav /></Provider>); });
		expect(screen.queryAllByRole("link")).toHaveLength(0);
	});
});

describe("the Dashboard module", () => {
	beforeEach(() => resetStore());

	it.each([true, null])("is Start Up and Approvals alone for an admin (%s)", (admin) => {
		expect(tabsFor("dashboard", MODULES.dashboard.tabs, "it@mannarubber.com", admin).map((t) => t[0]))
			.toEqual(["overview", "approvals"]);
	});

	it("opens on Start Up, keeps Approvals, and sends any other dashboard page to Start Up", () => {
		expect(landingFor("dashboard", "overview", "it@mannarubber.com", true)).toBe("overview");
		expect(landingFor("dashboard", "approvals", "it@mannarubber.com", true)).toBe("approvals");
		expect(landingFor("dashboard", "hr", MRP, true)).toBe("overview");
	});

	it("draws two tabs on the strip", async () => {
		set({ ...loadedState(), user: "it@mannarubber.com", admin: true, section: "dashboard", subtab: "approvals" });
		await act(async () => { render(<Provider store={store}><SubNav /></Provider>); });
		expect(screen.getAllByRole("link")).toHaveLength(2);
	});
});

describe("Add New Employee", () => {
	it("opens Create Employee for every login, narrowed menu or not — but the four that only read employees", () => {
		expect(landingFor("employees", "new", "someone@mannarubber.com", false)).toBe("new");
		expect(landingFor("employees", "new", "it@mannarubber.com", true)).toBe("new");
		/* The company logins read employees and change none (16 October 2026). */
		expect(landingFor("employees", "new", MRP, true)).toBe("overview");
		expect(landingFor("employees", "new", "hitechrubber@mannarubber.com", false)).toBe("overview");
	});

	it("adds no tab to the strip", () => {
		expect(tabsFor("employees", MODULES.employees.tabs, MRP, false).map((t) => t[0]))
			.toEqual(["overview", "calendar", "joining"]);
	});
});

describe("a login that is not an admin", () => {
	beforeEach(() => resetStore());

	it("is shown Employee Master, Calendar and New Joining, and may still open Employee Profile", () => {
		expect(tabsFor("employees", MODULES.employees.tabs, "someone@mannarubber.com", false).map((t) => t[0]))
			.toEqual(["overview", "calendar", "joining"]);
		expect(landingFor("employees", "profile", "someone@mannarubber.com", false)).toBe("profile");
		for (const k of allowedFor("employees", "", false)) expect(MODULES.employees.pages[k]).toBeTruthy();
	});

	/* Settings since 21 October 2026, holding Calendar alone, when Calendar
	   moved there from Employees. */
	it("has no other module on the rail but Settings with Calendar in it, and an admin or an unanswered check keeps them all", () => {
		expect(sectionFor("employees", false)).toBe(true);
		expect(["dashboard", "attendance", "leave"].some((k) => sectionFor(k, false))).toBe(false);
		expect(sectionFor("settings", false)).toBe(true);
		expect(tabsFor("settings", MODULES.settings.tabs, "someone@mannarubber.com", false).map((t) => t[0])).toEqual(["calendar"]);
		expect(sectionFor("attendance", true)).toBe(true);
		expect(sectionFor("attendance", null)).toBe(true);
	});

	it("keeps a login's own menu where it has one, and the four Employees pages beside it", () => {
		expect(sectionFor("attendance", false, MRP)).toBe(true);
		expect(allowedFor("attendance", MRP, false)).toContain("monthly");
		expect(allowedFor("employees", MRP, false)).toEqual(["overview", "calendar", "profile", "joining"]);
		expect(sectionFor("leave", false, MRP)).toBe(false);
	});

	it("is not shown On Board unless it is the HR login, and neither is an admin", () => {
		expect(sectionFor("onboard", false, "someone@mannarubber.com")).toBe(false);
		expect(sectionFor("onboard", false, MRP)).toBe(false);
		expect(sectionFor("onboard", true, "administrator")).toBe(false);
		expect(sectionFor("onboard", null, "someone@mannarubber.com")).toBe(false);
		expect(sectionFor("onboard", true, " HR@mannarubber.com ")).toBe(true);
	});

	it("the HR login is shown On Board's Onboarding page and none of its others", () => {
		const HR = "hr@mannarubber.com";
		expect(sectionFor("onboard", false, HR)).toBe(true);
		expect(tabsFor("onboard", MODULES.onboard.tabs, HR, false).map((t) => t[0])).toEqual(["overview"]);
		expect(landingFor("onboard", "letters", HR, false)).toBe("overview");
		expect(allowedFor("employees", HR, false)).toEqual(["overview", "calendar", "profile", "joining"]);
	});

	it("lands on Employee Master from a page off the menu", () => {
		expect(landingFor("employees", "detail", "", false)).toBe("overview");
		expect(landingFor("employees", "calendar", "", false)).toBe("calendar");
	});

	it("draws no strip over Employee Master, its one page there", async () => {
		set({ ...loadedState(), user: "someone@mannarubber.com", admin: false, section: "employees", subtab: "overview" });
		await act(async () => { render(<Provider store={store}><SubNav /></Provider>); });
		expect(screen.queryAllByRole("link")).toHaveLength(0);
	});
});

import MonthlyBasic from "@/features/attendance/MonthlyBasic";

describe("Monthly Basic Attendance fills itself from the site", () => {
	beforeEach(() => resetStore());

	it("draws P from a submitted Attendance row without Generate being pressed", async () => {
		set(loadedState());
		const emp = store.getState().app.employees.find((e) => e.status === "Active");
		const now = new Date();
		const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		set({
			mb: { ...store.getState().app.mb, emp: emp.name },
			ddaData: { key: `${ym}-01|${ym}-${last}|`, state: "ok", err: "", punches: [], leave: [],
				attendance: [{ employee: emp.name, attendance_date: `${ym}-01`, status: "Present", docstatus: 1 }] },
		});
		await act(async () => { render(<Provider store={store}><MonthlyBasic /></Provider>); });
		const cells = [...document.querySelectorAll("table.muster tbody td")].map((td) => td.textContent);
		expect(cells).toContain("P");
	});

	it("draws the second employee picked, not the first one's blank row", async () => {
		set(loadedState());
		const [a, b] = store.getState().app.employees.filter((e) => e.status === "Active");
		const now = new Date();
		const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		set({
			mb: { ...store.getState().app.mb, emp: a.name },
			ddaData: { key: `${ym}-01|${ym}-${last}|`, state: "ok", err: "", punches: [], leave: [],
				attendance: [{ employee: b.name, attendance_date: `${ym}-01`, status: "Present", docstatus: 1 }] },
		});
		const { unmount } = await act(async () => render(<Provider store={store}><MonthlyBasic /></Provider>));
		unmount();
		set({ mb: { ...store.getState().app.mb, emp: b.name } });
		await act(async () => { render(<Provider store={store}><MonthlyBasic /></Provider>); });
		const cells = [...document.querySelectorAll("table.muster tbody td")].map((td) => td.textContent);
		expect(cells).toContain("P");
	});

	it("shows an employee picked by name even when they are not Active", async () => {
		set(loadedState());
		const emp = store.getState().app.employees[0];
		set({
			employees: store.getState().app.employees.map((e) => (e.name === emp.name ? { ...e, status: "Left" } : e)),
			mb: { ...store.getState().app.mb, emp: emp.name, status: "Active" },
		});
		await act(async () => { render(<Provider store={store}><MonthlyBasic /></Provider>); });
		expect(document.querySelectorAll("table.muster tbody tr")).toHaveLength(1);
	});
});

import { isSupervisor, shiftChoices, shiftOptions } from "@/lib/worktime";

describe("Day or Night, and supervisors have three shifts", () => {
	const types = ["HRI-Day Shift", "HRI-Night Shift", "HRI-General Shift", "MT-Day Shift", "MT-Night Shift", "MT-General Shift", "Old Office"].map((name) => ({ name }));
	const cos = [{ name: "Hi-Tech Rubber Industries", abbr: "HRI" }, { name: "Manna Treads", abbr: "MT" }, { name: "Manna Tyre UAE", abbr: "MRU" }];

	it("a worker is offered their company's Day and Night", () => {
		expect(shiftChoices({ company: "Hi-Tech Rubber Industries", designation: "Operator" }, types, cos, []))
			.toEqual(["HRI-Day Shift", "HRI-Night Shift"]);
	});

	it("a supervisor is offered Day, Night and General", () => {
		const sup = { company: "Manna Treads", designation: "Shift Supervisor" };
		expect(isSupervisor(sup)).toBe(true);
		expect(shiftChoices(sup, types, cos, [])).toEqual(["MT-Day Shift", "MT-Night Shift", "MT-General Shift"]);
	});

	it("keeps a shift the person or company is already on, and offers everything where a company has none of its own", () => {
		expect(shiftChoices({ company: "Manna Treads", designation: "Helper", default_shift: "Old Office" }, types, cos, []))
			.toEqual(["MT-Day Shift", "MT-Night Shift", "Old Office"]);
		expect(shiftChoices({ company: "Manna Tyre UAE" }, types, cos, [])).toHaveLength(7);
	});

	it("after HR's sheet, a company's shifts are the ones named for it, whatever the Company record calls it", () => {
		const sheet = ["Manna Rubber Products Pvt.Ltd-Office Shift", "Manna Rubber Products Pvt.Ltd-HK shift",
			"Hi-Tech Pretreads-Office shift (08:30-17:30)", "MANNA TREADS PVT.LTD-SHIFT"].map((name) => ({ name }));
		const mrp = [{ name: "Manna Rubber Products Private Limited", abbr: "MRPPL" }, { name: "Manna Treads", abbr: "MT" }];
		expect(shiftChoices({ company: "Manna Rubber Products Private Limited" }, sheet, mrp, []))
			.toEqual(["Manna Rubber Products Pvt.Ltd-HK shift", "Manna Rubber Products Pvt.Ltd-Office Shift"]);
		expect(shiftChoices({ company: "Manna Treads" }, sheet, mrp, [])).toEqual(["MANNA TREADS PVT.LTD-SHIFT"]);
	});

	it("the picker lists every shift on the site, the person's own first", () => {
		const { suggested, others } = shiftOptions({ company: "Hi-Tech Rubber Industries", designation: "Operator" }, types, cos, []);
		expect(suggested).toEqual(["HRI-Day Shift", "HRI-Night Shift"]);
		expect(others).toEqual(["HRI-General Shift", "MT-Day Shift", "MT-General Shift", "MT-Night Shift", "Old Office"]);
		expect(shiftOptions({ company: "Manna Tyre UAE" }, types, cos, []).others).toEqual([]);
	});
});

import { monthRoster as roster } from "@/lib/roster";

describe("a night shift belongs to the day it started", () => {
	it("pairs the evening in with the next morning's out", () => {
		const N = { start_time: "20:30:00", end_time: "8:30:00" };
		const { rows } = roster({ ym: "2026-09", today: "2026-09-30", shift: "Night", window: N, punches: [
			{ time: "2026-09-01 20:25:00", log_type: "IN" }, { time: "2026-09-02 08:35:00", log_type: "OUT" },
			{ time: "2026-09-02 20:40:00", log_type: "IN" }, { time: "2026-09-03 08:30:00", log_type: "OUT" }] });
		expect(rows[0]).toMatchObject({ display: "full", workMin: 730 });
		expect(rows[1]).toMatchObject({ display: "full", lateMin: 10 });
		expect(rows[2].display).not.toBe("partial");
	});
});

import { calEditor } from "@/features/employees/Calendar";

describe("who may edit the Calendar", () => {
	it("is hr@ alone, however it is typed", () => {
		expect(calEditor("hr@mannarubber.com")).toBe(true);
		expect(calEditor(" HR@MannaRubber.com ")).toBe(true);
	});

	it.each(["mannarubber.products@mannarubber.com", "hitechrubber@mannarubber.com", "mannatreads@mannarubber.com",
		"mannatyreretreads@mannarubber.com", "it@mannarubber.com", "", null])("is not %s, even when the site would let it write", (u) => {
		expect(calEditor(u)).toBe(false);
	});
});

describe("Employee Profile", () => {
	it("is on no login's strip, and opens for each of them from Employee Master", () => {
		expect(MODULES.employees.tabs.some((t) => t[0] === "profile")).toBe(false);
		expect(MODULES.employees.pages.profile).toBeTruthy();
		for (const [login, admin] of [["it@mannarubber.com", true], [MRP, true], ["someone@mannarubber.com", false]]) {
			expect(landingFor("employees", "profile", login, admin)).toBe("profile");
		}
	});
});
