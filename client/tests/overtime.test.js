import { describe, expect, it } from "vitest";
import { autoOtMinutes, otCounts, otDay, parseOtInput, shiftMinutes, OT_APPROVED, OT_PENDING, OT_REJECTED } from "@/lib/overtime";
import { dailyRows, monthRollup } from "@/lib/dailydetail";
import { overtimeByDay } from "@/lib/roster";
import { DDA_COLS, DDA_MONTH_COLS } from "@/data/attendance";

/* ---------------------------------------------------------------------------
   Overtime worked out from the punches, paid only once approved (18 Nov 2026).
   --------------------------------------------------------------------------- */

describe("the OT rule: beyond the shift, from 30 minutes, in half hours", () => {
	it("counts nothing under 30 minutes beyond the shift", () => {
		expect(autoOtMinutes(540 + 29, 540)).toBe(0);
		expect(autoOtMinutes(540, 540)).toBe(0);
		expect(autoOtMinutes(500, 540)).toBe(0);
	});

	it("rounds down to the half hour from 30 minutes", () => {
		expect(autoOtMinutes(540 + 30, 540)).toBe(30);
		expect(autoOtMinutes(540 + 59, 540)).toBe(30);
		expect(autoOtMinutes(540 + 70, 540)).toBe(60);
		expect(autoOtMinutes(540 + 119, 540)).toBe(90);
	});

	it("gives an 8-hour worker on a 12-hour slot four hours", () => {
		expect(autoOtMinutes(12 * 60, 8 * 60)).toBe(240);
	});

	it("earns nothing without a known shift or known hours", () => {
		expect(autoOtMinutes(700, null)).toBe(0);
		expect(autoOtMinutes(0, 540)).toBe(0);
	});

	it("measures a night shift across midnight", () => {
		expect(shiftMinutes({ start_time: "20:30:00", end_time: "8:30:00" })).toBe(720);
		expect(shiftMinutes({ start_time: "8:30:00", end_time: "17:30:00" })).toBe(540);
		expect(shiftMinutes({})).toBe(null);
	});
});

describe("only approved OT is paid", () => {
	it("counts an approved row, and a row from before approval existed", () => {
		expect(otCounts({ hours: 2, status: OT_APPROVED })).toBe(true);
		expect(otCounts({ hours: 2 })).toBe(true);
		expect(otCounts({ hours: 2, status: OT_PENDING })).toBe(false);
		expect(otCounts({ hours: 2, status: OT_REJECTED })).toBe(false);
	});

	it("shows the punches' OT as pending until a row decides the day", () => {
		expect(otDay(null, 90)).toMatchObject({ state: "pending", paidMin: 0, pendingMin: 90 });
		expect(otDay({ hours: 1, status: OT_APPROVED }, 90)).toMatchObject({ state: "approved", paidMin: 60, pendingMin: 0 });
		expect(otDay({ hours: 0, status: OT_REJECTED }, 90)).toMatchObject({ state: "rejected", paidMin: 0, pendingMin: 0 });
		expect(otDay(null, 0)).toMatchObject({ state: "", paidMin: 0, pendingMin: 0 });
	});

	it("leaves pending and rejected rows out of the month's OT by day", () => {
		const m = overtimeByDay([
			{ ot_date: "2026-11-01", hours: 2, status: OT_APPROVED },
			{ ot_date: "2026-11-02", hours: 2, status: OT_REJECTED },
			{ ot_date: "2026-11-03", hours: 2, status: OT_PENDING },
			{ ot_date: "2026-11-04", hours: 1 },
		]);
		expect([...m.keys()]).toEqual(["2026-11-01", "2026-11-04"]);
	});
});

describe("Daily Detail: Overtime is approved, OT Pending is waiting", () => {
	const E = { name: "E1", employee_name: "A", default_shift: "Office", company: "C" };
	const W = { Office: { start_time: "8:30:00", end_time: "17:30:00" } };
	const base = { people: [E], from: "2026-11-02", to: "2026-11-02", windows: W, today: "2026-11-03",
		attendance: [], leave: [], holidaysOf: () => [],
		/* 08:20 to 19:00 is 10:40 against a 9-hour shift: 1:40 over, so 1:30 of OT. */
		punches: [
			{ employee: "E1", time: "2026-11-02 08:20:00", log_type: "IN" },
			{ employee: "E1", time: "2026-11-02 19:00:00", log_type: "OUT" }] };

	it("shows the punches' OT as pending and pays none of it", () => {
		const [r] = dailyRows(base).rows;
		expect(r).toMatchObject({ ot: "", otMin: 0, otPending: "1:30", otPendingMin: 90, otState: "pending", otAutoMin: 90 });
	});

	it("pays the approved hours, even when they differ from the punches", () => {
		const [r] = dailyRows({ ...base, overtime: [{ employee: "E1", ot_date: "2026-11-02", hours: 1, status: OT_APPROVED }] }).rows;
		expect(r).toMatchObject({ ot: "1:00", otMin: 60, otPending: "", otState: "approved", otAutoMin: 90 });
	});

	it("pays nothing and asks nothing for a rejected day", () => {
		const [r] = dailyRows({ ...base, overtime: [{ employee: "E1", ot_date: "2026-11-02", hours: 0, status: OT_REJECTED }] }).rows;
		expect(r).toMatchObject({ ot: "", otMin: 0, otPending: "", otState: "rejected" });
	});

	it("carries both figures into Month Wise, and has a column for each", () => {
		const [g] = monthRollup(dailyRows(base).rows);
		expect(g).toMatchObject({ ot: "", otPending: "1:30" });
		expect(DDA_COLS.map((c) => c[0])).toEqual(expect.arrayContaining(["Overtime", "OT Pending"]));
		expect(DDA_MONTH_COLS.map((c) => c[0])).toEqual(expect.arrayContaining(["Overtime", "OT Pending"]));
	});
});

describe("what somebody types as OT", () => {
	it("reads H:MM and decimal hours, and refuses anything else", () => {
		expect(parseOtInput("2:30")).toBe(150);
		expect(parseOtInput("2.5")).toBe(150);
		expect(parseOtInput("3")).toBe(180);
		expect(parseOtInput("")).toBe(0);
		expect(parseOtInput("2:75")).toBe(null);
		expect(parseOtInput("abc")).toBe(null);
	});
});
