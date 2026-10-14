import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
	AUTO_MARK, BACKFILL_UNTIL, EFFECTIVE_FROM, GRACE_DAYS, WORKED, adjustment, credit, credited, earned, isOff, listOn, plan,
	reason, stillOpenSince, sundays, window,
} from "@/lib/sundayleave";

/* ---------------------------------------------------------------------------
   Sunday leave (HR, 3 October 2026): each Sunday an office employee works
   adds a day of Casual Leave. lib/sundayleave.js is a copy of
   manna_hr/sundayleave.py — the site's hourly job once installed — so the two
   are pinned here, and the plan is tested on the Python's own cases.
   --------------------------------------------------------------------------- */

const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/sundayleave.py"), "utf8");

describe("the dashboard applies the same Sunday leave the site does", () => {
	it("the_mark_that_lets_the_rule_replace_its_own_adjustment_is_spelled_the_same", () => {
		expect(py).toContain(`AUTO_MARK = "${AUTO_MARK}"`);
	});

	it("starts_on_the_same_day_and_looks_back_as_far", () => {
		const [y, m, d] = EFFECTIVE_FROM.split("-").map(Number);
		expect(py).toContain(`EFFECTIVE_FROM = date(${y}, ${m}, ${d})`);
		expect(py).toContain(`GRACE_DAYS = ${GRACE_DAYS}`);
		const [by, bm, bd] = BACKFILL_UNTIL.split("-").map(Number);
		expect(py).toContain(`BACKFILL_UNTIL = date(${by}, ${bm}, ${bd})`);
	});

	it("a_marked_sunday_earns_the_same_in_both", () => {
		expect(py).toContain(`WORKED = {${Object.entries(WORKED).map(([k, v]) => `"${k}": ${v}`).join(", ")}}`);
	});

	it("the_reason_reads_the_same_as_the_python_writes_it", () => {
		expect(reason(["2026-10-04", "2026-10-11"]))
			.toBe("[Sunday leave] Casual Leave for 2 Sundays worked: 04-Oct-2026, 11-Oct-2026.");
		expect(reason(["2026-10-04"])).toBe("[Sunday leave] Casual Leave for 1 Sunday worked: 04-Oct-2026.");
		expect(reason(["2026-10-04", "2026-10-11"], ["2026-10-11"]))
			.toBe("[Sunday leave] Casual Leave for 2 Sundays worked: 04-Oct-2026, 11-Oct-2026 (half day).");
	});

	it("the_calendar_reads_back_exactly_the_sundays_the_reason_names", () => {
		expect(credited(reason(["2026-09-20", "2026-10-11"], ["2026-10-11"]))).toEqual({ "2026-09-20": 1, "2026-10-11": 0.5 });
		expect(credited("Opening balance 04-Oct-2026")).toEqual({});
	});
});

describe("one allocation's Sundays", () => {
	const ours = (name, leaves, days) => ({ name, leaves, reason: reason(days) });

	it("a_sunday_with_an_in_and_an_out_earns_a_day_and_one_punch_does_not", () => {
		expect(credit(undefined, 2)).toBe(1);
		expect(credit(undefined, 1)).toBe(0);
	});

	it("attendance_decides_when_the_site_has_marked_the_sunday", () => {
		expect(credit("Present", 0)).toBe(1);
		expect(credit("Half Day", 4)).toBe(0.5);
		expect(credit("Absent", 4)).toBe(0);
	});

	it("the_days_added_are_the_number_of_sundays_worked", () => {
		expect(earned({ "2026-10-04": 1, "2026-10-11": 0, "2026-10-18": 1 }))
			.toEqual({ total: 2, worked: ["2026-10-04", "2026-10-18"] });
	});

	it("only_sundays_on_the_holiday_list_count_and_all_do_when_it_cannot_be_read", () => {
		expect(sundays("2026-10-01", "2026-10-31", ["2026-10-02", "2026-10-04", "2026-10-18"])).toEqual(["2026-10-04", "2026-10-18"]);
		expect(sundays("2026-10-01", "2026-10-31")).toEqual(["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
	});

	it("sundays_before_the_rule_began_or_still_to_come_earn_nothing", () => {
		expect(window("2026-01-01", "2026-12-31", "2026-10-20")).toEqual(["2026-09-01", "2026-10-20"]);
		expect(window("2026-01-01", "2026-08-31", "2026-10-20")).toBe(null);
		expect(sundays("2026-10-01", "2026-10-03")).toEqual([]);
	});

	it("september_sundays_go_into_the_first_allocation_even_though_it_starts_in_october", () => {
		expect(window("2026-10-01", "2026-12-31", "2026-10-03", true)).toEqual(["2026-09-01", "2026-10-03"]);
		expect(window("2027-01-01", "2027-12-31", "2027-01-20")).toEqual(["2027-01-01", "2027-01-20"]);
	});

	it("only_the_october_changeover_reaches_back_to_september", () => {
		expect(window("2027-02-01", "2027-12-31", "2027-03-01", true)).toEqual(["2027-02-01", "2027-03-01"]);
	});

	const HLA = [
		{ assigned_to: "Manna Rubber", from_date: "2026-04-01", holiday_list: "Manna Holidays 2026-27" },
		{ assigned_to: "Manna Rubber", from_date: "2027-04-01", holiday_list: "Manna Holidays 2027-28" },
	];

	it("the_holiday_list_is_the_one_in_force_on_each_sunday_not_today", () => {
		expect(listOn(HLA, "E1", "Manna Rubber", "2027-01-10")).toBe("Manna Holidays 2026-27");
		expect(listOn(HLA, "E1", "Manna Rubber", "2027-04-04")).toBe("Manna Holidays 2027-28");
	});

	it("the_employees_own_assignment_wins_over_the_companys", () => {
		const own = [...HLA, { assigned_to: "E1", from_date: "2026-10-01", holiday_list: "Branch Holidays" }];
		expect(listOn(own, "E1", "Manna Rubber", "2026-10-04")).toBe("Branch Holidays");
		expect(listOn(own, "E2", "Manna Rubber", "2026-10-04")).toBe("Manna Holidays 2026-27");
	});

	it("a_sunday_no_list_answers_for_counts_rather_than_losing_the_day", () => {
		const lists = { "Manna Holidays 2026-27": { from: "2026-04-01", to: "2027-03-31", dates: new Set() } };
		expect(isOff("2027-04-04", "Manna Holidays 2026-27", lists)).toBe(true);
		expect(isOff("2026-10-04", null, lists)).toBe(true);
		expect(isOff("2026-10-04", "Manna Holidays 2026-27", lists)).toBe(false);
	});

	it("the_first_sunday_creates_the_adjustment_and_a_further_one_replaces_it", () => {
		expect(plan(1, [])).toEqual({ cancel: [], create: 1, blocked: null });
		expect(plan(2, [ours("LAD-1", 1, ["2026-10-04"])], reason(["2026-10-04", "2026-10-11"])))
			.toEqual({ cancel: ["LAD-1"], create: 2, blocked: null });
	});

	it("nothing_changes_when_the_total_and_the_sundays_agree", () => {
		const days = ["2026-10-04", "2026-10-11"];
		expect(plan(2, [ours("LAD-1", 2, days)], reason(days))).toEqual({ cancel: [], create: null, blocked: null });
	});

	it("a_sunday_that_no_longer_counts_takes_its_day_back", () => {
		expect(plan(0, [ours("LAD-1", 1, ["2026-10-04"])])).toEqual({ cancel: ["LAD-1"], create: null, blocked: null });
	});

	it("an_adjustment_hr_made_is_never_cancelled_and_blocks_the_rule", () => {
		const p = plan(1, [{ name: "LAD-HR", leaves: 3, reason: "Opening balance from Factor HR" }]);
		expect(p.cancel).toEqual([]);
		expect(p.create).toBe(null);
		expect(p.blocked).toContain("LAD-HR");
	});

	it("the_adjustment_allocates_the_total_to_casual_leave", () => {
		expect(adjustment("E1", "LAL-1", 2, ["2026-10-04", "2026-10-11"], "2026-10-12", "LAD-1")).toMatchObject({
			employee: "E1", leave_type: "Casual Leave", leave_allocation: "LAL-1", adjustment_type: "Allocate",
			leaves_to_adjust: 2, posting_date: "2026-10-12", amended_from: "LAD-1",
		});
	});

	it("an_allocation_that_ended_last_month_is_still_looked_at", () => {
		expect(stillOpenSince("2027-01-15")).toBe("2026-12-15");
		expect(stillOpenSince("2026-10-03")).toBe("2026-09-02");
		expect(stillOpenSince("2026-09-15")).toBe(EFFECTIVE_FROM);
	});
});

/* --------------------------------------------------------------- the writes */

const site = { allocations: [], attendance: [], punches: [], adjustments: [], assignments: [] };
const calls = [];
const asked = [];
let holidayDates = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label, fields, filters, size, orFilters) => {
		asked.push([label, orFilters]);
		return Promise.resolve(
			label === "Leave Allocation" ? site.allocations
				: label === "Attendance" ? site.attendance
					: label === "Employee Checkin" ? site.punches
						: label === "Leave Adjustment" ? site.adjustments
							: label === "Holiday List Assignment" ? site.assignments : []);
	},
	getDoc: (label, name) => Promise.resolve(label === "Holiday List" && name === "Manna Holidays 2026-27"
		? { from_date: "2026-04-01", to_date: "2027-03-31", holidays: holidayDates.map((holiday_date) => ({ holiday_date })) }
		: null),
	apiCreateSubmitted: (label, doc) => {
		calls.push(["create", label, doc.leave_allocation, doc.leaves_to_adjust, doc.amended_from || ""]);
		return Promise.resolve({ name: "LAD-NEW" });
	},
}));
vi.mock("@/api/crud", async (importOriginal) => ({
	...(await importOriginal()),
	cancel: (label, name) => { calls.push(["cancel", label, name]); return Promise.resolve({ ok: true }); },
}));

const { set } = await import("@/store");
const { runSundayLeave } = await import("@/api/sundayleave");

const SAJI = { name: "E-OFFICE", employee_name: "SAJI KUMAR K M", designation: "Production Manager", status: "Active", company: "Manna Rubber" };
const ALLOC = { name: "HR-LAL-1", employee: "E-OFFICE", from_date: "2026-10-01", to_date: "2026-12-31", leave_policy_assignment: "LPA-1" };

describe("Sunday leave runs by itself against the site", () => {
	beforeEach(() => {
		calls.length = 0;
		asked.length = 0;
		site.allocations = [ALLOC];
		site.attendance = [];
		site.punches = [];
		site.adjustments = [];
		/* hrms 16 reads the list off a Holiday List Assignment (the company's
		   here, as on the live site) and nothing else. */
		site.assignments = [{ assigned_to: "Manna Rubber", from_date: "2026-04-01", holiday_list: "Manna Holidays 2026-27" }];
		holidayDates = ["2026-09-06", "2026-09-13", "2026-10-02", "2026-10-04", "2026-10-11", "2026-10-18"];
		set({ employees: [SAJI], companies: [{ name: "Manna Rubber", default_holiday_list: "Some Other List" }] });
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-20T10:00:00"));
	});

	it("a_sunday_punched_in_and_out_adds_a_day_of_casual_leave_to_the_allocation", async () => {
		site.punches = [{ time: "2026-10-04 09:22:00" }, { time: "2026-10-04 17:15:00" }];
		const r = await runSundayLeave();
		expect(calls).toEqual([["create", "Leave Adjustment", "HR-LAL-1", 1, ""]]);
		expect(r.given).toMatchObject([{ employee: "E-OFFICE", days: 1, sundays: ["2026-10-04"] }]);
	});

	it("saji_kumars_september_sundays_are_added_to_his_october_allocation", async () => {
		vi.setSystemTime(new Date("2026-10-03T16:00:00"));
		holidayDates = ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-02"];
		site.punches = [
			{ time: "2026-09-20 08:01:53" }, { time: "2026-09-20 13:14:20" },
			{ time: "2026-09-27 09:22:59" }, { time: "2026-09-27 17:15:33" },
		];
		const r = await runSundayLeave();
		expect(calls).toEqual([["create", "Leave Adjustment", "HR-LAL-1", 2, ""]]);
		expect(r.given).toMatchObject([{ days: 2, sundays: ["2026-09-20", "2026-09-27"] }]);
	});

	it("a_one_month_september_allocation_made_for_an_absence_takes_no_sundays_and_is_nobodys_first", async () => {
		vi.setSystemTime(new Date("2026-10-06T16:00:00"));
		site.allocations = [{ name: "HR-LAL-SEP", employee: "E-OFFICE", from_date: "2026-09-01", to_date: "2026-09-30" }, ALLOC];
		holidayDates = ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-02", "2026-10-04"];
		site.punches = [
			{ time: "2026-09-20 08:01:53" }, { time: "2026-09-20 13:14:20" },
			{ time: "2026-09-27 09:22:59" }, { time: "2026-09-27 17:15:33" },
		];
		const r = await runSundayLeave();
		expect(calls).toEqual([["create", "Leave Adjustment", "HR-LAL-1", 2, ""]]);
		expect(r.given).toMatchObject([{ days: 2, sundays: ["2026-09-20", "2026-09-27"] }]);
	});

	it("a_later_allocation_does_not_take_sundays_before_its_own_start", async () => {
		site.allocations = [
			{ name: "HR-LAL-0", employee: "E-OFFICE", from_date: "2026-09-01", to_date: "2026-09-30", leave_policy_assignment: "LPA-0" },
			ALLOC,
		];
		holidayDates = ["2026-09-20", "2026-10-04", "2026-10-11", "2026-10-18"];
		site.punches = [{ time: "2026-09-20 08:00:00" }, { time: "2026-09-20 13:00:00" }];
		await runSundayLeave();
		const [, ors] = asked.filter(([label]) => label === "Employee Checkin").pop();
		expect(ors.map((o) => o[2][0].slice(0, 10))).toEqual(["2026-10-04", "2026-10-11", "2026-10-18"]);
	});

	it("reads_only_the_sundays_on_the_holiday_list_in_one_request", async () => {
		await runSundayLeave();
		const [, ors] = asked.find(([label]) => label === "Employee Checkin");
		expect(ors.map((o) => o[2][0].slice(0, 10))).toEqual(["2026-09-06", "2026-09-13", "2026-10-04", "2026-10-11", "2026-10-18"]);
	});

	it("the_list_comes_from_the_holiday_list_assignment_never_the_company_default", async () => {
		await runSundayLeave();
		expect(asked.some(([label]) => label === "Holiday List Assignment")).toBe(true);
	});

	it("a_second_sunday_cancels_the_old_adjustment_and_amends_it_with_the_total", async () => {
		site.punches = [
			{ time: "2026-10-04 09:22:00" }, { time: "2026-10-04 17:15:00" },
			{ time: "2026-10-11 08:01:00" }, { time: "2026-10-11 13:14:00" },
		];
		site.adjustments = [{ name: "LAD-1", leaves_to_adjust: 1, reason_for_adjustment: reason(["2026-10-04"]) }];
		await runSundayLeave();
		expect(calls).toEqual([
			["cancel", "Leave Adjustment", "LAD-1"],
			["create", "Leave Adjustment", "HR-LAL-1", 2, "LAD-1"],
		]);
	});

	it("nothing_is_written_when_the_adjustment_already_says_so", async () => {
		site.punches = [{ time: "2026-10-04 09:22:00" }, { time: "2026-10-04 17:15:00" }];
		site.adjustments = [{ name: "LAD-1", leaves_to_adjust: 1, reason_for_adjustment: reason(["2026-10-04"]) }];
		await runSundayLeave();
		expect(calls).toEqual([]);
	});

	it("nobody_outside_the_office_earns_it", async () => {
		set({ employees: [{ ...SAJI, designation: "WELDER" }] });
		site.punches = [{ time: "2026-10-04 09:22:00" }, { time: "2026-10-04 17:15:00" }];
		await runSundayLeave();
		expect(calls).toEqual([]);
	});

	it("an_adjustment_hr_made_is_left_alone_and_said", async () => {
		site.punches = [{ time: "2026-10-04 09:22:00" }, { time: "2026-10-04 17:15:00" }];
		site.adjustments = [{ name: "LAD-HR", leaves_to_adjust: 3, reason_for_adjustment: "Opening balance" }];
		const r = await runSundayLeave();
		expect(calls).toEqual([]);
		expect(r.refused[0].error).toContain("LAD-HR");
	});
});
