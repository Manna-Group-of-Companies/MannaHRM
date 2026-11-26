import { describe, expect, it } from "vitest";

import { approverOptions, controlFor, reportsToOptions } from "../src/lib/profedit.js";

/* Reporting Manager and Approving Manager on Employee Profile (26 November 2026,
   asked for by HR): only people tagged as a Manager in this person's company,
   nobody else — the same people Create Employee offers. */

const PEOPLE = [
	{ name: "E-SAJI", employee_name: "SAJI KUMAR K M", designation: "Production Manager", company: "MRPPL", status: "Active", custom_is_manager: 1, user_id: "" },
	{ name: "E-RANI", employee_name: "RANI", company: "MRPPL", status: "Active", custom_is_manager: 1, user_id: "rani@manna.in" },
	{ name: "E-OLD", employee_name: "LEFT MANAGER", company: "MRPPL", status: "Left", custom_is_manager: 1, user_id: "old@manna.in" },
	{ name: "E-ANU", employee_name: "ANU", company: "MRPPL", status: "Active", custom_is_manager: 0, user_id: "anu@manna.in" },
	{ name: "E-SURESH", employee_name: "SURESH KUMAR P S", company: "HRI", status: "Active", custom_is_manager: 1, user_id: "suresh@manna.in" },
];

describe("Reporting Manager on the profile", () => {
	it("offers only Active tagged managers in the person's own company", () => {
		expect(reportsToOptions(PEOPLE, "MRPPL", "E-ANU", "").map(([v]) => v)).toEqual(["E-SAJI", "E-RANI"]);
	});

	it("never offers the person themself", () => {
		expect(reportsToOptions(PEOPLE, "MRPPL", "E-SAJI", "").map(([v]) => v)).toEqual(["E-RANI"]);
	});

	it("keeps whoever the record already names, marked, so a Save elsewhere cannot blank it", () => {
		const opts = reportsToOptions(PEOPLE, "MRPPL", "E-RANI", "E-ANU");
		expect(opts.at(-1)).toEqual(["E-ANU", "ANU (not tagged as Manager)"]);
	});

	it("is a select of employees, not a box", () => {
		expect(controlFor("reports_to", "set")).toBe("employee");
	});
});

describe("Approving Manager on the profile", () => {
	it("offers only tagged managers with a login, in the person's company, as logins", () => {
		expect(approverOptions(PEOPLE, "MRPPL", "E-ANU", "")).toEqual([["rani@manna.in", "RANI"]]);
	});

	it("is a select now, not a free text box", () => {
		expect(controlFor("leave_approver", "set")).toBe("approver");
		expect(controlFor("leave_approver", "blank")).toBe("approver");
	});

	it("keeps an approver the record already holds, marked", () => {
		expect(approverOptions(PEOPLE, "MRPPL", "E-ANU", "boss@manna.in").at(-1))
			.toEqual(["boss@manna.in", "boss@manna.in (not a tagged manager)"]);
	});
});
