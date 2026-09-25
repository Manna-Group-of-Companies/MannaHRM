import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import InOut from "@/features/attendance/InOut";
import { firstLast } from "@/lib/inout";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The In / Out report's form, First & last view and coloured Excel.
   --------------------------------------------------------------------------- */

const P = (employee, time, extra = {}) => ({ name: `${employee}-${time}`, employee, time, ...extra });

describe("first and last", () => {
	it("takes_the_earliest_and_latest_punch_of_each_person_on_each_day", () => {
		const out = firstLast([
			P("A", "2026-09-24 08:00:00"), P("A", "2026-09-24 12:30:00"), P("A", "2026-09-24 17:15:00"),
			P("A", "2026-09-25 08:05:00"),
		]);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({ date: "2026-09-24", first: "2026-09-24 08:00:00", last: "2026-09-24 17:15:00", punches: 3 });
		expect(out[0].span).toBe("9 hrs 15 minutes");
	});

	it("leaves_the_last_punch_and_span_empty_on_a_day_with_one_punch", () => {
		expect(firstLast([P("A", "2026-09-24 08:00:00")])[0]).toMatchObject({ last: "", span: "", punches: 1 });
	});
});

async function page() {
	let out;
	await act(async () => { out = render(<Provider store={store}><InOut /></Provider>); });
	return out;
}

describe("the page", () => {
	beforeEach(() => resetStore());

	it("opens_already_generated_from_todays_loaded_punches", async () => {
		set(loadedState());
		const r = await page();
		expect(r.container.querySelector("table.io")).not.toBeNull();
		expect(r.container.querySelector(".tiles")).toBeNull();
		expect(getState().ioState).toBe("");
	});

	it("switches_to_one_row_per_person_per_day", async () => {
		set(loadedState());
		const r = await page();
		const btn = [...r.container.querySelectorAll("button")].find((b) => b.textContent === "First & last");
		await act(async () => { fireEvent.click(btn); });
		expect(getState().io.view).toBe("day");
		const heads = [...r.container.querySelectorAll("table.io th")].map((th) => th.textContent);
		expect(heads).toContain("First punch");
		expect(heads).toContain("Last punch");
	});

	it("draws_company_status_employee_date_and_format_and_nothing_else", async () => {
		set(loadedState());
		const r = await page();
		for (const l of ["Company", "Employee status", "Employee", "From date", "To date", "Format"]) {
			expect(r.getByLabelText(l)).toBeTruthy();
		}
		expect(r.queryByText("Report Criteria")).toBeNull();
		expect(r.getByText("Download")).toBeTruthy();
	});

	it("narrows_the_report_to_the_one_employee_picked", async () => {
		set(loadedState());
		const r = await page();
		const all = r.container.querySelectorAll("table.io tbody tr:not(.grp)").length;
		const pick = r.getByRole("combobox", { name: "Employee" });
		const person = getState().employees.find((e) => e.employee_name);
		await act(async () => {
			fireEvent.focus(pick);
			fireEvent.change(pick, { target: { value: person.employee_name } });
			fireEvent.keyDown(pick, { key: "Enter" });
		});
		const who = getState().io.who;
		expect(who).toBeTruthy();
		expect(getState().employees.find((e) => e.name === who).employee_name).toContain(person.employee_name);
		const rows = r.container.querySelectorAll("table.io tbody tr:not(.grp)").length;
		expect(rows).toBeLessThanOrEqual(all);
	});
});
