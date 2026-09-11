import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Approvals from "@/features/approvals/Approvals";
import {
	decideCorrection, localStamp, missingPunches, notYours, punchTime, punchesFor, regDevice,
} from "@/features/approvals/decide";
import { store, set, resetStore, getState } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Dashboard → Approvals → Attendance: the tick and the cross.

   What is worth pinning is the order and the boundary. The status goes to the
   site first, so a refused approval writes nothing; then any requested punch
   the site does not already hold is written, and nothing else — never
   `Attendance`, never a second copy of a punch that is there. A punch the site
   refuses puts the request back in the queue rather than leaving it Approved
   on a day that is still missing its punch.
   --------------------------------------------------------------------------- */

const REG = "Employee Attendance Regularization";

const calls = { wrote: [], made: [], listed: [] };
let writes;   // what apiWrite answers, per test
let creates;  // what apiCreate does, per test
let lists;    // what listAll answers, per doctype

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiWrite: (...a) => {
			calls.wrote.push(a);
			return writes(...a);
		},
		apiCreate: (...a) => {
			calls.made.push(a);
			return creates(...a);
		},
		listAll: (label, fields, filters) => {
			calls.listed.push([label, filters]);
			return lists(label, fields, filters);
		},
	};
});

vi.mock("@/api/load", async (importOriginal) => ({
	...(await importOriginal()),
	load: () => Promise.resolve(),
}));

/** The request on the screenshot of 11 Sep 2026: both punches asked for. */
const REQ = {
	name: "HR-REG-2026-00001", employee: "HR-EMP-00002", employee_name: "Priya Menon",
	attendance_date: "2026-09-10", requested_in: "2026-09-10 16:10:00",
	requested_out: "2026-09-10 18:00:00", reason: "sorry", status: "Pending Approval",
	owner: "priya@example.invalid",
};

const byLabel = (label) => calls.listed.filter((c) => c[0] === label);

beforeEach(() => {
	calls.wrote = [];
	calls.made = [];
	calls.listed = [];
	writes = () => Promise.resolve({ ok: true });
	creates = (label, doc) => Promise.resolve({ name: "EMP-CKIN-NEW", ...doc });
	lists = () => Promise.resolve([]);
	resetStore();
	set(loadedState());
	set({ user: "hr@example.invalid" });
});

describe("what an approval records", () => {
	it("pins a bare clock time to the day the request is about", () => {
		expect(punchTime("2026-09-10", "09:00:00")).toBe("2026-09-10 09:00:00");
		expect(punchTime("2026-09-10", "9:05")).toBe("2026-09-10 09:05:00");
	});

	it("cuts a datetime to the second, so a retry can match it exactly", () => {
		expect(punchTime("2026-09-10", "2026-09-10 16:10:00.000000")).toBe("2026-09-10 16:10:00");
		expect(punchTime("2026-09-10", "")).toBe("");
	});

	it("records only the punches that were asked for, in order", () => {
		expect(punchesFor(REQ)).toEqual([
			{ log_type: "IN", time: "2026-09-10 16:10:00" },
			{ log_type: "OUT", time: "2026-09-10 18:00:00" },
		]);
		expect(punchesFor({ ...REQ, requested_in: "" })).toEqual([
			{ log_type: "OUT", time: "2026-09-10 18:00:00" },
		]);
	});

	it("skips a punch the site already holds at that second", () => {
		const wanted = punchesFor(REQ);
		const left = missingPunches(wanted, [{ time: "2026-09-10 16:10:00.000000", log_type: "IN" }]);
		expect(left).toEqual([{ log_type: "OUT", time: "2026-09-10 18:00:00" }]);
	});

	it("marks its punches with the prefix the server reads as a regularization", () => {
		expect(regDevice("hr@example.invalid")).toBe("REG-hr@example.invalid");
	});

	it("writes the site's local wall-clock time, not UTC", () => {
		expect(localStamp(new Date(2026, 8, 11, 9, 5, 7))).toBe("2026-09-11 09:05:07");
	});
});

describe("who may decide", () => {
	it("refuses the person who raised the request", () => {
		expect(notYours(REQ, "priya@example.invalid", "")).toMatch(/You raised this/);
	});

	it("refuses a request about the approver's own attendance, whoever raised it", () => {
		expect(notYours({ ...REQ, owner: "hr@example.invalid" }, "boss@example.invalid", "HR-EMP-00002"))
			.toMatch(/your own attendance/);
	});

	it("lets anybody else through", () => {
		expect(notYours(REQ, "hr@example.invalid", "HR-EMP-00009")).toBe("");
	});
});

describe("approving a correction", () => {
	it("writes the status first, then both punches as the approver", async () => {
		const res = await decideCorrection(REQ, "Approve", "ok");

		expect(res.ok).toBe(true);
		expect(calls.wrote).toHaveLength(1);
		const [label, name, patch] = calls.wrote[0];
		expect(label).toBe(REG);
		expect(name).toBe("HR-REG-2026-00001");
		expect(patch.status).toBe("Approved");
		expect(patch.decided_by).toBe("hr@example.invalid");
		expect(patch.decision_note).toBe("ok");

		expect(calls.made.map((c) => [c[0], c[1].log_type, c[1].time, c[1].device_id])).toEqual([
			["Employee Checkin", "IN", "2026-09-10 16:10:00", "REG-hr@example.invalid"],
			["Employee Checkin", "OUT", "2026-09-10 18:00:00", "REG-hr@example.invalid"],
		]);
		expect(calls.made.every((c) => c[1].skip_auto_attendance === 0)).toBe(true);
		expect(res.msg).toContain("IN 16:10, OUT 18:00");
	});

	it("never writes Attendance", async () => {
		await decideCorrection(REQ, "Approve");
		expect(calls.made.some((c) => c[0] === "Attendance")).toBe(false);
		expect(calls.wrote.some((c) => c[0] === "Attendance")).toBe(false);
	});

	it("writes nothing twice when the site's own hook already wrote the punches", async () => {
		lists = (label) => Promise.resolve(label === "Employee Checkin"
			? [{ name: "EMP-CKIN-1", time: "2026-09-10 16:10:00", log_type: "IN" },
				{ name: "EMP-CKIN-2", time: "2026-09-10 18:00:00", log_type: "OUT" }]
			: []);
		const res = await decideCorrection(REQ, "Approve");

		expect(res.ok).toBe(true);
		expect(calls.made).toHaveLength(0);
		expect(res.msg).toContain("Already on the site");
	});

	it("writes no punch at all when the site refuses the approval", async () => {
		writes = () => Promise.resolve({ ok: false, error: "Not permitted", status: 403 });
		const res = await decideCorrection(REQ, "Approve");

		expect(res.ok).toBe(false);
		expect(res.msg).toContain("Not permitted");
		expect(calls.made).toHaveLength(0);
	});

	it("puts the request back to Pending when a punch is refused", async () => {
		creates = (label, doc) => (doc.log_type === "OUT"
			? Promise.reject(new Error("Employee Checkin: not permitted"))
			: Promise.resolve({ name: "EMP-CKIN-NEW" }));
		const res = await decideCorrection(REQ, "Approve");

		expect(res.ok).toBe(false);
		expect(calls.wrote).toHaveLength(2);
		expect(calls.wrote[1][2]).toEqual({ status: "Pending Approval", decided_by: null, decided_on: null });
		expect(res.msg).toContain("back to Pending Approval");
		expect(res.msg).toContain("IN 16:10 did land");
	});

	it("says so when the day already carries an Attendance row the job will not rebuild", async () => {
		lists = (label) => Promise.resolve(label === "Attendance"
			? [{ name: "HR-ATT-2026-00001", status: "Absent" }]
			: []);
		const res = await decideCorrection(REQ, "Approve");

		expect(res.ok).toBe(true);
		expect(res.msg).toContain("HR-ATT-2026-00001 already marks the day Absent");
	});

	it("refuses one with neither time before writing anything", async () => {
		const res = await decideCorrection({ ...REQ, requested_in: "", requested_out: "" }, "Approve");
		expect(res.ok).toBe(false);
		expect(calls.wrote).toHaveLength(0);
	});

	it("refuses a request that is no longer pending", async () => {
		const res = await decideCorrection({ ...REQ, status: "Approved" }, "Approve");
		expect(res.ok).toBe(false);
		expect(calls.wrote).toHaveLength(0);
	});

	it("refuses the approver's own attendance before writing anything", async () => {
		lists = (label) => Promise.resolve(label === "Employee" ? [{ name: "HR-EMP-00002" }] : []);
		const res = await decideCorrection({ ...REQ, owner: "someone@example.invalid" }, "Approve");
		expect(res.ok).toBe(false);
		expect(res.msg).toMatch(/your own attendance/);
		expect(calls.wrote).toHaveLength(0);
	});
});

describe("rejecting a correction", () => {
	it("writes the status and the note, and no punch", async () => {
		const res = await decideCorrection(REQ, "Reject", "Was on leave");

		expect(res.ok).toBe(true);
		expect(calls.wrote[0][2].status).toBe("Rejected");
		expect(calls.wrote[0][2].decision_note).toBe("Was on leave");
		expect(calls.made).toHaveLength(0);
		expect(byLabel("Employee Checkin")).toHaveLength(0);
	});
});

describe("the tick on the card", () => {
	const draw = () => {
		set({ section: "dashboard", apptab: "attendance",
			approvals: { ...getState().approvals, attendance: [REQ] } });
		return render(<Provider store={store}><Approvals /></Provider>);
	};

	it("asks first, naming the punches it will write", async () => {
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Approve"]').click(); });

		const dlg = view.container.querySelector('[role="dialog"]');
		expect(dlg).toBeTruthy();
		expect(dlg.textContent).toContain("Approve HR-REG-2026-00001");
		expect(dlg.textContent).toContain("IN 16:10, OUT 18:00");
		expect(calls.wrote).toHaveLength(0);
	});

	it("writes on confirmation and says what it did", async () => {
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Approve"]').click(); });
		fireEvent.change(view.container.querySelector("#dc_note"), { target: { value: "Checked CCTV" } });
		const confirm = [...view.container.querySelectorAll('[role="dialog"] button')]
			.find((b) => b.textContent.includes("✓ Approve"));
		await act(async () => { confirm.click(); });

		expect(calls.wrote[0][2].status).toBe("Approved");
		expect(calls.wrote[0][2].decision_note).toBe("Checked CCTV");
		expect(calls.made).toHaveLength(2);
		expect(view.container.querySelector('[role="dialog"]')).toBeNull();
		expect(view.container.textContent).toContain("HR-REG-2026-00001 approved");
	});

	it("keeps the dialog open with the site's reason when it is refused", async () => {
		writes = () => Promise.resolve({ ok: false, error: "Workflow State transition not allowed" });
		const view = draw();
		await act(async () => { view.container.querySelector('button[aria-label="Reject"]').click(); });
		const confirm = [...view.container.querySelectorAll('[role="dialog"] button')]
			.find((b) => b.textContent.includes("✕ Reject"));
		await act(async () => { confirm.click(); });

		const dlg = view.container.querySelector('[role="dialog"]');
		expect(dlg).toBeTruthy();
		expect(dlg.textContent).toContain("Workflow State transition not allowed");
	});
});
