import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import { store, set, resetStore } from "@/store";
import { PROFILE_PLUMBING } from "@/data/profile";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employees → Employee Profile → All Fields.

   The thirteen panes above it are lists somebody wrote, which is right for a
   screen being held next to Factor HR's and wrong as the whole of a record
   page: a field nobody mapped is read on every open of this page and drawn
   nowhere. This pane is generated from the document instead, and what is worth
   pinning is exactly that — that **every** column the site returned reaches
   the screen, including one this build has never heard of.

   The document is put in the store rather than fetched, because `useEmployeeDoc`
   skips the read when a copy is already there. What is under test is the
   drawing, not the fetching.
   --------------------------------------------------------------------------- */

/** One Employee as the document endpoint returns it: nulls kept, child tables
    whole, and Frappe's own columns on the end. `custom_shift_group` is the
    field this build has never heard of — nothing in `data/profile.js` names it,
    which is the case the pane exists for. */
const DOC = {
	name: "HR-EMP-00001",
	employee_name: "Anand Raghavan",
	employee_number: "MR001",
	status: "Active",
	company: "Manna Rubber",
	department: "Production - MR",
	designation: "Operator",
	date_of_joining: "2019-04-01",
	cell_number: "9000000001",
	custom_shift_group: "Night",
	custom_gate_pass_number: "GP-4471",
	blood_group: null,
	passport_number: "",
	bio: "",
	employee_external_work_history: [
		{ name: "row1", company_name: "Kerala Rubber", designation: "Helper", salary: 12000 },
	],
	employee_internal_work_history: [],
	doctype: "Employee",
	docstatus: 0,
	idx: 0,
	owner: "hr@example.invalid",
	creation: "2019-04-01 09:00:00",
	modified: "2026-08-25 11:12:13",
	modified_by: "it@mannarubber.com",
};

const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);

const text = (view) => view.container.textContent;

/** The pane, with one document already read. */
function open(view, tab = "all") {
	act(() => { set({ proftab: tab }); });
	return view;
}

const toggle = (view) =>
	view.container.querySelector(".proallck input");

const find = (view) =>
	view.container.querySelector('.proall input[type="search"]');

const type = (el, v) => act(() => { fireEvent.change(el, { target: { value: v } }); });

beforeEach(() => {
	resetStore();
	set(loadedState());
	set({ empSel: "HR-EMP-00001", empDoc: { "HR-EMP-00001": DOC }, proftab: "all" });
});

describe("All Fields draws the whole record", () => {
	it("shows a field no pane above maps", () => {
		const view = draw();
		expect(text(view)).toContain("custom_shift_group");
		expect(text(view)).toContain("Night");
	});

	it("marks the unmapped ones, because this is the only screen showing them", () => {
		const view = draw();
		const only = [...view.container.querySelectorAll(".profield")]
			.filter((f) => f.querySelector(".only"))
			.map((f) => f.querySelector(".fn").textContent);
		expect(only).toContain("custom_shift_group");
		expect(only).toContain("custom_gate_pass_number");
		/* Drawn by the About pane, so it is not "only here" — the marker has to
		   mean something or it is decoration on every row. */
		expect(only).not.toContain("employee_name");
	});

	it("reaches every field on the document once the empty ones are shown", () => {
		const view = draw();
		act(() => { toggle(view).click(); });

		const shown = [...view.container.querySelectorAll(".profield .fn")].map((e) => e.textContent);
		const want = Object.keys(DOC)
			.filter((k) => !Array.isArray(DOC[k]) && !PROFILE_PLUMBING.has(k));
		for (const k of want) expect(shown).toContain(k);
	});

	it("hides the empty ones by default and says how many there are", () => {
		const view = draw();
		expect(text(view)).not.toContain("blood_group");
		/* blood_group (null), passport_number ("") and bio ("") */
		expect(text(view)).toContain("Show the 3 empty");

		act(() => { toggle(view).click(); });
		expect(text(view)).toContain("blood_group");
		expect(text(view)).toContain("not set");
	});

	it("counts what the panes above leave out", () => {
		const view = draw();
		expect(text(view)).toContain("on no pane above");
	});

	it("finds a field by its fieldname as well as its label", () => {
		const view = draw();
		type(find(view), "gate_pass");
		const left = [...view.container.querySelectorAll(".profield .fn")].map((e) => e.textContent);
		expect(left).toEqual(["custom_gate_pass_number"]);

		type(find(view), "Shift Group");
		expect([...view.container.querySelectorAll(".profield .fn")].map((e) => e.textContent))
			.toEqual(["custom_shift_group"]);
	});

	it("says so rather than drawing nothing when the search matches no field", () => {
		const view = draw();
		type(find(view), "gratuity");
		expect(text(view)).toContain("Nothing matches");
	});

	it("draws every child table, including the empty one", () => {
		const view = draw();
		expect(text(view)).toContain("Employee External Work History · 1 rows");
		expect(text(view)).toContain("Kerala Rubber");
		expect(text(view)).toContain("Employee Internal Work History · 0 rows");
	});

	it("keeps Frappe's own columns apart from the person's", () => {
		const view = draw();
		const plumbing = [...view.container.querySelectorAll(".profield .fn")]
			.map((e) => e.textContent)
			.filter((k) => PROFILE_PLUMBING.has(k));
		/* Shown — "who typed this and when" is a real question about a record —
		   but under their own rule, and never carrying the "only here" marker. */
		expect(plumbing).toContain("modified_by");
		expect(text(view)).toContain("it@mannarubber.com");
	});

	it("leaves the thirteen panes above alone", () => {
		const view = open(draw(), "about");
		expect(text(view)).toContain("Anand Raghavan");
		expect(view.container.querySelector(".proall")).toBeNull();
	});

	it("draws no explanation under a pane, only its fields", () => {
		/* HR asked on 12 October 2026 for labels only on the website: the pane
		   notes that used to sit under each pane are gone. */
		const view = open(draw(), "separation");
		expect(text(view)).not.toContain("344 people have left");
		expect(view.container.querySelector(".pronote")).toBeNull();
	});
});

describe("what came across from Factor HR's Employee Detail Report", () => {
	/* tools/load_employee_detail.py writes these onto fields the app adds. The
	   panes read those fields, and say so when the site has not been given one
	   yet — a blank is a different finding from a field that does not exist. */
	const withLoaded = (extra) => {
		set({ empDoc: { "HR-EMP-00001": { ...DOC, ...extra } } });
	};

	it("shows the IFSC beside the bank account", () => {
		withLoaded({ bank_name: "UNION BANK OF INDIA", bank_ac_no: "000000000000", custom_ifsc: "UBIN0533793" });
		const view = open(draw(), "bank");
		expect(text(view)).toContain("UBIN0533793");
		expect(text(view)).toContain("UNION BANK OF INDIA");
	});

	it("shows the group joining and last working dates on Joining Details", () => {
		withLoaded({ custom_group_joining_date: "2013-09-30", custom_last_working_date: "2024-11-23" });
		const view = open(draw(), "joining");
		expect(text(view)).toContain("30-Sep-2013");
		expect(text(view)).toContain("23-Nov-2024");
	});

	it("says a field is missing from the site rather than empty, until it has been added", () => {
		const view = open(draw(), "bank");
		const row = [...view.container.querySelectorAll(".profield")].find((r) => r.textContent.startsWith("IFSC"));
		expect(row.textContent).toContain("no such field here");
	});
});
