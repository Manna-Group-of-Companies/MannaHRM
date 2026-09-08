import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employees → Employee Profile → the pencil.

   It used to be a link to `…/app/employee/HR-EMP-…` on the ERPNext desk, which
   answered "where do I change this" with "somewhere else" and left whoever
   followed it reading a Frappe form laid out nothing like the pane they had
   been looking at. It opens the boxes on this page now.

   What is worth pinning is the boundary rather than the boxes:

   - the **whole record is one edit and one Save**, because the thirteen panes
     are one document — a Save per card would be thirteen writes to one record
     and thirteen chances for the ninth to be refused;
   - the write carries **only what changed**, because a document sent back whole
     re-sends columns this reader may not write and values that were current
     when the page loaded;
   - a field the site has no column for **gets no box at all**, because Frappe
     accepts a key its doctype has not got and drops it — the field would look
     saved and be gone on reload;
   - a refusal is shown **in the site's own words**, because "a Link that names
     nothing" and "you may not write this record" are different things to do
     next.
   --------------------------------------------------------------------------- */

const wrote = [];
let writes; // what apiWrite does, per test

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiWrite: (...a) => {
			wrote.push(a);
			return writes(...a);
		},
	};
});

/** One Employee as the document endpoint returns it: nulls kept, so the screen
    can tell a field that is empty from one the site has not got. */
const DOC = {
	name: "HR-EMP-00001",
	employee_name: "Anand Raghavan",
	employee_number: "MR001",
	status: "Active",
	company: "Manna Rubber",
	department: "Production - MR",
	designation: "Operator",
	reports_to: null,
	date_of_joining: "2019-04-01",
	date_of_birth: "1988-02-11",
	cell_number: "9000000001",
	company_email: "anand@example.invalid",
	personal_email: null,
	current_address: null,
	doctype: "Employee",
	docstatus: 0,
	idx: 0,
	owner: "hr@example.invalid",
	creation: "2019-04-01 09:00:00",
	modified: "2026-08-25 11:12:13",
	modified_by: "it@mannarubber.com",
};

const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);
const text = (v) => v.container.textContent;

/** The ✎ on the first card of the pane. */
const pencil = (v) =>
	[...v.container.querySelectorAll(".proico button")].find((b) => b.textContent.trim() === "✎");

const startEditing = (v) => act(() => { pencil(v).click(); });

const box = (v, field) => v.container.querySelector(`#pe-${field}`);
const type = (el, value) => act(() => { fireEvent.change(el, { target: { value } }); });

const button = (v, label) =>
	[...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

beforeEach(() => {
	wrote.length = 0;
	writes = () => Promise.resolve({ ok: true });
	resetStore();
	set(loadedState());
	set({ empSel: "HR-EMP-00001", empDoc: { "HR-EMP-00001": DOC }, proftab: "about" });
});

describe("the pencil opens the form here", () => {
	it("draws a box for a field with a value in it", () => {
		const view = draw();
		expect(box(view, "cell_number")).toBeNull();

		startEditing(view);
		expect(box(view, "cell_number").value).toBe("9000000001");
	});

	it("draws a box for a field that is on the site and empty", () => {
		// The migration loaded the master and not the paperwork. Filling one of
		// these in is what somebody opens this page to do.
		const view = draw();
		startEditing(view);
		expect(box(view, "personal_email")).not.toBeNull();
		expect(box(view, "personal_email").value).toBe("");
	});

	it("draws no box for the name the site composes, and says why", () => {
		const view = draw();
		startEditing(view);
		expect(box(view, "employee_name")).toBeNull();
		expect(text(view)).toContain("first, middle and last name");
	});

	it("keeps the record readable — the pencil is gone while it is open", () => {
		const view = draw();
		startEditing(view);
		expect(pencil(view)).toBeUndefined();
		expect(button(view, "Save")).not.toBeUndefined();
		expect(button(view, "Cancel")).not.toBeUndefined();
	});
});

describe("one record, one Save", () => {
	it("counts what is pending across every pane, not just the one on screen", () => {
		// The thirteen panes are one document. Somebody who edits a phone number,
		// wanders to another pane and presses Save must not be surprised by what
		// goes — so the count is on the bar and it is the whole draft.
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		expect(text(view)).toContain("1 field changed");

		act(() => { set({ proftab: "personal" }); });
		expect(text(view)).toContain("1 field changed");
		// Still editing — moving between panes is not leaving the form.
		expect(button(view, "Save")).not.toBeUndefined();
	});

	it("will not save when nothing has been typed", () => {
		const view = draw();
		startEditing(view);
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("drops a box typed back to what the record says", () => {
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		type(box(view, "cell_number"), "9000000001");
		expect(button(view, "Save").disabled).toBe(true);
		expect(text(view)).toContain("nothing changed yet");
	});
});

describe("what reaches the site", () => {
	it("writes only the field that changed", async () => {
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		await act(async () => { button(view, "Save").click(); });

		expect(wrote).toHaveLength(1);
		const [label, name, patch] = wrote[0];
		expect(label).toBe("Employee");
		expect(name).toBe("HR-EMP-00001");
		expect(patch).toEqual({ cell_number: "9000000002" });
	});

	it("clears a field by sending null rather than an empty string", async () => {
		const view = draw();
		startEditing(view);
		type(box(view, "company_email"), "");
		await act(async () => { button(view, "Save").click(); });

		expect(wrote[0][2]).toEqual({ company_email: null });
	});

	it("reads the record back rather than keeping its own idea of it", async () => {
		// The site names the document, fills what it derives and normalises what
		// it was sent. A screen that patched its own copy would disagree with the
		// site by one character until somebody reloaded.
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		await act(async () => { button(view, "Save").click(); });

		expect(getState().empDoc["HR-EMP-00001"]).toBeUndefined();
		expect(getState().profedit).toBe(false);
		expect(getState().profdraft).toEqual({});
	});

	it("shows a refusal in the site's own words and keeps the typing", async () => {
		writes = () => Promise.resolve({ ok: false, error: "Could not find Department: Nowhere - MR", status: 417 });
		const view = draw();
		startEditing(view);
		type(box(view, "department"), "Nowhere - MR");
		await act(async () => { button(view, "Save").click(); });

		expect(text(view)).toContain("Could not find Department");
		// Still open, still holding what was typed — a refusal that emptied the
		// form would be a refusal that cost somebody their work.
		expect(getState().profedit).toBe(true);
		expect(box(view, "department").value).toBe("Nowhere - MR");
	});
});

describe("the draft belongs to one person", () => {
	it("is dropped when the record being looked at changes", () => {
		// Both values are legal, so nothing downstream would catch somebody's
		// typing landing on somebody else's record.
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		expect(getState().profdraft).toEqual({ cell_number: "9000000002" });

		act(() => { set({ empSel: "HR-EMP-00002", empDoc: { "HR-EMP-00002": { ...DOC, name: "HR-EMP-00002" } } }); });
		expect(getState().profdraft).toEqual({});
		expect(getState().profedit).toBe(false);
	});

	it("is dropped by Cancel, and writes nothing", () => {
		const view = draw();
		startEditing(view);
		type(box(view, "cell_number"), "9000000002");
		act(() => { button(view, "Cancel").click(); });

		expect(wrote).toHaveLength(0);
		expect(getState().profdraft).toEqual({});
		expect(box(view, "cell_number")).toBeNull();
	});
});
