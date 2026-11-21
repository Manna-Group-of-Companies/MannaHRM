import { describe, expect, it } from "vitest";
import { monthRoster } from "@/lib/roster";

/* Employee Attendance Regularization shows the overtime a day's punches earned
   and nobody has decided yet, so it can be approved there (21 Nov 2026). */
const W = { start_time: "08:30:00", end_time: "20:30:00" };
const base = { ym: "2026-11", leave: [], holidays: [], corrections: [], shift: "P12", today: "2026-11-21", window: W,
	assignments: [], windows: { P12: W } };
const day = (d, a, b) => [
	{ employee: "E1", time: `2026-11-${d} ${a}:00`, log_type: "IN" },
	{ employee: "E1", time: `2026-11-${d} ${b}:00`, log_type: "OUT" },
];

describe("overtime on the register", () => {
	it("a long day shows its overtime as pending, not paid", () => {
		const { rows } = monthRoster({ ...base, punches: day("02", "06:13", "20:39"), overtime: [] });
		const r = rows.find((x) => x.iso === "2026-11-02");
		expect(r.otPendingMin).toBe(120); // 14:26 against 12:00, rounded down to the half hour
		expect(r.otMin).toBe(0);
	});

	it("an approved day is paid and no longer pending; a rejected one is neither", () => {
		const punches = day("02", "06:13", "20:39").concat(day("03", "06:13", "20:39"));
		const { rows } = monthRoster({ ...base, punches, overtime: [
			{ ot_date: "2026-11-02", hours: 2, status: "Approved" },
			{ ot_date: "2026-11-03", hours: 0, status: "Rejected" }] });
		const [a, b] = ["2026-11-02", "2026-11-03"].map((d) => rows.find((x) => x.iso === d));
		expect([a.otMin, a.otPendingMin]).toEqual([120, 0]);
		expect([b.otMin, b.otPendingMin]).toEqual([0, 0]);
	});
});
