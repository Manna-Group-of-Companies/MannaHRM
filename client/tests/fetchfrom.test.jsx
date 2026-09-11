import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import RecordForm from "@/features/records/RecordForm";
import { SCHEMA } from "@/data/schema";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Picking somebody on a record form, and seeing who you picked.

   The form this matters most on is `Employee Attendance Regularization` — the
   one whose two datetime fields are labelled **Punch In** and **Punch Out**.
   Writing one of those writes somebody a punch they are paid for, and until
   now the Employee box was a bare text input with no list on it and the Name
   beside it stayed at "—" until after the record had been saved. So the moment
   at which somebody could check they had the right person was the moment after
   it was too late to check.

   The site applies `fetch_from` on save either way, so none of this is about
   what ends up stored. It is about the form telling the truth while it is
   being filled in.
   --------------------------------------------------------------------------- */

const REG = "Employee Attendance Regularization";

async function form(doctype, doc) {
	let out;
	await act(async () => {
		out = render(
			<Provider store={store}>
				<RecordForm doctype={doctype} doc={doc} onDone={() => {}} onCancel={() => {}} />
			</Provider>,
		);
	});
	return out;
}

/** The readonly cells, which is where anything fetched is drawn. */
const readonly = (r) => [...r.container.querySelectorAll(".ro")].map((n) => n.textContent);

describe("the Punch In form fetches the person it is about", () => {
	beforeEach(() => resetStore());

	it("offers_the_people_to_pick_from_rather_than_an_id_typed_from_memory", async () => {
		set(loadedState());
		const r = await form(REG);
		const box = r.container.querySelector("#rf-employee");
		expect(box.getAttribute("list")).toBeTruthy();
		const opts = r.container.querySelectorAll(`#${box.getAttribute("list")} option`);
		expect(opts.length).toBe(getState().employees.length);
	});

	it("names_the_person_by_name_and_code_because_nobody_knows_their_own_HR_EMP_number", async () => {
		set(loadedState());
		const r = await form(REG);
		const first = getState().employees[0];
		const opt = r.container.querySelector(`option[value="${first.name}"]`);
		expect(opt.textContent).toContain(first.employee_name);
		expect(opt.textContent).toContain(first.employee_number);
	});

	it("fills_the_name_and_company_the_moment_an_employee_is_picked", async () => {
		set(loadedState());
		const who = getState().employees[0];
		const r = await form(REG);
		expect(readonly(r)).toContain("—");

		await act(async () => {
			fireEvent.change(r.container.querySelector("#rf-employee"), { target: { value: who.name } });
		});
		const cells = readonly(r);
		expect(cells).toContain(who.employee_name);
		expect(cells).toContain(who.company);
	});

	it("empties_the_old_persons_name_when_the_employee_is_changed_to_one_it_cannot_resolve", async () => {
		/* A correction showing the previous person's name beside a new employee
		   id is worse than one showing nothing: it reads as confirmation. */
		set(loadedState());
		const who = getState().employees[0];
		const r = await form(REG);
		const box = r.container.querySelector("#rf-employee");

		await act(async () => fireEvent.change(box, { target: { value: who.name } }));
		expect(readonly(r)).toContain(who.employee_name);

		await act(async () => fireEvent.change(box, { target: { value: "HR-EMP-99999" } }));
		expect(readonly(r)).not.toContain(who.employee_name);
	});

	it("does_it_on_every_doctype_that_declares_it_not_only_on_the_correction", async () => {
		/* Eight of the twenty-one carry a fetch-from. The rule is the schema's,
		   so a doctype that grows one is covered without anybody editing this. */
		set(loadedState());
		const who = getState().employees[0];
		const carriers = Object.values(SCHEMA)
			.filter((d) => d.fields.some((f) => f.from === "employee.employee_name"))
			.map((d) => d.name);
		expect(carriers.length).toBeGreaterThan(1);

		let checked = 0;
		for (const dt of carriers) {
			const r = await form(dt);
			const box = r.container.querySelector("#rf-employee");
			expect(box, `${dt} has no Employee box on its form`).toBeTruthy();
			await act(async () => fireEvent.change(box, { target: { value: who.name } }));
			expect(readonly(r), `${dt} did not fetch the name`).toContain(who.employee_name);
			checked += 1;
			r.unmount();
		}
		/* The loop above is the assertion, so it has to be able to fail by not
		   running — a `continue` on a missing box would make this pass on a
		   schema where every form had lost its Employee field. */
		expect(checked).toBe(carriers.length);
	});

	it("leaves_a_link_this_app_holds_no_list_for_alone_rather_than_blanking_it", async () => {
		/* `loan_type.interest_type` has no store list behind it, so there is
		   nothing to resolve from and the site fills it on save. What must not
		   happen is the form deciding it is empty. */
		set(loadedState());
		const r = await form("Employee Loan Application");
		const box = r.container.querySelector("#rf-loan_type");
		expect(box).toBeTruthy();
		/* No datalist, because this app loads no Employee Loan Type list — which
		   is the state being tested, not an oversight in the fixture. */
		expect(box.getAttribute("list")).toBeNull();
		await act(async () => fireEvent.change(box, { target: { value: "Festival Advance" } }));
		expect(box.value).toBe("Festival Advance");
	});
});
