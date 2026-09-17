import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import Regularization from "@/features/attendance/Regularization";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* Attendance Regularization decides its own requests: a correction sent for
   approval is listed at the top of the page with Approve and Reject, and a
   request is never decided by the login that raised it. */

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

describe("Attendance Regularization lists what is waiting for approval", () => {
	beforeEach(() => { decided.length = 0; resetStore(); });

	it("approves a request from the page it was raised on", async () => {
		setup("hr@example.invalid");
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });

		expect(screen.getByRole("region", { name: "Waiting for approval" })).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Decision note, HR-REG-2026-00009"), { target: { value: "ok" } });
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve HR-REG-2026-00009" })); });

		expect(decided).toEqual([["HR-REG-2026-00009", "Approve", "ok"]]);
		expect(screen.getByRole("status").textContent).toContain("approved");
	});

	it("will not let the login that raised a request decide it", async () => {
		setup("admin@example.invalid");
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });

		expect(screen.getByRole("button", { name: "Approve HR-REG-2026-00009" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Reject HR-REG-2026-00009" })).toBeDisabled();
	});
});

describe("the approval box is there even when nothing is waiting", () => {
	beforeEach(() => resetStore());

	it("says a request is waiting in another month rather than hiding", async () => {
		setup("hr@example.invalid");
		set({ reg: { ...getState().reg, cycle: "2026-08" }, regGrid: { key: "2026-08", state: "ok", err: "", leave: [], ar: [], punches: [] } });
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });

		const box = screen.getByRole("region", { name: "Waiting for approval" });
		expect(box.textContent).toContain("Waiting in: Sep-2026");
	});
});

describe("a login that is not the approver", () => {
	beforeEach(() => resetStore());

	it("sees who the request is waiting for, and no Approve", async () => {
		setup("clerk@example.invalid");
		set({ user: "clerk@example.invalid" });
		await act(async () => { render(<Provider store={store}><Regularization /></Provider>); });

		const box = screen.getByRole("region", { name: "Waiting for approval" });
		expect(box.textContent).toContain("Waiting for admin@example.invalid");
		expect(screen.queryByRole("button", { name: "Approve HR-REG-2026-00009" })).toBeNull();
	});
});
