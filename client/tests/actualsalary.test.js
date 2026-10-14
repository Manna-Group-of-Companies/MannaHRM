import { describe, expect, it } from "vitest";

import { actualRow, actualToSave, findActualColumns, planActual, verifyActual } from "@/lib/actualsalary";

const CO = "Manna Rubber Products Private Limited";
const PEOPLE = [
	{ name: "HR-EMP-00092", employee_number: "MRP-190", employee_name: "Amal V P", company: CO },
	{ name: "HR-EMP-00125", employee_number: "MRP-293", employee_name: "PAUL SUNNY", company: CO },
	{ name: "HR-EMP-00006", employee_number: "HPT-010", employee_name: "PAUL T A", company: "Manna Treads" },
];
const HEAD = ["Emp Code", "Name", "Department", "Actual Salary", "From Date"];
const plan = (rows, ctx = {}) => planActual([HEAD, ...rows], { people: PEOPLE, existing: [], company: CO, defaultFrom: "2026-09-01", ...ctx });

describe("the actual salary sheet", () => {
	it("finds the code, salary and From Date columns by their headings", () => {
		expect(findActualColumns([HEAD]).at).toMatchObject({ id: 0, name: 1, salary: 3, from: 4 });
	});

	it("makes a new actual salary for each person by their code, on the sheet's own From Date", () => {
		const p = plan([["MRP-293", "PAUL SUNNY", "", 29000, "01-09-2026"], ["MRP-190", "Amal V P", "", "30,000", ""]]);
		expect(p.lines.map((l) => [l.employee, l.salary, l.from, l.action])).toEqual([
			["HR-EMP-00125", 29000, "2026-09-01", "new"],
			["HR-EMP-00092", 30000, "2026-09-01", "new"],
		]);
	});

	it("uses the page's date for a row with no From Date, and refuses a row when there is neither", () => {
		expect(plan([["MRP-293", "", "", 29000, ""]], { defaultFrom: "2026-10-01" }).lines[0].from).toBe("2026-10-01");
		const none = plan([["MRP-293", "", "", 29000, ""]], { defaultFrom: "" });
		expect(none.lines).toEqual([]);
		expect(none.problems[0].text).toContain("no From Date");
	});

	it("changes the row already on that date, and leaves the same figure alone so a sheet uploaded twice writes nothing", () => {
		const existing = [{ name: "HR-ASAL-1", employee: "HR-EMP-00125", from_date: "2026-09-01", actual_salary: 29000 }];
		expect(plan([["MRP-293", "", "", 29000, "2026-09-01"]], { existing }).lines[0].action).toBe("same");
		const up = plan([["MRP-293", "", "", 31000, "2026-09-01"]], { existing });
		expect(up.lines[0]).toMatchObject({ action: "update", existing: { name: "HR-ASAL-1", salary: 29000 } });
		expect(actualToSave(up)).toHaveLength(1);
		expect(plan([["MRP-293", "", "", 31000, "2026-10-01"]], { existing }).lines[0].action).toBe("new");
	});

	it("leaves out a code nobody has, somebody of another company, and a row with no salary as not yet filled in", () => {
		const p = plan([["NOPE", "", "", 1000, ""], ["HPT-010", "", "", 20000, ""], ["MRP-293", "", "", "", ""]]);
		expect(p.lines).toEqual([]);
		expect(p.problems.map((x) => x.text)).toEqual([
			"Row 2, NOPE: nobody on this site has that code.",
			"Row 3, HPT-010: is on Manna Treads's payroll — pick that company in the top bar.",
		]);
		expect(p.blank).toBe(1);
	});

	it("uses neither row when a person appears twice for one date", () => {
		const p = plan([["MRP-293", "", "", 29000, ""], ["MRP-293", "", "", 30000, ""]]);
		expect(p.lines).toEqual([]);
		expect(p.problems).toHaveLength(2);
	});

	it("says which saved row did not read back the way the sheet had it", () => {
		const lines = [{ employee: "E1", name: "A", salary: 29000, from: "2026-09-01" }, { employee: "E2", name: "B", salary: 30000, from: "2026-09-01" }];
		const after = [{ employee: "E1", from_date: "2026-09-01", actual_salary: 29000 }, { employee: "E2", from_date: "2026-09-01", actual_salary: 3000 }];
		expect(verifyActual(lines, after)).toEqual([{ name: "B", text: "has ₹3000 on the site, not ₹30000" }]);
	});

	it("fills the downloaded list with each person's latest actual salary", () => {
		const existing = [
			{ employee: "HR-EMP-00125", from_date: "2026-01-01", actual_salary: 25000 },
			{ employee: "HR-EMP-00125", from_date: "2026-09-01", actual_salary: 29000 },
		];
		expect(actualRow(PEOPLE[1], existing)).toEqual(["MRP-293", "PAUL SUNNY", "", 29000, "2026-09-01"]);
		expect(actualRow(PEOPLE[0], existing)).toEqual(["MRP-190", "Amal V P", "", null, null]);
	});
});
