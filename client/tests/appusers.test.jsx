import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";

import { appUserCounts, appUserRows, appsUsed, toggleQuestion, toggleWhy } from "@/lib/appusers";

/* ---------------------------------------------------------------------------
   Settings → App users (22 October 2026): everybody who can use the phone app,
   and Stop / Allow — their login switched off or on, on the site.
   --------------------------------------------------------------------------- */

const EMPLOYEES = [
	{ name: "E1", employee_name: "Anand Raghavan", employee_number: "MR001", company: "Manna Rubber", status: "Active", user_id: "anand@x.in" },
	{ name: "E2", employee_name: "Pradeep A K", employee_number: "MT003", company: "Manna Tyre", status: "Active", user_id: "Pradeep@x.in" },
	{ name: "E3", employee_name: "Old Hand", employee_number: "MR009", company: "Manna Rubber", status: "Left", user_id: "old@x.in" },
	{ name: "E4", employee_name: "No Login", employee_number: "MR010", company: "Manna Rubber", status: "Active", user_id: "" },
];
const USERS = [
	{ name: "anand@x.in", enabled: 1, last_login: "2026-10-20 09:00:00" },
	{ name: "pradeep@x.in", enabled: 1, last_login: "2026-10-22 13:00:00" },
	{ name: "old@x.in", enabled: 0, last_login: "2026-03-01 09:00:00" },
];
const ROLES = [{ parent: "pradeep@x.in", role: "HR Manager" }, { parent: "anand@x.in", role: "Employee" }];
const PUNCHES = [{ employee: "E1", time: "2026-10-21 08:30:00" }, { employee: "E1", time: "2026-10-22 08:31:00" }];

const rows = (me = "hr@x.in", roles = ROLES) => appUserRows({ employees: EMPLOYEES, users: USERS, roles, punches: PUNCHES, me });

describe("who the app users are", () => {
	it("is everybody whose Employee record names a login, and nobody without one", () => {
		expect(rows().map((r) => r.employee).sort()).toEqual(["E1", "E2", "E3"]);
	});

	it("reads each login's on or off, last sign-in and last punch from the app — case of the login aside", () => {
		const p = rows().find((r) => r.employee === "E2");
		expect(p).toMatchObject({ enabled: true, lastSignIn: "2026-10-22 13:00:00", lastAppPunch: "", website: true });
		expect(rows().find((r) => r.employee === "E1")).toMatchObject({ lastAppPunch: "2026-10-22 08:31:00", website: false });
	});

	it("lists the active first, then the stopped", () => {
		expect(rows().map((r) => r.enabled)).toEqual([true, true, false]);
	});

	it("counts with a login, active, stopped and who punched from the app", () => {
		expect(appUserCounts(rows())).toEqual({ all: 3, active: 2, stopped: 1, usedApp: 1, bothApps: 0 });
	});

	it("does not know whether a login is HR's when the site would not show roles", () => {
		expect(rows("hr@x.in", null).every((r) => r.website === null)).toBe(true);
	});
});

describe("stopping a login", () => {
	it("is never offered on the login doing it, so nobody locks themselves out", () => {
		const me = rows("pradeep@x.in").find((r) => r.employee === "E2");
		expect(me.self).toBe(true);
		expect(toggleWhy(me)).toMatch(/signed in with/);
	});

	it("is not offered on a login the site would not show", () => {
		const r = appUserRows({ employees: [EMPLOYEES[0]], users: [], roles: [], punches: [], me: "" })[0];
		expect([r.known, r.enabled]).toEqual([false, null]);
		expect(toggleWhy(r)).toMatch(/would not show/);
	});

	it("says that an HR login loses the website too", () => {
		const p = rows().find((r) => r.employee === "E2");
		expect(toggleQuestion(p, false)).toMatch(/also HR's on the website, and loses that too/);
		expect(toggleQuestion(rows().find((r) => r.employee === "E1"), false)).not.toMatch(/website/);
		expect(toggleQuestion(p, true)).toMatch(/use the app again/);
	});
});

describe("the app's own login beside a person's own (28 November 2026)", () => {
	const EBIN = { name: "E5", employee_name: "Ebin Joy", employee_number: "MRP-103", company: "Manna Rubber", status: "Active",
		user_id: "ebin@gmail.com", custom_app_login: "mrp-103@phone.manna.invalid" };
	const users = [{ name: "mrp-103@phone.manna.invalid", enabled: 1 }, { name: "ebin@gmail.com", enabled: 1 }];
	const row = () => appUserRows({ employees: [EBIN], users, roles: [{ parent: "ebin@gmail.com", role: "HR Manager" }],
		punches: [], salesLogs: [{ owner: "ebin@gmail.com", punch_in_time: "2026-11-20 09:00:00" }], me: "" })[0];

	it("stopping the app stops the app login, and their own Gmail login is never the one switched off", () => {
		expect(row()).toMatchObject({ login: "mrp-103@phone.manna.invalid", ownLogin: "ebin@gmail.com", website: false });
		expect(toggleQuestion(row(), false)).toMatch(/ebin@gmail\.com is not changed/);
	});

	it("the sales app is still read off their own login", () => {
		expect(row().apps.map((a) => a.app)).toEqual(["Sales app"]);
	});
});

/* ---- the page ---- */

const writes = [];
vi.mock("@/api/appusers", () => ({
	loadAppUsers: () => Promise.resolve({ employees: EMPLOYEES, users: USERS, roles: ROLES, punches: PUNCHES }),
	setLoginEnabled: (login, on) => { writes.push([login, on]); return Promise.resolve({ ok: true }); },
}));

/* Through the menu, as the app reaches it: the page and Settings import each other. */
const { pageFor } = await import("@/routes/registry");
const AppUsers = pageFor("settings", "appusers");
const { store, set, resetStore } = await import("@/store");
const { loadedState } = await import("./fixture");

describe("Settings → App users", () => {
	beforeEach(() => {
		writes.length = 0;
		resetStore();
		set({ ...loadedState(), user: "pradeep@x.in", section: "settings", subtab: "appusers" });
	});

	const draw = async () => {
		await act(async () => { render(<Provider store={store}><AppUsers /></Provider>); });
		await act(async () => {});
	};

	it("lists each app user with their login and whether they are active or stopped", async () => {
		await draw();
		const table = within(screen.getByRole("table", { name: "App users" }));
		expect(table.getByText("Anand Raghavan")).toBeTruthy();
		expect(table.getByText("old@x.in")).toBeTruthy();
		expect(table.getByText("Stopped")).toBeTruthy();
		expect(table.queryByText("No Login")).toBeNull();
	});

	it("asks before stopping somebody, and only then switches their login off", async () => {
		await draw();
		await act(async () => { screen.getByRole("button", { name: "Stop Anand Raghavan" }).click(); });
		expect(writes).toEqual([]);
		const dialog = within(screen.getByRole("dialog"));
		expect(dialog.getByText(/Stop Anand Raghavan using the app\?/)).toBeTruthy();
		await act(async () => { dialog.getByRole("button", { name: "Stop" }).click(); });
		expect(writes).toEqual([["anand@x.in", false]]);
	});

	it("lets a stopped login back in", async () => {
		await draw();
		await act(async () => { screen.getByRole("button", { name: "Allow Old Hand" }).click(); });
		await act(async () => { within(screen.getByRole("dialog")).getByRole("button", { name: "Allow" }).click(); });
		expect(writes).toEqual([["old@x.in", true]]);
	});

	it("offers no switch on the signed-in login's own row", async () => {
		await draw();
		expect(screen.queryByRole("button", { name: "Stop Pradeep A K" })).toBeNull();
	});
});

describe("which app a login is used in", () => {
	const LOGS = [
		{ owner: "Anand@x.in", punch_in_time: "2026-10-23 09:00:00" },
		{ owner: "pradeep@x.in", punch_in_time: "2026-10-22 10:00:00" },
		{ owner: "pradeep@x.in", punch_in_time: "2026-10-24 10:00:00", remarks: "Corrected by HR on 2026-10-24" },
	];
	const withLogs = (salesLogs) => appUserRows({ employees: EMPLOYEES, users: USERS, roles: ROLES, punches: PUNCHES, salesLogs, me: "hr@x.in" });
	const byName = (rs, n) => rs.find((r) => r.name === n);

	it("names the HR app from a phone punch and the Sales app from an Attendance Log the login owns", () => {
		const rs = withLogs(LOGS);
		expect(byName(rs, "Anand Raghavan").apps).toEqual([
			{ app: "HR app", last: "2026-10-22 08:31:00" },
			{ app: "Sales app", last: "2026-10-23 09:00:00" },
		]);
		expect(byName(rs, "Pradeep A K").apps).toEqual([{ app: "Sales app", last: "2026-10-22 10:00:00" }]);
	});

	it("does not count a row HR corrected on the desk as the rep's phone", () => {
		expect(byName(withLogs(LOGS), "Pradeep A K").apps.map((a) => a.last)).toEqual(["2026-10-22 10:00:00"]);
	});

	it("shows no app for a login used in neither, and counts those used in both", () => {
		const rs = withLogs(LOGS);
		expect(byName(rs, "Old Hand").apps).toEqual([]);
		expect(appUserCounts(rs).bothApps).toBe(1);
	});

	it("leaves the Sales app out when its records could not be read, rather than calling it unused", () => {
		expect(appsUsed("2026-10-22 08:31:00", null)).toEqual([{ app: "HR app", last: "2026-10-22 08:31:00" }]);
		expect(byName(withLogs(null), "Anand Raghavan").apps.map((a) => a.app)).toEqual(["HR app"]);
	});
});
