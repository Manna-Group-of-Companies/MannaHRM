import { describe, expect, it } from "vitest";

import { OLD_LOAN_HEADS, asPlan, kindOf, monthOf, planOldLoans } from "@/lib/oldloans";

/* Old loans and advances, uploaded on Advances & Loans — lib/oldloans.js. */

const CO = "Manna Treads";
const PEOPLE = [
	{ name: "HR-EMP-1", employee_number: "MT-001", employee_name: "Ravi Varma", company: CO },
	{ name: "HR-EMP-2", employee_number: "MT-002", employee_name: "Anu Joseph", company: CO },
	{ name: "HR-EMP-3", employee_number: "MRP-9", employee_name: "Elsewhere", company: "Manna Rubber" },
];
const sheet = (...rows) => [OLD_LOAN_HEADS, ...rows];
const plan = (rows, extra = {}) => planOldLoans(sheet(...rows), { people: PEOPLE, company: CO, defaultFrom: "2026-11", ...extra });

describe("an old loan", () => {
	it("takes only what is still owed — the total less the advance already received", () => {
		const r = plan([["MT-001", "Ravi", "Loan", 50000, 20000, 6, "2026-11"]]);
		expect(r.lines).toHaveLength(1);
		expect(r.lines[0]).toMatchObject({ employee: "HR-EMP-1", kind: "loan", total: 50000, received: 20000, owed: 30000,
			instalments: 6, from: "2026-11", to: "2027-04", each: 5000 });
		expect(asPlan(r.lines[0])).toEqual({ employee: "HR-EMP-1", kind: "loan", principal: 30000, instalments: 6, from: "2026-11" });
	});

	it("takes nothing from somebody who has already paid it all back", () => {
		const r = plan([["MT-001", "", "Loan", 10000, 10000, 2, ""]]);
		expect(r.lines).toEqual([]);
		expect(r.settled).toHaveLength(1);
	});

	it("refuses an advance received that is more than the loan taken", () => {
		const r = plan([["MT-001", "", "Loan", 10000, 12000, 2, ""]]);
		expect(r.lines).toEqual([]);
		expect(r.problems[0].text).toMatch(/more than/);
	});

	it("is a loan in one instalment, from the month chosen on the page, when the sheet does not say", () => {
		const r = plan([["MT-002", "", "", "8,000", "", "", ""]]);
		expect(r.lines[0]).toMatchObject({ kind: "loan", owed: 8000, instalments: 1, from: "2026-11" });
	});

	it("reads the first month however a sheet writes it", () => {
		expect(["2026-11", "11/2026", "Nov 2026", "November 2026", new Date(Date.UTC(2026, 10, 1))].map(monthOf))
			.toEqual(["2026-11", "2026-11", "2026-11", "2026-11", "2026-11"]);
		expect(monthOf("soon")).toBe("");
	});

	it("knows an advance from a loan, and a blank is a loan", () => {
		expect(["Advance", "adv", "LOAN", "", "gift"].map(kindOf)).toEqual(["advance", "advance", "loan", "loan", ""]);
	});
});

describe("whether a row is used", () => {
	it("matches by employee code only, and only in the company picked", () => {
		const r = plan([["Ravi Varma", "", "Loan", 1000, 0, 1, ""], ["MRP-9", "", "Loan", 1000, 0, 1, ""]]);
		expect(r.lines).toEqual([]);
		expect(r.problems.map((p) => p.text).join(" ")).toMatch(/nobody on this site has that code.*Manna Rubber's payroll/);
	});

	it("leaves a row with no total out as somebody with no old loan, not as a mistake", () => {
		const r = plan([["MT-001", "Ravi", "", "", "", "", ""]]);
		expect(r).toMatchObject({ lines: [], problems: [], blank: 1 });
	});

	it("will not take a loan twice: somebody who already has instalments from that month is left out", () => {
		const existing = [{ employee: "HR-EMP-1", salary_component: "Loan EMI", payroll_date: "2026-12-31", docstatus: 1 }];
		const r = plan([["MT-001", "", "Loan", 6000, 0, 3, "2026-11"]], { existing });
		expect(r.lines).toEqual([]);
		expect(r.problems[0].text).toMatch(/already has loan instalments from 2026-12/);
		/* An advance is a different deduction, and is not held up by a loan. */
		expect(plan([["MT-001", "", "Advance", 6000, 0, 3, "2026-11"]], { existing }).lines).toHaveLength(1);
		/* A cancelled instalment takes nothing, so does not hold it up either. */
		expect(plan([["MT-001", "", "Loan", 6000, 0, 3, "2026-11"]], { existing: [{ ...existing[0], docstatus: 2 }] }).lines).toHaveLength(1);
	});

	it("refuses two rows of one kind for one person, rather than guessing which", () => {
		const r = plan([["MT-001", "", "Loan", 1000, 0, 1, ""], ["MT-001", "", "Loan", 2000, 0, 1, ""]]);
		expect(r.lines).toHaveLength(1);
		expect(r.problems[0].text).toMatch(/second loan row/);
	});

	it("needs a whole number of instalments from 1 to 60", () => {
		expect(plan([["MT-001", "", "Loan", 1000, 0, 0, ""]]).problems[0].text).toMatch(/1 to 60/);
		expect(plan([["MT-001", "", "Loan", 1000, 0, 2.5, ""]]).problems[0].text).toMatch(/1 to 60/);
	});

	it("needs a code heading and a total heading to read the sheet at all", () => {
		expect(planOldLoans([["Name", "Amount?"]], { people: PEOPLE }).ok).toBe(false);
	});
});
