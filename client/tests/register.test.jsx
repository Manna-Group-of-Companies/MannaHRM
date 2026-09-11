import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Regularization from "@/features/attendance/Regularization";
import { REGISTER_CODE, monthRegister, monthRoster } from "@/lib/roster";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Attendance → Attendance Regularization, before anybody is picked: the
   register. Everybody down the side, the days of the cycle across.

   The one rule worth pinning is that a cell is the same answer the person's own
   month gives for that day — the register is `monthRoster` run per person, not
   a second opinion about what a day was.
   --------------------------------------------------------------------------- */

const IN = (employee, time) => ({ employee, time, log_type: "IN" });
const OUT = (employee, time) => ({ employee, time, log_type: "OUT" });

const PEOPLE = [
	{ name: "E1", employee_name: "Anand", status: "Active" },
	{ name: "E2", employee_name: "Priya", status: "Active" },
];

const base = {
	ym: "2026-08",
	people: PEOPLE,
	punches: [
		IN("E1", "2026-08-03 08:30:00"), OUT("E1", "2026-08-03 17:30:00"),
		IN("E2", "2026-08-03 09:10:00"),
	],
	leave: [{ employee: "E2", from_date: "2026-08-04", to_date: "2026-08-04", status: "Approved" }],
	corrections: [{ employee: "E1", attendance_date: "2026-08-05", status: "Pending Approval" }],
	holidaysOf: () => [{ holiday_date: "2026-08-02", weekly_off: 1 }],
	today: "2026-08-10",
};

describe("the register", () => {
	it("has a row per person and a column per day of the cycle", () => {
		const reg = monthRegister(base);
		expect(reg.map((r) => r.emp.name)).toEqual(["E1", "E2"]);
		expect(reg.every((r) => r.rows.length === 31)).toBe(true);
	});

	it("gives each person only their own punches, leave and corrections", () => {
		const [e1, e2] = monthRegister(base);
		const day = (r, iso) => r.rows.find((d) => d.iso === iso);
		expect(day(e1, "2026-08-03").display).toBe("full");
		expect(day(e2, "2026-08-03").display).toBe("partial");
		expect(day(e2, "2026-08-04").display).toBe("leave");
		expect(day(e1, "2026-08-04").display).toBe("absent");
		expect(day(e1, "2026-08-05").ar.status).toBe("Pending Approval");
		expect(day(e2, "2026-08-05").ar).toBeNull();
	});

	it("says for every cell exactly what the person's own month says for that day", () => {
		const [e1] = monthRegister(base);
		const own = monthRoster({
			ym: base.ym,
			punches: base.punches.filter((p) => p.employee === "E1"),
			leave: [],
			corrections: base.corrections,
			holidays: base.holidaysOf(),
			shift: "",
			today: base.today,
		});
		expect(e1.rows.map((d) => d.display)).toEqual(own.rows.map((d) => d.display));
	});

	it("reads a day not yet reached as nothing rather than as an absence", () => {
		const [e1] = monthRegister(base);
		expect(e1.rows.find((d) => d.iso === "2026-08-20").display).toBe("unmarked");
		expect(REGISTER_CODE.unmarked).toBe("");
	});

	it("uses each person's own calendar", () => {
		const reg = monthRegister({
			...base,
			holidaysOf: (e) => (e.name === "E2" ? [{ holiday_date: "2026-08-06", description: "Onam" }] : []),
		});
		const on6 = reg.map((r) => r.rows.find((d) => d.iso === "2026-08-06").display);
		expect(on6).toEqual(["absent", "holiday"]);
	});
});

describe("the page with nobody picked", () => {
	const draw = () => render(<Provider store={store}><Regularization /></Provider>);

	beforeEach(() => {
		resetStore();
		set(loadedState());
		const ym = new Date().toISOString().slice(0, 7);
		set({
			reg: { ...getState().reg, cycle: ym },
			regGrid: { key: ym, state: "ok", err: "", punches: [], leave: [], ar: [] },
		});
	});

	it("draws the register instead of an empty page", () => {
		const view = draw();
		const table = view.container.querySelector("table.rgrid");
		expect(table).toBeTruthy();
		expect(view.container.textContent).not.toContain("No Employee Selected");
	});

	it("has one row per employee in scope", () => {
		const view = draw();
		const rows = view.container.querySelectorAll("table.rgrid tbody tr");
		expect(rows.length).toBe(getState().employees.length);
	});

	it("opens a person's month when their name is clicked", async () => {
		const view = draw();
		const first = view.container.querySelector("table.rgrid .rgwho");
		await act(async () => { first.click(); });
		expect(getState().reg.emp).toBeTruthy();
	});
});
