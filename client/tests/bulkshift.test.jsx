import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import AssignShift from "@/features/attendance/AssignShift";
import { candidates, checkBulk, hoursOf, shiftLabel, shiftsFor } from "@/lib/bulkshift";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Manage Shift → Assign shift: several people, one shift (16 October 2026). */

const calls = [];
vi.mock("@/api/shiftassign", () => ({
	assignShiftMany: async (emps, form, onStep) => {
		calls.push([emps.map((e) => e.name), form]);
		emps.forEach((_, i) => onStep(i + 1));
		return { ok: emps.length - 1, results: emps.map((emp, i) => ({ emp, ok: i > 0, msg: i > 0 ? "General from 16-10-2026 onwards." : "the site refused: overlapping" })) };
	},
}));

const E = (name, employee_name, company, department, status = "Active") => ({ name, employee_name, employee_number: name, company, department, status });
const PEOPLE = [
	E("E1", "Anu Joseph", "Manna Treads", "Stores - MT"),
	E("E2", "Ravi Varma", "Manna Treads", "Maintenance - MT"),
	E("E3", "Bindu Paul", "Manna Rubber", "Accounts - MR"),
	E("E4", "Gone Person", "Manna Treads", "Stores - MT", "Left"),
];
const SHIFTS = [{ name: "General", company: "" }, { name: "MT Night", company: "Manna Treads" }, { name: "MR Day", company: "Manna Rubber" }];

describe("who can be picked, and which shift fits them", () => {
	it("offers active people only, by name, narrowed by search and department", () => {
		expect(candidates(PEOPLE).map((e) => e.name)).toEqual(["E1", "E3", "E2"]);
		expect(candidates(PEOPLE, { dept: "Stores - MT" }).map((e) => e.name)).toEqual(["E1"]);
		expect(candidates(PEOPLE, { q: "ravi" }).map((e) => e.name)).toEqual(["E2"]);
	});

	it("offers a company's own shift only when everybody ticked is in that company", () => {
		expect(shiftsFor(SHIFTS, [PEOPLE[0], PEOPLE[1]]).map((t) => t.name)).toEqual(["General", "MT Night"]);
		expect(shiftsFor(SHIFTS, [PEOPLE[0], PEOPLE[2]]).map((t) => t.name)).toEqual(["General"]);
	});

	it("needs somebody ticked, a shift, and for dates a start that is not after the end", () => {
		const base = { picked: [PEOPLE[0]], shift: "General", mode: "dates", from: "2026-10-16", to: "" };
		expect(checkBulk({ ...base, picked: [] }, SHIFTS)).toMatch(/Tick/);
		expect(checkBulk({ ...base, shift: "" }, SHIFTS)).toMatch(/shift/);
		expect(checkBulk({ ...base, from: "" }, SHIFTS)).toMatch(/starts/);
		expect(checkBulk({ ...base, to: "2026-10-01" }, SHIFTS)).toMatch(/before/);
		expect(checkBulk({ ...base, shift: "MR Day" }, SHIFTS)).toMatch(/another company/);
		expect(checkBulk({ ...base, mode: "working", from: "" }, SHIFTS)).toBe("");
		expect(checkBulk(base, SHIFTS)).toBe("");
	});
});

describe("a shift's hours beside its name", () => {
	it("writes the times Frappe sends as HH:MM, a night shift included", () => {
		expect(hoursOf({ start_time: "8:30:00", end_time: "17:30:00" })).toBe("08:30–17:30");
		expect(hoursOf({ start_time: "20:00:00", end_time: "8:00:00" })).toBe("20:00–08:00");
	});

	it("is the name alone where the site has not said the hours, never an invented time", () => {
		expect(shiftLabel("General", {})).toBe("General");
		expect(shiftLabel("General", { General: { start_time: "", end_time: "17:30:00" } })).toBe("General");
		expect(shiftLabel("General", { General: { start_time: "9:00:00", end_time: "17:30:00" } })).toBe("General · 09:00–17:30");
	});
});

describe("the Assign shift window", () => {
	beforeEach(() => {
		calls.length = 0;
		resetStore();
		act(() => set({ ...loadedState(), employees: PEOPLE, company: "", shiftTypes: SHIFTS }));
	});

	const draw = async () => {
		let view;
		await act(async () => { view = render(<Provider store={store}><AssignShift onClose={() => {}} /></Provider>); });
		return view;
	};
	const button = (v, re) => [...v.container.querySelectorAll("button")].find((b) => re.test(b.textContent));

	it("gives the shift to everybody ticked, says how each one went, and keeps the refused ones ticked", async () => {
		const view = await draw();
		fireEvent.click(view.getByLabelText("Tick Anu Joseph"));
		fireEvent.click(view.getByLabelText("Tick Ravi Varma"));
		fireEvent.change(view.getByLabelText("Shift"), { target: { value: "MT Night" } });
		await act(async () => { button(view, /^Assign to 2 people$/).click(); });
		expect(calls).toEqual([[["E1", "E2"], { shift: "MT Night", mode: "dates", from: expect.any(String), to: "" }]]);
		expect(view.container.textContent).toContain("1 of 2 assigned.");
		expect(view.container.textContent).toContain("Anu Joseph: the site refused: overlapping");
		expect(view.getByLabelText("Tick Anu Joseph").checked).toBe(true);
		expect(view.getByLabelText("Tick Ravi Varma").checked).toBe(false);
	});

	it("shows each shift's hours in the list, and the chosen one's under it", async () => {
		act(() => set({ shiftWindowState: "ok", shiftWindows: {
			General: { name: "General", start_time: "9:00:00", end_time: "17:30:00" },
			"MT Night": { name: "MT Night", start_time: "20:00:00", end_time: "8:00:00" },
		} }));
		const view = await draw();
		fireEvent.click(view.getByLabelText("Tick Anu Joseph"));
		const box = view.getByLabelText("Shift");
		expect([...box.options].map((o) => o.textContent)).toEqual(["Choose…", "General · 09:00–17:30", "MT Night · 20:00–08:00"]);
		fireEvent.change(box, { target: { value: "MT Night" } });
		expect(view.container.querySelector(".bshhours").textContent).toBe("20:00–08:00");
	});

	it("ticks everybody shown at once, and only those shown", async () => {
		const view = await draw();
		fireEvent.change(view.getByLabelText("Department"), { target: { value: "Stores - MT" } });
		fireEvent.click(view.getByLabelText("Tick everybody shown"));
		expect(view.container.textContent).toContain("1 ticked");
	});

	it("says what is missing rather than writing anything", async () => {
		const view = await draw();
		fireEvent.click(view.getByLabelText("Tick Anu Joseph"));
		await act(async () => { button(view, /^Assign to 1 person$/).click(); });
		expect(view.getByRole("alert").textContent).toMatch(/Choose the shift/);
		expect(calls).toEqual([]);
	});
});
