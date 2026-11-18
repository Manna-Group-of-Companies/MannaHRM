import { describe, expect, it } from "vitest";
import { activatePatch, deactivateDateProblem, deactivatePatch, workedIn } from "@/lib/deactivate";
import { dailyRows } from "@/lib/dailydetail";

/* ---------------------------------------------------------------------------
   Deactivate asks the date it took effect, kept as the Leaving Date, and Daily
   Detail draws a person's days only while they were here (18 Nov 2026).
   --------------------------------------------------------------------------- */

describe("deactivating with a date", () => {
	it("writes Inactive and the date as the Leaving Date; activating clears it", () => {
		expect(deactivatePatch("2026-11-15")).toEqual({ status: "Inactive", relieving_date: "2026-11-15" });
		expect(activatePatch()).toEqual({ status: "Active", relieving_date: null });
	});

	it("refuses no date, and a date before they joined", () => {
		expect(deactivateDateProblem("", "2025-01-01")).toMatch(/Pick the date/);
		expect(deactivateDateProblem("2024-12-31", "2025-01-01")).toMatch(/before they joined \(01-01-2025\)/);
		expect(deactivateDateProblem("2025-01-01", "2025-01-01")).toBe("");
		expect(deactivateDateProblem("2026-11-15", "")).toBe("");
	});

	it("counts somebody deactivated during or after the range as having worked in it", () => {
		expect(workedIn({ status: "Active" }, "2026-11-01")).toBe(true);
		expect(workedIn({ status: "Inactive", relieving_date: "2026-11-15" }, "2026-11-01")).toBe(true);
		expect(workedIn({ status: "Inactive", relieving_date: "2026-10-31" }, "2026-11-01")).toBe(false);
		expect(workedIn({ status: "Inactive" }, "2026-11-01")).toBe(false);
	});
});

describe("Daily Detail draws only the days somebody was here", () => {
	const W = { Office: { start_time: "9:00:00", end_time: "18:00:00" } };
	const base = { from: "2026-11-01", to: "2026-11-30", windows: W, today: "2026-12-01",
		attendance: [], punches: [], leave: [], holidaysOf: () => [] };

	it("stops on the date they were deactivated, instead of marking the rest Absent", () => {
		const e = { name: "E1", employee_name: "A", default_shift: "Office", status: "Inactive", relieving_date: "2026-11-15" };
		const { rows } = dailyRows({ ...base, people: [e] });
		expect(rows.length).toBe(15);
		expect(rows[rows.length - 1].date).toBe("2026-11-15");
	});

	it("starts on the day they joined", () => {
		const e = { name: "E2", employee_name: "B", default_shift: "Office", status: "Active", date_of_joining: "2026-11-20" };
		const { rows } = dailyRows({ ...base, people: [e] });
		expect(rows.map((r) => r.date)[0]).toBe("2026-11-20");
		expect(rows.length).toBe(11);
	});
});
