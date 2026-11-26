import { beforeEach, describe, expect, it, vi } from "vitest";

import { getState, resetStore, set } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Approve and Reject close as soon as the site has the decision (26 November
   2026). The dialog had waited on `load()`, which read every Attendance row on
   the live site — 18,128 rows, 182 sequential reads — and sat on "Saving…" for
   minutes after the decision had already landed.
   --------------------------------------------------------------------------- */

const calls = [];
let reloads = 0;

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (dt) => { calls.push(["read", dt]); return Promise.resolve([]); },
	apiCreate: (dt, doc) => { calls.push(["create", dt]); return Promise.resolve({ name: "CK-1", ...doc }); },
	apiWrite: (dt) => { calls.push(["write", dt]); return Promise.resolve({ ok: true }); },
	apiCall: (method) => { calls.push(["call", method]); return Promise.resolve({}); },
	apiDecide: () => Promise.resolve({ ok: true }),
}));

vi.mock("@/data/approver", () => ({
	ATTENDANCE_APPROVER: "hr@example.invalid",
	isAttendanceApprover: (u) => u === "hr@example.invalid",
}));

// A reload that never finishes: anything that waits on it never returns.
vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	load: () => { reloads++; return new Promise(() => {}); },
}));

vi.mock("@/api/absencerule", () => ({
	giveBack: () => Promise.resolve({ ok: true, returned: [] }),
	afterCorrection: () => Promise.resolve(null),
}));

const { decideCorrection } = await import("@/features/approvals/decide");

const REQ = {
	name: "HR-REG-2026-00026", employee: "HR-EMP-00125", employee_name: "PAUL SUNNY",
	attendance_date: "2026-11-25", requested_in: "2026-11-25 09:30:00",
	requested_out: "2026-11-25 18:30:00", reason: "sorry", status: "Pending Approval",
	owner: "mrp-293@phone.manna.invalid",
};
const OTHER = { ...REQ, name: "HR-REG-2026-00027" };

beforeEach(() => {
	calls.length = 0;
	reloads = 0;
	resetStore();
	set(loadedState());
	set({ user: "hr@example.invalid", approvals: { ...getState().approvals, attendance: [REQ, OTHER] } });
});

describe("deciding a time correction", () => {
	it("Approve returns once the punches are written, without waiting on the dashboard's reload", async () => {
		const res = await decideCorrection(REQ, "Approve", "");
		expect(res.ok).toBe(true);
		expect(calls.filter((c) => c[0] === "create").length).toBe(2);
		// The request is gone from the queue on screen at once; the rest reloads behind.
		expect(getState().approvals.attendance.map((r) => r.name)).toEqual(["HR-REG-2026-00027"]);
		expect(reloads).toBe(1);
	});

	it("Reject returns at once too, and leaves the other requests where they are", async () => {
		const res = await decideCorrection(REQ, "Reject", "");
		expect(res.ok).toBe(true);
		expect(calls.filter((c) => c[0] === "create")).toEqual([]);
		expect(getState().approvals.attendance.map((r) => r.name)).toEqual(["HR-REG-2026-00027"]);
	});
});

describe("the dashboard's attendance count", () => {
	it("is asked for as one count, never by reading every Attendance row", async () => {
		const fs = await import("node:fs");
		const path = await import("node:path");
		const src = fs.readFileSync(path.resolve(process.cwd(), "src/api/load.js"), "utf8");
		expect(src).not.toMatch(/listAll\("Attendance", \["name"\]\)/);
		expect(src).toMatch(/frappe\.client\.get_count", \{ doctype: "Attendance" \}/);
	});
});
