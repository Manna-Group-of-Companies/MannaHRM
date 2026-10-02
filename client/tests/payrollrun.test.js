import { describe, expect, it } from "vitest";
import { EXTRA_KINDS, checkExtra, componentDoc, componentOf, componentsToMake, extraDoc, sortExtras, startWhy } from "@/lib/payrollrun";

const PEOPLE = [{ name: "E1" }, { name: "E2" }];

describe("what the form may add", () => {
	it("has the four things HR adds to a month", () => {
		expect(EXTRA_KINDS.map((k) => k.key)).toEqual(["advance", "loan", "encash", "other"]);
	});

	it("sends an advance, a loan and encashment through their own components", () => {
		expect(componentOf({ kind: "advance" })).toBe("Salary Advance");
		expect(componentOf({ kind: "loan" })).toBe("Loan EMI");
		expect(componentOf({ kind: "encash" })).toBe("Leave Encashment");
		expect(componentOf({ kind: "other", component: "Bonus" })).toBe("Bonus");
		expect(componentOf({ kind: "other" })).toBe("");
	});

	it("says what is wrong, in the order a person would fix it", () => {
		expect(checkExtra({ kind: "advance", amount: "5" }, PEOPLE)).toBe("Pick the person.");
		expect(checkExtra({ employee: "E9", kind: "advance", amount: "5" }, PEOPLE)).toMatch(/not on this month/);
		expect(checkExtra({ employee: "E1", kind: "other", amount: "5" }, PEOPLE)).toBe("Choose the salary component.");
		expect(checkExtra({ employee: "E1", kind: "advance", amount: "" }, PEOPLE)).toMatch(/Type the amount/);
		expect(checkExtra({ employee: "E1", kind: "advance", amount: "-3" }, PEOPLE)).toMatch(/Type the amount/);
		expect(checkExtra({ employee: "E1", kind: "advance", amount: "99999999" }, PEOPLE)).toMatch(/too large/);
		expect(checkExtra({ employee: "E1", kind: "advance", amount: "5000" }, PEOPLE)).toBe("");
	});

	it("shapes one Additional Salary for the month's last day and does no arithmetic of its own", () => {
		expect(extraDoc({ employee: "E1", kind: "advance", amount: "1500.456" }, "2026-09-30", "Manna Rubber")).toEqual({
			employee: "E1", company: "Manna Rubber", salary_component: "Salary Advance", amount: 1500.46,
			payroll_date: "2026-09-30", overwrite_salary_structure_amount: 1,
		});
	});
});

describe("the salary components", () => {
	it("names what the site lacks, and counts a disabled one as lacking", () => {
		expect(componentsToMake([{ name: "Loan EMI", disabled: 0 }, { name: "Salary Advance", disabled: 1 }]).map((c) => c.name))
			.toEqual(["Leave Encashment", "Salary Advance"]);
		expect(componentsToMake(null)).toEqual([]);
	});

	it("makes an earning taxable and a deduction not, in hrms's own fields", () => {
		const [enc, adv] = [{ name: "Leave Encashment", abbr: "LENC", type: "Earning", why: "w" }, { name: "Salary Advance", abbr: "SADV", type: "Deduction", why: "w" }];
		expect(componentDoc(enc)).toMatchObject({ salary_component: "Leave Encashment", salary_component_abbr: "LENC", type: "Earning", is_tax_applicable: 1 });
		expect(componentDoc(adv)).toMatchObject({ type: "Deduction", is_tax_applicable: 0, depends_on_payment_days: 0 });
	});
});

describe("lists", () => {
	it("puts drafts first, then by name", () => {
		const rows = [{ name: "a", docstatus: 1, employee_name: "Zed" }, { name: "b", docstatus: 0, employee_name: "Yan" }, { name: "c", docstatus: 0, employee_name: "Abe" }];
		expect(sortExtras(rows).map((r) => r.name)).toEqual(["c", "b", "a"]);
	});

	it("says why a run cannot start", () => {
		const base = { company: "C", ym: "2026-09", now: "2026-10", ok: true, entry: null };
		expect(startWhy(base)).toBe("");
		expect(startWhy({ ...base, company: "" })).toMatch(/Pick a company/);
		expect(startWhy({ ...base, ym: "2026-11" })).toMatch(/not happened/);
		expect(startWhy({ ...base, ok: false })).toMatch(/Reading/);
		expect(startWhy({ ...base, entry: { name: "PE-1" } })).toBe("PE-1 is already this month's run.");
	});
});
