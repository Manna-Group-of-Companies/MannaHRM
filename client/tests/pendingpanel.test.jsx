import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import Regularization from "@/features/attendance/Regularization";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* Attendance Regularization used to decide its own requests in a box at the
   top of the page. It does not any more — see the note in the describe below. */

const decided = [];
vi.mock("@/features/approvals/decide", async (importOriginal) => ({
	...(await importOriginal()),
	decideCorrection: (r, action, note) => {
		decided.push([r.name, action, note]);
		return Promise.resolve({ ok: true, persisted: true, msg: `${r.name} ${action.toLowerCase()}d.` });
	},
}));
vi.mock("@/data/approver", () => ({
	ATTENDANCE_APPROVER: "admin@example.invalid",
	isAttendanceApprover: (u) => u === "admin@example.invalid",
}));
vi.mock("@/api/attendance", async (importOriginal) => ({
	...(await importOriginal()),
	loadRegGrid: () => Promise.resolve(),
	loadRegMonth: () => Promise.resolve(),
	loadShiftWindows: () => Promise.resolve(),
}));
vi.mock("@/api/load", async (importOriginal) => ({ ...(await importOriginal()), load: () => Promise.resolve() }));

function setup(owner) {
	set(loadedState());
	const emp = getState().employees.find((e) => e.status === "Active") || getState().employees[0];
	const ym = "2026-09";
	set({
		user: "admin@example.invalid",
		section: "attendance", subtab: "overview",
		reg: { ...getState().reg, emp: "", q: "", cycle: ym },
		regGrid: { key: ym, state: "ok", err: "", leave: [], ar: [], punches: [] },
		approvals: { ...getState().approvals, attendance: [{
			name: "HR-REG-2026-00009", employee: emp.name, employee_name: emp.employee_name,
			attendance_date: "2026-09-10", requested_in: "2026-09-10 09:00:00", requested_out: "",
			reason: "Machine was fast", status: "Pending Approval", owner,
		}] },
	});
}

describe("Attendance Regularization leaves approvals to Dashboard → Approvals", () => {
	/* The "Waiting for approval" box came off this page on 29 September 2026 —
	   most days it only said "Nothing waiting". A correction is decided on
	   Dashboard → Approvals through the same decideCorrection, whose rules
	   (the raiser cannot decide it, approving writes the punch) are pinned in
	   decide.test.jsx. What is pinned here is that this page no longer offers
	   the decision, even with a correction waiting in the cycle on screen. */
	beforeEach(() => { decided.length = 0; resetStore(); });

	it("draws no approval box and no Approve, with a correction waiting", async () => {
		setup("hr@example.invalid");
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });

		expect(screen.queryByRole("region", { name: "Waiting for approval" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Approve HR-REG-2026-00009" })).toBeNull();
		expect(screen.queryByText(/Nothing waiting/)).toBeNull();
		expect(decided).toEqual([]);
	});

	it("still draws the register under the bar", async () => {
		setup("hr@example.invalid");
		const { container } = await act(async () => render(<Provider store={store}><Regularization /></Provider>));
		expect(container.querySelector("table.rgrid")).toBeTruthy();
	});
});
