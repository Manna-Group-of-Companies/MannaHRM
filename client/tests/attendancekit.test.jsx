import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import TeamAttendance from "@/features/attendance/TeamAttendance";
import EmployeeAttendance from "@/features/attendance/EmployeeAttendance";
import AttendanceSettings from "@/features/attendance/AttendanceSettings";
import { reportsFor } from "@/features/attendance/DownloadReport";
import { ATT_REPORTS, runReport } from "@/features/attendance/reportrun";
import { teamState } from "@/features/attendance/attstate";
import { MODULES } from "@/routes/registry";
import { isHidden } from "@/data/sections";
import { http } from "@/api/client";
import { store, set, resetStore } from "@/store";
import { todayIso } from "@/lib/format";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Attendance as the HRDashboard reference draws it (21 October 2026): Team,
   Employee and My Attendance, Settings on one chosen shift (D13), and the
   eleven reports as files from one Download report dialog.
   --------------------------------------------------------------------------- */

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
let blobs;
beforeEach(() => {
	resetStore();
	blobs = [];
	globalThis.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return "blob:x"; });
	globalThis.URL.revokeObjectURL = vi.fn();
	HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("a day, in the reference's words", () => {
	it("calls a worked day with late minutes Late, and one without Present", () => {
		expect(teamState({ status: "Present", lateMin: 12 })).toBe("Late");
		expect(teamState({ status: "Present", lateMin: 0 })).toBe("Present");
		expect(teamState({ status: "Half Day", lateMin: 0 })).toBe("Present");
	});

	it("never calls a day nobody has decided yet Absent", () => {
		expect(teamState({ status: "—", lateMin: 0 })).toBe("Not in yet");
		expect(teamState({ status: "Absent", lateMin: 0 })).toBe("Absent");
		expect(teamState({ status: "On Leave", lateMin: 0 })).toBe("On leave");
		expect(teamState({ status: "—", dayType: "weekoff", lateMin: 0 })).toBe("Off today");
	});
});

describe("the eleven reports", () => {
	it("are eleven, each with a page that still exists and is off the menu", () => {
		expect(ATT_REPORTS).toHaveLength(11);
		for (const [key] of ATT_REPORTS) {
			expect(MODULES.attendance.pages[key], key).toBeTruthy();
			expect(isHidden("attendance", key), key).toBe(true);
		}
	});

	/* Monthly Basic Attendance left the menu on 21 October 2026, asked for by
	   HR: it is a box on Reports, as the other ten are. */
	it("keeps App Punches on the menu and Monthly Basic on Reports", () => {
		expect(isHidden("attendance", "monthly")).toBe(true);
		expect(isHidden("attendance", "app")).toBe(false);
		expect(MODULES.attendance.pages.monthly).toBeTruthy();
	});

	it("offers HR every one, and a company login only the ones its menu had", () => {
		expect(reportsFor("hr@mannarubber.com", true)).toHaveLength(11);
		expect(reportsFor("hitechrubber@mannarubber.com", true)).toHaveLength(11);
		expect(reportsFor("mannarubber.products@mannarubber.com", true).map((r) => r[0]).sort())
			.toEqual(["absent", "daily", "inout", "ot", "weekly"]);
		expect(reportsFor("someone@mannarubber.com", false)).toEqual([]);
	});

	it("builds the Employee Shift Report as an Excel file from the dialog's runner", async () => {
		await act(async () => set(loadedState()));
		const said = await runReport("shiftrep", "Excel", { day: todayIso(), from: todayIso(), to: todayIso() });
		expect(said).toMatch(/^Downloaded employee-shift-report-.*\.xlsx/);
		expect(blobs).toHaveLength(1);
	});

	it("refuses a range that ends before it starts, before reading anything", async () => {
		await expect(runReport("ot", "Excel", { day: "", from: "2026-10-10", to: "2026-10-01" })).rejects.toThrow(/From date/);
	});
});

describe("the pages", () => {
	it("keeps Team Attendance and Employee Attendance off the menu, Download report staying on Regularization", () => {
		expect(isHidden("attendance", "team")).toBe(true);
		expect(isHidden("attendance", "employee")).toBe(true);
		expect(isHidden("attendance", "overview")).toBe(false);
	});

	it("Team Attendance opens on four figures, a row of tabs and the Download report button", async () => {
		await act(async () => set({ ...loadedState(), user: "hr@mannarubber.com", admin: true }));
		const { container } = draw(<TeamAttendance />);
		expect([...container.querySelectorAll(".k-mini-t")].map((t) => t.textContent)).toEqual(["Present", "Late", "On leave", "Absent"]);
		expect(container.textContent).toContain("Download report");
		expect(container.textContent).not.toContain("My attendance");
	});

	it("My Attendance says so for a login no Employee is linked to, and offers no Check in", async () => {
		await act(async () => set({ ...loadedState(), user: "hr@mannarubber.com" }));
		const { container } = draw(<EmployeeAttendance mine />);
		expect(container.textContent).toContain("No employee record for this login");
		expect(container.textContent).not.toMatch(/Check in/i);
	});

	it("Settings writes only what changed on the shift picked, and ticks late marking for a grace", async () => {
		await act(async () => set({ ...loadedState(), shiftTypes: [{ name: "General", company: "" }] }));
		/* The shift itself for its own address, an empty list for any other read
		   — the shift list is read again after a save. */
		vi.spyOn(http, "get").mockImplementation((url) => Promise.resolve({
			data: { data: String(url).endsWith("/General")
				? { name: "General", start_time: "09:00:00", end_time: "17:30:00", late_entry_grace_period: 0, enable_late_entry_marking: 0 }
				: [] },
		}));
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		let view;
		await act(async () => { view = draw(<AttendanceSettings />); });
		await vi.waitFor(() => expect(view.container.querySelector("#as-late")).not.toBeNull());
		fireEvent.change(view.container.querySelector("#as-late"), { target: { value: "10" } });
		await act(async () => { fireEvent.submit(view.container.querySelector("form")); });
		expect(wrote).toEqual([["/api/resource/Shift Type/General", { late_entry_grace_period: 10, enable_late_entry_marking: 1 }]]);
	});

	/* Work locations are added and changed on Settings → Location since 21
	   October 2026; the Work Locations page left the menu. */
	const LOCS = [{ name: "Main Gate", location_name: "Main Gate", latitude: 9.59, longitude: 76.52, is_active: 1 }];
	const openLocation = async (user) => {
		vi.spyOn(http, "get").mockImplementation((url) => Promise.resolve({
			data: { data: decodeURIComponent(String(url)).endsWith("/Work Location/Main Gate")
				? { ...LOCS[0], doctype: "Work Location", company: "Manna Rubber", radius_metres: 150 }
				: [] },
		}));
		await act(async () => set({ ...loadedState(), user, admin: true, workLocs: LOCS, workLocState: "ok", shiftTypes: [] }));
		let view;
		await act(async () => { view = draw(<AttendanceSettings />); });
		await act(async () => { view.getByRole("tab", { name: "Location" }).click(); });
		return view;
	};

	it("Settings → Location adds a work location in the records form, the Work Locations page being off the menu", async () => {
		expect(isHidden("attendance", "locations")).toBe(true);
		const view = await openLocation("hr@mannarubber.com");
		expect(view.container.textContent).toContain("Main Gate");
		await act(async () => { view.getByRole("button", { name: "Add location" }).click(); });
		expect(document.body.textContent).toContain("New Work Location");
		expect(document.querySelector("#rf-location_name")).not.toBeNull();
		expect(document.querySelector("#rf-latitude")).not.toBeNull();
	});

	it("Settings → Location opens a location from the site to change it", async () => {
		const view = await openLocation("hr@mannarubber.com");
		await act(async () => { view.getByRole("button", { name: "Edit Main Gate" }).click(); });
		await vi.waitFor(() => expect(document.querySelector("#rf-radius_metres")).not.toBeNull());
		expect(document.querySelector("#rf-radius_metres").value).toBe("150");
	});

	it("Settings → Location shows a login that only reads employees the names and nothing to change", async () => {
		const view = await openLocation("hitechrubber@mannarubber.com");
		expect(view.container.textContent).toContain("Main Gate");
		expect(view.queryByRole("button", { name: "Add location" })).toBeNull();
		expect(view.queryByRole("button", { name: "Edit Main Gate" })).toBeNull();
	});
});
