import { describe, expect, it } from "vitest";

import { CLOSED, STATUSES, countedStatus, outstanding, overdue, problems, statusFor }
	from "@/lib/assign";

/* ---------------------------------------------------------------------------
   The handover arithmetic, browser side.

   A port of `manna_hr/assets.py`, and the two have to agree or the form refuses
   what the site allows — or worse, allows what the site refuses and reports it
   as a failure half a second later. `manna_hr/tests/test_assets.py` is the same
   list of rules against the same numbers; when one of these changes, both move.

   The site is still the one that decides. This exists so a box can be named
   before the round trip, not instead of it.
   --------------------------------------------------------------------------- */

const OUT = {
	employee: "HR-EMP-00001",
	asset: "ACC-ASS-2026-00004",
	assign_units: 10,
	assign_date: "2026-08-01",
};

const row = (over) => ({ ...OUT, ...over });

describe("what is still out", () => {
	it("is everything issued until something comes back", () => {
		expect(outstanding(row())).toBe(10);
	});

	it("counts returned and lost both off", () => {
		expect(outstanding(row({ return_unit: 3, lost_units: 2 }))).toBe(5);
	});

	it("reads an empty box as zero rather than NaN", () => {
		expect(outstanding(row({ return_unit: "", lost_units: undefined }))).toBe(10);
	});
});

describe("what an assignment is", () => {
	it("is Assigned while nothing has come back", () => {
		expect(statusFor(row())).toBe("Assigned");
	});

	it("is Returned once all of it has", () => {
		expect(statusFor(row({ return_unit: 10, returned_on: "2026-09-01" }))).toBe("Returned");
	});

	it("is Partly Returned while some is still out", () => {
		expect(statusFor(row({ return_unit: 4, returned_on: "2026-09-01" }))).toBe("Partly Returned");
	});

	it("lets a loss beat a return, because the missing one is the open question", () => {
		expect(statusFor(row({
			return_unit: 9, returned_on: "2026-09-01", lost_units: 1, lost_on: "2026-09-01",
		}))).toBe("Partly Lost");
	});

	it("is Lost when none of it came back", () => {
		expect(statusFor(row({ lost_units: 10, lost_on: "2026-09-01" }))).toBe("Lost");
	});

	it("counts Returned and Lost as closed and Partly Returned as not", () => {
		expect(CLOSED).toContain("Returned");
		expect(CLOSED).not.toContain("Partly Returned");
	});
});

describe("what the form refuses", () => {
	it("passes a plain handover", () => {
		expect(problems(row())).toEqual([]);
	});

	it("refuses more coming back than went out", () => {
		const said = problems(row({ return_unit: 11, returned_on: "2026-09-01" }));
		expect(said.join(" ")).toContain("more than the 10 that went out");
	});

	it("refuses returned plus lost over the total", () => {
		const said = problems(row({
			return_unit: 8, returned_on: "2026-09-01", lost_units: 5, lost_on: "2026-09-01",
		}));
		expect(said.join(" ")).toContain("more than the 10 that went out");
	});

	it("asks for the date behind a return count", () => {
		expect(problems(row({ return_unit: 3 })).join(" ")).toContain("Returned On needs the date");
	});

	it("asks for the count behind a return date", () => {
		expect(problems(row({ returned_on: "2026-09-01" })).join(" "))
			.toContain("Return Unit says nothing came back");
	});

	it("asks for the date behind a loss", () => {
		expect(problems(row({ lost_units: 2 })).join(" ")).toContain("Lost On needs the date");
	});

	it("refuses money recovered with no loss behind it", () => {
		/* This one is somebody's pay. A deduction with no reason attached is the
		   expensive mistake this module exists to prevent. */
		expect(problems(row({ recovery_amount: 4500 })).join(" "))
			.toContain("needs the loss it recovers");
	});

	it("allows it once something was lost", () => {
		expect(problems(row({ lost_units: 1, lost_on: "2026-09-02", recovery_amount: 4500 })))
			.toEqual([]);
	});

	it("refuses a handover of nothing", () => {
		expect(problems(row({ assign_units: 0 })).join(" ")).toContain("at least 1");
	});

	it("refuses a negative count rather than clamping it", () => {
		expect(problems(row({ return_unit: -2 })).join(" ")).toContain("cannot be negative");
	});

	it("names the person, the asset and the date when they are missing", () => {
		const said = problems({ assign_units: 1 }).join(" ");
		expect(said).toContain("needs the person");
		expect(said).toContain("needs the asset");
		expect(said).toContain("needs the date");
	});

	it("refuses a return dated before the handover", () => {
		expect(problems(row({ return_unit: 1, returned_on: "2026-07-30" })).join(" "))
			.toContain("before the assignment went out on 2026-08-01");
	});
});

describe("overdue", () => {
	it("is true past the date it was lent until", () => {
		expect(overdue(row({ valid_till: "2026-08-31" }), "2026-09-07")).toBe(true);
	});

	it("is false inside the term", () => {
		expect(overdue(row({ valid_till: "2026-09-30" }), "2026-09-07")).toBe(false);
	});

	it("is false when no end was agreed — which is not the same as late", () => {
		expect(overdue(row(), "2026-09-07")).toBe(false);
	});

	it("is false once it is back, however old", () => {
		expect(overdue(
			row({ valid_till: "2026-08-02", return_unit: 10, returned_on: "2026-08-03" }),
			"2026-09-07",
		)).toBe(false);
	});
});

/* ------------------------------------------------------ the status dropdown ---
   Factor HR's form has an Asset Status dropdown; ours does too, and these are
   the rules that stop it disagreeing with the counts printed beside it. The
   same list is in manna_hr/tests/test_onboard.py, against the same numbers. */

describe("the Asset Status dropdown", () => {
	it("computes a status nobody chose from the counts", () => {
		expect(statusFor(row())).toBe("Assigned");
	});

	it("leaves a chosen status that matches the counts alone", () => {
		expect(problems(row({ asset_status: "Assigned" }))).toEqual([]);
	});

	it("refuses a chosen status the counts contradict rather than rewriting it", () => {
		const said = problems(row({ asset_status: "Returned" }));
		expect(said).toHaveLength(1);
		expect(said[0]).toContain("says Returned");
		expect(said[0]).toContain("make it Assigned");
	});

	it("keeps Scrapped, because no count can produce it", () => {
		expect(statusFor(row({ asset_status: "Scrapped" }))).toBe("Scrapped");
		expect(problems(row({ asset_status: "Scrapped" }))).toEqual([]);
	});

	it("keeps Damaged Or Not Working, which is the reason the dropdown exists", () => {
		const got = row({ asset_status: "Damaged Or Not Working" });
		expect(statusFor(got)).toBe("Damaged Or Not Working");
		expect(problems(got)).toEqual([]);
	});

	it("treats damaged kit as still out, so it can still be overdue", () => {
		const got = row({ asset_status: "Damaged Or Not Working", valid_till: "2026-08-31" });
		expect(overdue(got, "2026-09-07")).toBe(true);
	});

	it("treats scrapped kit as finished with, so it cannot be overdue", () => {
		const got = row({ asset_status: "Scrapped", valid_till: "2026-08-31" });
		expect(overdue(got, "2026-09-07")).toBe(false);
	});

	it("refuses a word that is not one of the states at all", () => {
		const said = problems(row({ asset_status: "In Use" }));
		expect(said).toHaveLength(1);
		expect(said[0]).toContain("not one of the states");
	});

	it("still reads the counts straight when a judgment is on the row", () => {
		const got = row({ asset_status: "Scrapped", return_unit: 4, returned_on: "2026-08-20" });
		expect(countedStatus(got)).toBe("Partly Returned");
		expect(outstanding(got)).toBe(6);
	});

	it("spells every state the way manna_hr/rules.py spells it", () => {
		// A word this side spells differently is a row the site refuses.
		expect(STATUSES).toEqual([
			"Assigned", "Partly Returned", "Returned", "Partly Lost", "Lost",
			"Scrapped", "Damaged Or Not Working",
		]);
	});
});
