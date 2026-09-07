import { describe, expect, it } from "vitest";

import { ROSTER_STATES, dayPunches, daysOf, monthRoster, spanHours } from "../src/lib/roster.js";

/* ---------------------------------------------------------------------------
   One person's month.

   These rows are read to decide whether somebody was paid for a day, so every
   rule that decides one gets a test named after the rule. The order the day's
   status is settled in belongs to `rules.js` and is tested there; what is
   tested here is everything that sits around it — the times, the hours, the
   weekly-off half of "holiday", and the correction against the day.

   Relative import and no React: this runs the same functions the page does, in
   Node. CLAUDE.md §3.
   --------------------------------------------------------------------------- */

const IN = (t) => ({ log_type: "IN", time: t });
const OUT = (t) => ({ log_type: "OUT", time: t });

/** A month with nothing in it, so each test adds only what it is about. */
const base = {
	ym: "2026-08",
	punches: [],
	leave: [],
	holidays: [],
	corrections: [],
	shift: "Office Shift",
	today: "2026-09-01",
};

const dayOn = (out, iso) => out.rows.find((r) => r.iso === iso);

describe("daysOf", () => {
	it("gives every day of the month and stops at the last one", () => {
		expect(daysOf("2026-08")).toHaveLength(31);
		expect(daysOf("2026-09")).toHaveLength(30);
	});

	it("knows February in a leap year from February in an ordinary one", () => {
		expect(daysOf("2024-02")).toHaveLength(29);
		expect(daysOf("2026-02")).toHaveLength(28);
	});

	it("hands back nothing for a cycle that is not one", () => {
		expect(daysOf("")).toEqual([]);
		expect(daysOf("nonsense")).toEqual([]);
	});
});

describe("dayPunches", () => {
	it("takes the earliest in and the latest out, not the first two rows", () => {
		/* A gate that double-reads puts four rows on a day. Taken in arrival
		   order the second read is the punch-out, and a nine-hour day is
		   reported as four minutes. */
		const { inAt, outAt } = dayPunches([
			IN("2026-08-03 08:22:00"),
			IN("2026-08-03 08:26:00"),
			OUT("2026-08-03 17:25:00"),
			OUT("2026-08-03 17:29:00"),
		]);
		expect(inAt).toBe("2026-08-03 08:22:00");
		expect(outAt).toBe("2026-08-03 17:29:00");
	});

	it("treats a log type it does not recognise as an arrival", () => {
		/* The bridge writes IN and OUT; a device configured by somebody else can
		   write neither. Counting an unknown type as an arrival is the safe
		   rounding — it makes somebody present rather than absent. */
		expect(dayPunches([{ log_type: "", time: "2026-08-03 08:00:00" }]).inAt)
			.toBe("2026-08-03 08:00:00");
	});

	it("says nothing for a day with no punches", () => {
		expect(dayPunches([])).toEqual({ inAt: "", outAt: "" });
	});
});

describe("spanHours", () => {
	it("counts hours and minutes, not a clock time", () => {
		expect(spanHours("2026-08-03 08:22:00", "2026-08-03 17:25:00")).toBe("09:03");
	});

	it("says nothing when a punch is missing, rather than counting from zero", () => {
		expect(spanHours("", "2026-08-03 17:25:00")).toBe("");
		expect(spanHours("2026-08-03 08:22:00", "")).toBe("");
	});

	it("says nothing when the out is before the in", () => {
		/* A shift crossing midnight lands here, and a negative span drawn as
		   `-1:00` reads as a rule nobody wrote. Night shifts belong to the day
		   they started (CLAUDE.md §5) and this screen does not yet resolve them,
		   so it declines rather than guessing. */
		expect(spanHours("2026-08-03 22:00:00", "2026-08-03 06:00:00")).toBe("");
	});
});

describe("the month", () => {
	it("draws a row for every day, whether anything happened on it or not", () => {
		expect(monthRoster(base).rows).toHaveLength(31);
	});

	it("counts a day with both punches as a full day, with its hours", () => {
		const out = monthRoster({
			...base,
			punches: [IN("2026-08-03 08:22:00"), OUT("2026-08-03 17:25:00")],
		});
		const d = dayOn(out, "2026-08-03");
		expect(d.display).toBe("full");
		expect(d.hours).toBe("09:03");
		expect(out.counts.full).toBe(1);
	});

	it("counts a day with one punch as partial, not as a full day", () => {
		/* A day counts as worked only with a punch in *and* out. An open shift is
		   not a complete day and is not payroll-ready. */
		const out = monthRoster({ ...base, punches: [IN("2026-08-03 08:22:00")] });
		expect(dayOn(out, "2026-08-03").display).toBe("partial");
		expect(dayOn(out, "2026-08-03").hours).toBe("");
	});

	it("separates a weekly off from a named holiday, which the rule does not", () => {
		/* Both are "nobody's absence" to `resolveDayStatus`, and the same answer
		   to that question. They are different colours on the key and different
		   things to a person reading a month. */
		const out = monthRoster({
			...base,
			holidays: [
				{ holiday_date: "2026-08-02", description: "Sunday", weekly_off: 1 },
				{ holiday_date: "2026-08-15", description: "Independence Day", weekly_off: 0 },
			],
		});
		expect(dayOn(out, "2026-08-02").display).toBe("weekoff");
		expect(dayOn(out, "2026-08-15").display).toBe("holiday");
		expect(dayOn(out, "2026-08-15").holiday).toBe("Independence Day");
	});

	it("lets a punch beat an approved leave record", () => {
		/* Somebody who cancelled their leave and came in must not be marked as on
		   leave because the request was never withdrawn. The rule's first clause,
		   seen through this screen. */
		const out = monthRoster({
			...base,
			punches: [IN("2026-08-10 08:00:00"), OUT("2026-08-10 17:00:00")],
			leave: [{ from_date: "2026-08-10", to_date: "2026-08-10", status: "Approved", leave_type: "Casual Leave" }],
		});
		expect(dayOn(out, "2026-08-10").display).toBe("full");
	});

	it("keeps a request nobody has decided out of the leave column", () => {
		const out = monthRoster({
			...base,
			leave: [{ from_date: "2026-08-11", to_date: "2026-08-11", status: "Open", leave_type: "Sick Leave" }],
		});
		expect(dayOn(out, "2026-08-11").display).toBe("unappr");
	});

	it("covers every day a leave spans, including one that began the month before", () => {
		/* The read asks for overlapping applications rather than contained ones,
		   and this is what that is for: a leave from 30 July to 3 August covers
		   three days of this month. */
		const out = monthRoster({
			...base,
			leave: [{ from_date: "2026-07-30", to_date: "2026-08-03", status: "Approved", leave_type: "Earned Leave" }],
		});
		expect(dayOn(out, "2026-08-01").display).toBe("leave");
		expect(dayOn(out, "2026-08-03").display).toBe("leave");
		expect(dayOn(out, "2026-08-04").display).not.toBe("leave");
	});

	it("does not call a day absent before it has happened", () => {
		/* Treating a missing record as an absence would mark the whole group
		   absent at nine in the morning. */
		const out = monthRoster({ ...base, today: "2026-08-10" });
		expect(dayOn(out, "2026-08-09").display).toBe("absent");
		expect(dayOn(out, "2026-08-10").display).toBe("unmarked");
		expect(dayOn(out, "2026-08-20").display).toBe("unmarked");
	});

	it("hangs a correction on the day it is about", () => {
		const out = monthRoster({
			...base,
			corrections: [{
				name: "AR-1", attendance_date: "2026-08-19", status: "Pending Approval",
				requested_in: "2026-08-19 09:05:00", requested_out: "2026-08-19 18:10:00",
			}],
		});
		expect(dayOn(out, "2026-08-19").ar.name).toBe("AR-1");
		expect(dayOn(out, "2026-08-18").ar).toBeNull();
	});

	it("counts every day into exactly one state", () => {
		/* The strip along the top has to add up to the month, or it is a set of
		   numbers nobody can check. */
		const out = monthRoster({
			...base,
			today: "2026-09-01",
			punches: [IN("2026-08-03 08:00:00"), OUT("2026-08-03 17:00:00"), IN("2026-08-04 08:00:00")],
			holidays: [{ holiday_date: "2026-08-02", description: "Sunday", weekly_off: 1 }],
			leave: [{ from_date: "2026-08-05", to_date: "2026-08-05", status: "Approved" }],
		});
		const total = ROSTER_STATES.reduce((t, st) => t + (out.counts[st.key] || 0), 0);
		expect(total).toBe(31);
	});

	it("survives a month the site answered nothing for", () => {
		const out = monthRoster({ ...base, punches: null, leave: null, holidays: null, corrections: null });
		expect(out.rows).toHaveLength(31);
		expect(out.counts.absent).toBe(31);
	});
});

describe("a day carrying more than one leave application", () => {
	it("takes the granted one, whatever order the site listed them in", () => {
		/* Somebody applies, is refused, applies again and is granted. The site
		   lists the older one first, and taking the first would read a granted
		   day as absent — on a screen somebody is paid from. */
		const out = monthRoster({
			...base,
			leave: [
				{ from_date: "2026-08-12", to_date: "2026-08-12", status: "Rejected", leave_type: "Casual Leave" },
				{ from_date: "2026-08-12", to_date: "2026-08-12", status: "Approved", leave_type: "Sick Leave" },
			],
		});
		const d = dayOn(out, "2026-08-12");
		expect(d.display).toBe("leave");
		expect(d.leave.leave_type).toBe("Sick Leave");
	});

	it("prefers one still waiting over one already refused", () => {
		const out = monthRoster({
			...base,
			leave: [
				{ from_date: "2026-08-12", to_date: "2026-08-12", status: "Rejected" },
				{ from_date: "2026-08-12", to_date: "2026-08-12", status: "Open" },
			],
		});
		expect(dayOn(out, "2026-08-12").display).toBe("unappr");
	});

	it("carries a refusal alongside the day rather than dropping it", () => {
		/* "Asked, was refused, did not come in" is exactly the context HR wants
		   when they open the day — so the row keeps the application even though
		   the status is absent. */
		const out = monthRoster({
			...base,
			leave: [{ from_date: "2026-08-13", to_date: "2026-08-13", status: "Rejected", leave_type: "Casual Leave" }],
		});
		const d = dayOn(out, "2026-08-13");
		expect(d.display).toBe("absent");
		expect(d.leave.status).toBe("Rejected");
	});
});
