import { describe, expect, it } from "vitest";

import {
	NEVER_EDITABLE, boxValue, changedCount, controlFor, patchFrom, same, whyNotEditable, withEdit,
} from "@/lib/profedit";

/* ---------------------------------------------------------------------------
   What the profile will offer a box for, and what it would send.

   No DOM and no site: every rule below is a sentence about a document, which is
   the same bargain `lib/newemp.js` makes for the create wizard.

   **The one that earns its place most is the `absent` rule.** Frappe accepts a
   key its doctype has not got and drops it without a word, so a box for a field
   this site does not have would take a value, save, report success, and be gone
   on reload — which reads as the record refusing to keep what somebody typed.
   Employee Profile is the one screen that can tell "not set" from "no such
   field here", and this is what that distinction is finally for.
   --------------------------------------------------------------------------- */

describe("which fields get a box", () => {
	it("offers one for a field that has a value", () => {
		expect(controlFor("cell_number", "set")).toBe("text");
	});

	it("offers one for a field that is on the site and empty", () => {
		// The migration loaded the master and not the paperwork; filling it in is
		// exactly what somebody opens this page to do.
		expect(controlFor("passport_number", "blank")).toBe("text");
	});

	it("offers none for a field the site has not got", () => {
		expect(controlFor("custom_nothing_like_this", "absent")).toBe("");
	});

	it("says why there is no box, in words somebody can act on", () => {
		expect(whyNotEditable("custom_nothing_like_this", "absent")).toContain("Custom Field");
	});

	it("offers none for the name the site composes", () => {
		// ERPNext rebuilds employee_name from the three name parts on every save,
		// so a name typed over it reverts the next time anybody touches the record.
		expect(NEVER_EDITABLE.has("employee_name")).toBe(true);
		expect(controlFor("employee_name", "set")).toBe("");
		expect(whyNotEditable("employee_name", "set")).toContain("first, middle and last");
	});

	it("offers none for Frappe's own bookkeeping", () => {
		expect(controlFor("modified_by", "set")).toBe("");
		expect(controlFor("creation", "set")).toBe("");
	});
});

describe("which control each field gets", () => {
	it("gives a date a date box", () => {
		expect(controlFor("date_of_joining", "set")).toBe("date");
	});

	it("gives a tick a checkbox", () => {
		expect(controlFor("custom_allow_remote_punch", "set")).toBe("check");
	});

	it("gives an address a textarea", () => {
		expect(controlFor("current_address", "set")).toBe("long");
	});

	it("gives status the four words the site allows", () => {
		expect(controlFor("status", "set")).toBe("choice");
	});

	it("gives the reporting manager a select, because the value is an id", () => {
		// The screen shows a name and the record holds `HR-EMP-00001`. A box that
		// took the name would post the name, and the site would refuse it — or
		// worse, on a site where a person is named after themselves, would not.
		expect(controlFor("reports_to", "set")).toBe("employee");
	});

	it("gives a Link a list to pick from and still lets anything be typed", () => {
		// A datalist, not a select: the list this dashboard holds is one read's
		// worth, and the site is what refuses a Link that names nothing.
		expect(controlFor("department", "set")).toBe("link");
		expect(controlFor("holiday_list", "set")).toBe("link");
	});

	it("gives CTC a number box", () => {
		expect(controlFor("ctc", "set")).toBe("number");
	});
});

describe("what the box starts with", () => {
	it("takes the day off a datetime, because a date box will not show one", () => {
		expect(boxValue({ date_of_joining: "2019-04-01 00:00:00" }, "date_of_joining", "date"))
			.toBe("2019-04-01");
	});

	it("turns a null into an empty box rather than the word null", () => {
		expect(boxValue({ blood_group: null }, "blood_group", "text")).toBe("");
	});

	it("reads a tick as one or nothing", () => {
		expect(boxValue({ x: 1 }, "x", "check")).toBe(1);
		expect(boxValue({ x: null }, "x", "check")).toBe(0);
	});
});

describe("what would be sent", () => {
	const DOC = { cell_number: "9000000001", department: "Production - MR", blood_group: null, ctc: 480000 };

	it("sends only what changed", () => {
		const draft = { cell_number: "9000000002" };
		expect(patchFrom(DOC, draft)).toEqual({ cell_number: "9000000002" });
	});

	it("sends nothing when a box was typed back to what the record says", () => {
		// Otherwise the Save button stays lit over a document nothing would
		// happen to, and the count on the bar lies about what is pending.
		const draft = withEdit(DOC, { cell_number: "9000000002" }, "cell_number", "9000000001");
		expect(draft).toEqual({});
		expect(changedCount(DOC, draft)).toBe(0);
	});

	it("treats an empty box and a column that was never filled as the same document", () => {
		expect(same(null, "")).toBe(true);
		expect(patchFrom(DOC, { blood_group: "" })).toEqual({});
	});

	it("clears a field by sending null rather than an empty string", () => {
		expect(patchFrom(DOC, { cell_number: "" })).toEqual({ cell_number: null });
	});

	it("survives a figure read back off a box as a string", () => {
		expect(patchFrom(DOC, { ctc: "480000" })).toEqual({});
		expect(patchFrom(DOC, { ctc: "500000" })).toEqual({ ctc: "500000" });
	});

	it("never sends a field nobody touched", () => {
		// The whole reason this is a patch. A document sent back whole re-sends
		// every column the read returned — including ones this reader may not
		// write, so a corrected phone number is refused over a salary field; and
		// values that were current when the page loaded, so the second of two
		// people saving quietly undoes the first everywhere they did not type.
		const patch = patchFrom(DOC, { cell_number: "9000000002" });
		expect(Object.keys(patch)).toEqual(["cell_number"]);
	});
});
