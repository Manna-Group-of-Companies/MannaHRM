import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import TeamTimeOff from "@/features/leave/TeamTimeOff";
import TimeOffSettings from "@/features/leave/TimeOffSettings";
import MyTimeOff from "@/features/leave/MyTimeOff";
import LeaveBalances from "@/features/leave/LeaveBalances";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { LEAVE_APPLICATIONS, loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Time Off as the HRDashboard reference draws it (21 October 2026): Team Time
   Off with its decisions, Employee Time Off on Leave Balance's figures,
   Settings that read (D17), and My Time Off for a linked login only (D3).
   --------------------------------------------------------------------------- */

const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);
beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("Team Time Off", () => {
	it("counts what is waiting and lists it under Pending", async () => {
		await act(async () => set({ ...loadedState(), lvAll: { state: "ok", rows: [] } }));
		const { container } = draw(<TeamTimeOff />);
		const waiting = [...container.querySelectorAll(".k-mini")].find((m) => m.textContent.includes("Awaiting review"));
		expect(waiting.querySelector("b").textContent).toBe(String(LEAVE_APPLICATIONS.length));
		expect(container.querySelector("tbody").textContent).toContain(LEAVE_APPLICATIONS[0].employee_name);
	});

	it("approves through the site's own submit, and says so", async () => {
		await act(async () => set({ ...loadedState(), lvAll: { state: "ok", rows: [] } }));
		const sent = [];
		/* The site reads the application before submitting it (apiDecide). */
		vi.spyOn(http, "get").mockImplementation((url) => Promise.resolve({
			data: { data: String(url).includes(LEAVE_APPLICATIONS[0].name) ? { ...LEAVE_APPLICATIONS[0], docstatus: 0 } : [] },
		}));
		vi.spyOn(http, "post").mockImplementation((url, body) => { sent.push([decodeURIComponent(url), body]); return Promise.resolve({ data: { message: {} } }); });
		const { container } = draw(<TeamTimeOff />);
		const row = container.querySelector("tbody tr");
		await act(async () => { within(row).getByText("Approve").click(); });
		const save = sent.find(([u]) => u.includes("savedocs"));
		expect(save[1].action).toBe("Submit");
		expect(JSON.parse(save[1].doc)).toMatchObject({ name: LEAVE_APPLICATIONS[0].name, status: "Approved" });
	});

	it("opens a request in the side drawer with Approve and Decline while it is open", async () => {
		await act(async () => set({ ...loadedState(), lvAll: { state: "ok", rows: [] } }));
		const { container } = draw(<TeamTimeOff />);
		await act(async () => { container.querySelector("tbody tr").click(); });
		const drawer = document.querySelector(".k-drawer");
		expect(drawer.textContent).toContain("Casual Leave");
		expect(within(drawer).getByText("Decline")).toBeTruthy();
	});

	it("draws the month as a calendar with the request on its days", async () => {
		await act(async () => set({ ...loadedState(), lvAll: { state: "ok", rows: [] } }));
		const { container } = draw(<TeamTimeOff />);
		await act(async () => { within(container.querySelector('[aria-label="View"]')).getByText("Calendar").click(); });
		expect(container.querySelectorAll(".k-cal .k-dc")).toHaveLength(42);
	});
});

describe("Employee Time Off", () => {
	it("opens on the reference's summary and keeps the report's table one switch away", async () => {
		const st = loadedState();
		const emp = st.employees.find((x) => x.status === "Active");
		await act(async () => set({
			...st, lvbRows: [], lvbState: "done",
			lvbLedger: [{ employee: emp.name, leave_type: "Casual Leave", transaction_type: "Leave Allocation", from_date: "2026-01-01", leaves: 3 }],
			lvb: { ...getState().lvb, emp: emp.name, status: "", ason: "2026-09-24" },
		}));
		const { container } = draw(<LeaveBalances />);
		expect(container.querySelector("h1").textContent).toBe("Employee Time Off");
		expect(container.querySelector("thead").textContent).toContain("Casual Leave (taken / left)");
		expect(container.querySelector("tbody").textContent).toContain("3.0");
		await act(async () => { within(container.querySelector('[aria-label="View"]')).getByText("Detail").click(); });
		expect(container.querySelector("thead").textContent).toContain("Carried Fwd");
	});
});

describe("Time Off Settings", () => {
	it("reads the leave types and changes none of them", async () => {
		await act(async () => set(loadedState()));
		const put = vi.spyOn(http, "put");
		const { container } = draw(<TimeOffSettings />);
		await act(async () => { within(container.querySelector('[role="tablist"]')).getByText("Types & policies").click(); });
		for (const t of getState().leaveTypes) expect(container.textContent).toContain(t.name);
		expect(container.querySelector('[aria-label^="Edit"], [aria-label^="Delete"]')).toBeNull();
		expect(put).not.toHaveBeenCalled();
	});
});

describe("My Time Off", () => {
	it("is for a login an Employee is linked to, and says so to one none is", async () => {
		await act(async () => set({ ...loadedState(), user: "hr@mannarubber.com" }));
		const { container } = draw(<MyTimeOff />);
		expect(container.textContent).toContain("No employee record for this login");
		expect(container.textContent).not.toContain("New request");
	});

	it("opens Apply Leave on the person from New request", async () => {
		const st = loadedState();
		const me = st.employees[0];
		const employees = st.employees.map((e) => (e === me ? { ...e, user_id: "me@mannarubber.com" } : e));
		await act(async () => set({ ...st, employees, user: "me@mannarubber.com", lvAll: { state: "ok", rows: [] } }));
		const { container } = draw(<MyTimeOff />);
		await act(async () => { fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent.includes("New request"))); });
		expect(getState().apply.emp).toBe(me.name);
		expect(getState().subtab).toBe("overview");
	});
});
