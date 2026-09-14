import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import SubmitAttendance from "@/features/attendance/SubmitAttendance";
import {
	blockers, lastMonth, liveFor, periodBounds, periodLabel, periodProblem, stateOf, summarise,
} from "@/features/attendance/submit";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Attendance → Submit Attendance: closing a company's month.

   What is worth pinning is the boundary, and it runs the other way from most
   of this app. **Here the dashboard does submit** — submitting is the whole
   point of the page — and it can afford to because the controller is what
   decides: `manna_hr/freeze.py` and `Attendance Submission`. So the tests are
   about what gets asked of the site, in what order, and that a refusal is
   shown in the site's own words with nothing claimed that did not happen.
   --------------------------------------------------------------------------- */

const calls = { lists: [], create: [], submit: [], cancel: [], remove: [] };
let subs;       // what the site answers for Attendance Submission
let attendance; // what it answers for Attendance
let answers;    // what the four writes answer

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label, fields, filters) => {
		calls.lists.push([label, filters]);
		if (label === "Attendance Submission") return subs();
		if (label === "Attendance") return Promise.resolve(attendance);
		return Promise.resolve([]);
	},
}));

vi.mock("@/api/crud", async (importOriginal) => ({
	...(await importOriginal()),
	create: (...a) => { calls.create.push(a); return Promise.resolve(answers.create(...a)); },
	submit: (...a) => { calls.submit.push(a); return Promise.resolve(answers.submit(...a)); },
	cancel: (...a) => { calls.cancel.push(a); return Promise.resolve(answers.cancel(...a)); },
	remove: (...a) => { calls.remove.push(a); return Promise.resolve(answers.remove(...a)); },
}));

const AUGUST = [
	{ name: "HR-ATS-2026-00001", company: "Manna Rubber", period: "2026-07", docstatus: 1,
		attendance_rows: 52, submitted_on: "2026-08-02 10:00:00", submitted_by: "hr@manna.invalid" },
	{ name: "HR-ATS-2026-00002", company: "Manna Rubber", period: "2026-06", docstatus: 2,
		reopened_on: "2026-07-05 09:00:00", reopened_by: "hr@manna.invalid" },
	{ name: "HR-ATS-2026-00003", company: "Manna Tyre UAE", period: "2026-07", docstatus: 0 },
];

beforeEach(() => {
	/* Only the date is faked, so every promise still settles. 11 September 2026
	   — the day this page was built — puts "last month" on August. */
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(2026, 8, 11, 10, 0));
	for (const k of Object.keys(calls)) calls[k] = [];
	subs = () => Promise.resolve(AUGUST);
	attendance = [];
	answers = {
		create: () => ({ ok: true, name: "HR-ATS-2026-00004" }),
		submit: () => ({ ok: true }),
		cancel: () => ({ ok: true }),
		remove: () => ({ ok: true }),
	};
	resetStore();
	set(loadedState());
	set({ company: "Manna Rubber" });
});

afterEach(() => vi.useRealTimers());

async function draw() {
	let view;
	await act(async () => { view = render(<Provider store={store}><SubmitAttendance /></Provider>); });
	return view;
}

const click = async (el) => { await act(async () => { fireEvent.click(el); }); };
const dialog = (view) => within(view.getByRole("dialog"));

describe("the month, as arithmetic", () => {
	it("last_month_of_january_is_december_of_the_year_before", () => {
		expect(lastMonth("2027-01-15")).toBe("2026-12");
		expect(lastMonth("2026-09-11")).toBe("2026-08");
	});

	it("a_period_runs_to_its_real_last_day_not_the_31st", () => {
		expect(periodBounds("2026-09")).toEqual(["2026-09-01", "2026-09-30"]);
		expect(periodBounds("2028-02")).toEqual(["2028-02-01", "2028-02-29"]);
		expect(periodBounds("Aug-26")).toBeNull();
	});

	it("a_period_is_written_the_way_factor_hr_writes_it", () => {
		expect(periodLabel("2026-08")).toBe("Aug-26");
	});

	it("a_month_is_refused_until_its_last_day_is_over", () => {
		expect(periodProblem("2026-09", "2026-09-11")).toMatch(/Sep-26 has not ended yet — its last day is 2026-09-30/);
		expect(periodProblem("2026-08", "2026-08-31")).toMatch(/has not ended/);
		expect(periodProblem("2026-08", "2026-09-01")).toBe("");
	});

	it("every_row_is_counted_and_an_unknown_status_is_other_not_dropped", () => {
		const { byEmp, total } = summarise([
			{ employee: "E1", status: "Present" }, { employee: "E1", status: "Absent" },
			{ employee: "E2", status: "Comp Off" },
		]);
		expect(total).toMatchObject({ rows: 3, employees: 2, present: 1, absent: 1, other: 1 });
		expect(byEmp.E1.rows).toBe(2);
	});

	it("every_reason_the_site_will_refuse_is_said_at_once", () => {
		expect(blockers(0, 2, 1)).toHaveLength(3);
		expect(blockers(40, 0, 0)).toEqual([]);
		expect(blockers(40, 1, 0)[0]).toMatch(/^1 attendance correction for this month is still open/);
	});

	it("a_cancelled_submission_leaves_the_month_free_to_be_closed_again", () => {
		expect(liveFor(AUGUST, "Manna Rubber", "2026-06")).toBeNull();
		expect(liveFor(AUGUST, "Manna Tyre UAE", "2026-07").name).toBe("HR-ATS-2026-00003");
		expect(stateOf({ docstatus: 2 })).toBe("Cancelled");
	});
});

describe("the list", () => {
	it("draws_every_submission_the_header_company_can_see_with_its_state", async () => {
		const view = await draw();
		const text = view.container.textContent;
		expect(text).toMatch(/HR-ATS-2026-00001/);
		expect(text).toMatch(/Submitted/);
		expect(text).toMatch(/reopened 05-Jul-2026 09:00 by hr@manna.invalid/);
		// The header says Manna Rubber, so the UAE draft is not in this list.
		expect(text).not.toMatch(/HR-ATS-2026-00003/);
	});

	it("offers_reopen_on_a_submitted_month_and_delete_on_nothing_but_a_draft", async () => {
		set({ company: "" });
		const view = await draw();
		const row = (id) => within(view.getByText(id).closest("tr"));
		expect(row("HR-ATS-2026-00001").queryByRole("button", { name: "Reopen" })).toBeTruthy();
		expect(row("HR-ATS-2026-00001").queryByRole("button", { name: "Delete" })).toBeNull();
		expect(row("HR-ATS-2026-00002").queryAllByRole("button")).toHaveLength(0);
		expect(row("HR-ATS-2026-00003").queryByRole("button", { name: "Delete" })).toBeTruthy();
	});

	it("reopening_asks_first_then_cancels_that_submission_on_the_site", async () => {
		const view = await draw();
		await click(view.getByRole("button", { name: "Reopen" }));
		expect(calls.cancel).toEqual([]);
		expect(dialog(view).getByText(/refuses this once salary has been processed/)).toBeTruthy();
		await click(dialog(view).getByRole("button", { name: "Reopen it" }));
		expect(calls.cancel).toEqual([["Attendance Submission", "HR-ATS-2026-00001"]]);
		expect(view.container.textContent).toMatch(/Jul-26 for Manna Rubber is open again/);
	});

	it("a_refused_reopen_is_shown_in_the_sites_words_and_claims_nothing", async () => {
		answers.cancel = () => ({ ok: false, error: "Salary has already been processed from this month — 4 submitted salary slips." });
		const view = await draw();
		await click(view.getByRole("button", { name: "Reopen" }));
		await click(dialog(view).getByRole("button", { name: "Reopen it" }));
		const text = view.container.textContent;
		expect(text).toMatch(/The site refused it: Salary has already been processed/);
		expect(text).toMatch(/HR-ATS-2026-00001 is as it was/);
		expect(text).not.toMatch(/is open again/);
	});

	it("a_site_without_the_doctype_says_so_rather_than_showing_an_empty_list", async () => {
		subs = () => Promise.reject(Object.assign(new Error("DocType Attendance Submission not found"), { status: 404 }));
		const view = await draw();
		expect(view.container.textContent).toMatch(/Attendance Submission is not on the site yet/);
		expect(view.container.textContent).toMatch(/arrives with the app install/);
		// Still enabled: the site is what refuses, and it says why.
		expect(view.getByRole("button", { name: "+ Add" }).disabled).toBe(false);
	});

	it("nothing_on_the_page_is_drawn_dead_that_could_work", async () => {
		const view = await draw();
		expect(view.getByRole("searchbox", { name: "Search submissions" }).disabled).toBe(false);
		expect(view.getByRole("combobox", { name: "Entries per page" }).disabled).toBe(false);
		expect(view.getByRole("button", { name: "Preview Data" }).disabled).toBe(false);
	});
});

describe("+ Add", () => {
	it("opens_on_last_month_for_the_header_company", async () => {
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		expect(dialog(view).getByRole("heading").textContent).toBe("Submit Aug-26 — Manna Rubber");
	});

	it("reads_the_month_it_is_about_to_freeze_before_anything_is_written", async () => {
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		const read = calls.lists.find(([label]) => label === "Attendance");
		expect(read[1]).toEqual(expect.arrayContaining([
			["company", "=", "Manna Rubber"], ["docstatus", "=", 1],
			["attendance_date", ">=", "2026-08-01"], ["attendance_date", "<=", "2026-08-31"],
		]));
		expect(calls.create).toEqual([]);
	});

	it("an_empty_month_is_refused_here_in_the_sites_own_words", async () => {
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		expect(dialog(view).getByText(/freeze a month of nothing/)).toBeTruthy();
		expect(dialog(view).getByRole("button", { name: "Submit Aug-26" }).disabled).toBe(true);
	});

	it("submit_makes_the_submission_then_submits_it", async () => {
		attendance = [
			{ name: "A1", employee: "HR-EMP-00001", attendance_date: "2026-08-03", status: "Present" },
			{ name: "A2", employee: "HR-EMP-00002", attendance_date: "2026-08-03", status: "Absent" },
		];
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		await click(dialog(view).getByRole("button", { name: "Submit Aug-26" }));
		expect(calls.create).toEqual([["Attendance Submission",
			{ company: "Manna Rubber", period: "2026-08", remarks: undefined }]]);
		expect(calls.submit).toEqual([["Attendance Submission", "HR-ATS-2026-00004"]]);
		expect(view.container.textContent).toMatch(/Aug-26 for Manna Rubber is submitted as HR-ATS-2026-00004/);
	});

	it("a_refused_submit_keeps_the_draft_and_says_where_it_is", async () => {
		attendance = [{ name: "A1", employee: "HR-EMP-00001", attendance_date: "2026-08-03", status: "Present" }];
		answers.submit = () => ({ ok: false, error: "1 attendance correction for this month is still open." });
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		await click(dialog(view).getByRole("button", { name: "Submit Aug-26" }));
		const text = dialog(view).getByText(/Saved as draft/).textContent;
		expect(text).toMatch(/Saved as draft HR-ATS-2026-00004, but the site would not submit it: 1 attendance correction/);
		expect(view.container.textContent).not.toMatch(/is submitted as/);
	});

	it("the_month_still_in_progress_cannot_be_sent", async () => {
		const view = await draw();
		await click(view.getByRole("button", { name: "+ Add" }));
		const month = dialog(view).getByLabelText("Month");
		await act(async () => { fireEvent.change(month, { target: { value: "2026-09" } }); });
		expect(dialog(view).getByText(/Sep-26 has not ended yet/)).toBeTruthy();
		expect(dialog(view).getByRole("button", { name: "Submit Sep-26" }).disabled).toBe(true);
	});

	it("a_month_already_submitted_cannot_be_submitted_twice", async () => {
		const view = await draw();
		await act(async () => { fireEvent.change(view.getByLabelText("Month"), { target: { value: "2026-07" } }); });
		await click(view.getByRole("button", { name: "+ Add" }));
		expect(dialog(view).getByText(/already has a submission — HR-ATS-2026-00001/)).toBeTruthy();
	});
});

describe("Preview Data", () => {
	it("shows_the_month_per_person_and_names_the_people_with_no_attendance_at_all", async () => {
		attendance = [
			{ name: "A1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", attendance_date: "2026-08-03", status: "Present" },
			{ name: "A2", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", attendance_date: "2026-08-04", status: "Half Day" },
		];
		const view = await draw();
		await click(view.getByRole("button", { name: "Preview Data" }));
		const text = view.container.textContent;
		expect(text).toMatch(/Preview — Aug-26, Manna Rubber/);
		// Priya is active at Manna Rubber and has no row: the one a close would pay nothing.
		expect(text).toMatch(/1 person has no attendance at all in Aug-26/);
		const anand = within(view.getByText("Anand Raghavan").closest("tr"));
		expect(anand.getAllByRole("cell").map((c) => c.textContent)).toEqual(
			["MR001", "Anand Raghavan", "1", "1", "—", "—", "—", "—", "2"]);
	});
});
