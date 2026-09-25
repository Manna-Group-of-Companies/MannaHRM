import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import { store, set, resetStore } from "@/store";
import { leavePlans } from "@/lib/monthlyleave";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employee Profile → Leave: what somebody was given, and what they have left.

   The reads are put in the store rather than fetched — the pane skips its read
   when `profLeave` already belongs to this person — so what is under test is
   the drawing and the arithmetic, not the network.
   --------------------------------------------------------------------------- */

const EMP = "HR-EMP-00001";
const DOC = { name: EMP, employee_name: "Anand Raghavan", status: "Active", doctype: "Employee" };

const POLICIES = {
	"HR-LPOL-0001": {
		title: "Manna Casual Leave — 1 a month",
		leave_policy_details: [{ leave_type: "Casual Leave", annual_allocation: 12 }],
	},
	"HR-LPOL-0002": {
		title: "Manna Sick Leave — 2 a month",
		leave_policy_details: [{ leave_type: "Sick Leave", annual_allocation: 24 }],
	},
	"HR-LPOL-0003": {
		title: "Privilege, yearly",
		leave_policy_details: [{ leave_type: "Privilege Leave", annual_allocation: 15 }],
	},
};
const TYPES = [
	{ name: "Casual Leave", is_earned_leave: 1, earned_leave_frequency: "Monthly" },
	{ name: "Privilege Leave", is_earned_leave: 0, earned_leave_frequency: "" },
];
const ASSIGN = [
	{ name: "LPA-1", leave_policy: "HR-LPOL-0001", effective_from: "2025-01-01", effective_to: "2025-12-31" },
	{ name: "LPA-2", leave_policy: "HR-LPOL-0001", effective_from: "2026-09-01", effective_to: "2026-12-31" },
];

describe("leavePlans — what one person was given", () => {
	it("one_a_month_is_twelve_a_year_and_newest_comes_first", () => {
		const rows = leavePlans(ASSIGN, POLICIES, TYPES, "2026-09-24");
		expect(rows.map((r) => r.assignment)).toEqual(["LPA-2", "LPA-1"]);
		expect(rows[0]).toMatchObject({ type: "Casual Leave", perMonth: 1, annual: 12, current: true });
		expect(rows[1].current).toBe(false);
	});

	it("a_type_not_earned_monthly_has_no_monthly_number", () => {
		const a = [{ name: "LPA-3", leave_policy: "HR-LPOL-0003", effective_from: "2026-01-01", effective_to: "2026-12-31" }];
		expect(leavePlans(a, POLICIES, TYPES, "2026-09-24")[0]).toMatchObject({ annual: 15, perMonth: null });
	});

	it("a_type_the_read_did_not_describe_is_judged_by_the_policy_title", () => {
		const a = [{ name: "LPA-4", leave_policy: "HR-LPOL-0002", effective_from: "2026-09-01", effective_to: "2026-12-31" }];
		expect(leavePlans(a, POLICIES, [], "2026-09-24")[0]).toMatchObject({ type: "Sick Leave", perMonth: 2 });
	});

	it("a_policy_that_could_not_be_read_still_shows_the_assignment", () => {
		const a = [{ name: "LPA-5", leave_policy: "HR-LPOL-9", effective_from: "2026-09-01", effective_to: "2026-12-31" }];
		expect(leavePlans(a, {}, TYPES, "2026-09-24")[0]).toMatchObject({ policy: "HR-LPOL-9", type: null });
	});
});

const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);

describe("the Leave pane", () => {
	beforeEach(() => {
		resetStore();
		set(loadedState());
		set({ empSel: EMP, empDoc: { [EMP]: DOC }, proftab: "leave", leaveTypes: TYPES });
	});

	it("shows_the_leave_type_and_how_many_a_month", () => {
		act(() => {
			set({ profLeave: { emp: EMP, busy: false, assignments: ASSIGN, policies: POLICIES, balance: [
				{ type: "Casual Leave", total: 1, taken: 0, pending: 0, remaining: 1 },
			] } });
		});
		const t = draw().container.textContent;
		expect(t).toContain("Leave given");
		expect(t).toContain("Casual Leave");
		expect(t).toContain("Manna Casual Leave — 1 a month");
		expect(t).toContain("Balance today");
	});

	it("says_in_words_when_nothing_was_given", () => {
		act(() => {
			set({ profLeave: { emp: EMP, busy: false, assignments: [], policies: {}, balance: [] } });
		});
		const t = draw().container.textContent;
		expect(t).toContain("No leave has been given to this person");
		expect(t).toContain("Nothing to take yet");
	});

	it("a_refused_read_is_shown_in_the_sites_words", () => {
		act(() => {
			set({ profLeave: { emp: EMP, busy: false, assignments: [], policies: {}, planErr: "Not permitted", balance: [] } });
		});
		expect(draw().container.textContent).toContain("Not permitted");
	});
});
