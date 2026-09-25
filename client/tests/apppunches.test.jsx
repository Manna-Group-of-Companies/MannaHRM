import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, resetStore } from "@/store";
import AppPunches from "@/features/attendance/AppPunches";
import { apDaily, apGrid, apTotals, cellLetter, fenceText, hm } from "@/lib/apppunches";

/* ---------------------------------------------------------------------------
   App Punches' reports — a day per person, a line per person, the month as a
   grid. What matters is that a night shift is one day and not two, that a
   missing punch is called missing rather than zero hours, and that the fence
   is the server's word, repeated.
   --------------------------------------------------------------------------- */

const p = (employee, time, log_type, extra = {}) => ({
	name: `${employee}-${time}`, employee, employee_name: employee === "E1" ? "Anil" : "Mary", time, log_type,
	device_id: "PHONE-x", ...extra,
});

describe("the daily summary", () => {
	it("pairs_the_first_in_with_the_last_out_of_the_day", () => {
		const [d] = apDaily([
			p("E1", "2026-09-01 08:30:00", "IN"), p("E1", "2026-09-01 13:00:00", "OUT"),
			p("E1", "2026-09-01 13:40:00", "IN"), p("E1", "2026-09-01 17:05:00", "OUT"),
		]);
		expect(d.firstIn).toBe("2026-09-01 08:30:00");
		expect(d.lastOut).toBe("2026-09-01 17:05:00");
		expect(hm(d.workMs)).toBe("8:35");
		expect(d.complete).toBe(true);
	});

	it("an_out_after_midnight_belongs_to_the_night_shift_that_started_the_day_before", () => {
		const days = apDaily([p("E1", "2026-09-01 22:00:00", "IN"), p("E1", "2026-09-02 06:05:00", "OUT")]);
		expect(days).toHaveLength(1);
		expect(days[0].date).toBe("2026-09-01");
		expect(hm(days[0].workMs)).toBe("8:05");
	});

	it("does_not_carry_a_forgotten_out_into_the_next_morning", () => {
		const days = apDaily([p("E1", "2026-09-01 08:00:00", "IN"), p("E1", "2026-09-03 17:00:00", "OUT")]);
		expect(days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-03"]);
		expect(days[0].missing).toBe("Out");
		expect(days[1].missing).toBe("In");
	});

	it("a_day_with_one_punch_is_missing_one_not_a_day_of_zero_hours", () => {
		const [d] = apDaily([p("E1", "2026-09-01 08:30:00", "IN")]);
		expect(d.complete).toBe(false);
		expect(d.missing).toBe("Out");
		expect(d.workMs).toBeNull();
		expect(cellLetter(d)).toBe("MP");
	});

	it("repeats_the_servers_fence_verdict_with_the_farthest_distance", () => {
		const [d] = apDaily([
			p("E1", "2026-09-01 08:30:00", "IN", { custom_geofence_result: "outside", custom_distance_metres: 340 }),
			p("E1", "2026-09-01 17:00:00", "OUT", { custom_geofence_result: "inside" }),
		]);
		expect(fenceText(d)).toBe("Outside ×1 (340 m)");
		expect(fenceText(apDaily([p("E1", "2026-09-01 08:30:00", "IN", { custom_geofence_result: "inside" })])[0])).toBe("Inside");
	});
});

describe("the per-person totals and the grid", () => {
	const rows = [
		p("E1", "2026-09-01 08:00:00", "IN"), p("E1", "2026-09-01 16:00:00", "OUT"),
		p("E1", "2026-09-02 08:00:00", "IN"), p("E1", "2026-09-02 17:00:00", "OUT"),
		p("E1", "2026-09-03 08:00:00", "IN", { custom_geofence_result: "outside" }),
		p("E2", "2026-09-02 09:00:00", "OUT"),
	];

	it("averages_hours_over_full_days_only", () => {
		const [anil, mary] = apTotals(apDaily(rows));
		expect(anil).toMatchObject({ days: 3, punches: 5, complete: 2, missingOut: 1, outside: 1, first: "2026-09-01", last: "2026-09-03" });
		expect(hm(anil.workMs)).toBe("17:00");
		expect(hm(anil.avgMs)).toBe("8:30");
		expect(mary).toMatchObject({ days: 1, complete: 0, missingIn: 1, avgMs: null });
	});

	it("draws_a_column_for_every_date_and_a_blank_for_a_day_with_no_app_punch", () => {
		const g = apGrid(apDaily(rows), "2026-09-01", "2026-09-04");
		expect(g.dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
		const mary = g.people.find((x) => x.employee === "E2");
		expect(mary.cells.map(cellLetter)).toEqual(["", "MP", "", ""]);
	});
});

describe("the App Punches page", () => {
	beforeEach(() => resetStore());

	const page = async () => {
		let out;
		await act(async () => {
			set({
				ap: { from: "2026-09-01", till: "2026-09-03", view: "" },
				apRows: [p("E1", "2026-09-01 08:00:00", "IN"), p("E1", "2026-09-01 16:00:00", "OUT"), p("E2", "2026-09-02 09:00:00", "IN")],
				apState: "done", apRan: "2026-09-01 to 2026-09-03",
			});
			out = render(<Provider store={store}><AppPunches /></Provider>);
		});
		return out;
	};
	const tab = async (r, label) => {
		const b = [...r.container.querySelectorAll('[role="tab"]')].find((x) => x.textContent === label);
		await act(async () => { fireEvent.click(b); });
	};

	it("opens_on_the_punch_list_and_switches_to_each_report", async () => {
		const r = await page();
		expect(r.container.textContent).toContain("3 punches");
		await tab(r, "Daily Summary");
		expect(r.container.textContent).toContain("2 days");
		expect(r.container.textContent).toContain("Missing Out");
		await tab(r, "Per Person");
		expect(r.container.textContent).toContain("2 people");
		await tab(r, "Monthly Grid");
		expect(r.container.querySelectorAll("table.muster th.d")).toHaveLength(3);
		expect(r.container.querySelector("td.d.full").textContent).toBe("08:00\n16:00");
		expect(r.container.querySelector("td.d.half").textContent).toBe("09:00\n?");
	});

	it("draws_the_grid_over_the_range_that_was_read_not_the_one_being_typed", async () => {
		const r = await page();
		await act(async () => { set({ ap: { from: "2026-09-01", till: "2026-09-30", view: "grid" } }); });
		expect(r.container.querySelectorAll("table.muster th.d")).toHaveLength(3);
	});
});

describe("the App Punches workbook", () => {
	it("builds_four_styled_sheets_off_the_same_rows", async () => {
		const ExcelJS = (await import("exceljs")).default;
		let blob;
		const was = [URL.createObjectURL, URL.revokeObjectURL];
		URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
		URL.revokeObjectURL = () => {};
		const click = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = () => {};
		try {
			const { appPunchesXlsx } = await import("@/lib/xlsx");
			const rows = [p("E1", "2026-09-01 08:00:00", "IN"), p("E1", "2026-09-01 16:00:00", "OUT", { custom_geofence_result: "outside" })];
			const daily = apDaily(rows);
			await appPunchesXlsx(
				{ from: "2026-09-01", till: "2026-09-02", company: "", daily, totals: apTotals(daily), grid: apGrid(daily, "2026-09-01", "2026-09-02"), punches: rows },
				{ name: "t.xlsx", empOf: () => ({}), whereOf: () => "", hm, fenceText },
			);
		} finally {
			[URL.createObjectURL, URL.revokeObjectURL] = was;
			HTMLAnchorElement.prototype.click = click;
		}
		const buf = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsArrayBuffer(blob); });
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(buf);
		expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Daily", "Monthly Grid", "Punches"]);
		const grid = wb.getWorksheet("Monthly Grid");
		let cell = null;
		grid.eachRow((row) => row.eachCell((c) => { if (c.value === "08:00\n16:00") cell = c; }));
		expect(cell).not.toBeNull();
		expect(cell.fill.fgColor.argb).toBe("FFD9F2E3");
		/* Outside the fence: red text on the green of a full day. */
		expect(cell.font.color.argb).toBe("FFB42318");
	});
});
