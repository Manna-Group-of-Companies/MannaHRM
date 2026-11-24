import { describe, expect, it } from "vitest";
import { pageAllowed } from "@/data/menus";

describe("Attendance Policy is the admin's page alone (24 Nov 2026)", () => {
	it("hr@mannarubber.com is shown it", () => {
		expect(pageAllowed("attendance", "policy", "hr@mannarubber.com")).toBe(true);
	});
	it("a company login is not", () => {
		expect(pageAllowed("attendance", "policy", "mannarubber.products@gmail.com")).toBe(false);
	});
	it("the other attendance pages are untouched", () => {
		expect(pageAllowed("attendance", "overview", "mannarubber.products@gmail.com")).toBe(true);
	});
});
