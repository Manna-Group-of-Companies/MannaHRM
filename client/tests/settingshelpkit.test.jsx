import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Reports, { ATT_TILES, REPORT_TILES, attTilesFor, headcountAt, last12 } from "@/features/reports/Reports";
import { Password, Permission, Departments } from "@/features/settings/SettingsKit";
import { Help, Notifications, NoteBell, SHORTCUTS, SUPPORT_EMAIL } from "@/features/help/NotesHelp";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Reports, Settings, Notifications and Help as the HRDashboard reference
   draws them (21 October 2026): real figures or none, roles shown and never
   changed (D8), the site's own notifications, and help as fixed text (D18).
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("Reports", () => {
	it("draws every report as a box: the eleven attendance reports first, in HR's order", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "reports", subtab: "overview" }));
		const { container } = draw(<Reports />);
		const boxes = [...container.querySelectorAll(".k-tile h3")].map((h) => h.textContent);
		expect(boxes.slice(0, 11)).toEqual([
			"In / Out Activity Report", "Daily Detail Attendance Report", "Monthly Basic Attendance Report",
			"Monthly Summary Attendance Report", "Present Report", "Absent Report", "MSP Report", "In / Out Count Report",
			"Employee Shift Report", "OT Report", "Weekly Report",
		]);
		expect(boxes).toHaveLength(ATT_TILES.length + REPORT_TILES.length + 1);
		expect(boxes[boxes.length - 1]).toBe("All reports");
	});

	it("opens a report inside Reports, at its own address, with the way back", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "reports", subtab: "overview" }));
		const { container } = draw(<Reports />);
		await act(async () => { [...container.querySelectorAll(".k-tile")].find((b) => b.textContent.includes("OT Report")).click(); });
		expect(getState().section).toBe("reports");
		expect(getState().subtab).toBe("ot");
		expect(container.querySelector(".k-back").textContent).toBe("OT Report");
		expect(container.textContent).toContain("Export CSV");
	});

	it("offers a company login only the attendance reports its menu had", () => {
		expect(attTilesFor("mannarubber.products@mannarubber.com", true).map((t) => t[0]))
			.toEqual(["inout", "daily", "monthly", "absent", "ot", "weekly"]);
		expect(attTilesFor(HR, true)).toHaveLength(11);
	});

	it("counts the headcount at a month's end: joined by then and not yet relieved", () => {
		const people = [
			{ name: "A", date_of_joining: "2025-01-10" },
			{ name: "B", date_of_joining: "2026-03-01" },
			{ name: "C", date_of_joining: "2024-05-01" },
		];
		expect(headcountAt(people, { C: "2026-02-15" }, "2026-02")).toBe(1);
		expect(headcountAt(people, { C: "2026-02-15" }, "2026-01")).toBe(2);
		expect(last12(new Date("2026-10-21T10:00:00"))).toHaveLength(12);
		expect(last12(new Date("2026-10-21T10:00:00"))[11]).toBe("2026-10");
	});

	it("shows New Joining in the Onboarding box, under the joiners by month", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "reports", subtab: "overview" }));
		const { container } = draw(<Reports />);
		await act(async () => { [...container.querySelectorAll(".k-tile")].find((b) => b.textContent.includes("Onboarding")).click(); });
		expect(getState().subtab).toBe("onboarding");
		expect(container.textContent).toContain("Joiners by month");
		expect(container.textContent).toContain("New Joining");
		expect(container.textContent).not.toContain("New employees");
	});

	it("opens Time Off Balance on the Leave Balance Report, which is that report", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "reports", subtab: "overview" }));
		const { container } = draw(<Reports />);
		await act(async () => { [...container.querySelectorAll(".k-tile")].find((b) => b.textContent.includes("Time Off Balance")).click(); });
		expect(getState().section).toBe("leave");
		expect(getState().subtab).toBe("balances");
	});
});

describe("Settings", () => {
	it("lists the sections this login's menu gives it, ours among them", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "departments" }));
		const { container } = draw(<Departments />);
		const names = [...container.querySelectorAll(".k-set-nav button")].map((b) => b.textContent);
		expect(names).toContain("Company info");
		expect(names).toContain("Security");
		expect(container.querySelector('.k-set-nav [aria-current="page"]').textContent).toBe("Departments");
	});

	it("shows roles and changes none of them (D8)", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [{ name: "x@mannarubber.com", full_name: "X Person", enabled: 1 }] } }));
		const put = vi.spyOn(http, "put");
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "permission" }));
		let view;
		await act(async () => { view = draw(<Permission />); });
		await vi.waitFor(() => expect(view.container.textContent).toContain("X Person"));
		expect(view.container.querySelector("select, input[type=checkbox]")).toBeNull();
		expect(put).not.toHaveBeenCalled();
	});

	it("will not send a new password shorter than eight or one that does not match", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "password" }));
		const post = vi.spyOn(http, "post");
		const { container } = draw(<Password />);
		fireEvent.change(container.querySelector("#pw-old"), { target: { value: "old-secret" } });
		fireEvent.change(container.querySelector("#pw-next"), { target: { value: "short" } });
		fireEvent.change(container.querySelector("#pw-again"), { target: { value: "other" } });
		await act(async () => { fireEvent.submit(container.querySelector("form")); });
		expect(container.textContent).toContain("Use at least 8 characters");
		expect(container.textContent).toContain("The two do not match");
		expect(post).not.toHaveBeenCalled();
	});
});

describe("Notifications", () => {
	const NOTES = [
		{ name: "N1", subject: "<b>Anand</b> asked for leave", type: "Alert", read: 0, creation: "2026-10-21 09:00:00" },
		{ name: "N2", subject: "Payroll is ready", type: "Alert", read: 1, creation: "2026-10-01 09:00:00" },
	];
	it("puts a dot on the bell while one is unread, and lists them as text", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: NOTES } }));
		await act(async () => set({ ...loadedState(), user: HR, admin: true }));
		let view;
		await act(async () => { view = draw(<NoteBell />); });
		await vi.waitFor(() => expect(view.container.querySelector(".dot-n")).not.toBeNull());
		expect(view.container.querySelector('[aria-label="1 unread notifications"]')).not.toBeNull();
		expect(view.container.textContent).toContain("Anand asked for leave");
		expect(view.container.innerHTML).not.toContain("<b>Anand</b>");
		await act(async () => { within(view.container).getByText("See all").closest("button").click(); });
		expect(getState().section).toBe("notifications");
	});

	it("marks one read by writing that and nothing else", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: NOTES } }));
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "notifications", subtab: "overview" }));
		let view;
		await act(async () => { view = draw(<Notifications />); });
		await vi.waitFor(() => expect(view.container.querySelector('[aria-label="Mark as read"]')).not.toBeNull());
		await act(async () => { view.container.querySelector('[aria-label="Mark as read"]').click(); });
		expect(wrote).toEqual([["/api/resource/Notification Log/N1", { read: 1 }]]);
	});
});

describe("Help", () => {
	it("marks the privacy policy a draft for HR (D18)", async () => {
		await act(async () => set({ ...loadedState(), section: "help", subtab: "privacy" }));
		const { container } = draw(<Help />);
		expect(container.textContent).toContain("Draft — HR to review");
		expect(container.textContent).not.toMatch(/local storage/i);
	});

	it("lists only the shortcuts this app has", () => {
		expect(SHORTCUTS.map((k) => k[0].join("+"))).toEqual(["/", "Ctrl+K", "↑+↓", "Enter", "Esc"]);
	});

	it("sends a support request to IT by email", async () => {
		await act(async () => set({ ...loadedState(), user: HR, section: "help", subtab: "contact" }));
		const { container } = draw(<Help />);
		expect(container.textContent).toContain(SUPPORT_EMAIL);
		await act(async () => { fireEvent.submit(container.querySelector("form")); });
		expect(container.textContent).toContain("Add a subject");
	});
});
