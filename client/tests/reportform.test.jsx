import { describe, expect, it, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import DailyDetail from "@/features/attendance/DailyDetail";
import MonthlyBasic from "@/features/attendance/MonthlyBasic";
import { todayIso } from "@/lib/format";
import { LETTER_FILL, rgbOf, statusFill } from "@/lib/fills";
import { daySummary } from "@/lib/dailydetail";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Daily Detail and Monthly Basic ask In / Out's five questions — company,
   status, employee, dates, a file — and colour their exports the same way.
   --------------------------------------------------------------------------- */

const LABELS = ["Company", "Employee status", "Employee", "From date", "To date", "Format"];

async function page(C) {
	let out;
	await act(async () => { out = render(<Provider store={store}><C /></Provider>); });
	return out;
}

describe("the colours", () => {
	it("paints_a_present_day_green_and_an_absent_one_red_whatever_the_star_says", () => {
		expect(statusFill("Present")).toBe(LETTER_FILL.P);
		expect(statusFill("Present *")).toBe(LETTER_FILL.P);
		expect(statusFill("Absent")).toBe(LETTER_FILL.A);
		expect(statusFill("In Only")).toBe(LETTER_FILL.MP);
		expect(statusFill("—")).toBeNull();
	});

	it("turns_an_excel_colour_into_the_rgb_a_pdf_wants", () => {
		expect(rgbOf("FFE8651A")).toEqual([0xe8, 0x65, 0x1a]);
		expect(rgbOf(null)).toBeNull();
	});
});

describe("the day summary", () => {
	it("counts_a_day_with_only_an_in_as_a_missed_punch_not_an_absence", () => {
		const emp = { name: "A" };
		const n = daySummary([
			{ emp, status: "Present", lateMin: 5 }, { emp, status: "In Only" }, { emp, status: "Absent" },
			{ emp, status: "Weekly Off", dayType: "weekoff" },
		]);
		expect(n).toMatchObject({ people: 1, present: 1, missed: 1, absent: 1, late: 1, off: 1 });
	});
});

describe("Daily Detail", () => {
	beforeEach(() => resetStore());

	it("draws_the_five_questions_and_reads_today_on_open", async () => {
		const t = todayIso();
		set({ ...loadedState(), ddaData: { key: `${t}|${t}|`, state: "ok", err: "", attendance: [], punches: [], leave: [] } });
		const r = await page(DailyDetail);
		for (const l of LABELS) expect(r.getByLabelText(l)).toBeTruthy();
		expect(r.queryByText("Report Criteria")).toBeNull();
		expect(r.getByText("Download")).toBeTruthy();
		expect(r.container.querySelector(".tiles")).not.toBeNull();
		expect(getState().dda.from || t).toBe(t);
	});

	it("draws_every_person_day_as_a_row_of_one_table_with_one_header", async () => {
		const t = todayIso();
		set({ ...loadedState(), ddaData: { key: `${t}|${t}|`, state: "ok", err: "", attendance: [], punches: [], leave: [] } });
		const r = await page(DailyDetail);
		const out = r.container.querySelector(".ddaout");
		expect(out.querySelectorAll("table")).toHaveLength(1);
		expect(out.querySelectorAll("thead tr")).toHaveLength(1);
		expect(r.getAllByText("Emp Code")).toHaveLength(1);
		const people = new Set([...out.querySelectorAll("tbody tr")].map((tr) => tr.cells[0].textContent));
		expect(out.querySelectorAll("tbody tr").length).toBeGreaterThan(1);
		expect(people.size).toBe(out.querySelectorAll("tbody tr").length);
	});
});

describe("Monthly Basic", () => {
	beforeEach(() => resetStore());

	it("draws_the_five_questions_and_the_summary_over_the_grid", async () => {
		const now = new Date();
		const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		set({ ...loadedState(), ddaData: { key: `${ym}-01|${ym}-${last}|`, state: "ok", err: "", attendance: [], punches: [], leave: [] } });
		const r = await page(MonthlyBasic);
		for (const l of LABELS) expect(r.getByLabelText(l)).toBeTruthy();
		expect(r.queryByText("Report Criteria")).toBeNull();
		expect(r.container.querySelector(".tiles")).not.toBeNull();
		expect(r.container.querySelector("table.muster")).not.toBeNull();
	});
});
