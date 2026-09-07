import { describe, expect, it } from "vitest";

import { attendanceToday, joinersByMonth, mergeActivity } from "../src/lib/summary.js";

/* ---------------------------------------------------------------------------
   The dashboard's arithmetic.

   These are the figures somebody quotes in a meeting — how many turned up, how
   many are on leave, how many joined in August — so every rule that decides one
   of them gets a test named after the rule. When one of these fails at
   midnight, the name is what tells the reader what was supposed to be true.

   Relative import and no React: this file runs the same functions the page
   does, in Node, with no browser anywhere near it. CLAUDE.md §3.
   --------------------------------------------------------------------------- */

const IN = (employee, at = "2026-09-05 09:00:00") => ({ employee, log_type: "IN", time: at });
const OUT = (employee, at = "2026-09-05 18:00:00") => ({ employee, log_type: "OUT", time: at });

describe("attendanceToday", () => {
	it("counts a person who punched in and out once, as completed and not also as still in", () => {
		const a = attendanceToday([IN("e1"), OUT("e1")], [], 10);
		expect(a.done).toBe(1);
		expect(a.still).toBe(0);
		expect(a.present).toBe(1);
	});

	it("counts a person with two punches in and one out once", () => {
		/* A gate that double-reads is the commonest thing in the punch data, and
		   a headcount that grows with it is a headcount nobody can use. */
		const a = attendanceToday([IN("e1", "2026-09-05 08:59:00"), IN("e1"), OUT("e1")], [], 10);
		expect(a.done).toBe(1);
		expect(a.present).toBe(1);
	});

	it("treats a punch out with no punch in as somebody who was here", () => {
		/* The morning punch failed to deliver, or the shift began yesterday. The
		   expensive mistake is refusing somebody who did turn up — CLAUDE.md §4. */
		const a = attendanceToday([OUT("e1")], [], 10);
		expect(a.present).toBe(1);
		expect(a.absent).toBe(9);
	});

	it("counts one person on leave once however many applications they hold", () => {
		const leave = [{ employee: "e2" }, { employee: "e2" }];
		expect(attendanceToday([], leave, 10).leave).toBe(1);
	});

	it("adds up to the headcount", () => {
		const a = attendanceToday([IN("e1"), OUT("e1"), IN("e2")], [{ employee: "e3" }], 10);
		expect(a.done + a.still + a.leave + a.absent).toBe(10);
	});

	it("never reports a negative number of absentees, even when more people punched than are active", () => {
		/* A leaver whose card still opens the gate. That is a real finding and it
		   belongs on a report, not as a ring drawn inside out. */
		const a = attendanceToday([IN("e1"), IN("e2"), IN("e3")], [], 2);
		expect(a.absent).toBe(0);
	});

	it("draws an empty morning as nobody in and everybody still to come", () => {
		const a = attendanceToday([], [], 8);
		expect(a).toMatchObject({ done: 0, still: 0, leave: 0, absent: 8, present: 0 });
	});

	it("survives a site that answered with nothing at all", () => {
		expect(attendanceToday(null, null, 0).absent).toBe(0);
	});
});

describe("joinersByMonth", () => {
	const NOW = new Date(2026, 8, 5); // 5 September 2026

	it("ends on the month it is asked about and runs back from there", () => {
		const rows = joinersByMonth([], NOW);
		expect(rows).toHaveLength(6);
		expect(rows[5].key).toBe("2026-09");
		expect(rows[0].key).toBe("2026-04");
	});

	it("crosses the new year backwards without landing on month zero", () => {
		const rows = joinersByMonth([], new Date(2026, 1, 15));
		expect(rows.map((r) => r.key)).toEqual(
			["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"],
		);
	});

	it("counts a joining date by its month without parsing it as an instant", () => {
		/* The trap this is named after: `new Date("2026-04-01")` is midnight UTC,
		   which is 2026-03-31 in Chennai — so a joiner on the first of the month
		   lands in the month before. Compared as a string, it cannot. */
		const rows = joinersByMonth([{ date_of_joining: "2026-04-01" }], NOW);
		expect(rows.find((r) => r.key === "2026-04").n).toBe(1);
		expect(rows.find((r) => r.key === "2026-03")).toBeUndefined();
	});

	it("ignores a record with no joining date rather than counting it as this month", () => {
		const rows = joinersByMonth([{}, { date_of_joining: "" }, { date_of_joining: null }], NOW);
		expect(rows.reduce((t, r) => t + r.n, 0)).toBe(0);
	});
});

describe("mergeActivity", () => {
	it("puts the newest first across sources that stamp their rows differently", () => {
		const punches = [{ id: "a", at: "2026-09-05 08:41:00" }];
		const letters = [{ id: "b", at: "2026-09-05" }];
		const leave = [{ id: "c", at: "2026-09-04 17:00:00" }];
		expect(mergeActivity([punches, letters, leave]).map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("drops a row with no timestamp rather than sorting it to one end", () => {
		expect(mergeActivity([[{ id: "a", at: "" }, { id: "b", at: "2026-09-05" }]])).toHaveLength(1);
	});

	it("cuts to the limit it was given", () => {
		const many = Array.from({ length: 40 }, (_, i) => ({ id: i, at: "2026-09-0" + (i % 9) }));
		expect(mergeActivity([many], 9)).toHaveLength(9);
	});
});
