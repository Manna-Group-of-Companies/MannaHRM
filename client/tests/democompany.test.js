import { describe, expect, it } from "vitest";
import { isDemoCompany } from "@/data/companies";

/* The demo company is kept off every company list (18 November 2026). */
describe("the demo company", () => {
	it("is recognised by the word DEMO in its name, in any case", () => {
		expect(isDemoCompany("Hi-Tech Rubber DEMO")).toBe(true);
		expect(isDemoCompany("Demo Company")).toBe(true);
	});

	it("does not catch a real company, or a name that only contains the letters", () => {
		for (const name of ["Hi-Tech Rubber Industries", "Manna Treads", "Manna Tyre UAE", "Suriya Rubber", "Demolition Works", "", null]) {
			expect(isDemoCompany(name)).toBe(false);
		}
	});
});
