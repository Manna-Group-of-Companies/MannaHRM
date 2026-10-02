import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, resetStore } from "@/store";
import AppPunches from "@/features/attendance/AppPunches";
import { apDaily, apGrid, apPunchList, apTotals, cellLetter, fenceText, hm, hms } from "@/lib/apppunches";
import { terminalOf } from "@/lib/punchplace";

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

describe("the punch list, in Factor HR's In / Out report order", () => {
	it("puts_a_persons_punches_together_oldest_first_by_employee_code", () => {
		const list = apPunchList([
			p("E2", "2026-09-01 09:00:00", "IN"), p("E1", "2026-09-01 16:00:00", "OUT"), p("E1", "2026-09-01 08:00:00", "IN"),
		], (id) => ({ E1: "HPT-010", E2: "HPT-002" })[id]);
		expect(list.map((r) => `${r.employee} ${r.time.slice(11, 16)}`)).toEqual(["E2 09:00", "E1 08:00", "E1 16:00"]);
	});

	it("says_how_long_after_the_same_persons_previous_punch_and_nothing_on_their_first", () => {
		const list = apPunchList([
			p("E1", "2026-09-01 08:00:00", "IN"), p("E1", "2026-09-01 08:00:01", "IN"), p("E2", "2026-09-01 08:00:30", "IN"),
		]);
		expect(list.map((r) => hms(r.gapMs))).toEqual(["", "00:00:01", ""]);
	});

	it("prints_a_gap_past_a_day_in_hours_rather_than_wrapping_round", () => {
		expect(hms(26 * 3600e3 + 61e3)).toBe("26:01:01");
	});

	it("calls_every_phone_punch_the_mobile_app_and_a_machine_by_its_own_name", () => {
		expect(terminalOf({ device_id: "PHONE-HR-EMP-00001" })).toBe("Mobile App");
		expect(terminalOf({ device_id: "BIO-MRP-GATE1" })).toBe("BIO-MRP-GATE1");
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

	it("draws_the_punch_list_in_factor_hrs_columns_with_what_the_phone_said", async () => {
		await act(async () => {
			set({
				ap: { from: "2026-10-02", till: "2026-10-02", view: "" },
				apRows: [p("E1", "2026-10-02 08:00:00", "IN", {
					creation: "2026-10-02 08:00:02.123456", latitude: 10.0639767, longitude: 76.4781234,
					custom_location_accuracy: 13.99, custom_device_info: "vivo 1906 · Android 11",
					custom_punch_address: "4F6J+23R, Perumbavoor, Kerala, 683542", custom_geofence_result: "outside",
				}), p("E1", "2026-10-02 08:00:45", "IN")],
				apState: "done", apRan: "2026-10-02 to 2026-10-02",
			});
		});
		const r = render(<Provider store={store}><AppPunches /></Provider>);
		const heads = [...r.container.querySelectorAll("thead th")].map((th) => th.textContent);
		expect(heads).toEqual(["S#", "Emp Code", "Emp Name", "Terminal", "Location", "Generation Time / Upload Time",
			"Punch Date", "Punch Time", "In / Out", "Duration From Previous Punch", "Selfie Image", "Remarks",
			"Punch Info", "Location Link"]);
		const [first, second] = [...r.container.querySelectorAll("tbody tr")]
			.map((tr) => Object.fromEntries([...tr.children].map((td, i) => [heads[i], td.textContent])));
		expect(first["Terminal"]).toBe("Mobile App");
		expect(first["Location"]).toContain("4F6J+23R, Perumbavoor");
		expect(first["Generation Time / Upload Time"]).toBe("02-Oct-2026 08:00:02");
		expect(first["Punch Time"]).toBe("08:00:00");
		expect(first["Remarks"]).toBe("outside fence");
		expect(first["Punch Info"]).toContain("Loc Acc: 14 m");
		expect(first["Punch Info"]).toContain("Device Info: vivo 1906 · Android 11");
		expect(first["Location Link"]).toBe("View Map");
		expect(second["Duration From Previous Punch"]).toBe("00:00:45");
		expect(second["Location Link"]).toBe("—");
	});

	it("a_night_shift_is_night_by_its_punch_in_though_its_out_is_in_the_morning", async () => {
		await act(async () => {
			set({
				ap: { from: "2026-09-01", till: "2026-09-02", view: "daily" },
				apRows: [p("E1", "2026-09-01 20:30:00", "IN"), p("E1", "2026-09-02 08:30:00", "OUT"),
					p("E2", "2026-09-01 08:25:00", "IN"), p("E2", "2026-09-01 20:35:00", "OUT")],
				apState: "done", apRan: "2026-09-01 to 2026-09-02",
			});
		});
		const r = render(<Provider store={store}><AppPunches /></Provider>);
		const heads = [...r.container.querySelectorAll("thead th")].map((th) => th.textContent);
		const at = heads.indexOf("Day / Night");
		expect(at).toBe(heads.indexOf("First in") + 1);
		const byName = Object.fromEntries([...r.container.querySelectorAll("tbody tr")]
			.map((tr) => [tr.children[3].textContent, tr.children[at].textContent]));
		expect(byName).toEqual({ Anil: "Night", Mary: "Day" });
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
				{
					name: "t.xlsx", empOf: () => ({}), hm, fenceText,
					punchCols: [["S#", (r, i) => String(i + 1)], ["Location", () => "4F6J+23R,\nPerumbavoor"],
						["Location Link", () => "https://www.google.com/maps/search/?api=1&query=10,76"]],
					photoUrl: () => "",
				},
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
		/* The Daily sheet says Day or Night beside the punch-in, as the screen does. */
		const cells = [];
		wb.getWorksheet("Daily").eachRow((row) => cells.push(row.values.slice(1)));
		const head = cells.findIndex((v) => v.includes("Day / Night"));
		expect(head).toBeGreaterThan(-1);
		const col = cells[head].indexOf("Day / Night");
		expect(cells[head][col - 1]).toBe("First In");
		expect(cells[head + 1][col]).toBe("Day");
		/* The Punches sheet is the page's columns, the map a link that opens from the file. */
		const punches = [];
		wb.getWorksheet("Punches").eachRow((row) => punches.push(row.values.slice(1)));
		const ph = punches.findIndex((v) => v[0] === "S#");
		expect(punches[ph]).toEqual(["S#", "Location", "Location Link"]);
		expect(punches[ph + 2][0]).toBe("2");
		expect(punches[ph + 1][2]).toEqual({ text: "View Map", hyperlink: "https://www.google.com/maps/search/?api=1&query=10,76" });
	});
});
