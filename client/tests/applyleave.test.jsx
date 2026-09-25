import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import ApplyLeave, { pickDay } from "@/features/leave/ApplyLeave";
import { approverFor, leaveDoc, raiseLeave } from "@/features/leave/raise";
import { store, set, patch, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Leave → Apply Leave: Save raises a real Leave Application.

   What is worth pinning is the boundary. It goes up Open, as a draft, and
   nothing here approves, submits or touches a balance. The site's refusal is
   shown in the site's words — escaped, because those words are drawn as HTML —
   and when the refusal is "no allocation", the screen says what fixes it
   rather than leaving somebody to read hrms's sentence cold.
   --------------------------------------------------------------------------- */

const calls = { made: [], uploaded: [], docs: [], sandwich: [] };
let creates;  // what apiCreate does, per test
let uploads;  // what apiUpload does, per test
let docs;     // what getDoc answers, per employee
let sandwich; // what apiCall("manna_hr.leave.sandwich_preview", ...) answers, per test

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	apiCreate: (...a) => {
		calls.made.push(a);
		return creates(...a);
	},
	apiUpload: (...a) => {
		calls.uploaded.push(a);
		return uploads(...a);
	},
	getDoc: (label, name) => {
		calls.docs.push([label, name]);
		return Promise.resolve(docs[name] ?? null);
	},
	apiCall: (method, body) => {
		calls.sandwich.push([method, body]);
		return sandwich(method, body);
	},
}));

vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	loadLeaveFor: () => Promise.resolve(),
}));

/* Priya reports to Anand in the fixture. */
const PRIYA = "HR-EMP-00002";
const FORM = { emp: PRIYA, type: "Casual Leave", from: "2026-09-14", till: "2026-09-14", fromval: "1", tillval: "1" };

beforeEach(() => {
	calls.made = [];
	calls.uploaded = [];
	calls.docs = [];
	calls.sandwich = [];
	creates = (label, doc) => Promise.resolve({ name: "HR-LAP-2026-00001", ...doc });
	uploads = () => Promise.resolve({ name: "FILE-1" });
	docs = { "HR-EMP-00001": { user_id: "anand@example.invalid" } };
	sandwich = () => Promise.resolve([]);
	resetStore();
	set(loadedState());
	set({ leaveTypes: [{ name: "Casual Leave" }] });
});

const emp = (name = PRIYA) => getState().byName[name];

describe("what an application sends", () => {
	it("a_single_full_day_is_one_day_with_no_half_day", () => {
		const { doc } = leaveDoc(FORM, emp(), "2026-09-11");
		expect(doc).toMatchObject({
			employee: PRIYA, leave_type: "Casual Leave", from_date: "2026-09-14", to_date: "2026-09-14",
			posting_date: "2026-09-11", half_day: 0,
		});
		expect(doc).not.toHaveProperty("half_day_date");
	});

	it("it_is_raised_open_and_never_approved_or_submitted", () => {
		const { doc } = leaveDoc(FORM, emp(), "2026-09-11");
		expect(doc.status).toBe("Open");
		expect(doc).not.toHaveProperty("docstatus");
	});

	it("it_is_filed_under_the_persons_company", () => {
		const { doc } = leaveDoc(FORM, emp(), "2026-09-11");
		expect(doc.company).toBe(emp().company);
	});

	it("a_half_day_keeps_which_half_in_the_remarks_because_the_doctype_cannot", () => {
		const { doc } = leaveDoc({ ...FORM, fromval: "0.5s", remarks: "Clinic" }, emp(), "2026-09-11");
		expect(doc.half_day).toBe(1);
		expect(doc.half_day_date).toBe("2026-09-14");
		expect(doc.description).toBe("Clinic\nHalf day on 14-Sep-2026: second half.");
	});

	it("a_range_ending_on_a_half_puts_the_half_on_the_last_day", () => {
		const { doc } = leaveDoc({ ...FORM, till: "2026-09-16", tillval: "0.5f" }, emp(), "2026-09-11");
		expect(doc.half_day_date).toBe("2026-09-16");
		expect(doc.description).toBe("Half day on 16-Sep-2026: first half.");
	});

	it("half_a_day_at_both_ends_is_refused_before_anything_is_sent", async () => {
		const f = { ...FORM, till: "2026-09-16", fromval: "0.5s", tillval: "0.5f" };
		expect(leaveDoc(f, emp(), "2026-09-11").refuse).toMatch(/two <code>half_day_date<\/code>/);
		const r = await raiseLeave(f, emp(), "2026-09-11", null);
		expect(r.ok).toBe(false);
		expect(calls.made).toEqual([]);
	});

	it("a_one_day_application_ignores_the_till_value_the_form_does_not_offer", () => {
		// One day, one value: the till box is disabled and shows the from value.
		const { doc } = leaveDoc({ ...FORM, fromval: "1", tillval: "0.5f" }, emp(), "2026-09-11");
		expect(doc.half_day).toBe(0);
	});
});

describe("who it goes to", () => {
	it("the_approver_on_the_record_wins_over_the_manager", async () => {
		docs[PRIYA] = { leave_approver: "hr.head@example.invalid" };
		expect(await approverFor(emp())).toEqual({ user: "hr.head@example.invalid", inferred: false });
	});

	it("otherwise_the_reporting_managers_login_marked_as_inferred", async () => {
		expect(await approverFor(emp())).toEqual({ user: "anand@example.invalid", inferred: true });
	});

	it("a_manager_with_no_login_is_nobody_rather_than_a_guess", async () => {
		docs["HR-EMP-00001"] = { user_id: "" };
		expect(await approverFor(emp())).toEqual({ user: "", inferred: false });
	});
});

describe("the page", () => {
	const draw = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const submit = async (view) => {
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Save" })); });
	};

	it("submit_raises_a_real_leave_application_on_the_site", async () => {
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		expect(calls.made).toHaveLength(1);
		const [label, doc] = calls.made[0];
		expect(label).toBe("Leave Application");
		expect(doc).toMatchObject({ employee: PRIYA, leave_type: "Casual Leave", status: "Open",
			leave_approver: "anand@example.invalid" });
		expect(view.container.textContent).toMatch(/saved as HR-LAP-2026-00001, Open/);
	});

	it("the_raised_application_lands_in_the_approvals_leave_queue", async () => {
		patch("apply", FORM);
		await submit(draw());
		expect(getState().approvals.leave.map((r) => r.name)).toContain("HR-LAP-2026-00001");
	});

	it("nothing_is_sent_when_the_type_is_missing", async () => {
		patch("apply", { ...FORM, type: "" });
		const view = draw();
		await submit(view);
		expect(calls.made).toEqual([]);
		expect(view.container.textContent).toMatch(/Needs a leave type\. Nothing has been sent\./);
	});

	it("no_allocation_points_at_give_monthly_leave_and_links_the_desk_to_allocate", async () => {
		creates = () => Promise.reject(new Error("Application period cannot be outside leave allocation period"));
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		const text = view.container.textContent;
		expect(text).toMatch(/the site refused it: Application period cannot be outside leave allocation period/);
		expect(text).toMatch(/Press Give monthly leave/);
		expect(text).toMatch(/Nothing has been written/);
		const link = view.getByRole("link", { name: "allocate it on the desk" });
		expect(link.getAttribute("href")).toBe(
			"https://erp.example.invalid/app/leave-allocation/new?employee=HR-EMP-00002&leave_type=Casual+Leave");
		expect(getState().approvals.leave.map((r) => r.name)).not.toContain("HR-LAP-2026-00001");
	});

	it("the_sites_words_are_shown_as_text_never_drawn_as_markup", async () => {
		creates = () => Promise.reject(new Error('<img src=x onerror="alert(1)"> refused'));
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		expect(view.container.querySelector("img")).toBeNull();
		expect(view.container.textContent).toMatch(/<img src=x onerror="alert\(1\)"> refused/);
	});

	it("a_range_with_nothing_to_sweep_is_sent_straight_away", async () => {
		sandwich = () => Promise.resolve([]);
		patch("apply", FORM);
		await submit(draw());
		expect(calls.sandwich).toHaveLength(1);
		expect(calls.sandwich[0][0]).toBe("manna_hr.leave.sandwich_preview");
		expect(calls.made).toHaveLength(1);
	});

	it("a_sandwiched_weekend_stops_for_a_warning_before_anything_is_sent", async () => {
		sandwich = () => Promise.resolve(["2026-09-19", "2026-09-20"]);
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		expect(calls.made).toEqual([]);
		expect(view.container.textContent).toMatch(/Sandwich Leave Warning/);
		expect(view.container.textContent).toMatch(/19-Sep-2026/);
		expect(view.container.textContent).toMatch(/20-Sep-2026/);
		expect(view.getByRole("button", { name: "Continue" })).toBeTruthy();
		expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
	});

	it("continue_on_the_warning_raises_the_application", async () => {
		sandwich = () => Promise.resolve(["2026-09-19"]);
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Continue" })); });
		expect(calls.made).toHaveLength(1);
		expect(view.container.textContent).toMatch(/saved as HR-LAP-2026-00001, Open/);
	});

	it("cancel_on_the_warning_sends_nothing_and_clears_it", async () => {
		sandwich = () => Promise.resolve(["2026-09-19"]);
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Cancel" })); });
		expect(calls.made).toEqual([]);
		expect(view.container.textContent).not.toMatch(/Sandwich Leave Warning/);
	});

	it("changing_a_date_after_a_warning_drops_it_so_submit_asks_again", async () => {
		sandwich = () => Promise.resolve(["2026-09-19"]);
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		expect(view.container.textContent).toMatch(/Sandwich Leave Warning/);
		const day15 = [...view.container.querySelectorAll(".lvgrid button.cell:not(.out)")]
			.find((el) => el.querySelector("i").textContent === "15");
		fireEvent.click(day15);
		expect(view.container.textContent).not.toMatch(/Sandwich Leave Warning/);
		expect(calls.sandwich).toHaveLength(1);
	});

	it("a_second_click_while_one_is_on_its_way_sends_nothing_more", async () => {
		let release;
		creates = (label, doc) => new Promise((ok) => { release = () => ok({ name: "HR-LAP-2026-00001", ...doc }); });
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Saving…" })); });
		await act(async () => { release(); });
		expect(calls.made).toHaveLength(1);
	});
});

describe("the calendar", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const cell = (c, day) => [...c.container.querySelectorAll(".lvgrid .cell:not(.out)")]
		.find((el) => el.querySelector("i").textContent === String(day));

	it("with_nobody_picked_it_asks_for_an_employee_and_marks_no_day", () => {
		patch("apply", { month: "2026-09" });
		set({ applyAtt: { "2026-09-07": "Present" } });
		const c = page();
		expect(c.container.querySelector(".lvcalbar").textContent).toContain("Pick an employee");
		expect(c.container.querySelector(".lvgrid .lvtag")).toBeNull();
	});

	it("picking_somebody_shows_their_name_and_every_day_they_were_present", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyAtt: { "2026-09-07": "Present", "2026-09-08": "Work From Home" } });
		const c = page();
		expect(c.container.querySelector(".lvcalbar").textContent).toContain(emp().employee_name);
		expect(cell(c, 7).querySelector(".lvtag").textContent).toBe("P");
		expect(cell(c, 8).querySelector(".lvtag").textContent).toBe("P");
	});

	it("a_half_day_and_an_on_leave_row_are_marked_as_such", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: { "2026-09-09": "Half Day", "2026-09-10": "On Leave", "2026-09-11": "Absent" } });
		const c = page();
		expect(cell(c, 9).querySelector(".lvtag").textContent).toBe("½");
		expect(cell(c, 10).querySelector(".lvtag").textContent).toBe("L");
		expect(cell(c, 11).querySelector(".lvtag").textContent).toBe("A");
	});

	it("the_month_is_counted_under_the_grid", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyAtt: { "2026-09-07": "Present", "2026-09-08": "Present", "2026-09-09": "Absent" } });
		const c = page();
		const tally = c.container.querySelector(".lvtally").textContent;
		expect(tally).toContain("Present 2");
		expect(tally).toContain("Absent 1");
	});
});

describe("picking the dates on the calendar", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const day = (c, n) => [...c.container.querySelectorAll(".lvgrid button.cell:not(.out)")]
		.find((el) => el.querySelector("i").textContent === String(n));

	it("the_first_click_starts_and_ends_a_one_day_leave_on_that_day", () => {
		expect(pickDay({ picking: false, from: "2026-09-01" }, "2026-09-15"))
			.toEqual({ from: "2026-09-15", till: "2026-09-15", picking: true });
	});

	it("the_second_click_on_a_later_day_ends_the_leave_there", () => {
		expect(pickDay({ picking: true, from: "2026-09-15" }, "2026-09-17"))
			.toEqual({ till: "2026-09-17", picking: false });
	});

	it("the_same_day_clicked_twice_is_one_day", () => {
		expect(pickDay({ picking: true, from: "2026-09-15" }, "2026-09-15"))
			.toEqual({ till: "2026-09-15", picking: false });
	});

	it("a_second_click_before_the_start_starts_again_rather_than_running_backwards", () => {
		expect(pickDay({ picking: true, from: "2026-09-15" }, "2026-09-10"))
			.toEqual({ from: "2026-09-10", till: "2026-09-10", picking: true });
	});

	it("the_dates_can_be_picked_before_the_person", () => {
		patch("apply", { month: "2026-09" });
		const c = page();
		fireEvent.click(day(c, 15));
		expect(getState().apply.from).toBe("2026-09-15");
	});

	it("a_day_shows_its_first_and_last_punch", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: {}, applyPunch: { "2026-09-15": { first: "09:02", last: "18:10", n: 2 } } });
		const c = page();
		expect(day(c, 15).querySelector(".lvtimes").textContent).toBe("09:0218:10");
	});

	it("a_greyed_day_of_next_month_turns_the_calendar_to_it", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: {} });
		const c = page();
		const oct2 = [...c.container.querySelectorAll(".lvgrid button.cell.out")]
			.find((el) => el.querySelector("i").textContent === "2");
		fireEvent.click(oct2);
		expect(getState().apply.month).toBe("2026-10");
		expect(getState().apply.from).toBe("2026-10-02");
	});

	it("clicking_two_days_fills_from_and_till_in_the_form", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: {} });
		const c = page();
		fireEvent.click(day(c, 15));
		fireEvent.click(day(c, 17));
		expect(getState().apply.from).toBe("2026-09-15");
		expect(getState().apply.till).toBe("2026-09-17");
		expect(c.container.querySelectorAll(".lvgrid .cell.lvsel")).toHaveLength(3);
	});
});

describe("choosing the employee", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);

	it("the_list_of_matches_hangs_from_the_search_box_not_somewhere_down_the_page", () => {
		patch("apply", { q: emp().employee_name.slice(0, 4) });
		const c = page();
		const list = c.container.querySelector(".regfind");
		expect(list).not.toBeNull();
		expect(list.parentElement.closest(".ctl")).not.toBeNull();
	});

	it("a_name_left_in_the_box_after_a_stray_keystroke_still_picks_that_person", () => {
		const e = emp();
		const c = page();
		fireEvent.change(c.container.querySelector("#lv-emp"),
			{ target: { value: `${e.employee_name} (${e.employee_number || e.name}) ` } });
		expect(getState().apply.emp).toBe(PRIYA);
		expect(c.container.querySelector(".lvcalbar").textContent).toContain(e.employee_name);
	});
});

describe("the leave balance", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const CASUAL = { type: "Casual Leave", total: 4, taken: 1, pending: 0, expired: 0, remaining: 3 };

	it("shows_what_the_person_has_left_of_each_leave_type", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [CASUAL] } });
		const text = page().container.querySelector(".lvbal").textContent;
		expect(text).toContain("Casual Leave");
		expect(text).toContain("3available");
		expect(text).toContain("4 given, 1 taken");
	});

	it("a_person_given_no_leave_is_told_so_in_words_not_zeros", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [] } });
		expect(page().container.querySelector(".lvbal").textContent).toMatch(/has not been given Casual Leave/);
	});

	it("asking_for_more_than_is_left_warns_before_anything_is_sent", () => {
		patch("apply", { ...FORM, till: "2026-09-17" });
		set({ applyBal: { rows: [CASUAL] } });
		const hint = page().container.querySelector(".lvf .hint.warn");
		expect(hint.textContent).toMatch(/3 available — this asks for 4/);
	});

	it("nobody_chosen_shows_no_balance", () => {
		expect(page().container.querySelector(".lvbal")).toBeNull();
	});
});

describe("the monthly leave on the calendar", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const day = (c, n) => [...c.container.querySelectorAll(".lvgrid button.cell:not(.out)")]
		.find((el) => el.querySelector("i").textContent === String(n));

	it("the_first_of_the_month_shows_one_casual_leave_earned", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: {} });
		const c = page();
		expect(day(c, 1).querySelector(".lvearn").textContent).toBe("+1 CL");
		expect(day(c, 2).querySelector(".lvearn")).toBeNull();
	});

});

describe("giving the monthly leave", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);

	it("a_person_with_no_leave_is_offered_the_button_for_them_and_for_everyone", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [] } });
		const c = page();
		expect(c.getByRole("button", { name: `Give ${emp().employee_name} monthly leave` })).toBeTruthy();
		expect(c.getByRole("button", { name: /Give everyone \(\d+\) monthly leave/ })).toBeTruthy();
	});

	it("a_person_who_has_leave_is_not_offered_it_again", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [{ type: "Casual Leave", total: 1, taken: 0, pending: 0, expired: 0, remaining: 1 }] } });
		expect(page().queryByRole("button", { name: /monthly leave/ })).toBeNull();
	});
});

describe("why a leave is outside what was given", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const SICK = { type: "Sick Leave", total: 2, taken: 0, pending: 0, expired: 0, remaining: 2, periods: [] };
	const CL_FROM_SEP = { type: "Casual Leave", total: 1, taken: 0, pending: 0, expired: 0, remaining: 1,
		periods: [["2026-09-01", "2026-12-31"]] };

	it("somebody_with_another_leave_but_no_casual_leave_is_still_offered_the_button", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [SICK] } });
		expect(page().getByRole("button", { name: `Give ${emp().employee_name} monthly leave` })).toBeTruthy();
	});

	it("the_balance_says_which_dates_it_covers", () => {
		patch("apply", { emp: PRIYA });
		set({ applyBal: { rows: [CL_FROM_SEP] } });
		expect(page().container.querySelector(".lvbal").textContent).toContain("for 01-Sep-2026 – 31-Dec-2026");
	});

	it("dates_before_the_leave_starts_are_named_as_the_reason", async () => {
		creates = () => Promise.reject(new Error("Application period cannot be outside leave allocation period"));
		patch("apply", { ...FORM, from: "2026-08-28", till: "2026-08-28" });
		set({ applyBal: { rows: [CL_FROM_SEP] } });
		const view = page();
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Save" })); });
		expect(view.container.textContent).toMatch(/Casual Leave starts on 01-Sep-2026, and this leave begins on 28-Aug-2026/);
	});

	it("a_refusal_with_no_casual_leave_puts_the_button_right_under_it", async () => {
		creates = () => Promise.reject(new Error("Application period cannot be outside leave allocation period"));
		patch("apply", FORM);
		set({ applyBal: { rows: [SICK] } });
		const view = page();
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Save" })); });
		expect(view.getAllByRole("button", { name: `Give ${emp().employee_name} monthly leave` }).length).toBe(2);
	});
});

describe("the leave approver", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const box = (c) => c.container.querySelector("select[aria-labelledby=lv-appr-l]");

	it("is_filled_with_the_reporting_managers_login_when_there_is_one", async () => {
		patch("apply", { emp: PRIYA });
		let c;
		await act(async () => { c = page(); });
		expect(getState().apply.approver).toBe("anand@example.invalid");
		expect(box(c).value).toBe("anand@example.invalid");
	});

	it("falls_back_to_whoever_is_signed_in_when_nobody_is_set", async () => {
		const loner = getState().employees.find((e) => !e.reports_to && e.status === "Active");
		set({ user: "hr@example.invalid" });
		patch("apply", { emp: loner.name });
		await act(async () => { page(); });
		expect(getState().apply.approver).toBe("hr@example.invalid");
		expect(getState().apply.approverWhy).toMatch(/you/);
	});

	it("the_one_picked_on_the_form_is_the_one_sent", async () => {
		const { doc } = leaveDoc(FORM, emp(), "2026-09-01");
		expect(doc.leave_approver).toBeUndefined();
		const r = await raiseLeave({ ...FORM, approver: "boss@example.invalid" }, emp(), "2026-09-01", null);
		expect(r.ok).toBe(true);
		expect(calls.made.at(-1)[1].leave_approver).toBe("boss@example.invalid");
	});
});

describe("unused casual leave carries to the next month", () => {
	const page = () => render(<Provider store={store}><ApplyLeave /></Provider>);
	const line = (c) => c.container.querySelector(".lvmonth").textContent;
	/* Given from July: one each 1st, a day taken in August, nothing in September. */
	const LEDGER = [
		{ leaves: 1, from_date: "2026-07-01", transaction_type: "Leave Allocation" },
		{ leaves: 1, from_date: "2026-08-01", transaction_type: "Leave Allocation" },
		{ leaves: -1, from_date: "2026-08-12", transaction_type: "Leave Application" },
		{ leaves: 1, from_date: "2026-09-01", transaction_type: "Leave Allocation" },
	];
	const BAL = { rows: [{ type: "Casual Leave", total: 3, taken: 1, pending: 0, expired: 0, remaining: 2 }], ledger: LEDGER };

	it("a_month_with_nothing_taken_carries_everything_on", () => {
		patch("apply", { emp: PRIYA, month: "2026-07" });
		set({ applyHist: [], applyAtt: {}, applyBal: BAL });
		expect(line(page())).toMatch(/brought forward 0.*\+1 earned.*0 taken.*carried to next month 1/);
	});

	it("the_next_month_starts_with_what_the_last_one_carried", () => {
		patch("apply", { emp: PRIYA, month: "2026-08" });
		set({ applyHist: [], applyAtt: {}, applyBal: BAL });
		expect(line(page())).toMatch(/brought forward 1.*\+1 earned.*1 taken.*carried to next month 1/);
	});

	it("a_person_the_site_has_given_nothing_is_told_so", () => {
		patch("apply", { emp: PRIYA, month: "2026-09" });
		set({ applyHist: [], applyAtt: {}, applyBal: { rows: [], ledger: [] } });
		expect(line(page())).toMatch(/not given on the site yet/);
	});
});
