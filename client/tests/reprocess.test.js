import { describe, expect, it } from "vitest";
import { rebuildSummary } from "@/api/reprocess";

const person = (cancel, refetch, skipped = 0, errors = 0) => ({
	cancel: Array(cancel).fill({}), refetch: Array(refetch).fill({}),
	skipped: Array(skipped).fill({}), errors: Array(errors).fill({}),
});

describe("rebuild days, as the page says it", () => {
	it("a preview says what would be rebuilt and counts only people with something to rebuild", () => {
		const out = { write: false, cancelled: 3, refetched: 6, employees: [person(3, 6), person(0, 0)] };
		expect(rebuildSummary(out)).toBe("Would rebuild: 3 days for 1 person · 6 punches given a new shift.");
	});

	it("names the days left alone and the ones that failed", () => {
		const out = { write: true, cancelled: 1, refetched: 1, employees: [person(1, 1, 2, 1)] };
		expect(rebuildSummary(out)).toBe(
			"Rebuilt: 1 day for 1 person · 1 punch given their shift · 2 left alone (leave, or a submitted month) · 1 could not be done.",
		);
	});

	it("says nothing for no answer", () => {
		expect(rebuildSummary(null)).toBe("");
	});
});
