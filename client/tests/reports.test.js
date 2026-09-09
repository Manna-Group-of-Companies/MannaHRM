import { describe, expect, it } from "vitest";

import {
	absent, availedLeave, birthdays, headCount, inOutCount, leaveDays, leaveHistory,
	missedPunches, monthlyLeave, newJoiners, onLeave, orgChart, pendingLeave, present,
	shiftReport, weekoffs,
} from "../src/lib/reports.js";
import { daysBetween } from "../src/data/reports.js";

/* ---------------------------------------------------------------------------
   Fifteen of Factor HR's reports, as arithmetic.

   No DOM and no site. Every rule below is a sentence about punches, people and
   days — the same bargain `lib/summary.js` and `lib/profedit.js` make — and the
   name of each test is the rule, because when one fails the name is what tells
   the reader what was supposed to be true.

   **Two of these decide whether somebody is paid for a day**, and they are the
   ones worth reading first: `absent` names people who did not turn up, and
   `missedPunches` names the punches somebody has to correct. Both round in the
   safe direction — CLAUDE.md §4 — and both have a test named after the way they
   round.
   --------------------------------------------------------------------------- */

const E = (name, extra = {}) => ({
	name, employee_name: name, employee_number: name, status: "Active",
	company: "Manna Rubber", department: "Production - MR", designation: "Operator", ...extra,
});

const P = (employee, time, log_type = "IN") => ({ employee, time, log_type });

const PEOPLE = [
	E("A", { date_of_joining: "2026-09-01", date_of_birth: "1990-03-14", default_shift: "General" }),
	E("B", { date_of_joining: "2019-04-01", date_of_birth: "1988-03-02", reports_to: "A" }),
	E("C", { date_of_joining: "2024-07-15", reports_to: "A", holiday_list: "Kerala 2026" }),
	E("D", { date_of_joining: "2026-09-05", reports_to: "B" }),
];

describe("who was here", () => {
	const punches = [
		P("A", "2026-09-08 09:01:00"), P("A", "2026-09-08 18:03:00", "OUT"),
		P("B", "2026-09-08 18:20:00", "OUT"),
		P("C", "2026-09-07 09:00:00"),
	];

	it("counts an OUT with no IN as present", () => {
		// A missed morning punch and a night shift that began yesterday both look
		// like this, and neither is somebody who did not turn up.
		expect(present(PEOPLE, punches, "2026-09-08").map((e) => e.name)).toEqual(["A", "B"]);
	});

	it("does not count a punch from another day", () => {
		expect(present(PEOPLE, punches, "2026-09-08").map((e) => e.name)).not.toContain("C");
	});

	it("reports the first and last punch, not an arbitrary one", () => {
		const a = present(PEOPLE, punches, "2026-09-08")[0];
		expect(a.first).toBe("2026-09-08 09:01:00");
		expect(a.last).toBe("2026-09-08 18:03:00");
	});

	it("splits ins from outs, so a count that is not two is visible", () => {
		const rows = inOutCount(PEOPLE, punches, "2026-09-08");
		expect(rows.find((r) => r.name === "B")).toMatchObject({ ins: 0, outs: 1, punches: 1 });
	});
});

describe("who was not", () => {
	const punches = [P("A", "2026-09-08 09:01:00")];
	const leave = [{ employee: "B", from_date: "2026-09-07", to_date: "2026-09-09", status: "Approved" }];

	it("leaves out anybody with a punch", () => {
		expect(absent(PEOPLE, punches, leave, "2026-09-08").map((e) => e.name)).not.toContain("A");
	});

	it("leaves out anybody on approved leave", () => {
		// An approved day off is not an absence, and a report that called it one
		// would be pointing HR at the wrong person on their first read.
		expect(absent(PEOPLE, punches, leave, "2026-09-08").map((e) => e.name)).not.toContain("B");
	});

	it("counts the last day of somebody's leave as leave", () => {
		// Both ends inclusive. Off by one here makes somebody absent on the last
		// day of their own holiday, which is a day's pay and an argument.
		expect(onLeave(leave, "2026-09-09").has("B")).toBe(true);
		expect(onLeave(leave, "2026-09-10").has("B")).toBe(false);
	});

	it("names the rest, and no more than the rest", () => {
		expect(absent(PEOPLE, punches, leave, "2026-09-08").map((e) => e.name)).toEqual(["C", "D"]);
	});
});

describe("missed punches", () => {
	const punches = [
		// A: in and out. Fine.
		P("A", "2026-09-08 09:00:00"), P("A", "2026-09-08 18:00:00", "OUT"),
		// B: in, never out.
		P("B", "2026-09-08 09:05:00"),
		// C: out with no in, on another day.
		P("C", "2026-09-07 18:30:00", "OUT"),
	];
	const days = ["2026-09-07", "2026-09-08"];

	it("says nothing about a day that pairs up", () => {
		expect(missedPunches(PEOPLE, punches, days).map((r) => r.name)).not.toContain("A");
	});

	it("catches an IN with no OUT and names what is missing", () => {
		const b = missedPunches(PEOPLE, punches, days).find((r) => r.name === "B");
		expect(b.missing).toBe("OUT");
		expect(b.on).toBe("2026-09-08");
	});

	it("catches an OUT with no IN, which is the same fault the other way up", () => {
		const c = missedPunches(PEOPLE, punches, days).find((r) => r.name === "C");
		expect(c.missing).toBe("IN");
	});

	it("walks the window a day at a time rather than subtracting two dates", () => {
		// Every off-by-one in this kind of code lives in the subtraction.
		expect(daysBetween("2026-09-07", "2026-09-09")).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
		expect(daysBetween("2026-09-08", "2026-09-08")).toEqual(["2026-09-08"]);
	});

	it("returns nothing rather than everything when the window is backwards", () => {
		expect(daysBetween("2026-09-09", "2026-09-07")).toEqual([]);
	});

	it("caps a very long window instead of walking it", () => {
		// A mistyped year is a short report, not a frozen tab. The page says so
		// on screen rather than quietly returning less than was asked for.
		expect(daysBetween("2020-01-01", "2026-01-01")).toHaveLength(62);
	});
});

describe("the shape of the place", () => {
	it("adds each group's three counts to its team size", () => {
		// The check worth doing before quoting any one of them.
		const punches = [P("A", "2026-09-08 09:00:00")];
		const leave = [{ employee: "B", from_date: "2026-09-08", to_date: "2026-09-08" }];
		const [g] = headCount(PEOPLE, punches, leave, "2026-09-08", "company");
		expect(g.team).toBe(4);
		expect(g.in + g.leave + g.notIn).toBe(g.team);
	});

	it("puts a person with no manager at the top and their reports under them", () => {
		const chart = orgChart(PEOPLE);
		expect(chart.map((e) => [e.name, e.depth])).toEqual([["A", 0], ["B", 1], ["D", 2], ["C", 1]]);
	});

	it("keeps two people who report to each other rather than dropping them", () => {
		// A real mistake on a real site. A chart that silently omitted them would
		// hide the one thing somebody opened it to find.
		const pair = [E("X", { reports_to: "Y" }), E("Y", { reports_to: "X" })];
		const chart = orgChart(pair);
		expect(chart.map((e) => e.name).sort()).toEqual(["X", "Y"]);
		expect(chart.every((e) => e.cycle)).toBe(true);
	});

	it("says which calendar each person is measured against, and when there is none", () => {
		const rows = weekoffs(PEOPLE, { "Kerala 2026": [1, 2, 3] });
		expect(rows.find((e) => e.name === "C")).toMatchObject({ list: "Kerala 2026", days: 3 });
		expect(rows.find((e) => e.name === "A")).toMatchObject({ list: "", days: null });
	});

	it("does not invent a shift for somebody who has none", () => {
		expect(shiftReport(PEOPLE).find((e) => e.name === "B").shift).toBe("");
	});
});

describe("who is new and who has a birthday", () => {
	it("counts joiners inside the window and nobody outside it", () => {
		const rows = newJoiners(PEOPLE, "2026-09-01", "2026-09-30");
		expect(rows.map((e) => e.name)).toEqual(["D", "A"]);
	});

	it("matches a birthday on the month, throwing the year away", () => {
		expect(birthdays(PEOPLE, "03").map((e) => e.name)).toEqual(["B", "A"]);
	});

	it("skips a record with no birthday rather than dating it", () => {
		// The commonest gap on a migrated record. A dashboard that invented one
		// would be wishing the wrong person.
		expect(birthdays(PEOPLE, "03").map((e) => e.name)).not.toContain("C");
	});
});

describe("leave, as their reports count it", () => {
	const rows = [
		{ employee: "A", leave_type: "Casual Leave", from_date: "2026-08-31", to_date: "2026-09-02", status: "Approved" },
		{ employee: "B", leave_type: "Sick Leave", from_date: "2026-09-10", to_date: "2026-09-10", status: "Open" },
		{ employee: "C", leave_type: "Casual Leave", from_date: "2026-09-01", to_date: "2026-09-01" },
		{ employee: "D", leave_type: "Casual Leave", from_date: "2026-08-03", to_date: "2026-08-04", status: "Approved", total_leave_days: 1.5 },
	];

	it("counts both ends of an application", () => {
		// A Monday-to-Monday application is eight days, not seven. A half-open
		// range would take a day off everybody's balance.
		expect(leaveDays({ from_date: "2026-09-07", to_date: "2026-09-14" })).toBe(8);
		expect(leaveDays({ from_date: "2026-09-08", to_date: "2026-09-08" })).toBe(1);
	});

	it("takes the site's own figure when it has one, because a half day is real", () => {
		expect(leaveDays(rows[3])).toBe(1.5);
	});

	it("treats an application with no status as still pending", () => {
		// Nobody has decided it, which is exactly what the report is for.
		// Reading a blank as decided would hide the worst case, not the best.
		expect(pendingLeave(rows).map((r) => r.employee).sort()).toEqual(["B", "C"]);
	});

	it("counts only approved leave as availed", () => {
		expect(availedLeave(rows).map((r) => r.employee).sort()).toEqual(["A", "D"]);
	});

	it("puts a trip crossing a month wholly in the month it started", () => {
		// Their report does the same. Worth knowing before anybody reconciles
		// the two and finds three days missing from September.
		const aug = monthlyLeave(rows).find((g) => g.month === "2026-08" && g.type === "Casual Leave");
		expect(aug.days).toBe(3 + 1.5);
		expect(monthlyLeave(rows).some((g) => g.month === "2026-09")).toBe(false);
	});

	it("counts people, not applications", () => {
		const twice = [
			{ employee: "A", leave_type: "Casual Leave", from_date: "2026-09-01", to_date: "2026-09-01", status: "Approved" },
			{ employee: "A", leave_type: "Casual Leave", from_date: "2026-09-20", to_date: "2026-09-20", status: "Approved" },
		];
		expect(monthlyLeave(twice)[0].people).toBe(1);
	});

	it("puts the newest application first", () => {
		expect(leaveHistory(rows)[0].employee).toBe("B");
	});
});
