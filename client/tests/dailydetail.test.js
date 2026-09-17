import { describe, expect, it } from "vitest";
import { clockOf, dailyRows, minutesOf, monthRollup } from "@/lib/dailydetail";
import { hhmm } from "@/api/attendance";

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

	it("month wise counts statuses and adds the hours", () => {
		const { rows } = dailyRows({ ...base, today: "2026-09-04", attendance: [
			{ employee: "E1", attendance_date: "2026-09-01", docstatus: 1, status: "Present", working_hours: 8 },
			{ employee: "E1", attendance_date: "2026-09-02", docstatus: 1, status: "Half Day", working_hours: 4 }] });
		const [g] = monthRollup(rows);
		expect(g).toMatchObject({ present: 1, half: 1, absent: 1, work: "12:00" });
	});
});
