import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoRuns, exclusive, leaveRulesFor, settleFirstAbsence } from "@/api/leaverules";
import { getState, resetStore, set } from "@/store";
import { AUTO_LEAVE_RULES } from "@/lib/absencerule";

const ran = { rule: [], loads: [], result: null };

vi.mock("@/api/absencerule", () => ({
	runAbsenceRule: (opts) => { ran.rule.push(opts); return Promise.resolve(ran.result); },
}));
vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	loadLeaveFor: (emp, ym) => { ran.loads.push([emp, ym]); return Promise.resolve(); },
}));

/* ---------------------------------------------------------------------------
   HR's automatic leave rules, as the dashboard starts them (api/leaverules.js).
   The review of 3 October 2026 found the dev server writing to live leave on
   every save, and every refusal thrown away unseen; these pin both fixes.
   --------------------------------------------------------------------------- */

describe("when the dashboard runs the leave rules by itself", () => {
	it("they_do_not_run_at_all_while_hr_has_them_switched_off_whatever_the_build", async () => {
		expect(AUTO_LEAVE_RULES).toBe(false);
		expect(autoRuns({ DEV: false })).toBe(false);
		expect(autoRuns({ DEV: true, VITE_LEAVE_RULES: "on" })).toBe(false);
		ran.rule = [];
		expect(await settleFirstAbsence("E1", "2026-10", { DEV: false })).toBe(null);
		expect(ran.rule).toEqual([]);
	});

	it("switched_on_a_production_build_runs_them", () => {
		expect(autoRuns({ DEV: false }, true)).toBe(true);
	});

	it("switched_on_the_dev_server_does_not_write_to_live_leave_unless_asked", () => {
		expect(autoRuns({ DEV: true }, true)).toBe(false);
		expect(autoRuns({ DEV: true, VITE_LEAVE_RULES: "on" }, true)).toBe(true);
	});

	it("without_web_locks_a_run_still_happens", async () => {
		expect(await exclusive(() => Promise.resolve(42))).toBe(42);
	});
});

describe("what Apply Leave says about the last run", () => {
	const state = {
		leaveRules: {
			absence: {
				waiting: [{ employee: "E1", day: "2026-10-09", error: "no Casual Leave to give on that day" }],
				refused: [{ employee: "E2", day: "2026-10-01", error: "Leave Approver is mandatory" }],
			},
			sunday: { refused: [{ employee: "E1", error: "LAD-HR already adjusts this allocation, and hrms allows one." }] },
		},
	};

	it("a_person_sees_only_their_own_notes_and_both_rules", () => {
		expect(leaveRulesFor(state, "E1").map((n) => n.rule)).toEqual(["absence", "sunday"]);
		expect(leaveRulesFor(state, "E2")).toMatchObject([{ day: "2026-10-01", rule: "absence" }]);
	});

	it("nothing_is_said_before_a_run_or_for_nobody", () => {
		expect(leaveRulesFor({ leaveRules: null }, "E1")).toEqual([]);
		expect(leaveRulesFor(state, "")).toEqual([]);
	});
});

describe("switched on, Apply Leave turning a first absence into Casual Leave as it opens (6 October 2026)", () => {
	const PROD = { DEV: false };
	beforeEach(() => {
		ran.rule = []; ran.loads = [];
		ran.result = { given: [], returned: [], refused: [], waiting: [] };
		resetStore();
	});

	it("runs_the_absence_rule_for_that_person_and_month_only_and_reads_them_again_when_it_gave_leave", async () => {
		ran.result.given = [{ employee: "E1", day: "2026-10-03", name: "LA-1" }];
		await settleFirstAbsence("E1", "2026-10", PROD, true);
		expect(ran.rule).toEqual([{ only: "E1", ym: "2026-10" }]);
		expect(ran.loads).toEqual([["E1", "2026-10"]]);
	});

	it("never_treats_the_day_as_regularized_which_would_keep_it_out_of_the_leave", async () => {
		await settleFirstAbsence("E1", "2026-10", PROD, true);
		expect(ran.rule[0]).not.toHaveProperty("day");
	});

	it("says_why_the_day_is_still_A_and_keeps_what_the_last_run_said_about_everybody_else", async () => {
		set({ leaveRules: { at: "x", absence: { given: [], returned: [], refused: [],
			waiting: [{ employee: "E2", day: "2026-10-01", error: "no Casual Leave to give on that day" }] } } });
		ran.result.waiting = [{ employee: "E1", day: "2026-10-03", error: "no Casual Leave to give on that day" }];
		await settleFirstAbsence("E1", "2026-10", PROD, true);
		expect(leaveRulesFor(getState(), "E1")).toMatchObject([{ day: "2026-10-03", rule: "absence" }]);
		expect(leaveRulesFor(getState(), "E2")).toMatchObject([{ day: "2026-10-01" }]);
		expect(ran.loads).toEqual([]);
	});

	it("the_dev_server_does_not_write_leave_from_the_page_either", async () => {
		expect(await settleFirstAbsence("E1", "2026-10", { DEV: true }, true)).toBe(null);
		expect(ran.rule).toEqual([]);
	});
});
