import { describe, expect, it } from "vitest";
import { lastOfMonth } from "@/lib/format";

/* Frappe runs a Date filter through `getdate`, which refuses 31 September, and
   the reads that use this swallow the error — so a wrong last day is a month
   drawn with nothing in it, not a failure anybody sees. */
describe("lastOfMonth", () => {
	it("a_thirty_day_month_ends_on_the_thirtieth_not_the_thirty_first", () => {
		expect(lastOfMonth("2026-09")).toBe("2026-09-30");
	});

	it("february_ends_on_the_28th_or_in_a_leap_year_the_29th", () => {
		expect(lastOfMonth("2026-02")).toBe("2026-02-28");
		expect(lastOfMonth("2028-02")).toBe("2028-02-29");
	});

	it("december_ends_in_the_same_year", () => {
		expect(lastOfMonth("2026-12")).toBe("2026-12-31");
	});
});
