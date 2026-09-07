import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Categories from "@/features/employees/Categories";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employees → Categories → + Add, all the way to the site and back.

   This screen used to hand the answers to Frappe's own form in another tab and
   call that a save. It creates the field now, so what is worth pinning is the
   round trip rather than the layout: what goes over the wire, that the list is
   re-read from the site rather than patched locally, that a refusal is shown
   instead of swallowed, and that the new category is a row of the table
   afterwards.

   `@/api/client` is mocked rather than the layer above it, so `ctDoc`, the two
   inversions and the read-back in api/categorytype.js are all under test. Both
   calls are recorded and asserted on, because "it did not throw" and "it sent
   the right document" are very different claims to make about a change to the
   shape of every Employee record on the site.
   --------------------------------------------------------------------------- */

const calls = { created: [], listed: [] };
let creates;          // what apiCreate does, per test
let rowsAfter = [];   // what the read-back answers with

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiCreate: (...a) => {
			calls.created.push(a);
			return creates(...a);
		},
		listAll: (...a) => {
			calls.listed.push(a);
			return Promise.resolve(rowsAfter);
		},
	};
});

/** One `Custom Field` as the site hands it back. */
const CF = (over = {}) => ({
	name: "Employee-custom_cat_shift_group",
	fieldname: "custom_cat_shift_group",
	label: "Shift Group",
	fieldtype: "Select",
	options: "Day\nNight",
	reqd: 0, hidden: 0, in_standard_filter: 1,
	description: "", creation: "2026-09-05 10:00:00",
	...over,
});

const draw = () => render(<Provider store={store}><Categories /></Provider>);

const text = (view) => view.container.textContent;

/** The form as somebody fills it: open + Add, then type. */
function fill(view, { code = "Shift Group", desc = "Shift Group", values = ["Day", "Night"] } = {}) {
	act(() => {
		[...view.container.querySelectorAll("button")]
			.find((b) => b.textContent.trim() === "+ Add").click();
	});
	const type = (sel, v) => act(() => {
		fireEvent.change(view.container.querySelector(sel), { target: { value: v } });
	});
	if (code) type("#ct_code", code);
	type("#ct_desc", desc);
	values.forEach((v, i) => {
		if (i > 0) act(() => view.container.querySelector(".ctadd").click());
		type(`[aria-label="Custom field ${i + 1}"]`, v);
	});
}

const save = async (view) => {
	await act(async () => {
		[...view.container.querySelectorAll(".modal .foot button")]
			.find((b) => /^Sav/.test(b.textContent.trim())).click();
	});
};

beforeEach(() => {
	resetStore();
	calls.created = [];
	calls.listed = [];
	rowsAfter = [];
	creates = async () => CF();
	act(() => set(loadedState()));
});

describe("+ Add creates the category type", () => {
	it("opens their Create Category Type on the + Add", () => {
		const view = draw();
		expect(getState().catnew.open).toBe(false);
		fill(view, { values: [] });
		expect(view.container.querySelector("#dlgtitle").textContent).toBe("Create Category Type");
	});

	it("sends one Custom Field on Employee, with the values as its options", async () => {
		rowsAfter = [CF()];
		const view = draw();
		fill(view);
		await save(view);

		expect(calls.created).toHaveLength(1);
		const [label, doc] = calls.created[0];
		expect(label).toBe("Custom Field");
		expect(doc).toMatchObject({
			dt: "Employee",
			fieldname: "custom_cat_shift_group",
			label: "Shift Group",
			fieldtype: "Select",
			options: "Day\nNight",
		});
	});

	/* The prefix is what tells a category type apart from the seven custom
	   fields already on Employee for the passport block. Without it this screen
	   lists somebody's PAN number as a category. */
	it("names the field under the category prefix, never bare custom_", async () => {
		const view = draw();
		fill(view, { values: [] });
		await save(view);
		expect(calls.created[0][1].fieldname).toBe("custom_cat_shift_group");
	});

	/* An empty table is an answer, not an unfinished form — see CT_CUSTOM_WHY. */
	it("makes a category with no values a free-text field rather than an empty list", async () => {
		const view = draw();
		fill(view, { values: [] });
		await save(view);
		expect(calls.created[0][1].fieldtype).toBe("Data");
		expect(calls.created[0][1].options).toBeUndefined();
	});

	/* Both of these read the opposite way round on the two systems, and one of
	   them backwards hides a category somebody then cannot find. */
	it("inverts Is Visible on the way over", async () => {
		const view = draw();
		fill(view, { values: [] });
		act(() => {
			fireEvent.change(view.container.querySelector("#ct_visible"), { target: { value: "false" } });
		});
		await save(view);
		expect(calls.created[0][1].hidden).toBe(1);
		expect(calls.created[0][1].in_standard_filter).toBe(1);
	});

	it("reads the list back off the site rather than pushing the new row into the store", async () => {
		rowsAfter = [CF()];
		const view = draw();
		fill(view);
		await save(view);
		expect(calls.listed).toHaveLength(1);
		expect(calls.listed[0][0]).toBe("Custom Field");
		expect(getState().empFields).toEqual([CF()]);
	});
});

describe("the new category on the screen", () => {
	it("is a row of Category Type, after Factor HR's own", async () => {
		rowsAfter = [CF()];
		const view = draw();
		fill(view);
		await save(view);

		const names = [...view.container.querySelectorAll("tbody tr td:nth-child(2)")]
			.map((td) => td.textContent);
		expect(names[0]).toContain("Company Name");
		expect(names[names.length - 1]).toContain("Shift Group");
	});

	/* **Two cases were removed here on 5 September 2026**, and what they tested
	   went with them rather than breaking: Factor HR's *View Category* — the
	   second screen listing the values a category can take — was taken off this
	   page, so "opens onto the values the field holds" and "does not count a
	   brand new category off the people" had nothing left to open.

	   Both said something true and neither says it here any more. The first is
	   now `createCategoryType` reading the field back with its Options intact,
	   which the API tests above cover; the second was about a field created a
	   minute ago not being on the employee records this page loaded, which is a
	   property of the read rather than of any screen. If View Category comes
	   back, they come back with it. */

	it("says so when the site would not say which category types it holds", () => {
		act(() => set({ empFieldsState: "denied" }));
		const view = draw();
		expect(text(view)).toContain("may not read Custom Field");
	});
});

describe("when it cannot be saved", () => {
	it("prints what the site refused it with, and keeps the form open", async () => {
		creates = async () => {
			throw new Error("Not permitted: Custom Field");
		};
		const view = draw();
		fill(view);
		await save(view);

		expect(getState().catnew.open).toBe(true);
		expect(getState().catnew.bad).toBe(true);
		expect(view.container.querySelector(".modal .gap").textContent)
			.toContain("Not permitted: Custom Field");
		/* Nothing was read back, because nothing was created. */
		expect(calls.listed).toHaveLength(0);
	});

	it("refuses a second field with a name the site already holds, before the round trip", async () => {
		act(() => set({ empFields: [CF()], empFieldsState: "ok" }));
		const view = draw();
		fill(view);
		expect(text(view)).toContain("already holds a category type stored as custom_cat_shift_group");
		await save(view);
		expect(calls.created).toHaveLength(0);
	});

	it("will not save a category with no code, because the code is the fieldname", async () => {
		const view = draw();
		fill(view, { code: "", desc: "Nameless", values: [] });
		await save(view);
		expect(calls.created).toHaveLength(0);
	});
});
