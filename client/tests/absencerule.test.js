import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
	AUTO_LEAVE_RULES, AUTO_MARK, DESCRIPTION, EFFECTIVE_FROM, GROUPS, REG_PREFIX, appliesTo, application, approverFor, isAuto, monthsToCheck,
	plan,
} from "@/lib/absencerule";

/* ---------------------------------------------------------------------------
   The office absence rule (HR, 3 October 2026): the month's first absence is
   Casual Leave, the second is a salary cut, and a regularized day gives its
   leave back to the next absence. lib/absencerule.js is a copy of
   manna_hr/absencerule.py — the site's hourly job once installed — so the two
   are pinned here, and the plan is tested on the same cases as the Python.
   --------------------------------------------------------------------------- */

const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/absencerule.py"), "utf8");
/** The Python's adjacent string literals, joined the way Python joins them. */
const pyJoined = py.replace(/"\s*\n\s*"/g, "");

describe("the dashboard applies the same rule the site does", () => {
	it("the_mark_that_lets_the_rule_cancel_its_own_leave_is_spelled_the_same", () => {
		expect(py).toContain(`AUTO_MARK = "${AUTO_MARK}"`);
		expect(pyJoined).toContain(DESCRIPTION.slice(AUTO_MARK.length));
	});

	it("is_switched_on_or_off_the_same_on_the_dashboard_and_the_site", () => {
		expect(py).toContain(`AUTO_LEAVE_RULES = ${AUTO_LEAVE_RULES ? "True" : "False"}`);
	});

	it("starts_on_the_same_day_and_covers_the_same_groups", () => {
		const [y, m, d] = EFFECTIVE_FROM.split("-").map(Number);
		expect(py).toContain(`EFFECTIVE_FROM = date(${y}, ${m}, ${d})`);
		/* The Python takes leavepolicy's groups whole; this copy spells them. */
		expect(py).toContain("GROUPS = lp.CASUAL_LEAVE_GROUPS");
		const policy = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/leavepolicy.py"), "utf8");
		expect(policy).toContain(`CASUAL_LEAVE_GROUPS = (${GROUPS.map((g) => `"${g}"`).join(", ")})`);
		expect(py).toContain(`REG_PREFIX = "${REG_PREFIX}"`);
	});

	it("a_correction_punch_carries_the_prefix_the_rule_looks_for", async () => {
		const { regDevice } = await import("@/features/approvals/decide");
		expect(regDevice("hr@manna").startsWith(REG_PREFIX)).toBe(true);
	});
});

describe("one person's month", () => {
	const A = (name, day) => ({ name, day });

	it("the_first_absence_of_the_month_becomes_casual_leave", () => {
		expect(plan(["2026-10-12", "2026-10-05"], [])).toEqual({ cancel: [], give: "2026-10-05" });
	});

	it("a_second_absence_stays_absent_once_the_month_has_its_leave", () => {
		expect(plan(["2026-10-12"], [A("LA-1", "2026-10-05")])).toEqual({ cancel: [], give: null });
	});

	it("a_regularized_day_gives_its_leave_back_and_the_next_absence_takes_it", () => {
		expect(plan(["2026-10-12", "2026-10-20"], [A("LA-1", "2026-10-05")], ["2026-10-05"]))
			.toEqual({ cancel: ["LA-1"], give: "2026-10-12" });
	});

	it("a_day_already_regularized_never_takes_the_leave", () => {
		expect(plan(["2026-10-05", "2026-10-12"], [], ["2026-10-05"])).toEqual({ cancel: [], give: "2026-10-12" });
	});

	it("a_day_under_leave_somebody_asked_for_is_not_the_first_absence", () => {
		expect(plan(["2026-10-05", "2026-10-12"], [], [], ["2026-10-05"])).toEqual({ cancel: [], give: "2026-10-12" });
	});

	it("the_month_keeps_the_day_it_gave_even_if_an_earlier_one_turns_absent", () => {
		expect(plan(["2026-10-03"], [A("LA-1", "2026-10-12")])).toEqual({ cancel: [], give: null });
	});

	it("a_second_automatic_leave_in_one_month_is_undone", () => {
		expect(plan([], [A("LA-2", "2026-10-12"), A("LA-1", "2026-10-05")])).toEqual({ cancel: ["LA-2"], give: null });
	});

	it("everybody_who_earns_casual_leave_is_covered_and_the_factory_floor_is_not", () => {
		expect(appliesTo("ACCOUNTANT")).toBe(true);
		expect(appliesTo("SHIFT SUPERVISOR")).toBe(true);
		expect(appliesTo("Quality/production Supervisor")).toBe(true);
		expect(appliesTo("DRIVER")).toBe(true);
		expect(appliesTo("WELDER")).toBe(false);
	});

	it("the_approver_is_the_persons_own_then_their_managers_then_whoever_runs_the_rule", () => {
		expect(approverFor("own@m", "mgr@m", "hr@m")).toBe("own@m");
		expect(approverFor("", "mgr@m", "hr@m")).toBe("mgr@m");
		expect(approverFor("", "", "hr@m")).toBe("hr@m");
		expect(application("E1", "2026-10-05", "", "", "hr@m").leave_approver).toBe("hr@m");
	});

	it("only_applications_carrying_the_mark_are_the_rules_to_cancel", () => {
		expect(isAuto(DESCRIPTION)).toBe(true);
		expect(isAuto("Sick, " + AUTO_MARK)).toBe(false);
		expect(isAuto(undefined)).toBe(false);
	});

	it("the_application_is_one_approved_day_of_casual_leave", () => {
		expect(application("E1", "2026-10-05", "Manna Rubber", "2026-10-06")).toMatchObject({
			employee: "E1", leave_type: "Casual Leave", from_date: "2026-10-05", to_date: "2026-10-05",
			status: "Approved", half_day: 0, posting_date: "2026-10-06", company: "Manna Rubber",
		});
	});

	it("a_run_looks_at_this_month_and_last_but_never_before_the_rule_began", () => {
		expect(monthsToCheck("2026-10-03")).toEqual([["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-03"]]);
		expect(monthsToCheck("2026-11-02")).toEqual([["2026-10-01", "2026-10-31"], ["2026-11-01", "2026-11-02"]]);
		expect(monthsToCheck("2027-01-01")[0]).toEqual(["2026-12-01", "2026-12-31"]);
		expect(monthsToCheck("2026-09-15")).toEqual([["2026-09-01", "2026-09-15"]]);
		expect(monthsToCheck("2026-08-31")).toEqual([]);
	});

	it("september_is_covered_since_hr_asked_on_6_october_and_august_is_not", () => {
		expect(EFFECTIVE_FROM).toBe("2026-09-01");
	});
});

/* --------------------------------------------------------------- the writes */

const site = { attendance: [], leave: [], punches: [] };

/* The date bounds of a read, as the site applies them: a run reads this month
   and last, and a site that ignored the bounds would hand October's absences
   to the September pass as well. */
const within = (rows, filters = []) => rows.filter((r) => filters.every(([f, op, v]) => {
	if (!(f in r) || (op !== ">=" && op !== "<=")) return true;
	const have = String(r[f]).slice(0, String(v).length);
	return op === ">=" ? have >= v : have <= v;
}));
const calls = [];
const approvers = [];
let refuse = "";
let balance = 1;
let cancelRefused = false;
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	api: (path) => Promise.resolve(path.includes("get_leave_balance_on")
		? { message: { leave_balance: balance, leave_balance_for_consumption: balance } } : {}),
	listAll: (label, fields, filters) => Promise.resolve(within(
		label === "Attendance" ? site.attendance
			: label === "Leave Application" ? site.leave
				: label === "Employee Checkin" ? site.punches : [], filters)),
	getDoc: (label, name) => Promise.resolve(
		name === "E-OFFICE" ? { name, leave_approver: "", reports_to: "E-BOSS" }
			: name === "E-BOSS" ? { name, user_id: "boss@manna" } : null),
	apiCreate: (label, doc) => {
		calls.push(["punch", label, doc.log_type, doc.time]);
		return Promise.resolve({ name: "CHK-NEW" });
	},
	apiWrite: () => Promise.resolve({ ok: true }),
	apiCreateSubmitted: (label, doc) => {
		approvers.push(doc.leave_approver);
		calls.push(["give", label, doc.employee, doc.from_date]);
		const why = typeof refuse === "function" ? refuse(doc) : refuse;
		return why ? Promise.reject(new Error(why)) : Promise.resolve({ name: "LA-NEW" });
	},
}));
vi.mock("@/api/crud", async (importOriginal) => ({
	...(await importOriginal()),
	cancel: (label, name) => {
		calls.push(["cancel", label, name]);
		return Promise.resolve(cancelRefused ? { ok: false, error: "TimestampMismatchError" } : { ok: true });
	},
}));

const { set } = await import("@/store");
const { afterCorrection, giveBack, runAbsenceRule } = await import("@/api/absencerule");
const { leaveSummary, writeCorrection } = await import("@/features/approvals/decide");

const ANU = { name: "E-OFFICE", employee_name: "ANU", designation: "ACCOUNTANT", status: "Active", company: "Manna Rubber", reports_to: "E-BOSS" };
const RAJU = { name: "E-FLOOR", employee_name: "RAJU", designation: "WELDER", status: "Active", company: "Manna Rubber" };

describe("the rule runs by itself against the site", () => {
	beforeEach(() => {
		calls.length = 0;
		approvers.length = 0;
		refuse = "";
		balance = 1;
		cancelRefused = false;
		site.attendance = [];
		site.leave = [];
		site.punches = [];
		set({ employees: [ANU, RAJU] });
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-20T10:00:00"));
	});

	it("an_office_employees_first_absence_is_submitted_as_approved_casual_leave", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-07" }, { employee: "E-OFFICE", attendance_date: "2026-10-14" }];
		const r = await runAbsenceRule();
		expect(calls).toEqual([["give", "Leave Application", "E-OFFICE", "2026-10-07"]]);
		expect(r.given).toMatchObject([{ employee: "E-OFFICE", day: "2026-10-07" }]);
	});

	it("one_persons_month_run_from_apply_leave_gives_the_first_absence_and_touches_nobody_else", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-07" }, { employee: "E-OFFICE", attendance_date: "2026-10-14" }];
		const r = await runAbsenceRule({ only: "E-OFFICE", ym: "2026-10" });
		expect(calls).toEqual([["give", "Leave Application", "E-OFFICE", "2026-10-07"]]);
		expect(r.given).toMatchObject([{ employee: "E-OFFICE", day: "2026-10-07" }]);
	});

	it("the_leave_names_the_managers_login_as_approver_because_the_site_refuses_one_without", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-07" }];
		await runAbsenceRule();
		expect(approvers).toEqual(["boss@manna"]);
	});

	it("nobody_on_the_factory_floor_is_given_leave_for_an_absence", async () => {
		site.attendance = [{ employee: "E-FLOOR", attendance_date: "2026-10-07" }];
		await runAbsenceRule();
		expect(calls).toEqual([]);
	});

	/* Switched off by HR on 14 October 2026 (AUTO_LEAVE_RULES). Before that, the
	   next absence took the leave a regularized day gave back. */
	it("switched_off_a_regularized_day_still_gives_its_old_leave_back_but_no_absence_takes_new_leave", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-14" }];
		site.leave = [{ name: "LA-1", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: DESCRIPTION, docstatus: 1 }];
		const back = await giveBack("E-OFFICE", "2026-10-07");
		expect(back.ok).toBe(true);
		const r = await afterCorrection("E-OFFICE", "2026-10-07");
		expect(r).toBeNull();
		expect(calls).toEqual([["cancel", "Leave Application", "LA-1"]]);
		expect(leaveSummary(r)).toBe("");
	});

	it("leave_somebody_asked_for_is_never_cancelled", async () => {
		site.leave = [{ name: "LA-OWN", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: "Fever", docstatus: 1 }];
		await afterCorrection("E-OFFICE", "2026-10-07");
		expect(calls).toEqual([]);
	});

	it("nobody_with_no_casual_leave_left_is_sent_a_write_the_site_would_refuse", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-09" }];
		balance = 0;
		const r = await runAbsenceRule();
		expect(calls).toEqual([]);
		expect(r.waiting).toMatchObject([{ employee: "E-OFFICE", day: "2026-10-09" }]);
	});

	it("leave_given_after_a_refusal_reaches_the_absence_on_the_next_run_without_a_reload", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-09" }];
		balance = 0;
		await runAbsenceRule();
		balance = 1; // Give monthly leave pressed in the same tab
		const r = await runAbsenceRule();
		expect(r.given).toMatchObject([{ day: "2026-10-09" }]);
	});

	it("a_day_hrms_will_not_take_passes_the_leave_to_the_next_absence", async () => {
		site.attendance = [
			{ employee: "E-OFFICE", attendance_date: "2026-10-13" },
			{ employee: "E-OFFICE", attendance_date: "2026-10-20" },
		];
		refuse = (doc) => (doc.from_date === "2026-10-13" ? "The day(s) on which you are applying for leave are holidays." : "");
		const r = await runAbsenceRule();
		expect(calls.map((c) => c[3])).toEqual(["2026-10-13", "2026-10-20"]);
		expect(r.given).toMatchObject([{ day: "2026-10-20" }]);
	});

	it("a_balance_refusal_does_not_try_the_rest_of_the_month", async () => {
		site.attendance = [
			{ employee: "E-OFFICE", attendance_date: "2026-10-20" },
			{ employee: "E-OFFICE", attendance_date: "2026-10-27" },
		];
		refuse = "Insufficient leave balance for Leave Type Casual Leave";
		await runAbsenceRule();
		expect(calls.map((c) => c[3])).toEqual(["2026-10-20"]);
	});

	it("a_leave_that_could_not_be_given_back_stops_the_next_absence_taking_one_too", async () => {
		site.attendance = [{ employee: "E-OFFICE", attendance_date: "2026-10-14" }];
		site.leave = [{ name: "LA-1", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: DESCRIPTION, docstatus: 1 }];
		site.punches = [{ employee: "E-OFFICE", time: "2026-10-07 09:00:00" }];
		cancelRefused = true;
		const r = await runAbsenceRule();
		expect(calls).toEqual([["cancel", "Leave Application", "LA-1"]]);
		expect(r.given).toEqual([]);
	});

	it("a_correction_gives_the_days_leave_back_before_any_punch_is_written", async () => {
		site.leave = [{ name: "LA-1", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: DESCRIPTION, docstatus: 1 }];
		expect(await giveBack("E-OFFICE", "2026-10-07")).toMatchObject({ ok: true, returned: [{ name: "LA-1" }] });
		cancelRefused = true;
		expect((await giveBack("E-OFFICE", "2026-10-07")).ok).toBe(false);
	});

	it("saving_a_correction_gives_the_leave_back_before_the_punch_is_written", async () => {
		site.leave = [{ name: "LA-1", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: DESCRIPTION, docstatus: 1 }];
		const w = await writeCorrection({ employee: "E-OFFICE", attendance_date: "2026-10-07", requested_in: "09:00" }, "hr@manna");
		expect(w.ok).toBe(true);
		expect(calls.slice(0, 2)).toEqual([
			["cancel", "Leave Application", "LA-1"],
			["punch", "Employee Checkin", "IN", "2026-10-07 09:00:00"],
		]);
		expect(leaveSummary(w.leave)).toContain("07-Oct-2026 is given back");
	});

	it("a_leave_that_cannot_be_given_back_stops_the_correction_with_nothing_written", async () => {
		site.leave = [{ name: "LA-1", employee: "E-OFFICE", from_date: "2026-10-07", to_date: "2026-10-07", description: DESCRIPTION, docstatus: 1 }];
		cancelRefused = true;
		const w = await writeCorrection({ employee: "E-OFFICE", attendance_date: "2026-10-07", requested_in: "09:00" }, "hr@manna");
		expect(w.ok).toBe(false);
		expect(w.error).toContain("No punch was written");
		expect(calls.filter((c) => c[0] === "punch")).toEqual([]);
	});

	it("a_correction_for_somebody_the_rule_does_not_cover_does_nothing", async () => {
		expect(await afterCorrection("E-FLOOR", "2026-10-07")).toBe(null);
		expect(calls).toEqual([]);
	});
});
