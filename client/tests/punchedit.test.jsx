import { describe, expect, it, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Regularization from "@/features/attendance/Regularization";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

function monthOf(punches) {
	set(loadedState());
	const emp = getState().employees[0];
	const ym = "2026-09";
	set({
		reg: { ...getState().reg, emp: emp.name, cycle: ym },
		regMonth: { key: `${emp.name}|${ym}`, state: "ok", err: "", leave: [], ar: [],
			punches: punches.map((p) => ({ ...p, employee: emp.name })) },
		section: "attendance", subtab: "overview",
	});
	return emp;
}

describe("Attendance Regularization: clicking a time opens a popup with Save in it", () => {
	beforeEach(() => resetStore());

	it("a past day's Time In opens the popup; Save turns on as soon as a time changes, reason or not", async () => {
		monthOf([{ name: "c1", time: "2026-09-01 08:05:00", log_type: "IN" }]);
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		expect(screen.queryByRole("dialog")).toBeNull();

		const cell = screen.getByRole("button", { name: "Time In, 01-Sep-2026" });
		expect(cell.textContent).toBe("08:05");
		fireEvent.click(cell);

		const popup = within(screen.getByRole("dialog"));
		expect(popup.getByLabelText("Time In").value).toBe("08:05");
		expect(popup.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(popup.getByRole("status").textContent).toBe("Pick a new time to turn Save on.");
		fireEvent.change(popup.getByLabelText("Time In"), { target: { value: "08:00" } });
		/* No reason typed: Save is on anyway. */
		expect(popup.getByRole("button", { name: "Save" })).not.toBeDisabled();
		expect(popup.queryByRole("status")).toBeNull();

		fireEvent.click(popup.getAllByRole("button", { name: "Close" })[0]);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("a day with no punch-out offers one to add, and the popup opens on Time Out", async () => {
		monthOf([{ name: "c1", time: "2026-09-01 08:05:00", log_type: "IN" }]);
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		const out = screen.getByRole("button", { name: "Time Out, 01-Sep-2026" });
		expect(out.textContent).toBe("—");
		fireEvent.click(out);
		expect(within(screen.getByRole("dialog")).getByLabelText("Time Out")).toHaveFocus();
	});

	it("the month has no Request column — Save lives in the popup", async () => {
		monthOf([]);
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).not.toContain("Request");
	});
});

describe("Attendance register: a day cell opens its Time In / Time Out editor", () => {
	beforeEach(() => resetStore());

	it("clicking a past day on the register shows the editor for that person and day", async () => {
		set(loadedState());
		const emp = getState().employees.find((e) => e.status === "Active") || getState().employees[0];
		const ym = "2026-09";
		set({
			reg: { ...getState().reg, emp: "", q: "", cycle: ym },
			regGrid: { key: ym, state: "ok", err: "", leave: [], ar: [],
				punches: [{ name: "c1", employee: emp.name, time: "2026-09-01 08:05:00", log_type: "IN" }] },
			section: "attendance", subtab: "overview",
		});
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		const cell = screen.getAllByRole("button", { name: `Edit ${emp.employee_name}, 01-Sep-2026` })[0];
		fireEvent.click(cell);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByLabelText("Time In").value).toBe("08:05");
		fireEvent.change(screen.getByLabelText("Time In"), { target: { value: "08:00" } });
		fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Machine missed" } });
		expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
	});
});

import { dayMinutes, monthRoster } from "@/lib/roster";

describe("the register counts time as well as days", () => {
	const W = { start_time: "8:30:00", end_time: "17:30:00" };

	it("late, early and overtime against a shift stored as 8:30:00", () => {
		expect(dayMinutes("2026-09-01 08:45:00", "2026-09-01 19:00:00", W)).toEqual({ workMin: 615, lateMin: 15, earlyMin: 0 });
		expect(dayMinutes("2026-09-01 08:00:00", "2026-09-01 17:00:00", W)).toMatchObject({ lateMin: 0, earlyMin: 30 });
	});

	it("claims nothing for a pair whose out is before its in, or with no window", () => {
		expect(dayMinutes("2026-09-01 20:26:00", "2026-09-01 08:32:00", W)).toMatchObject({ workMin: 0, earlyMin: 0 });
		expect(dayMinutes("2026-09-01 09:00:00", "2026-09-01 19:00:00", null)).toMatchObject({ workMin: 600, lateMin: 0 });
	});

	it("a late punch-out is hours worked; OT is only what HR entered, and the month adds it up", () => {
		const { counts, rows } = monthRoster({ ym: "2026-09", today: "2026-09-30", window: W,
			overtime: [{ ot_date: "2026-09-02", hours: 1.5, name: "HR-OT-1" }], punches: [
			{ time: "2026-09-01 08:40:00", log_type: "IN" }, { time: "2026-09-01 18:30:00", log_type: "OUT" },
			{ time: "2026-09-02 08:20:00", log_type: "IN" }, { time: "2026-09-02 18:00:00", log_type: "OUT" }] });
		expect(counts).toMatchObject({ otMin: 90, lateDays: 1, lateMin: 10, workMin: 590 + 580 });
		expect(rows[0].otMin).toBe(0);
		expect(rows[1].otMin).toBe(90);
	});
});

describe("HR adds OT by clicking a day", () => {
	beforeEach(() => resetStore());

	it("the day editor takes OT on a clock, to the second, and saves it without a reason, up to 16:00:00", async () => {
		set(loadedState());
		const emp = getState().employees.find((e) => e.status === "Active") || getState().employees[0];
		const ym = "2026-09";
		set({
			reg: { ...getState().reg, emp: "", q: "", cycle: ym },
			regGrid: { key: ym, state: "ok", err: "", leave: [], ar: [], overtime: [],
				punches: [{ name: "c1", employee: emp.name, time: "2026-09-01 08:05:00", log_type: "IN" }] },
			section: "attendance", subtab: "overview",
		});
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		fireEvent.click(screen.getAllByRole("button", { name: `Edit ${emp.employee_name}, 01-Sep-2026` })[0]);
		const save = () => screen.getByRole("button", { name: "Save" });
		/* Nothing changed yet: Save waits. */
		expect(save()).toBeDisabled();
		fireEvent.change(screen.getByLabelText("OT hours"), { target: { value: "02:00:00" } });
		expect(save()).not.toBeDisabled();
		fireEvent.change(screen.getByLabelText("OT hours"), { target: { value: "16:00:01" } });
		expect(save()).toBeDisabled();
		fireEvent.change(screen.getByLabelText("OT hours"), { target: { value: "00:00:59" } });
		expect(save()).not.toBeDisabled();
		expect(screen.getByLabelText("OT hours")).toHaveAttribute("type", "time");
		expect(screen.getByLabelText("OT hours")).toHaveAttribute("step", "1");
	});
});

import { assignmentOn } from "@/lib/roster";

describe("select an employee and add a shift", () => {
	beforeEach(() => resetStore());

	it("a dated shift beats the working time on its days only", () => {
		const W = { Day: { start_time: "8:30:00", end_time: "17:30:00" }, Night: { start_time: "20:00:00", end_time: "08:00:00" } };
		const { rows } = monthRoster({ ym: "2026-09", today: "2026-09-30", shift: "Day", window: W.Day, windows: W,
			assignments: [{ shift_type: "Night", start_date: "2026-09-10", end_date: "2026-09-12" }], punches: [] });
		expect(rows[8].shift).toBe("Day");
		expect(rows[9]).toMatchObject({ shift: "Night", assigned: true });
		expect(rows[12].shift).toBe("Day");
		expect(assignmentOn("2026-09-20", [{ shift_type: "A", start_date: "2026-09-01" }, { shift_type: "B", start_date: "2026-09-15" }]).shift_type).toBe("B");
	});

	it("the picked person's month offers a shift, a working time and dates", async () => {
		set(loadedState());
		const emp = getState().employees.find((e) => e.status === "Active") || getState().employees[0];
		set({ reg: { ...getState().reg, emp: emp.name, cycle: "2026-09" }, shiftTypes: [{ name: "Night" }], section: "attendance", subtab: "overview" });
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
		fireEvent.change(screen.getByLabelText("Shift"), { target: { value: "Night" } });
		expect(screen.getByRole("button", { name: "Set as working time" })).not.toBeDisabled();
		expect(screen.getByRole("button", { name: "Add shift" })).not.toBeDisabled();
		fireEvent.change(screen.getByLabelText("Shift from"), { target: { value: "" } });
		expect(screen.getByRole("button", { name: "Add shift" })).toBeDisabled();
	});
});

describe("clicking a time opens the clock", () => {
	beforeEach(() => resetStore());

	it("the popup opens the clock on the time that was clicked, and a browser that refuses still takes typing", async () => {
		monthOf([{ name: "c1", time: "2026-09-01 08:05:00", log_type: "IN" }]);
		const opened = [];
		const had = HTMLInputElement.prototype.showPicker;
		HTMLInputElement.prototype.showPicker = function () { opened.push(this.getAttribute("aria-label")); };
		try {
			await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });
			await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Time In, 01-Sep-2026" })); });
			expect(opened).toEqual(["Time In"]);
			const popup = within(screen.getByRole("dialog"));
			fireEvent.click(popup.getByLabelText("Time Out"));
			expect(opened).toEqual(["Time In", "Time Out"]);

			HTMLInputElement.prototype.showPicker = () => { throw new Error("NotAllowedError"); };
			fireEvent.click(popup.getByLabelText("Time In"));
			fireEvent.change(popup.getByLabelText("Time In"), { target: { value: "07:55" } });
			expect(popup.getByLabelText("Time In").value).toBe("07:55");
		} finally {
			HTMLInputElement.prototype.showPicker = had;
		}
	});
});
