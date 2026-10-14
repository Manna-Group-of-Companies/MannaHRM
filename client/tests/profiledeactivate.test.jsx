import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import EmployeeCard from "@/components/EmployeeCard";
import EmployeeMaster from "@/features/employees/EmployeeMaster";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employees → Employee Profile → Deactivate (3 October 2026).

   Deactivate writes one field, `status: "Inactive"`, as the signed-in person.
   Once somebody is not Active the page draws their name and status and nothing
   else — on the profile, on their card, and on the list view — until they are
   activated again. What is pinned:

   - it asks before it writes, because the next thing that happens is the
     person's details going off every screen here;
   - the write is the status alone, never the record sent back whole;
   - a refusal is shown in the site's own words, and nothing is hidden;
   - not Active means hidden whatever the status is called — Inactive, Left,
     Suspended — and only Inactive is offered Activate.
   --------------------------------------------------------------------------- */

const wrote = [];
let writes;

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

const DOC = {
	name: "HR-EMP-00001",
	employee_name: "Anand Raghavan",
	employee_number: "MR001",
	status: "Active",
	company: "Manna Rubber",
	department: "Production - MR",
	designation: "Operator",
	cell_number: "9000000001",
	date_of_joining: "2019-04-01",
	doctype: "Employee",
	docstatus: 0,
};

const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);
const text = (v) => v.container.textContent;
const button = (v, label) =>
	[...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const click = (el) => act(async () => { el.click(); });

/** What the page would read back from the site after the write: the same
    record with the status it was just given. */
const siteNowSays = (status) => act(() => {
	set({ empDoc: { ...getState().empDoc, "HR-EMP-00001": { ...DOC, status } } });
});

beforeEach(() => {
	wrote.length = 0;
	writes = () => Promise.resolve({ ok: true });
	resetStore();
	set(loadedState());
	set({ empSel: "HR-EMP-00001", empDoc: { "HR-EMP-00001": DOC }, proftab: "about" });
});

describe("Deactivate on the profile", () => {
	it("asks_before_it_writes_anything", async () => {
		const v = draw();
		await click(button(v, "Deactivate"));
		expect(wrote).toHaveLength(0);
		expect(button(v, "Yes, deactivate")).toBeTruthy();

		await click(button(v, "Cancel"));
		expect(wrote).toHaveLength(0);
		expect(button(v, "Deactivate")).toBeTruthy();
	});

	it("writes_the_status_inactive_and_nothing_else", async () => {
		const v = draw();
		await click(button(v, "Deactivate"));
		await click(button(v, "Yes, deactivate"));
		expect(wrote).toEqual([["Employee", "HR-EMP-00001", { status: "Inactive" }]]);
	});

	it("marks_the_card_row_inactive_without_a_reload", async () => {
		const v = draw();
		await click(button(v, "Deactivate"));
		await click(button(v, "Yes, deactivate"));
		expect(getState().byName["HR-EMP-00001"].status).toBe("Inactive");
		expect(getState().employees.find((e) => e.name === "HR-EMP-00001").status).toBe("Inactive");
	});

	it("hides_the_details_once_the_site_says_inactive", async () => {
		const v = draw();
		expect(text(v)).toContain("MR001");
		await click(button(v, "Deactivate"));
		await click(button(v, "Yes, deactivate"));
		siteNowSays("Inactive");

		expect(text(v)).toContain("Anand Raghavan");
		expect(text(v)).toContain("Inactive");
		expect(text(v)).toContain("details are hidden");
		expect(text(v)).not.toContain("MR001");
		expect(text(v)).not.toContain("9000000001");
		expect(v.container.querySelector(".protabs")).toBeNull();
	});

	it("shows_the_sites_refusal_and_hides_nothing", async () => {
		writes = () => Promise.resolve({ ok: false, error: "Insufficient Permission for Employee" });
		const v = draw();
		await click(button(v, "Deactivate"));
		await click(button(v, "Yes, deactivate"));
		expect(text(v)).toContain("The site refused this: Insufficient Permission for Employee");
		expect(getState().byName["HR-EMP-00001"].status).toBe("Active");
		expect(text(v)).toContain("MR001");
	});

	it("is_not_offered_while_the_record_is_being_edited", async () => {
		const v = draw();
		await click(button(v, "✎ Edit"));
		expect(button(v, "Deactivate")).toBeUndefined();
	});
});

describe("somebody who is not active", () => {
	it("is_offered_activate_which_writes_the_status_active", async () => {
		set({ empDoc: { "HR-EMP-00001": { ...DOC, status: "Inactive" } } });
		const v = draw();
		await click(button(v, "Activate"));
		expect(wrote).toEqual([["Employee", "HR-EMP-00001", { status: "Active" }]]);
		siteNowSays("Active");
		expect(text(v)).toContain("MR001");
		expect(button(v, "Deactivate")).toBeTruthy();
	});

	it("is_hidden_whatever_the_status_is_called_and_only_inactive_is_offered_activate", () => {
		for (const status of ["Left", "Suspended"]) {
			/* The record and the list row agree, as they do when both are read
			   from the site. */
			const row = { ...getState().byName["HR-EMP-00001"], status };
			set({
				empDoc: { "HR-EMP-00001": { ...DOC, status } },
				byName: { ...getState().byName, "HR-EMP-00001": row },
				employees: getState().employees.map((e) => (e.name === row.name ? row : e)),
			});
			const v = draw();
			expect(text(v)).toContain(status);
			expect(text(v)).not.toContain("MR001");
			expect(button(v, "Activate")).toBeUndefined();
			v.unmount();
		}
	});

	it("has_a_card_with_the_name_and_status_and_no_details", () => {
		const e = { ...loadedState().employees[0], status: "Inactive" };
		const v = render(<EmployeeCard e={e} onOpen={() => {}} />);
		expect(text(v)).toContain(e.employee_name);
		expect(text(v)).toContain("Inactive");
		expect(text(v)).not.toContain(e.employee_number);
		expect(text(v)).not.toContain(e.designation);
	});

	it("is_off_employee_master_until_somebody_asks_for_inactive", async () => {
		const base = loadedState();
		const employees = base.employees.map((e, i) => (i === 0 ? { ...e, status: "Inactive" } : e));
		set({ ...base, employees, byName: Object.fromEntries(employees.map((e) => [e.name, e])) });
		const gone = employees[0];

		let v;
		await act(async () => { v = render(<Provider store={store}><EmployeeMaster /></Provider>); });
		const names = () => [...v.container.querySelectorAll("article.ecard")].map((a) => a.textContent);
		expect(names().some((t) => t.includes(gone.employee_name))).toBe(false);

		await act(async () => { set({ empstatus: "Inactive" }); });
		const card = names().find((t) => t.includes(gone.employee_name));
		expect(card).toBeTruthy();
		expect(card).not.toContain(gone.employee_number);
	});
});
