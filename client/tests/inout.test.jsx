import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import InOut from "@/features/attendance/InOut";
import { clockOn, dayPeriod, firstLast } from "@/lib/inout";
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

	const NIGHT = { start_time: "20:30:00", end_time: "8:30:00" };

	it("a_night_shift_is_one_day_the_one_it_began_on_with_its_leaving_marked_next_morning", () => {
		const [d, ...rest] = firstLast([P("A", "2026-09-24 20:28:00"), P("A", "2026-09-25 08:32:00")], () => NIGHT);
		expect(rest).toHaveLength(0);
		expect(d).toMatchObject({ date: "2026-09-24", first: "2026-09-24 20:28:00", last: "2026-09-25 08:32:00", punches: 2 });
		expect(d.span).toBe("12 hrs 4 minutes");
		expect(clockOn(d.first, d.date)).toBe("20:28");
		expect(clockOn(d.last, d.date)).toBe("08:32 (+1)");
		expect(dayPeriod(d)).toBe("Night");
	});

	it("a_day_worker_is_day_by_the_first_punch_and_is_never_moved", () => {
		const days = firstLast([P("B", "2026-09-24 08:25:00"), P("B", "2026-09-24 20:35:00"), P("B", "2026-09-25 08:27:00")],
			() => ({ start_time: "8:30:00", end_time: "20:30:00" }));
		expect(days.map((d) => d.date)).toEqual(["2026-09-24", "2026-09-25"]);
		expect(days.map(dayPeriod)).toEqual(["Day", "Day"]);
	});

	it("a_night_with_only_its_morning_leaving_is_night_whatever_that_clock_says", () => {
		const [d] = firstLast([P("A", "2026-09-25 08:32:00")], () => NIGHT);
		expect(d.date).toBe("2026-09-24");
		expect(dayPeriod(d)).toBe("Night");
		expect(clockOn(d.first, d.date)).toBe("08:32 (+1)");
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

	it("first_and_last_joins_a_night_across_midnight_and_every_punch_stops_at_the_range_end", async () => {
		const N = { name: "N1", employee_name: "Night Worker", employee_number: "N1", company: "", status: "Active", default_shift: "Night" };
		set({
			...loadedState(),
			employees: [N], byName: { N1: N },
			shiftWindows: { Night: { name: "Night", start_time: "20:30:00", end_time: "8:30:00" } }, shiftWindowState: "ok",
			io: { ...getState().io, from: "2026-09-24", till: "2026-09-24", view: "day" },
			ioState: "done", ioRan: "2026-09-24 to 2026-09-24",
			/* The read reaches noon on the 25th: the 24th's night ends then. The 24th's own
			   morning was the 23rd's night and is not a day inside the range. */
			ioRows: [P("N1", "2026-09-24 08:29:00"), P("N1", "2026-09-24 20:31:00"), P("N1", "2026-09-25 08:33:00")],
		});
		const r = await page();
		const heads = [...r.container.querySelectorAll("table.io th")].map((th) => th.textContent);
		const body = () => [...r.container.querySelectorAll("table.io tbody tr:not(.grp)")]
			.map((tr) => [...tr.children].map((td) => td.textContent));
		expect(heads.slice(heads.indexOf("First punch"), heads.indexOf("First punch") + 3)).toEqual(["First punch", "Day / Night", "Last punch"]);
		expect(body()).toHaveLength(1);
		const [row] = body();
		expect(row[heads.indexOf("First punch")]).toBe("20:31");
		expect(row[heads.indexOf("Day / Night")]).toBe("Night");
		expect(row[heads.indexOf("Last punch")]).toBe("08:33 (+1)");

		await act(async () => { set({ io: { ...getState().io, view: "" } }); });
		/* Every punch: the 25th's morning was read for the night, and is not a punch of this range. */
		const time = [...r.container.querySelectorAll("table.io th")].map((th) => th.textContent).indexOf("Time");
		expect(body().map((cells) => cells[time])).toEqual(["08:29", "20:31"]);
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
