import { describe, expect, it } from "vitest";
import { availedUpTo, balanceOf, ledgerUpTo, lvbFill, lvbKey, monthLeave } from "@/lib/leavebalance";
import { LETTER_FILL } from "@/lib/fills";

const CL = "Casual Leave";
const e = (from_date, leaves, extra = {}) =>
	({ employee: "E1", leave_type: CL, transaction_type: "Leave Allocation", from_date, leaves, ...extra });

describe("the leave ledger, added up to the As On Date", () => {
	it("counts each monthly credit on or before the date and none after it", () => {
		const got = ledgerUpTo([e("2026-07-01", 1), e("2026-08-01", 1), e("2026-09-01", 1)], "2026-08-31");
		expect(got.get(lvbKey("E1", CL))).toEqual({ assigned: 2, carried: 0, expired: 0 });
	});

	it("keeps a carry-forward apart from a new allocation, and an expiry as a positive number", () => {
		const got = ledgerUpTo([
			e("2026-01-01", 4, { is_carry_forward: 1 }),
			e("2026-01-01", 1),
			e("2026-12-31", -2, { is_expired: 1 }),
		], "2026-12-31");
		expect(got.get(lvbKey("E1", CL))).toEqual({ assigned: 1, carried: 4, expired: 2 });
	});

	it("skips the ledger's own leave application debits, so availed is not taken twice", () => {
		const got = ledgerUpTo([e("2026-08-01", 1), e("2026-08-10", -1, { transaction_type: "Leave Application" })], "2026-09-01");
		expect(got.get(lvbKey("E1", CL))).toEqual({ assigned: 1, carried: 0, expired: 0 });
	});

	it("answers an empty map for a ledger the site refused", () => {
		expect(ledgerUpTo(null, "2026-09-01").size).toBe(0);
	});
});

describe("the balance", () => {
	it("is assigned plus carried less expired less availed", () => {
		expect(balanceOf({ availed: 1.5, alloc: { assigned: 3, carried: 2, expired: 1 } })).toBe(2.5);
	});

	it("is blank, not negative, for a type never allocated", () => {
		expect(balanceOf({ availed: 3, alloc: null })).toBeNull();
	});
});

describe("one month of leave, for Leave Monthly Availed", () => {
	const app = (from_date, to_date, total_leave_days, extra = {}) =>
		({ employee: "E1", leave_type: CL, from_date, to_date, total_leave_days, ...extra });
	const credits = [e("2026-07-01", 1), e("2026-08-01", 1), e("2026-09-01", 1)];

	it("makes available what was brought in plus what the month earned, less what was taken", () => {
		const got = monthLeave(credits, [app("2026-08-10", "2026-08-10", 1)], "2026-09").get(lvbKey("E1", CL));
		expect(got).toEqual({ brought: 1, earned: 1, availed: 0, lapsed: 0, available: 2 });
	});

	it("ends a month on exactly the balance the Leave Balance Report prints on its last day", () => {
		const apps = [app("2026-08-10", "2026-08-10", 1), app("2026-09-14", "2026-09-15", 2)];
		const a = ledgerUpTo(credits, "2026-09-30").get(lvbKey("E1", CL));
		const taken = apps.reduce((t, r) => t + availedUpTo(r, "2026-09-30"), 0);
		expect(monthLeave(credits, apps, "2026-09").get(lvbKey("E1", CL)).available)
			.toBe(balanceOf({ alloc: a, availed: taken }));
	});

	it("splits a leave that crosses a month end between the two months", () => {
		const apps = [app("2026-08-30", "2026-09-02", 4)];
		expect(monthLeave(credits, apps, "2026-08").get(lvbKey("E1", CL)).availed).toBe(2);
		expect(monthLeave(credits, apps, "2026-09").get(lvbKey("E1", CL)).availed).toBe(2);
	});

	it("ends December at what lapsed and starts January at what was carried", () => {
		const ledger = [
			e("2026-11-01", 1), e("2026-12-01", 1), e("2026-12-31", -2, { is_expired: 1 }),
			e("2027-01-01", 2, { is_carry_forward: 1 }), e("2027-01-01", 1),
		];
		expect(monthLeave(ledger, [], "2026-12").get(lvbKey("E1", CL)))
			.toEqual({ brought: 1, earned: 1, availed: 0, lapsed: 2, available: 0 });
		expect(monthLeave(ledger, [], "2027-01").get(lvbKey("E1", CL)))
			.toEqual({ brought: 2, earned: 1, availed: 0, lapsed: 0, available: 3 });
	});

	it("draws a type never allocated only in a month it was taken, with its balance blank", () => {
		const lwp = [{ employee: "E1", leave_type: "Leave Without Pay", from_date: "2026-08-05", to_date: "2026-08-05", total_leave_days: 1 }];
		expect(monthLeave(credits, lwp, "2026-08").get(lvbKey("E1", "Leave Without Pay")))
			.toEqual({ brought: null, earned: null, availed: 1, lapsed: null, available: null });
		expect(monthLeave(credits, lwp, "2026-09").has(lvbKey("E1", "Leave Without Pay"))).toBe(false);
	});

	it("has no row for a month before anything was allocated", () => {
		expect(monthLeave(credits, [], "2026-06").size).toBe(0);
	});
});

describe("the export's colours", () => {
	it("paints a positive balance green, a negative one red and nothing on a blank", () => {
		expect(lvbFill("2.0", "Balance")).toBe(LETTER_FILL.P);
		expect(lvbFill("-1.0", "Balance")).toBe(LETTER_FILL.A);
		expect(lvbFill("—", "Balance")).toBeNull();
	});

	it("paints an active employee green and one who has left grey", () => {
		expect(lvbFill("Active", "Status")).toBe(LETTER_FILL.P);
		expect(lvbFill("Left", "Status")).toBe(LETTER_FILL.WO);
	});

	it("leaves the name and code columns white", () => {
		expect(lvbFill("Asha", "Employee Name")).toBeNull();
		expect(lvbFill("1.0", "Leave Type")).toBeNull();
	});
});

import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach } from "vitest";
import { getState, resetStore, set, store } from "@/store";
import { loadedState } from "./fixture";
import LeaveBalances from "@/features/leave/LeaveBalances";

describe("the Leave Balance Report, with a ledger", () => {
	beforeEach(() => resetStore());

	it("lists somebody who was assigned leave and took none, with the balance filled", async () => {
		const st = loadedState();
		const emp = st.employees.find((x) => x.status === "Active");
		set({
			...st, lvbRows: [], lvbState: "done",
			lvbLedger: [
				{ employee: emp.name, leave_type: CL, transaction_type: "Leave Allocation", from_date: "2026-01-01", leaves: 3 },
				{ employee: emp.name, leave_type: CL, transaction_type: "Leave Allocation", from_date: "2099-01-01", leaves: 5 },
			],
			lvb: { ...getState().lvb, emp: emp.name, status: "", ason: "2026-09-24" },
		});
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveBalances /></Provider>); });
		/* Since 21 October 2026 the page opens on the reference's summary; the
		   report's own table is Detail. */
		await act(async () => { [...out.container.querySelectorAll('[aria-label="View"] button')].find((b) => b.textContent === "Detail").click(); });
		const row = [...out.container.querySelectorAll("table tbody tr")].map((r) => r.textContent);
		expect(row).toHaveLength(1);
		expect(row[0]).toContain(emp.employee_name);
		expect(row[0]).toContain(CL);
		expect(row[0]).toContain("3.0");
		expect(row[0]).not.toContain("8.0");
	});

	it("asks for employee, status, leave type, date and file type, and has no Generate", async () => {
		set({ ...loadedState(), lvbState: "done", lvbLedger: [] });
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveBalances /></Provider>); });
		const q = (l) => out.container.querySelector(`[aria-label="${l}"]`);
		for (const l of ["Search employee", "Employee status", "Leave type", "As on date", "File type"]) expect(q(l)).toBeTruthy();
		expect([...q("File type").options].map((o) => o.value)).toEqual(["Excel", "PDF"]);
		const buttons = [...out.container.querySelectorAll("button")].map((b) => b.textContent);
		expect(buttons).toContain("Download");
		expect(buttons.some((b) => /Generate/.test(b))).toBe(false);
	});
});

import LeaveMonthly from "@/features/leave/LeaveMonthly";

describe("the Leave Monthly Availed page", () => {
	beforeEach(() => resetStore());

	it("shows each person's leave available at the end of the chosen month", async () => {
		const st = loadedState();
		const emp = st.employees.find((x) => x.status === "Active");
		const on = (from_date) => ({ employee: emp.name, leave_type: CL, transaction_type: "Leave Allocation", from_date, leaves: 1 });
		set({
			...st, lvbState: "done",
			lvbLedger: [on("2026-07-01"), on("2026-08-01"), on("2026-09-01")],
			lvbRows: [{ employee: emp.name, leave_type: CL, from_date: "2026-09-10", to_date: "2026-09-10", total_leave_days: 1 }],
			lvm: { ...getState().lvm, emps: [emp.name], status: "", month: "2026-09" },
		});
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveMonthly /></Provider>); });
		const cells = [...out.container.querySelectorAll("table tbody tr")].map((r) =>
			[...r.querySelectorAll("td")].map((c) => c.textContent));
		expect(cells).toHaveLength(1);
		const head = [...out.container.querySelectorAll("table thead th")].map((c) => c.textContent);
		const at = (h) => cells[0][head.indexOf(h)];
		expect(at("Employee Name")).toBe(emp.employee_name);
		expect([at("Brought Fwd"), at("Earned"), at("Availed"), at("Available")]).toEqual(["2.0", "1.0", "1.0", "2.0"]);
	});

	const credited = (st) => st.employees.filter((x) => x.status === "Active").flatMap((x) =>
		["2026-08-01", "2026-09-01"].map((from_date) =>
			({ employee: x.name, leave_type: CL, transaction_type: "Leave Allocation", from_date, leaves: 1 })));
	const names = (out) => [...out.container.querySelectorAll("table tbody tr")].map((r) => r.children[1].textContent);

	it("lists nobody until an employee is picked, even with everybody credited", async () => {
		const st = loadedState();
		set({ ...st, lvbState: "done", lvbRows: [], lvbLedger: credited(st),
			lvm: { ...getState().lvm, month: "2026-09" } });
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveMonthly /></Provider>); });
		expect(out.container.querySelector("table")).toBeNull();
		expect(out.container.textContent).toContain("Pick an employee");
	});

	it("lists only the employees picked, and drops one when its chip is removed", async () => {
		const st = loadedState();
		const active = st.employees.filter((x) => x.status === "Active");
		expect(active.length).toBeGreaterThan(2);
		const [a, b] = active;
		set({ ...st, lvbState: "done", lvbRows: [], lvbLedger: credited(st),
			lvm: { ...getState().lvm, emps: [a.name, b.name], month: "2026-09" } });
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveMonthly /></Provider>); });
		expect(names(out).sort()).toEqual([a.employee_name, b.employee_name].sort());

		const remove = out.container.querySelector(`[aria-label="Remove ${b.employee_name}"]`);
		await act(async () => { fireEvent.click(remove); });
		expect(names(out)).toEqual([a.employee_name]);
		expect(getState().lvm.emps).toEqual([a.name]);
	});

	it("takes a picked person off when the status filter no longer allows them", async () => {
		const st = loadedState();
		const emp = st.employees.find((x) => x.status === "Active");
		set({ ...st, lvbState: "done", lvbRows: [], lvbLedger: credited(st),
			lvm: { ...getState().lvm, emps: [emp.name], status: "" } });
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveMonthly /></Provider>); });
		await act(async () => {
			fireEvent.change(out.container.querySelector('[aria-label="Employee status"]'), { target: { value: "Left" } });
		});
		expect(getState().lvm.emps).toEqual([]);
	});

	it("asks for employee, status, leave type, month and file type", async () => {
		set({ ...loadedState(), lvbState: "done", lvbLedger: [] });
		let out;
		await act(async () => { out = render(<Provider store={store}><LeaveMonthly /></Provider>); });
		const q = (l) => out.container.querySelector(`[aria-label="${l}"]`);
		for (const l of ["Search employee", "Employee status", "Leave type", "Month", "File type"]) expect(q(l)).toBeTruthy();
		expect(q("Month").value).toMatch(/^\d{4}-\d{2}$/);
	});
});
