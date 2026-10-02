import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   The three cards over Apply Leave — Frappe HR's "Employees on leave today",
   "Employees on leave this month" and "Holidays in this month".
   --------------------------------------------------------------------------- */

vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	loadLeaveFor: () => Promise.resolve(),
	loadLeaveBalance: () => Promise.resolve(),
	loadLeaveMonth: () => Promise.resolve(),
}));

import { pageFor } from "@/routes/registry";
import ApplyLeave, { calendarFor, holidayName } from "@/features/leave/ApplyLeave";
import { leaveCards } from "@/lib/leavecards";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

const lv = (employee, from_date, to_date, status = "Approved") => ({ employee, from_date, to_date, status });
const P = [{ name: "E1" }, { name: "E2" }, { name: "E3" }];

describe("the three numbers", () => {
	it("counts people, not applications — two leaves in a month is one person", () => {
		const n = leaveCards({ people: P, ym: "2026-09", today: "2026-09-29", rows: [
			lv("E1", "2026-09-02", "2026-09-02"), lv("E1", "2026-09-20", "2026-09-21"),
			lv("E2", "2026-09-29", "2026-09-30"),
		] });
		expect(n.inMonth).toBe(2);
		expect(n.onToday).toBe(1);
	});

	it("counts a leave that runs in from the month before, and not one that ended before it", () => {
		const n = leaveCards({ people: P, ym: "2026-09", today: "2026-09-29", rows: [
			lv("E1", "2026-08-28", "2026-09-02"), lv("E2", "2026-08-10", "2026-08-12"),
		] });
		expect(n.inMonth).toBe(1);
	});

	it("counts only approved leave, and only people in scope", () => {
		const n = leaveCards({ people: [{ name: "E1" }], ym: "2026-09", today: "2026-09-29", rows: [
			lv("E1", "2026-09-29", "2026-09-29", "Open"), lv("E9", "2026-09-29", "2026-09-29"),
		] });
		expect(n).toMatchObject({ onToday: 0, inMonth: 0 });
	});

	it("keeps today about today when the calendar is on another month", () => {
		const n = leaveCards({ people: P, ym: "2026-10", today: "2026-09-29", rows: [lv("E1", "2026-09-28", "2026-09-30")] });
		expect(n).toMatchObject({ onToday: 1, inMonth: 0 });
	});

	it("counts every holiday row in the month, weekly offs included, and says which is which", () => {
		const n = leaveCards({ people: P, ym: "2026-09", today: "2026-09-29", rows: [], holidays: [
			{ holiday_date: "2026-09-06", weekly_off: 1 }, { holiday_date: "2026-09-13", weekly_off: 1 },
			{ holiday_date: "2026-09-15", weekly_off: 0 }, { holiday_date: "2026-10-04", weekly_off: 1 },
		] });
		expect(n.holidays).toEqual({ total: 3, weekly: 2, other: 1 });
	});

	it("has no holiday figure when there is no calendar to count", () => {
		expect(leaveCards({ people: P, ym: "2026-09", today: "2026-09-29", rows: [] }).holidays).toBeNull();
	});
});

describe("on Apply Leave", () => {
	beforeEach(() => resetStore());

	const draw = async () => {
		let view;
		await act(async () => { view = render(<Provider store={store}><ApplyLeave /></Provider>); });
		return view;
	};

	it("is on the page Leave opens on", () => {
		expect(pageFor("leave", "overview")).toBe(ApplyLeave);
	});

	it("draws the three cards before anybody is picked, and follows the person once they are", async () => {
		set(loadedState());
		const today = new Date().toISOString().slice(0, 10);
		const ym = today.slice(0, 7);
		const emp = getState().employees.find((e) => e.status === "Active" && e.company);
		const mate = getState().employees.find((e) => e.company === emp.company && e.name !== emp.name) || emp;
		set({
			lvMonth: { key: `${ym}|${today}`, state: "ok", rows: [lv(mate.name, today, today)] },
			holidays: { ...getState().holidays, TESTCAL: [{ holiday_date: `${ym}-01`, weekly_off: 1 }] },
			employees: getState().employees.map((e) => (e.name === emp.name ? { ...e, holiday_list: "TESTCAL" } : e)),
		});
		set({ byName: Object.fromEntries(getState().employees.map((e) => [e.name, e])) });

		let { container, unmount } = await draw();
		const labels = () => [...container.querySelectorAll(".lvcards .stat .sk")].map((x) => x.textContent);
		expect(labels()).toEqual(["Employees on leave today", "Employees on leave this month", "Holidays this month"]);
		unmount();

		set({ apply: { ...getState().apply, emp: emp.name } });
		({ container } = await draw());
		const nums = [...container.querySelectorAll(".lvcards .stat .sn")].map((x) => x.textContent);
		expect(nums).toEqual(["1", "1", "1"]);
		expect(container.querySelector(".lvcards").textContent).toContain(emp.company);
		expect(container.querySelector(".lvcards").textContent).toContain("1 weekly off");
	});
});

describe("the holiday calendar the page draws", () => {
	const companies = [
		{ name: "Manna Rubber", default_holiday_list: "Manna Holidays" },
		{ name: "Manna Polymers", default_holiday_list: "Manna Holidays" },
	];

	it("is the person's own list, else their company's", () => {
		const s = { companies, company: "" };
		expect(calendarFor(s, { company: "Manna Rubber", holiday_list: "Kochi 2026" })).toBe("Kochi 2026");
		expect(calendarFor(s, { company: "Manna Rubber", holiday_list: "" })).toBe("Manna Holidays");
	});

	it("with nobody picked, is the top-bar company's — or the group's one calendar when they all share it", () => {
		expect(calendarFor({ companies, company: "Manna Polymers" }, null)).toBe("Manna Holidays");
		expect(calendarFor({ companies, company: "" }, null)).toBe("Manna Holidays");
	});

	it("is none on All companies when the companies' calendars differ", () => {
		const two = [...companies, { name: "Manna Tyre UAE", default_holiday_list: "UAE 2026" }];
		expect(calendarFor({ companies: two, company: "", holidayLists: [{ name: "Manna Holidays" }, { name: "UAE 2026" }] }, null)).toBe("");
	});

	it("reads a holiday's name out of the editor's HTML", () => {
		expect(holidayName({ description: "<p>Onam&nbsp;</p>" })).toBe("Onam");
		expect(holidayName({ description: "Gandhi Jayanti" })).toBe("Gandhi Jayanti");
		expect(holidayName({})).toBe("");
	});

	it("draws the month's holidays by name before anybody is picked", async () => {
		resetStore();
		set(loadedState());
		const ym = new Date().toISOString().slice(0, 7);
		set({
			company: "",
			companies: [{ name: "Manna Rubber", default_holiday_list: "Manna Holidays" }],
			holidays: { ...getState().holidays, "Manna Holidays": [
				{ holiday_date: `${ym}-15`, weekly_off: 0, description: "<p>Onam</p>" },
				{ holiday_date: `${ym}-06`, weekly_off: 1, description: "Sunday" },
			] },
			lvMonth: { key: "", state: "", rows: [] },
		});
		let view;
		await act(async () => { view = render(<Provider store={store}><ApplyLeave /></Provider>); });

		const onam = view.container.querySelector(".lvgrid .lvholname");
		expect(onam.textContent).toBe("Onam");
		expect(onam.closest("button").getAttribute("title")).toContain("Holiday — Onam");
		const box = view.container.querySelector(".lvhols");
		expect(box.textContent).toContain("Manna Holidays");
		expect(box.textContent).toContain("Onam");
		expect(box.textContent).toContain("1 weekly off");
	});
});
