import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Reports, { ATT_TILES, REPORT_TILES, attTilesFor, headcountAt, last12 } from "@/features/reports/Reports";
import { Password, Permission, Departments, Offices, Titles } from "@/features/settings/SettingsKit";
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

	/* 21 October 2026, asked for by HR: a department is added here, not on the
	   desk, and the list is read back from the site. */
	it("adds a department here with its name and company, and reads the list again", async () => {
		const sent = [];
		vi.spyOn(http, "post").mockImplementation((url, body) => { sent.push([decodeURIComponent(url), body]); return Promise.resolve({ data: { data: { name: "Quality - MR" } } }); });
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [{ name: "Quality - MR", disabled: 0 }] } }));
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "departments", company: "" }));
		const view = draw(<Departments />);
		expect(view.container.textContent).not.toContain("Manage on the site");
		await act(async () => { view.getByRole("button", { name: "Add department" }).click(); });
		fireEvent.change(document.querySelector("#dp-name"), { target: { value: "Quality" } });
		const company = document.querySelector("#dp-co").value;
		expect(company).not.toBe("");
		await act(async () => { fireEvent.submit(document.querySelector("#dp-name").closest("form")); });
		expect(sent).toEqual([["/api/resource/Department", { department_name: "Quality", company, docstatus: 0 }]]);
		expect(getState().departments).toEqual([{ name: "Quality - MR", disabled: 0 }]);
		expect(document.querySelector("#dp-name")).toBeNull();
	});

	/* 22 October 2026, asked for by HR: one record a company, one row a name. */
	it("lists each department once, its people summed across the companies that have it", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "departments",
			departments: [{ name: "All Departments" }, { name: "Accounts - MR", disabled: 0 }, { name: "Accounts - MP", disabled: 0 },
				{ name: "Stores - MP", disabled: 1 }],
			employees: [
				{ name: "E1", status: "Active", department: "Accounts - MR" },
				{ name: "E2", status: "Active", department: "Accounts - MP" },
				{ name: "E3", status: "Left", department: "Accounts - MP" },
				{ name: "E4", status: "Active", department: "Stores - MP" },
			] }));
		const view = draw(<Departments />);
		const rows = [...view.container.querySelectorAll("tbody tr")];
		expect(rows).toHaveLength(2);
		expect(rows[0].querySelector("b").textContent).toBe("Accounts");
		expect(rows[0].textContent).toContain("in 2 companies");
		expect(rows[0].querySelector('[data-label="People"]').textContent).toBe("2");
		expect(rows[1].querySelector("b").textContent).toBe("Stores");
		expect(rows[1].textContent).toContain("Disabled");
		expect(view.container.textContent).not.toContain("All Departments");
	});

	it("shows the site's refusal of a department and keeps the form open", async () => {
		vi.spyOn(http, "post").mockImplementation(() => Promise.reject({ response: { data: { _server_messages: JSON.stringify([JSON.stringify({ message: "Department Quality - MR already exists" })]) } } }));
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "departments" }));
		const view = draw(<Departments />);
		await act(async () => { view.getByRole("button", { name: "Add department" }).click(); });
		fireEvent.change(document.querySelector("#dp-name"), { target: { value: "Quality" } });
		await act(async () => { fireEvent.submit(document.querySelector("#dp-name").closest("form")); });
		expect(document.body.textContent).toContain("already exists");
		expect(document.querySelector("#dp-name")).not.toBeNull();
	});

	it("gives a login that only reads employees no Add department", async () => {
		await act(async () => set({ ...loadedState(), user: "hitechrubber@mannarubber.com", admin: true, section: "settings", subtab: "departments" }));
		const view = draw(<Departments />);
		expect(view.queryByRole("button", { name: "Add department" })).toBeNull();
	});

	it("adds a job title here as a Designation, and reads the list again", async () => {
		const sent = [];
		vi.spyOn(http, "post").mockImplementation((url, body) => { sent.push([decodeURIComponent(url), body]); return Promise.resolve({ data: { data: { name: "Quality Inspector" } } }); });
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [{ name: "Quality Inspector" }] } }));
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "titles" }));
		const view = draw(<Titles />);
		expect(view.container.textContent).not.toContain("Manage on the site");
		await act(async () => { view.getByRole("button", { name: "Add job title" }).click(); });
		fireEvent.change(document.querySelector("#jt-name"), { target: { value: "Quality Inspector" } });
		await act(async () => { fireEvent.submit(document.querySelector("#jt-name").closest("form")); });
		expect(sent).toEqual([["/api/resource/Designation", { designation_name: "Quality Inspector", docstatus: 0 }]]);
		expect(getState().designations).toEqual([{ name: "Quality Inspector" }]);
		expect(document.querySelector("#jt-name")).toBeNull();
	});

	it("draws Offices as the work locations with their Add, not a button to a page off the menu", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [] } }));
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "settings", subtab: "offices",
			workLocs: [{ name: "Main Gate", location_name: "Main Gate", latitude: 9.59, longitude: 76.52, is_active: 1 }], workLocState: "ok" }));
		const view = draw(<Offices />);
		expect(view.container.querySelector(".k-sec-h h3").textContent).toBe("Offices");
		expect(view.container.textContent).toContain("Main Gate");
		expect(view.getByRole("button", { name: "Add location" })).toBeTruthy();
		expect(view.queryByRole("button", { name: /Manage offices/ })).toBeNull();
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
		expect(SHORTCUTS.map((k) => k[0].join("+"))).toEqual(["/", "?", "Ctrl+K", "↑+↓", "Enter", "Esc",
			"g+d", "g+e", "g+t", "g+a", "g+p", "g+r", "g+o", "g+n", "g+x", "g+c", "g+s", "g+h", "n"]);
	});

	it("sends a support request to IT by email", async () => {
		await act(async () => set({ ...loadedState(), user: HR, section: "help", subtab: "contact" }));
		const { container } = draw(<Help />);
		expect(container.textContent).toContain(SUPPORT_EMAIL);
		await act(async () => { fireEvent.submit(container.querySelector("form")); });
		expect(container.textContent).toContain("Add a subject");
	});
});
