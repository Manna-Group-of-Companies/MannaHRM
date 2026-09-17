import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveDayEdit } from "@/api/punchedit";
import { supersededBy } from "@/lib/punchedit";
import { resetStore, set } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Attendance Regularization → Save on a changed Time In / Time Out.

   Saving is a request, not a change: one Pending Approval correction, and not
   a single punch written or set aside until an approver decides it.
   --------------------------------------------------------------------------- */

const REG = "Employee Attendance Regularization";
const calls = { wrote: [], made: [], called: [] };
let lists;

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	apiWrite: (...a) => { calls.wrote.push(a); return Promise.resolve({ ok: true }); },
	apiCreate: (...a) => { calls.made.push(a); return Promise.resolve({ name: "HR-REG-2026-00009" }); },
	listAll: (label) => Promise.resolve(lists(label)),
	apiCall: (...a) => { calls.called.push(a); return Promise.resolve({}); },
}));
vi.mock("@/api/load", async (importOriginal) => ({ ...(await importOriginal()), load: () => Promise.resolve() }));
vi.mock("@/api/attendance", async (importOriginal) => ({ ...(await importOriginal()), loadRegMonth: () => Promise.resolve() }));

const EMP = { name: "HR-EMP-00002", employee_name: "Priya Menon", company: "Manna Rubber" };
const DAY = "2026-09-10";
const MACHINE_IN = { name: "EMP-CKIN-1", time: "2026-09-10 08:02:00", log_type: "IN", skip_auto_attendance: 0 };

beforeEach(() => {
	calls.wrote = [];
	calls.made = [];
	calls.called = [];
	lists = (label) => (label === "Employee Checkin" ? [MACHINE_IN] : []);
	resetStore();
	set(loadedState());
	set({ user: "hr@example.invalid" });
});

describe("saving a changed time changes it now", () => {
	it("writes an Approved correction, the new punches, and sets aside the machine's punch it replaces", async () => {
		const res = await saveDayEdit(EMP, DAY, { in: "09:00", out: "18:00", reason: "Machine was fast" });

		expect(res.ok).toBe(true);
		const [label, doc] = calls.made[0];
		expect(label).toBe(REG);
		expect(doc).toMatchObject({
			employee: EMP.name, attendance_date: DAY, status: "Approved", decided_by: "hr@example.invalid",
			requested_in: "2026-09-10 09:00:00", requested_out: "2026-09-10 18:00:00", reason: "Machine was fast",
		});
		expect(calls.made.slice(1)).toEqual([
			["Employee Checkin", expect.objectContaining({ employee: EMP.name, time: "2026-09-10 09:00:00", log_type: "IN", device_id: "REG-hr@example.invalid" })],
			["Employee Checkin", expect.objectContaining({ employee: EMP.name, time: "2026-09-10 18:00:00", log_type: "OUT" })],
		]);
		expect(calls.wrote).toEqual([["Employee Checkin", "EMP-CKIN-1", { skip_auto_attendance: 1 }]]);
		expect(res.msg).toContain("10-Sep-2026 saved (In 09:00, Out 18:00)");
		expect(res.msg).not.toContain("hr@mannarubber.com");
	});

	it("sends nothing to hr@mannarubber.com — no request is raised and nothing is assigned", async () => {
		await saveDayEdit(EMP, DAY, { in: "09:00", out: "", reason: "Machine was fast" });
		expect(calls.called).toEqual([]);
		expect(calls.made[0][1].status).not.toBe("Pending Approval");
	});

	it("saves the request already waiting for that day rather than raising a second", async () => {
		lists = (label) => (label === REG ? [{ name: "HR-REG-2026-00004", status: "Pending Approval" }]
			: label === "Employee Checkin" ? [MACHINE_IN] : []);
		const res = await saveDayEdit(EMP, DAY, { in: "09:15", out: "", reason: "Corrected again" });

		expect(res.ok).toBe(true);
		expect(calls.made.map((m) => m[0])).toEqual(["Employee Checkin"]);
		expect(calls.wrote[0]).toEqual([REG, "HR-REG-2026-00004", expect.objectContaining({
			requested_in: "2026-09-10 09:15:00", requested_out: null, reason: "Corrected again", status: "Approved",
		})]);
	});

	it("a punch the site refuses leaves the correction Pending rather than Approved with nothing behind it", async () => {
		const client = await import("@/api/client");
		const spy = vi.spyOn(client, "apiCreate").mockImplementation((dt, doc) => (dt === "Employee Checkin"
			? Promise.reject(new Error("not permitted")) : Promise.resolve({ name: "HR-REG-2026-00009", ...doc })));
		const res = await saveDayEdit(EMP, DAY, { in: "09:00", out: "", reason: "Machine was fast" });
		spy.mockRestore();

		expect(res.ok).toBe(false);
		expect(res.msg).toContain("The time was not saved");
		expect(calls.wrote).toContainEqual([REG, "HR-REG-2026-00009", { status: "Pending Approval", decided_by: null, decided_on: null }]);
	});

	it("a saved time that a later save set aside is put back, not skipped as already there", async () => {
		const aside = { name: "EMP-CKIN-8", time: "2026-09-10 08:22:00", log_type: "IN", skip_auto_attendance: 1 };
		const later = { name: "EMP-CKIN-9", time: "2026-09-10 08:30:00", log_type: "IN", skip_auto_attendance: 0 };
		lists = (label) => (label === "Employee Checkin" ? [aside, later] : []);
		const res = await saveDayEdit(EMP, DAY, { in: "08:22", out: "", reason: "Back to the real time" });

		expect(res.ok).toBe(true);
		expect(calls.wrote).toContainEqual(["Employee Checkin", "EMP-CKIN-8", { skip_auto_attendance: 0 }]);
		expect(calls.made.filter((m) => m[0] === "Employee Checkin")).toEqual([]);
		expect(res.msg).toContain("Put back from set aside: IN 08:22");
		expect(res.msg).not.toContain("Already on the site");
	});

	it("refuses to remove a time", async () => {
		const res = await saveDayEdit(EMP, DAY, { in: "", out: "", reason: "Was not here" });
		expect(res.ok).toBe(false);
		expect(calls.made).toHaveLength(0);
	});

	it("saves without a reason, and records who changed it in its place", async () => {
		const res = await saveDayEdit(EMP, DAY, { in: "09:00", out: "", reason: " " });
		expect(res.ok).toBe(true);
		expect(calls.made[0][1].reason).toBe("Changed on Attendance Regularization by hr@example.invalid");
	});
});

describe("the punches an approved time replaces", () => {
	const day = [
		MACHINE_IN,
		{ name: "EMP-CKIN-2", time: "2026-09-10 19:40:00", log_type: "OUT", skip_auto_attendance: 0 },
		{ name: "EMP-CKIN-3", time: "2026-09-10 07:50:00", log_type: "IN", skip_auto_attendance: 1 },
	];

	it("an IN before the requested Time In and an OUT after the requested Time Out", () => {
		expect(supersededBy(day, "2026-09-10 09:00:00", "2026-09-10 18:00:00").map((c) => c.name))
			.toEqual(["EMP-CKIN-1", "EMP-CKIN-2"]);
	});

	it("nothing on a side the request leaves empty", () => {
		expect(supersededBy(day, "", "2026-09-10 20:00:00")).toEqual([]);
	});
});
