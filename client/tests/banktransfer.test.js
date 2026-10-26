import { describe, expect, it } from "vitest";

import { transferQuestion, transferStep } from "@/lib/banktransfer";

/* ---------------------------------------------------------------------------
   Bank Transfer moves a month along (22 October 2026, asked for by HR): it
   works the salary out when opened on a month that is over, and Transferred —
   once the bank has been paid — makes the payslips.
   --------------------------------------------------------------------------- */

const base = { company: "Manna Rubber", ym: "2026-09", now: "2026-10", locked: false, ok: true, entry: null };
const at = (o) => transferStep({ ...base, ...o });

describe("which step Bank Transfer takes", () => {
	it("works out a month that is over by itself: the run first, then its slips", () => {
		expect(at({ state: "none" }).auto).toBe("start");
		expect(at({ state: "draft", entry: { name: "PE-1", docstatus: 0 } }).auto).toBe("slips");
	});

	it("works out this month only when asked, since its attendance is not finished", () => {
		const s = at({ ym: "2026-10", state: "none" });
		expect(s.auto).toBe("");
		expect(s.calc).toBe("start");
	});

	it("does nothing for a month that has not happened, and says so", () => {
		const s = at({ ym: "2026-11", state: "none" });
		expect([s.auto, s.calc, s.transfer]).toEqual(["", "", false]);
		expect(s.why).toMatch(/not happened/);
	});

	it("needs one company, because a salary run is one company's month", () => {
		const s = at({ company: "", state: "none" });
		expect(s.auto).toBe("");
		expect(s.why).toMatch(/Pick a company/);
	});

	it("takes no step for a login kept from changing pay", () => {
		expect(at({ locked: true, state: "none" })).toEqual({ auto: "", calc: "", transfer: false, why: "" });
		expect(at({ locked: true, state: "slips", entry: { name: "PE-1" } }).transfer).toBe(false);
	});

	it("takes no step before the month has been read", () => {
		expect(at({ ok: false, state: "none" }).auto).toBe("");
	});

	it("offers Transferred only on a run's draft slips — not before them, and not once they are submitted", () => {
		const entry = { name: "PE-1", docstatus: 1 };
		expect(at({ state: "slips", entry }).transfer).toBe(true);
		expect(at({ state: "queued", entry }).transfer).toBe(false);
		expect(at({ state: "final", entry }).transfer).toBe(false);
	});

	it("leaves slips made on the desk, with no run behind them, to the desk", () => {
		const s = at({ state: "slips", entry: null });
		expect(s.transfer).toBe(false);
		expect(s.why).toMatch(/made on the desk/);
	});

	it("says a failed run failed, and takes no step on it", () => {
		const s = at({ state: "failed", entry: { name: "PE-1" } });
		expect([s.auto, s.transfer]).toEqual(["", false]);
		expect(s.why).toMatch(/PE-1 failed/);
	});
});

describe("the question Transferred asks", () => {
	it("names the month, the total and how many people, and that it books the pay", () => {
		const q = transferQuestion({ label: "September 2026", count: 2, net: 18500, noBank: 0 });
		expect(q).toContain("September 2026");
		expect(q).toContain("₹18,500 to 2 people");
		expect(q).toMatch(/books the pay/);
		expect(q).not.toMatch(/no bank details/);
	});

	it("says how many of them have no bank details", () => {
		expect(transferQuestion({ label: "September 2026", count: 1, net: 8000, noBank: 1 })).toContain("1 of them has no bank details");
	});
});
