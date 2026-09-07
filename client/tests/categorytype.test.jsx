import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Categories from "@/features/employees/Categories";
import { store, set, getState, resetStore } from "@/store";
import { SITE_CATEGORY_TYPES } from "@/data/masters";
import { CT_RCD, ctSeed } from "@/data/categorytype";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The ⓘ and the ✎ on a Category Type row.

   Two dialogs, one component, and the reason it is one component is the reason
   this file exists: **a read-only form that has fallen a field behind the
   editable one is a form nobody can check anything against.** The first test
   here is that the two draw the same controls, and it is written so that adding
   a control to one and not the other fails rather than passes quietly.

   The other half is the destination. A category type that reads onto a field on
   `Employee` is edited through Customize Form; one that reads onto nothing has
   no field to customise, and Save says so instead of guessing. Sending an edit
   down + Add's route would put a second `department` on Employee beside the one
   already there — which imports, reports and reads as a real field right up
   until somebody notices half the company is filed under the other one.
   --------------------------------------------------------------------------- */

const COMPANY = SITE_CATEGORY_TYPES.find((t) => t.dt === "Company");

/** A category created on this screen, with no values on it yet — the one row
    that can still draw an empty Custom Field table. It replaced Factor HR's
    Gratuity Applicable here, which drew one for a different reason: it read
    onto nothing at all, and it was a row transcribed off a screenshot rather
    than anything this site held. */
const EMPTY_CF = {
	name: "Employee-custom_cat_shift_group",
	fieldname: "custom_cat_shift_group",
	label: "Shift Group",
	fieldtype: "Select",
	options: "",
	reqd: 0, hidden: 0, in_standard_filter: 1,
	description: "", creation: "2026-09-05 10:00:00",
};

const draw = () => render(<Provider store={store}><Categories /></Provider>);

/** The dialog as the page opens it, so a change to the icon's handler is a
    change this file sees. */
function open(mode, name) {
	const view = draw();
	const row = [...view.container.querySelectorAll("tbody tr")]
		.find((tr) => tr.textContent.includes(name));
	const label = mode === "view" ? "View this category type" : "Edit this category type";
	act(() => {
		within(row).getByLabelText(label).click();
	});
	return view;
}

beforeEach(() => {
	resetStore();
	act(() => set(loadedState()));
});

describe("the two dialogs", () => {
	it("opens View Category Type from the ⓘ, for the row it is on", () => {
		const { container } = open("view", COMPANY.name);
		expect(container.querySelector("#dlgtitle").textContent).toBe("View Category Type");
		expect(getState().catdlg.name).toBe(COMPANY.name);
	});

	it("opens Edit Category Type from the ✎, for the row it is on", () => {
		const { container } = open("edit", COMPANY.name);
		expect(container.querySelector("#dlgtitle").textContent).toBe("Edit Category Type");
		expect(getState().catdlg.mode).toBe("edit");
	});

	it("draws the same controls in both modes, labelled the same way", () => {
		/* The whole reason the two are one component. Labels rather than inputs,
		   because in View half of them are not inputs at all — which is exactly
		   the difference that must not become a missing field. */
		const labels = (c) => [...c.querySelectorAll(".ctf > .k, .ctchk")]
			/* The six report names are `.ctchk` too, inside the list this control
			   opens — they are the control's *value*, not another field, and in
			   View that list is closed. Counting them would make the two modes
			   differ for a reason that is not a missing field. */
			.filter((el) => !el.closest(".ctrcd"))
			.map((el) => el.textContent.replace(/\s*\*$/, "").trim());

		const v = open("view", COMPANY.name);
		const seen = labels(v.container);
		v.unmount();

		const e = open("edit", COMPANY.name);
		expect(labels(e.container)).toEqual(seen);
	});

	it("shows a dash, not a blank, for every property Factor HR keeps and this site does not", () => {
		/* A blank beside a label reads as a value that failed to load; a dash
		   reads as a value that is not there. On this dialog the dash is the
		   finding — their Category Type master has no equivalent here. */
		const { container } = open("view", COMPANY.name);
		const none = [...container.querySelectorAll(".ctv.none")];
		expect(none.length).toBeGreaterThan(0);
		none.forEach((el) => expect(el.textContent).toBe("—"));
	});

	it("fills Description from the row, so the dialog is about the row it was opened from", () => {
		const { container } = open("view", COMPANY.name);
		const desc = [...container.querySelectorAll(".ctf")]
			.find((el) => el.querySelector(".k").textContent.startsWith("Description"));
		expect(desc.querySelector(".ctv").textContent).toBe(COMPANY.name);
	});
});

describe("the Custom Field table", () => {
	it("opens filled with the values the site actually holds", () => {
		/* Their table read as the values this category may take. For a type with
		   a master behind it those are one click away on the same screen, so the
		   dialog does not ask anybody to retype them. */
		open("edit", COMPANY.name);
		const names = getState().companies.map((c) => c.name);
		expect(getState().catdlg.custom).toEqual(names);
	});

	it("says so in words when there is nothing behind the category", () => {
		act(() => set({ empFields: [EMPTY_CF] }));
		const { container } = open("view", EMPTY_CF.label);
		expect(container.querySelector(".ctnone").textContent).toContain("No Custom Field Available");
	});

	it("takes a new row and gives it back", () => {
		const { container } = open("edit", COMPANY.name);
		const before = getState().catdlg.custom.length;
		act(() => { container.querySelector(".ctadd").click(); });
		expect(getState().catdlg.custom).toHaveLength(before + 1);
	});
});

describe("Report Category Display", () => {
	it("offers the six from their screen, in their order", () => {
		const { container } = open("edit", COMPANY.name);
		act(() => { fireEvent.click(container.querySelector(".ctsel")); });
		const items = [...container.querySelectorAll(".ctrcd .ctchk")].map((el) => el.textContent.trim());
		expect(items).toEqual(CT_RCD);
	});

	it("is inert on the read-only form, where nothing has ever been read into it", () => {
		const { container } = open("view", COMPANY.name);
		expect(container.querySelector(".ctsel").disabled).toBe(true);
	});

	it("counts what is ticked, so a closed list still says how many", () => {
		const { container } = open("edit", COMPANY.name);
		act(() => { fireEvent.click(container.querySelector(".ctsel")); });
		act(() => { fireEvent.click(container.querySelectorAll(".ctrcd .ctchk input")[0]); });
		expect(getState().catdlg.rcd).toEqual([CT_RCD[0]]);
		expect(container.querySelector(".ctsel").textContent).toContain(`1 of ${CT_RCD.length}`);
	});
});

describe("what Save opens", () => {
	it("sends a category that reads onto a field to Customize Form, never to a new Custom Field", () => {
		/* The trap. + Add creates a field; Edit changes one that exists. Down the
		   wrong route this adds a second `department` to Employee beside the
		   first, and both look real to every read afterwards. */
		act(() => set({ site: "https://site.example" }));
		const { container } = open("edit", COMPANY.name);
		const save = [...container.querySelectorAll(".modal .foot a, .modal .foot button")]
			.find((el) => el.textContent.trim() === "Save");
		expect(save.getAttribute("href")).toContain("/app/customize-form?doc_type=Employee");
		expect(save.getAttribute("href")).not.toContain("custom-field");
	});

	/* **Two cases were removed here on 7 September 2026.** Save had a second
	   destination — a refusal, for a category type that reads onto no field on
	   this side — and the only two rows ever in that state were Factor HR's
	   Gratuity Applicable and LWF Applicable, transcribed off a screenshot of
	   their master. The rows are read from the site now, every one of them is a
	   field on Employee, and a branch nothing can reach is a branch no test can
	   defend. See SITE_CATEGORY_TYPES. */

	it("carries every answer with nowhere to land into the description, and shows it first", () => {
		const { container } = open("edit", COMPANY.name);
		act(() => {
			fireEvent.change(container.querySelector("#ctd_rprio"), { target: { value: "3" } });
		});
		const what = container.querySelector(".ctwhat pre").textContent;
		expect(what).toContain("Report Display Priority: 3");
	});
});

describe("the view dialog's way into the edit one", () => {
	it("switches mode in place rather than opening a second dialog", () => {
		const { container } = open("view", COMPANY.name);
		const edit = [...container.querySelectorAll(".modal .foot button")]
			.find((el) => el.textContent.trim() === "Edit");
		act(() => { edit.click(); });
		expect(getState().catdlg.mode).toBe("edit");
		expect(getState().catdlg.name).toBe(COMPANY.name);
		expect(container.querySelectorAll(".modal")).toHaveLength(1);
	});
});

describe("ctSeed", () => {
	it("opens on the type it was given, in the mode it was given", () => {
		const c = ctSeed(getState(), COMPANY, "edit");
		expect(c).toMatchObject({ open: true, mode: "edit", name: COMPANY.name });
		expect(c.f.desc).toBe(COMPANY.name);
	});

	it("hands back a fresh object every time", () => {
		/* Two callers sharing a mutable literal is how a dialog reopened comes
		   back holding the last one's typing — the same reason NEW_EMP_BLANK and
		   CT_BLANK are functions. */
		const a = ctSeed(getState(), COMPANY, "view");
		const b = ctSeed(getState(), COMPANY, "view");
		a.f.desc = "changed";
		a.custom.push("changed");
		expect(b.f.desc).toBe(COMPANY.name);
		expect(b.custom).not.toContain("changed");
	});
});
