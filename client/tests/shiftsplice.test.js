import { beforeEach, describe, expect, it, vi } from "vitest";

import { spliceShift, spliceText } from "@/lib/shiftsplice";
import { dmy } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Changing a shift is adding one (1 October 2026). HR gave VIKRAM ASUR
   (MRP-298) an open-ended HRI-Night Shift from 1 October, then the night shift
   Factor HR's Change Shift Report has for him, 28 Sep – 3 Oct — and the site
   refused it: "already has an active Shift Assignment HR-SHA-26-10-00004 for
   some/all of these dates". The new shift wins on its dates; the old one keeps
   the rest. lib/shiftsplice.js.
   --------------------------------------------------------------------------- */

const A = (name, shift_type, start_date, end_date = "") => ({ name, shift_type, start_date, end_date });
const VIKRAM = A("HR-SHA-26-10-00004", "HRI-Night Shift", "2026-10-01");

describe("a new shift for dates makes room in the ones already there", () => {
	it("an old shift inside the new dates is set Inactive, and the part after them comes back", () => {
		const p = spliceShift([VIKRAM], { shift: "Production12hrshift2", from: "2026-09-28", to: "2026-10-03" });
		expect(p.trim).toEqual([]);
		expect(p.retire).toEqual([{ name: "HR-SHA-26-10-00004", shift_type: "HRI-Night Shift", start_date: "2026-10-01", end_date: "" }]);
		expect(p.resume).toEqual([{ shift_type: "HRI-Night Shift", start_date: "2026-10-04", end_date: "", after: "HR-SHA-26-10-00004" }]);
	});

	it("an old shift that began earlier ends the day before the new one", () => {
		const p = spliceShift([A("SA-1", "Day", "2026-09-01")], { shift: "Night", from: "2026-09-28" });
		expect(p.trim).toEqual([{ name: "SA-1", shift_type: "Day", start_date: "2026-09-01", end_date: "2026-09-27", was: "" }]);
		expect(p.retire).toEqual([]);
		expect(p.resume).toEqual([]);
	});

	it("a week of nights in the middle of an open-ended day shift splits it in three", () => {
		const p = spliceShift([A("SA-1", "Day", "2026-09-01")], { shift: "Night", from: "2026-09-28", to: "2026-10-03" });
		expect(p.trim.map((a) => a.end_date)).toEqual(["2026-09-27"]);
		expect(p.resume).toEqual([{ shift_type: "Day", start_date: "2026-10-04", end_date: "", after: "SA-1" }]);
	});

	it("the end of a month is counted as the calendar has it", () => {
		const p = spliceShift([A("SA-1", "Day", "2026-02-01", "2026-03-31")], { shift: "Night", from: "2026-03-01", to: "2026-03-31" });
		expect(p.trim[0].end_date).toBe("2026-02-28");
		expect(p.resume).toEqual([]);
	});

	it("an open-ended new shift retires every one that starts on or after it", () => {
		const p = spliceShift([A("SA-1", "Day", "2026-10-01", "2026-10-10"), A("SA-2", "Night", "2026-10-11")], { shift: "General", from: "2026-10-01" });
		expect(p.retire.map((a) => a.name)).toEqual(["SA-1", "SA-2"]);
		expect(p.resume).toEqual([]);
	});

	it("shifts that end before the new dates or start after them are left alone", () => {
		const p = spliceShift([A("SA-1", "Day", "2026-09-01", "2026-09-27"), A("SA-2", "Day", "2026-10-04")],
			{ shift: "Night", from: "2026-09-28", to: "2026-10-03" });
		expect(p).toEqual({ same: false, trim: [], retire: [], resume: [] });
	});

	it("asking for the shift a person is already on for those dates changes nothing", () => {
		expect(spliceShift([A("SA-1", "Night", "2026-09-01")], { shift: "Night", from: "2026-09-28", to: "2026-10-03" }).same).toBe(true);
		expect(spliceShift([A("SA-1", "Night", "2026-09-01", "2026-09-30")], { shift: "Night", from: "2026-09-28", to: "2026-10-03" }).same).toBe(false);
	});

	it("says what it will do in words", () => {
		const p = spliceShift([VIKRAM], { shift: "X", from: "2026-09-28", to: "2026-10-03" });
		expect(spliceText(p, dmy)).toBe("HRI-Night Shift 01-Oct-2026 → (HR-SHA-26-10-00004) set Inactive · HRI-Night Shift resumes 04-Oct-2026 →");
		expect(spliceText(spliceShift([], { shift: "X", from: "2026-09-28" }), dmy)).toBe("");
	});
});

/* --------------------------------------------------------------- the writes */

const calls = [];
let refuseNew = false;
let current = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label) => Promise.resolve(label === "Shift Assignment" ? current : [
		{ attendance_date: "2026-09-29", shift: "Manna Rubber Products Pvt.Ltd-Production12hrshift1" },
		{ attendance_date: "2026-09-28", shift: "Manna Rubber Products Pvt.Ltd-Production12hrshift1" },
	]),
	apiWrite: (label, name, patch) => { calls.push(["write", name, patch]); return Promise.resolve({ ok: true }); },
	apiCreateSubmitted: (label, doc) => {
		calls.push(["create", doc.shift_type, doc.start_date, doc.end_date]);
		if (refuseNew && doc.start_date === "2026-09-28") return Promise.reject(new Error("Not permitted"));
		return Promise.resolve({ name: "HR-SHA-NEW" });
	},
}));
vi.mock("@/api/attendance", async (importOriginal) => ({ ...(await importOriginal()), loadRegMonth: () => Promise.resolve() }));

const { addShiftForDates } = await import("@/api/shiftassign");
const EMP = { name: "HR-EMP-00130", employee_name: "VIKRAM ASUR", company: "Manna Rubber Products Private Limited" };

describe("adding a shift that overlaps one already there", () => {
	beforeEach(() => { calls.length = 0; refuseNew = false; current = [VIKRAM]; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-01T12:30:00")); });

	it("makes room, adds the new shift, then gives the old one back its days after", async () => {
		const r = await addShiftForDates(EMP, { shift: "Production12hrshift2", from: "2026-09-28", to: "2026-10-03" });
		expect(calls).toEqual([
			["write", "HR-SHA-26-10-00004", { status: "Inactive" }],
			["create", "Production12hrshift2", "2026-09-28", "2026-10-03"],
			["create", "HRI-Night Shift", "2026-10-04", undefined],
		]);
		expect(r.ok).toBe(true);
		expect(r.msg).toContain("HR-SHA-NEW: Production12hrshift2 from 28-Sep-2026 to 03-Oct-2026.");
		expect(r.msg).toContain("set Inactive");
	});

	it("names the past days hrms already marked on the old shift, because the new one does not change them", async () => {
		const r = await addShiftForDates(EMP, { shift: "Production12hrshift2", from: "2026-09-28", to: "2026-10-03" });
		expect(r.msg).toContain("Already marked on the old shift, and not changed by this: 28-Sep-2026, 29-Sep-2026.");
	});

	it("a refused new shift puts the old one back as it was", async () => {
		refuseNew = true;
		const r = await addShiftForDates(EMP, { shift: "Production12hrshift2", from: "2026-09-28", to: "2026-10-03" });
		expect(r.ok).toBe(false);
		expect(calls).toEqual([
			["write", "HR-SHA-26-10-00004", { status: "Inactive" }],
			["create", "Production12hrshift2", "2026-09-28", "2026-10-03"],
			["write", "HR-SHA-26-10-00004", { status: "Active" }],
		]);
		expect(r.msg).toContain("put back as they were");
	});

	it("an earlier end date that is undone goes back to open-ended, not to a date", async () => {
		refuseNew = true;
		current = [A("SA-1", "Day", "2026-09-01")];
		await addShiftForDates(EMP, { shift: "Night", from: "2026-09-28", to: "2026-10-03" });
		expect(calls[0]).toEqual(["write", "SA-1", { end_date: "2026-09-27" }]);
		expect(calls.at(-1)).toEqual(["write", "SA-1", { end_date: null }]);
	});

	it("removing a dated shift sets it Inactive and cancels nothing", async () => {
		const { removeShiftForDates } = await import("@/api/shiftassign");
		const r = await removeShiftForDates(EMP, VIKRAM);
		expect(calls).toEqual([["write", "HR-SHA-26-10-00004", { status: "Inactive" }]]);
		expect(r.ok).toBe(true);
		expect(r.msg).toContain("days already marked keep the shift they were marked on");
	});

	it("the shift a person is already on writes nothing", async () => {
		current = [A("SA-1", "Night", "2026-09-01")];
		const r = await addShiftForDates(EMP, { shift: "Night", from: "2026-09-28" });
		expect(calls).toEqual([]);
		expect(r).toEqual({ ok: true, msg: "VIKRAM ASUR is already on Night on those dates." });
	});
});
