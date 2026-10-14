import { describe, expect, it } from "vitest";
import { clockOf, dailyRows, minutesOf, monthRollup } from "@/lib/dailydetail";
import { hhmm, shiftLabel } from "@/api/attendance";
import { periodOf } from "@/lib/format";
import { shiftPeriod } from "@/lib/monthlysummary";
import { DDA_COLS } from "@/data/attendance";

const E = { name: "E1", employee_name: "A", default_shift: "Office", company: "C" };
const W = { Office: { start_time: "8:30:00", end_time: "17:30:00" } };
const base = { people: [E], from: "2026-09-01", to: "2026-09-03", windows: W, today: "2026-09-03",
	attendance: [], punches: [], leave: [], holidaysOf: () => [] };

describe("Daily Detail Attendance Report reads the whole range, not today's punches", () => {
	it("a shift stored as 8:30:00 is 08:30, not 8:30:", () => {
		expect(minutesOf("8:30:00")).toBe(510);
		expect(clockOf("8:30:00")).toBe("08:30");
		expect(hhmm("8:30:00")).toBe("08:30");
	});

	it("a processed day takes status, times and hours from Attendance", () => {
		const { rows } = dailyRows({ ...base, attendance: [{ employee: "E1", attendance_date: "2026-09-01", docstatus: 1,
			status: "Present", in_time: "2026-09-01 08:42:00", out_time: "2026-09-01 17:10:00", working_hours: 8.47,
			shift: "Office" }] });
		expect(rows[0]).toMatchObject({ status: "Present", in: "08:42", out: "17:10", work: "8:28", late: "0:12", early: "0:20", source: "attendance" });
	});

	it("an unprocessed day falls back to its punches, and says so", () => {
		const { rows } = dailyRows({ ...base, punches: [
			{ employee: "E1", time: "2026-09-02 08:20:00", log_type: "IN" },
			{ employee: "E1", time: "2026-09-02 18:30:00", log_type: "OUT" }] });
		expect(rows[1]).toMatchObject({ status: "Present", in: "08:20", out: "18:30", ot: "", source: "punches" });
	});

	it("a past day with nothing is Absent, a holiday is the holiday, approved leave is leave", () => {
		const { rows } = dailyRows({ ...base,
			holidaysOf: () => [{ holiday_date: "2026-09-02", weekly_off: 1 }],
			leave: [{ employee: "E1", from_date: "2026-09-03", to_date: "2026-09-03", status: "Approved" }], today: "2026-09-04" });
		expect(rows.map((r) => r.status)).toEqual(["Absent", "Weekly Off", "On Leave"]);
	});

	it("OT is the hours HR entered for the day, not the late punch-out", () => {
		const { rows } = dailyRows({ ...base, overtime: [{ employee: "E1", ot_date: "2026-09-02", hours: 2 }], punches: [
			{ employee: "E1", time: "2026-09-02 08:20:00", log_type: "IN" },
			{ employee: "E1", time: "2026-09-02 18:30:00", log_type: "OUT" }] });
		expect(rows.map((r) => r.ot)).toEqual(["", "2:00", ""]);
	});

	it("an out that is not after its in gets no hours rather than negative ones", () => {
		const { rows } = dailyRows({ ...base, attendance: [{ employee: "E1", attendance_date: "2026-09-01", docstatus: 1,
			status: "Present", in_time: "2026-09-01 20:26:26", out_time: "2026-09-01 08:32:32", working_hours: -11.9 }] });
		expect(rows[0]).toMatchObject({ work: "", crossed: true, early: "", ot: "" });
	});

	it("a punch-in from 06:00 up to 18:00 is Day, and every other hour is Night", () => {
		expect(["05:59", "06:00", "8:30:00", "17:59", "18:00", "20:30", "00:15"].map(periodOf))
			.toEqual(["Night", "Day", "Day", "Day", "Night", "Night", "Night"]);
		expect(periodOf("2026-09-10 20:32:00")).toBe("Night");
		expect(periodOf("2026-09-10T07:55:00")).toBe("Day");
	});

	it("a day with no punch-in is neither Day nor Night", () => {
		expect(periodOf("")).toBe("");
		expect(periodOf(null)).toBe("");
		const col = DDA_COLS.find((c) => c[0] === "Day / Night");
		const { rows } = dailyRows({ ...base, today: "2026-09-04" });
		expect(col[1](rows[0])).toBe("—");
	});

	it("Day / Night reads the punch-in, not the shift the person is assigned", () => {
		const col = DDA_COLS.find((c) => c[0] === "Day / Night");
		const { rows } = dailyRows({ ...base, attendance: [
			{ employee: "E1", attendance_date: "2026-09-01", docstatus: 1, status: "Present",
				in_time: "2026-09-01 08:42:00", out_time: "2026-09-01 17:10:00", shift: "Office" },
			{ employee: "E1", attendance_date: "2026-09-02", docstatus: 1, status: "Present",
				in_time: "2026-09-02 20:31:00", out_time: "2026-09-03 08:35:00", shift: "Office" }] });
		expect(rows.slice(0, 2).map(col[1])).toEqual(["Day", "Night"]);
	});

	it("a shift is called Day or Night by the same cut as a punch-in", () => {
		const windows = { "HRI-Day Shift": { start_time: "8:30:00" }, "HRI-Night Shift": { start_time: "20:30:00" } };
		expect(shiftPeriod("HRI-Day Shift", windows)).toBe("Day");
		expect(shiftPeriod("HRI-Night Shift", windows)).toBe("Night");
		expect(shiftPeriod("Nobody's", windows)).toBe("");
	});

	it("an unprocessed night at a gate with no direction is one day, arrived at night", () => {
		const N = { ...E, default_shift: "Night" };
		const windows = { Night: { start_time: "20:30:00", end_time: "8:30:00" } };
		const gate = (t) => ({ employee: "E1", time: t, log_type: "" });
		const { rows } = dailyRows({ ...base, people: [N], windows, today: "2026-09-04", punches: [
			gate("2026-09-01 20:29:00"), gate("2026-09-02 08:31:00"), gate("2026-09-02 20:33:00"), gate("2026-09-03 08:30:00")] });
		expect(rows[0]).toMatchObject({ in: "20:29", out: "08:31", period: "Night", work: "12:02", status: "Present", late: "", early: "" });
		/* The 2nd's 08:31 was the 1st's leaving — calendar days made it the 2nd's arrival, at a Day time. */
		expect(rows[1]).toMatchObject({ in: "20:33", out: "08:30", period: "Night", status: "Present" });
	});

	it("the last night of a range is finished by the morning after it", () => {
		const N = { ...E, default_shift: "Night" };
		const windows = { Night: { start_time: "20:30:00", end_time: "8:30:00" } };
		const { rows } = dailyRows({ ...base, people: [N], windows, from: "2026-09-03", to: "2026-09-03", today: "2026-09-05",
			punches: [{ employee: "E1", time: "2026-09-03 20:30:00" }, { employee: "E1", time: "2026-09-04 08:30:00" }] });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ in: "20:30", out: "08:30", status: "Present" });
	});

	it("a night with only its morning leaving is Night and out-only, not a Day arrival", () => {
		const N = { ...E, default_shift: "Night" };
		const windows = { Night: { start_time: "20:30:00", end_time: "8:30:00" } };
		const { rows } = dailyRows({ ...base, people: [N], windows, today: "2026-09-04",
			punches: [{ employee: "E1", time: "2026-09-02 08:31:00" }] });
		expect(rows[0]).toMatchObject({ in: "", out: "08:31", period: "Night", status: "Out Only" });
		expect(rows[1]).toMatchObject({ in: "", out: "", status: "Absent" });
	});

	it("month wise counts statuses and adds the hours", () => {
		const { rows } = dailyRows({ ...base, today: "2026-09-04", attendance: [
			{ employee: "E1", attendance_date: "2026-09-01", docstatus: 1, status: "Present", working_hours: 8 },
			{ employee: "E1", attendance_date: "2026-09-02", docstatus: 1, status: "Half Day", working_hours: 4 }] });
		const [g] = monthRollup(rows);
		expect(g).toMatchObject({ present: 1, half: 1, absent: 1, work: "12:00" });
	});
});

describe("a shift's label on a roster row", () => {
	it("a window in the name gives way to the one the site runs, so a row never shows two", () => {
		const w = { "Hi-Tech Pretreads-Cook shift (08:00-04:00)": { start_time: "8:00:00", end_time: "16:00:00" } };
		expect(shiftLabel("Hi-Tech Pretreads-Cook shift (08:00-04:00)", w)).toBe("Hi-Tech Pretreads-Cook shift (08:00-16:00)");
		expect(shiftLabel("Office", W)).toBe("Office (08:30-17:30)");
		expect(shiftLabel("Hi-Tech Pretreads-Cook shift (08:00-04:00)", {})).toBe("Hi-Tech Pretreads-Cook shift (08:00-04:00)");
	});
});
