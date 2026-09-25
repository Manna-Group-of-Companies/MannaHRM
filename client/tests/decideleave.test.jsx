import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Approvals from "@/features/approvals/Approvals";
import { decideLeave, leaveSpan } from "@/features/approvals/decideLeave";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Dashboard → Approvals → Leave: the tick and the cross (25 Sep 2026).

   Deciding leave is a submit in hrms, and hrms's controller is what checks the
   balance, the overlaps and the approver. So what is worth pinning here is the
   boundary: the page sends the one status change and the submit, says what
   the site said when it refuses, and adds nothing of its own — no Attendance,
   no ledger, no second write when the first was refused.
   --------------------------------------------------------------------------- */

const calls = { decided: [], called: [] };
let decides;  // what apiDecide does, per test
let comments; // what add_comment does, per test

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiDecide: (...a) => {
			calls.decided.push(a);
			return decides(...a);
		},
		apiCall: (...a) => {
			calls.called.push(a);
			return comments(...a);
		},
	};
});

vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	load: () => Promise.resolve(),
}));

/** The application the dashboard refused to decide on 25 Sep 2026. */
const LAP = {
	name: "HR-LAP-2026-00001", employee: "HR-EMP-00002", employee_name: "Priya Menon",
	leave_type: "Casual Leave", from_date: "2026-09-29", to_date: "2026-09-30",
	total_leave_days: 2, leave_balance: 3, status: "Open", description: "Family function",
};

beforeEach(() => {
	calls.decided = [];
	calls.called = [];
	decides = () => Promise.resolve();
	comments = () => Promise.resolve();
	resetStore();
	set(loadedState());
	set({ user: "hr@example.invalid" });
});

describe("deciding a leave application", () => {
	it("submits_an_approval_as_Approved_on_the_site_and_says_what_it_booked", async () => {
		const res = await decideLeave(LAP, "Approve");
		expect(calls.decided).toEqual([["Leave Application", "HR-LAP-2026-00001", "Approved"]]);
		expect(res.ok).toBe(true);
		expect(res.msg).toContain("2 days of Casual Leave for Priya Menon, 29-Sep-2026 to 30-Sep-2026");
		expect(calls.called).toHaveLength(0);
	});

	it("submits_a_rejection_as_Rejected_and_books_nothing", async () => {
		const res = await decideLeave(LAP, "Reject");
		expect(calls.decided[0][2]).toBe("Rejected");
		expect(res.msg).toContain("No leave was booked");
	});

	it("puts_the_approvers_note_on_the_applications_comments_after_the_decision", async () => {
		const res = await decideLeave(LAP, "Reject", "  Peak week at the plant  ");
		const [method, body] = calls.called[0];
		expect(method).toBe("frappe.desk.form.utils.add_comment");
		expect(body).toMatchObject({ reference_doctype: "Leave Application", reference_name: LAP.name,
			content: "Peak week at the plant" });
		expect(res.msg).toContain("Your note is on its comments");
	});

	it("keeps_a_decision_that_landed_even_when_its_note_does_not", async () => {
		comments = () => Promise.reject(new Error("Not permitted"));
		const res = await decideLeave(LAP, "Approve", "ok");
		expect(res.ok).toBe(true);
		expect(res.msg).toContain("The note could not be added (Not permitted)");
	});

	it("shows_a_refusal_in_the_sites_own_words_and_writes_nothing_else", async () => {
		decides = () => Promise.reject(new Error("Insufficient leave balance for Leave Type Casual Leave"));
		const res = await decideLeave(LAP, "Approve", "a note");
		expect(res.ok).toBe(false);
		expect(res.msg).toContain("Insufficient leave balance for Leave Type Casual Leave");
		expect(calls.called).toHaveLength(0);
	});

	it("does_not_send_an_application_that_is_no_longer_open", async () => {
		const res = await decideLeave({ ...LAP, status: "Approved" }, "Approve");
		expect(res.ok).toBe(false);
		expect(calls.decided).toHaveLength(0);
	});

	it("reads_a_one_day_leave_as_one_date", () => {
		expect(leaveSpan({ from_date: "2026-09-29", to_date: "2026-09-29" })).toBe("29-Sep-2026");
	});
});

describe("the tick on a leave card", () => {
	const draw = () => {
		set({ section: "dashboard", apptab: "leave", approvals: { ...getState().approvals, leave: [LAP] } });
		return render(<Provider store={store}><Approvals /></Provider>);
	};
	const button = (view, text) => [...view.container.querySelectorAll('[role="dialog"] button')]
		.find((b) => b.textContent.includes(text));

	it("asks_first_saying_it_submits_the_leave_and_writes_nothing_yet", async () => {
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Approve"]').click(); });
		const dlg = view.container.querySelector('[role="dialog"]');
		expect(dlg.textContent).toContain("Approve HR-LAP-2026-00001");
		expect(dlg.textContent).toContain("29-Sep-2026 to 30-Sep-2026 · 2 days · Casual Leave");
		expect(dlg.textContent).toContain("Submits this application on the site as Approved");
		expect(calls.decided).toHaveLength(0);
	});

	it("decides_on_confirmation_and_says_what_it_did", async () => {
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Approve"]').click(); });
		await act(async () => { button(view, "✓ Approve").click(); });
		expect(calls.decided[0][2]).toBe("Approved");
		expect(view.container.querySelector('[role="dialog"]')).toBeNull();
		expect(view.container.textContent).toContain("HR-LAP-2026-00001 approved");
	});

	it("keeps_the_dialog_open_with_the_sites_reason_when_it_refuses", async () => {
		decides = () => Promise.reject(new Error("Leave Application is overlapping HR-LAP-2026-00000"));
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Reject"]').click(); });
		fireEvent.change(view.container.querySelector("#dc_note"), { target: { value: "no" } });
		await act(async () => { button(view, "✕ Reject").click(); });
		const dlg = view.container.querySelector('[role="dialog"]');
		expect(dlg).toBeTruthy();
		expect(dlg.textContent).toContain("overlapping HR-LAP-2026-00000");
	});
});

describe("what the client will decide", () => {
	it("refuses_to_submit_a_doctype_that_is_not_on_its_short_list", async () => {
		const { apiDecide } = await vi.importActual("@/api/client");
		await expect(apiDecide("Salary Slip", "SAL-0001", "Approved")).rejects.toThrow(/not decided from here/);
	});
});
