import { describe, expect, it } from "vitest";
import {
	DASH_COMPANIES, dailyPresent, hrSummary, joinTrend, monthAttendance, netByDept, offered,
	payrollSummary, todayAtGate, withoutStructure,
} from "@/lib/companydash";

const T = "2026-09-16";

describe("company dashboards", () => {
	it("a locked login that reads one company is offered only that company", () => {
		expect(offered([{ name: "Manna Treads" }])).toEqual(["Manna Treads"]);
	});

	it("an unrestricted login is offered the four asked for, not every company on the site", () => {
		expect(offered([{ name: "Manna Tyre UAE" }, ...DASH_COMPANIES.map((name) => ({ name }))])).toEqual(DASH_COMPANIES);
	});

	it("headcount counts only Active as active, and a joiner by this month's date", () => {
		const h = hrSummary([
			{ name: "a", status: "Active", date_of_joining: "2026-09-02", department: "Mixing" },
			{ name: "b", status: "Left", date_of_joining: "2020-01-01" },
			{ name: "c", status: "Active", date_of_joining: "2024-05-01", attendance_device_id: "7", reports_to: "a" },
		], T);
		expect([h.total, h.active, h.left, h.joinedMonth, h.noDevice, h.noManager]).toEqual([3, 2, 1, 1, 1, 1]);
	});

	it("the join trend is six months ending this one", () => {
		const t = joinTrend([{ date_of_joining: "2026-09-01" }, { date_of_joining: "2026-04-10" }], T);
		expect(t.map((r) => r.n)).toEqual([1, 0, 0, 0, 0, 1]);
		expect(t).toHaveLength(6);
	});

	it("a punch beats an approved leave on the same day", () => {
		const g = todayAtGate(
			[{ name: "a" }, { name: "b" }, { name: "c" }],
			[{ employee: "a", time: T + " 08:01:00" }, { employee: "z", time: T + " 08:00:00" }],
			[{ employee: "a", status: "Approved", from_date: T, to_date: T },
				{ employee: "b", status: "Approved", from_date: "2026-09-15", to_date: "2026-09-17" }],
			T,
		);
		expect(g).toEqual({ present: 1, leave: 1, notIn: 1, of: 3 });
	});

	it("draft and cancelled attendance are not counted as days", () => {
		const m = monthAttendance([
			{ status: "Present", docstatus: 1, late_entry: 1 },
			{ status: "Half Day", docstatus: 1 },
			{ status: "Absent", docstatus: 0 },
			{ status: "Absent", docstatus: 2 },
		]);
		expect(m.marked).toBe(2);
		expect(m.late).toBe(1);
		expect(m.rate).toBe(75);
	});

	it("an empty month has no rate rather than a zero one", () => {
		expect(monthAttendance([]).rate).toBeNull();
	});

	it("present per day runs to today only", () => {
		const d = dailyPresent([{ status: "Present", docstatus: 1, attendance_date: "2026-09-03" }], T);
		expect(d).toHaveLength(16);
		expect(d[2].n).toBe(1);
	});

	it("draft slips are never added to paid totals", () => {
		const p = payrollSummary([
			{ docstatus: 1, gross_pay: 20000, total_deduction: 2000, net_pay: 18000, department: "A" },
			{ docstatus: 0, gross_pay: 9000, net_pay: 8000 },
			{ docstatus: 2, net_pay: 99999 },
		]);
		expect([p.slips, p.submitted, p.draft, p.net, p.gross, p.draftNet]).toEqual([2, 1, 1, 18000, 20000, 8000]);
		expect(netByDept([{ docstatus: 1, net_pay: 5, department: "A" }, { docstatus: 0, net_pay: 9, department: "B" }]))
			.toEqual([["A", 5]]);
	});

	it("only a submitted structure assignment counts as having a structure", () => {
		expect(withoutStructure([{ name: "a" }, { name: "b" }], [{ employee: "a", docstatus: 1 }, { employee: "b", docstatus: 0 }])
			.map((e) => e.name)).toEqual(["b"]);
	});
});

import { missing, punchGaps } from "@/lib/newemp";
import { NEW_EMP_STEPS } from "@/data/employees";

describe("create employee: company and punch method", () => {
	it("company and punch method are asked on the first step", () => {
		const first = NEW_EMP_STEPS[0][2].flatMap((g) => g[1]).map((r) => r[0]);
		expect(first.slice(0, 2)).toEqual(["company", "custom_punch_method"]);
		expect(NEW_EMP_STEPS.slice(1).flatMap((s) => s[2].flatMap((g) => g[1])).map((r) => r[0])).not.toContain("company");
	});

	it("a fingerprint-machine punch without a machine code is not finished", () => {
		expect(missing(0, { company: "Manna Treads", custom_punch_method: "Fingerprint Machine" }).join(" "))
			.toMatch(/Machine Code/);
		expect(punchGaps({ custom_punch_method: "Fingerprint Machine", attendance_device_id: "12" })).toEqual([]);
	});

	it("a mobile-app punch needs an email to sign in with, and does not need a machine code", () => {
		const f = { custom_punch_method: "Mobile App" };
		expect(punchGaps(f).map((g) => g.on)).toEqual(["company_email"]);
		expect(punchGaps({ ...f, personal_email: "a@b.c" })).toEqual([]);
		expect(missing(0, f).join(" ")).not.toMatch(/Machine Code/);
		expect(missing(1, f).join(" ")).toMatch(/Email/);
	});

	it("both needs both", () => {
		expect(punchGaps({ custom_punch_method: "Both" })).toHaveLength(2);
	});
});

import { editPlan } from "@/lib/punchedit";
import { dayPunches } from "@/lib/roster";

describe("editing a day's punches on Attendance Regularization", () => {
	const D = "2026-09-10";
	const day = [
		{ name: "c1", time: D + " 08:05:00", log_type: "IN" },
		{ name: "c2", time: D + " 13:00:00", log_type: "OUT" },
		{ name: "c3", time: D + " 13:30:00", log_type: "IN" },
		{ name: "c4", time: D + " 17:40:00", log_type: "OUT" },
	];

	it("moving Time In earlier writes one punch and sets nothing aside", () => {
		const p = editPlan(D, day, { in: "08:00", out: "17:40" });
		expect(p.add).toEqual([{ log_type: "IN", time: D + " 08:00:00" }]);
		expect(p.skip).toEqual([]);
	});

	it("moving Time In later sets aside every IN that would still win, and no later one", () => {
		const p = editPlan(D, day, { in: "09:00", out: "17:40" });
		expect(p.skip.map((c) => c.name)).toEqual(["c1"]);
	});

	it("moving Time Out earlier sets aside the later OUT and keeps the lunch one", () => {
		const p = editPlan(D, day, { in: "08:05", out: "17:30" });
		expect(p.add).toEqual([{ log_type: "OUT", time: D + " 17:30:00" }]);
		expect(p.skip.map((c) => c.name)).toEqual(["c4"]);
	});

	it("an out before the in is refused rather than guessed across midnight", () => {
		expect(editPlan(D, day, { in: "22:00", out: "06:00" }).ok).toBe(false);
	});

	it("an unchanged row writes nothing", () => {
		expect(editPlan(D, day, { in: "08:05", out: "17:40" })).toMatchObject({ ok: false, add: [], skip: [] });
	});

	it("a set-aside punch no longer decides the day, but is still there", () => {
		const after = day.map((c) => (c.name === "c1" ? { ...c, skip_auto_attendance: 1 } : c))
			.concat([{ name: "n", time: D + " 09:00:00", log_type: "IN" }]);
		expect(dayPunches(after).inAt).toBe(D + " 09:00:00");
		expect(editPlan(D, after, { in: "09:00", out: "17:40" }).ok).toBe(false);
	});
});
