import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MONTHLY_LEAVE } from "@/data/leave";

/* The calendar marks the day the monthly leave arrives off a copy of the rule.
   The site's policy is manna_hr/leavepolicy.py; if the two drift, the calendar
   promises a leave on the 1st that the site never gives. */
const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/leavepolicy.py"), "utf8");

describe("the monthly leave the calendar draws", () => {
	it("is_the_same_leave_type_the_site_policy_grants", () => {
		expect(py).toContain(`LEAVE_TYPE_NAME = "${MONTHLY_LEAVE.type}"`);
	});

	it("is_the_same_number_a_year_so_the_same_one_a_month", () => {
		expect(py).toContain(`ANNUAL_ALLOCATION = ${MONTHLY_LEAVE.annual}`);
		expect(py).toContain('"earned_leave_frequency": "Monthly"');
	});
});

import {
	LEAVE_TYPE, POLICY_TITLE, assignmentFor, earnFrom, typeDiffers,
} from "@/lib/monthlyleave";

/** `"key": value,` out of the Python LEAVE_TYPE dict, comments ignored. */
function pyLeaveType() {
	const body = py.slice(py.indexOf("LEAVE_TYPE = {"), py.indexOf("}", py.indexOf("LEAVE_TYPE = {")));
	const out = {};
	for (const m of body.matchAll(/^\s*"(\w+)":\s*(.+?),\s*$/gm)) {
		const v = m[2].trim();
		out[m[1]] = v === "LEAVE_TYPE_NAME" ? "Casual Leave" : v.startsWith('"') ? v.slice(1, -1) : Number(v);
	}
	return out;
}

describe("the button gives the same leave the tool does", () => {
	it("every_leave_type_field_matches_leavepolicy_py", () => {
		expect(LEAVE_TYPE).toEqual(pyLeaveType());
	});

	it("the_policy_title_matches_so_the_button_and_the_tool_find_the_same_policy", () => {
		expect(py).toContain(`POLICY_TITLE = "${POLICY_TITLE}"`);
	});

	it("a_mid_year_assignment_starts_this_month_not_january", () => {
		expect(earnFrom("2026-09-24", "2019-08-01")).toBe("2026-09-01");
	});

	it("somebody_who_joins_later_starts_the_month_they_join", () => {
		expect(earnFrom("2026-09-24", "2026-11-15")).toBe("2026-11-01");
	});

	it("an_assignment_made_on_new_years_day_carries_last_years_balance", () => {
		const a = assignmentFor({ name: "E1", date_of_joining: "2019-01-01" }, "POL", "2027-01-01");
		expect(a).toMatchObject({ effective_from: "2027-01-01", effective_to: "2027-12-31", carry_forward: 1 });
	});

	it("a_mid_year_assignment_has_nothing_to_carry", () => {
		const a = assignmentFor({ name: "E1" }, "POL", "2026-09-24");
		expect(a).toMatchObject({ effective_from: "2026-09-01", effective_to: "2026-12-31", carry_forward: 0 });
	});

	it("a_site_type_that_already_matches_needs_nothing_written", () => {
		expect(typeDiffers({ ...LEAVE_TYPE, max_leaves_allowed: null })).toEqual({});
	});
});

import { monthCarry } from "@/lib/monthlyleave";

describe("monthCarry — the carry off the site's ledger", () => {
	const L = [
		{ leaves: 1, from_date: "2026-07-01", transaction_type: "Leave Allocation" },
		{ leaves: 1, from_date: "2026-08-01", transaction_type: "Leave Allocation" },
		{ leaves: -0.5, from_date: "2026-08-20", transaction_type: "Leave Application" },
	];

	it("nothing_on_the_ledger_is_null_not_a_row_of_zeros", () => {
		expect(monthCarry([], "2026-08")).toBeNull();
	});

	it("an_unused_month_carries_its_leave_into_the_next", () => {
		expect(monthCarry(L, "2026-07")).toMatchObject({ brought: 0, earned: 1, taken: 0, carried: 1 });
		expect(monthCarry(L, "2026-08").brought).toBe(1);
	});

	it("a_half_day_taken_leaves_half_to_carry", () => {
		expect(monthCarry(L, "2026-08")).toMatchObject({ brought: 1, earned: 1, taken: 0.5, carried: 1.5 });
	});

	it("an_expiry_at_the_year_end_is_counted_not_hidden", () => {
		const y = [...L, { leaves: -1.5, from_date: "2026-12-31", transaction_type: "Leave Allocation" }];
		expect(monthCarry(y, "2026-12")).toMatchObject({ other: -1.5, carried: 0 });
	});
});

import { leavePolicy, perMonthProblem, policyTitle } from "@/lib/monthlyleave";
import { employeeDoc, leaveProblems, problemsOf } from "@/lib/newemp";

describe("leaves a month, asked when an employee is added", () => {
	it("one_a_month_finds_the_policy_already_on_the_site", () => {
		expect(policyTitle(1)).toBe(POLICY_TITLE);
		expect(policyTitle("1")).toBe(POLICY_TITLE);
	});

	it("the_title_is_built_the_way_leavepolicy_py_builds_it", () => {
		expect(py).toContain('"Manna {0} — {1} a month"');
		expect(policyTitle(1.5)).toBe("Manna Casual Leave — 1.5 a month");
	});

	it("two_a_month_is_twenty_four_a_year", () => {
		expect(leavePolicy(2).leave_policy_details[0].annual_allocation).toBe(24);
	});

	it("the_ceiling_matches_leavepolicy_py", () => {
		expect(py).toContain("MAX_PER_MONTH = 5");
		expect(perMonthProblem(5)).toBeNull();
		expect(perMonthProblem(6)).toMatch(/72 a year/);
	});

	it("zero_is_an_answer_and_a_quarter_day_is_not", () => {
		expect(perMonthProblem(0)).toBeNull();
		expect(perMonthProblem("1.25")).toMatch(/half days/);
		expect(perMonthProblem(-1)).toMatch(/negative/);
	});

	it("the_answer_is_never_sent_to_employee_which_has_no_field_for_it", () => {
		expect(employeeDoc({ first_name: "A", leaves_a_month: "2" })).toEqual({ first_name: "A" });
	});

	it("an_empty_answer_is_a_gap_not_a_mistake", () => {
		expect(leaveProblems({})).toEqual([]);
		expect(problemsOf({}, []).gaps).toContain("Leaves A Month");
	});

	it("a_wrong_answer_stops_create", () => {
		expect(problemsOf({ leaves_a_month: "12" }, []).bad.join(" ")).toMatch(/check the number/);
	});
});

import { isMonthly, notMonthly } from "@/lib/monthlyleave";
import { NEW_EMP_BLANK, isBlank } from "@/lib/newemp";

describe("the leave type asked beside leaves a month", () => {
	const SICK_YEARLY = { name: "Sick Leave", is_earned_leave: 0, earned_leave_frequency: "" };
	const SICK_MONTHLY = { name: "Sick Leave", is_earned_leave: 1, earned_leave_frequency: "Monthly" };

	it("a_new_form_starts_on_casual_leave_and_still_counts_as_untouched", () => {
		expect(NEW_EMP_BLANK().f.leave_type).toBe("Casual Leave");
		expect(isBlank(NEW_EMP_BLANK().f)).toBe(true);
	});

	it("the_type_is_never_sent_to_employee_either", () => {
		expect(employeeDoc({ first_name: "A", leave_type: "Sick Leave" })).toEqual({ first_name: "A" });
	});

	it("each_type_and_rate_has_its_own_policy", () => {
		expect(policyTitle(1, "Sick Leave")).toBe("Manna Sick Leave — 1 a month");
		expect(leavePolicy(2, "Sick Leave").leave_policy_details[0]).toEqual({ leave_type: "Sick Leave", annual_allocation: 24 });
	});

	it("casual_leave_can_always_be_given_by_the_month_because_giving_it_makes_it_monthly", () => {
		expect(notMonthly("Casual Leave", [{ name: "Casual Leave", is_earned_leave: 0 }])).toBeNull();
	});

	it("a_type_the_site_does_not_earn_monthly_stops_create", () => {
		expect(notMonthly("Sick Leave", [SICK_YEARLY])).toMatch(/not earned monthly/);
		expect(problemsOf({ leave_type: "Sick Leave", leaves_a_month: "1" }, [], [SICK_YEARLY]).bad.join(" "))
			.toMatch(/not earned monthly/);
	});

	it("a_type_the_site_earns_monthly_goes_through", () => {
		expect(isMonthly(SICK_MONTHLY)).toBe(true);
		expect(leaveProblems({ leave_type: "Sick Leave", leaves_a_month: "1" }, [SICK_MONTHLY])).toEqual([]);
	});

	it("zero_of_a_type_that_is_not_monthly_writes_nothing_so_is_not_a_problem", () => {
		expect(leaveProblems({ leave_type: "Sick Leave", leaves_a_month: "0" }, [SICK_YEARLY])).toEqual([]);
	});

	it("a_type_whose_row_did_not_say_is_left_to_the_write_to_check", () => {
		expect(notMonthly("Sick Leave", [{ name: "Sick Leave" }])).toBeNull();
	});
});
