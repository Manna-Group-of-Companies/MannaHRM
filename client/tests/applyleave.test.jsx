import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import ApplyLeave from "@/features/leave/ApplyLeave";
import { approverFor, leaveDoc, raiseLeave } from "@/features/leave/raise";
import { store, set, patch, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Leave → Apply Leave: Submit raises a real Leave Application.

   What is worth pinning is the boundary. It goes up Open, as a draft, and
   nothing here approves, submits or touches a balance. The site's refusal is
   shown in the site's words — escaped, because those words are drawn as HTML —
   and when the refusal is "no allocation", the screen says what fixes it
   rather than leaving somebody to read hrms's sentence cold.
   --------------------------------------------------------------------------- */

const calls = { made: [], uploaded: [], docs: [] };
let creates;  // what apiCreate does, per test
let uploads;  // what apiUpload does, per test
let docs;     // what getDoc answers, per employee

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
	creates = (label, doc) => Promise.resolve({ name: "HR-LAP-2026-00001", ...doc });
	uploads = () => Promise.resolve({ name: "FILE-1" });
	docs = { "HR-EMP-00001": { user_id: "anand@example.invalid" } };
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
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Submit" })); });
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
		expect(view.container.textContent).toMatch(/raised as HR-LAP-2026-00001, Open/);
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

	it("no_allocation_says_what_fixes_it_and_links_the_desk_to_allocate", async () => {
		creates = () => Promise.reject(new Error("Application period cannot be outside leave allocation period"));
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		const text = view.container.textContent;
		expect(text).toMatch(/the site refused it: Application period cannot be outside leave allocation period/);
		expect(text).toMatch(/Leave Allocation/);
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

	it("the_attachment_is_filed_privately_against_the_new_application", async () => {
		patch("apply", FORM);
		const view = draw();
		const input = view.container.querySelector('input[type="file"]');
		const file = new File(["scan"], "medical.pdf", { type: "application/pdf" });
		await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
		await submit(view);
		expect(calls.uploaded).toHaveLength(1);
		expect(calls.uploaded[0][0]).toBe(file);
		expect(calls.uploaded[0][1]).toEqual({ doctype: "Leave Application", name: "HR-LAP-2026-00001" });
	});

	it("an_attachment_that_fails_does_not_undo_the_leave", async () => {
		uploads = () => Promise.reject(new Error("File too big"));
		patch("apply", FORM);
		const view = draw();
		const input = view.container.querySelector('input[type="file"]');
		await act(async () => {
			fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf")] } });
		});
		await submit(view);
		expect(view.container.textContent).toMatch(/raised as HR-LAP-2026-00001/);
		expect(view.container.textContent).toMatch(/The attachment did not go: File too big/);
	});

	it("a_second_click_while_one_is_on_its_way_sends_nothing_more", async () => {
		let release;
		creates = (label, doc) => new Promise((ok) => { release = () => ok({ name: "HR-LAP-2026-00001", ...doc }); });
		patch("apply", FORM);
		const view = draw();
		await submit(view);
		await act(async () => { fireEvent.click(view.getByRole("button", { name: "Submitting…" })); });
		await act(async () => { release(); });
		expect(calls.made).toHaveLength(1);
	});
});
