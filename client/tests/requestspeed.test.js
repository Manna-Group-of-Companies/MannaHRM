import { beforeEach, describe, expect, it, vi } from "vitest";

import { getState, resetStore, set } from "@/store";

/* Save returns once the day is written, without re-reading the whole dashboard
   — `load()` pages through every Attendance row on the site, and waiting on it
   made every save look stuck. */
const calls = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (dt) => { calls.push(["read", dt]); return Promise.resolve(dt === "Employee Checkin"
		? [{ name: "c1", time: "2026-09-01 08:05:00", log_type: "IN", skip_auto_attendance: 0 }] : []); },
	apiCreate: (dt, doc) => { calls.push(["create", dt]); return Promise.resolve({ name: dt === "Employee Checkin" ? "CK-1" : "HR-REG-7", ...doc }); },
	apiWrite: (dt) => { calls.push(["write", dt]); return Promise.resolve({ ok: true }); },
	apiCall: (method) => { calls.push(["call", method]); return new Promise(() => {}); },
}));
vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	load: () => { calls.push(["load"]); return new Promise(() => {}); },
}));

const { saveDayEdit } = await import("@/api/punchedit");

describe("Save", () => {
	beforeEach(() => { calls.length = 0; resetStore(); });

	it("returns once the day is written, without re-reading the dashboard, and leaves nothing in the approval queue", async () => {
		set({ user: "hitechrubber@mannarubber.com", approvals: { ...getState().approvals,
			attendance: [{ name: "HR-REG-OTHER", employee: "E2", status: "Pending Approval" }] } });
		const emp = { name: "E1", employee_name: "Asha", company: "Hi-Tech Rubber Industries" };
		const res = await saveDayEdit(emp, "2026-09-01", { in: "08:00", out: "", reason: "Machine missed" });

		expect(res.ok).toBe(true);
		expect(calls).not.toContainEqual(["load"]);
		expect(calls.filter((c) => c[0] === "call")).toEqual([]);
		expect(getState().approvals.attendance.map((r) => r.name)).toEqual(["HR-REG-OTHER"]);
	});
});
