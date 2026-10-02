import { describe, expect, it } from "vitest";
import { BY_MACHINE, byMachine, fromMachine } from "@/lib/direction";
import { monthRoster } from "@/lib/roster";

/* ---------------------------------------------------------------------------
   Manna Tyre Retreads: 692 is the punch-in machine, 688 the punch-out
   machine, and the production shift is 24 hours — in at nine, out at nine the
   next morning (lib/direction.js). The punches below are MTR-009's, off the
   site, keys and all: 19 Sep was keyed OUT on the in machine.
   --------------------------------------------------------------------------- */

const IN = "BIO-6426150300692";
const OUT = "BIO-6426150300688";
const p = (time, device_id, log_type) => ({ name: time, employee: "MTR-009", time, device_id, log_type });

const JAYAKUMAR = [
	p("2026-09-16 08:35:11", OUT, "OUT"),
	p("2026-09-17 09:03:02", IN, "IN"),
	p("2026-09-18 09:21:48", OUT, "OUT"),
	p("2026-09-19 09:18:30", IN, "OUT"),
	p("2026-09-20 10:05:12", OUT, "OUT"),
	p("2026-09-21 09:12:19", IN, "IN"),
	p("2026-09-22 09:13:26", OUT, "OUT"),
];

const month = (punches) =>
	monthRoster({ ym: "2026-09", today: "2026-09-30", punches: byMachine(punches) }).rows;
const on = (rows, iso) => rows.find((r) => r.iso === iso);

describe("the machine says the direction", () => {
	it("692 is in and 688 is out, and nobody else's machine is touched", () => {
		expect(BY_MACHINE.get(IN)).toBe("IN");
		expect(BY_MACHINE.get(OUT)).toBe("OUT");
		expect(BY_MACHINE.has("BIO-MRP-GATE1")).toBe(false);
		const gate = p("2026-09-22 08:31:00", "BIO-MRP-GATE1", "OUT");
		expect(fromMachine(gate)).toBe(gate);
	});

	it("whatever key was pressed, which is kept as pressed", () => {
		expect(fromMachine(p("2026-09-19 09:18:30", IN, "OUT"))).toMatchObject({ log_type: "IN", pressed: "OUT" });
		expect(byMachine(null)).toBeNull();
	});
});

describe("a 24-hour shift belongs to the day it started", () => {
	const rows = month(JAYAKUMAR);

	it("in at nine on the in machine, out at nine next morning on the out machine, is one day", () => {
		const d = on(rows, "2026-09-17");
		expect(d.display).toBe("full");
		expect([d.inAt, d.outAt]).toEqual(["2026-09-17 09:03:02", "2026-09-18 09:21:48"]);
	});

	it("the morning of the leaving is not a day of its own — it is the rest day between shifts", () => {
		const d = on(rows, "2026-09-18");
		expect(d.inAt).toBeFalsy();
		expect(d.outAt).toBeFalsy();
	});

	it("a day keyed OUT on the in machine is still an arrival", () => {
		const d = on(rows, "2026-09-19");
		expect([d.inAt, d.outAt]).toEqual(["2026-09-19 09:18:30", "2026-09-20 10:05:12"]);
	});

	it("every shift of his in the month reads in and out", () => {
		for (const iso of ["2026-09-17", "2026-09-19", "2026-09-21"]) expect(on(rows, iso).display, iso).toBe("full");
	});

	it("a leaving whose arrival is not in the read stays an out with its arrival missing, never an arrival", () => {
		// 16 Sep's 08:35 on the out machine ended a shift that began on the 15th,
		// before the bridge was running.
		const d = on(rows, "2026-09-16");
		expect(d.inAt).toBeFalsy();
		expect(d.outAt).toBe("2026-09-16 08:35:11");
	});

	it("an out more than thirty hours after the last in is not that shift's leaving", () => {
		const placed = byMachine([p("2026-09-21 09:00:00", IN, "IN"), p("2026-09-23 08:00:00", OUT, "OUT")]);
		expect(placed[1].work_day).toBeUndefined();
	});
});
