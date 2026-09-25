import { describe, expect, it } from "vitest";
import { balanceOf, ledgerUpTo, lvbFill, lvbKey } from "@/lib/leavebalance";
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

import { act, render } from "@testing-library/react";
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
