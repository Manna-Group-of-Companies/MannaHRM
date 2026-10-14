import { describe, expect, it } from "vitest";

import { amountOf, findColumns, matchBasePay } from "@/lib/basepayimport";
import { basePayTemplate, parseCsv, readTable } from "@/lib/basepayfile";

/* Base pay from an uploaded sheet: matched to people, and every row it cannot
   use said, never guessed at. Nothing here saves anything. */

const WAITING = [
	{ name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MRP-001" },
	{ name: "HR-EMP-00002", employee_name: "Priya Menon", employee_number: "MRP-002" },
	{ name: "HR-EMP-00003", employee_name: "Same Name", employee_number: "MRP-003" },
	{ name: "HR-EMP-00004", employee_name: "Same Name", employee_number: "MRP-004" },
];
const ALL = [...WAITING, { name: "HR-EMP-00009", employee_name: "Already Set", employee_number: "MRP-009" }];

describe("reading an amount", () => {
	it("takes a number however it is written, and nothing that is not one", () => {
		expect(amountOf(25000)).toBe(25000);
		expect(amountOf("₹ 25,000.50")).toBe(25000.5);
		expect(amountOf("Rs. 1,200")).toBe(1200);
		expect(amountOf("25k")).toBeNaN();
		expect(amountOf("")).toBeNaN();
		expect(amountOf("12000 + 3000")).toBeNaN();
	});
});

describe("finding the columns", () => {
	it("finds the code and the monthly pay under any usual heading", () => {
		expect(findColumns([["Employee Code", "Employee Name", "Monthly Base Pay"]])).toMatchObject({ row: 0, id: 0, name: 1, pay: 2 });
		expect(findColumns([["Sl", "Emp. ID", "Name", "Remarks", "Salary"]])).toMatchObject({ id: 1, name: 2, pay: 4 });
	});
	it("looks below a title row for the headings", () => {
		const t = [["MANNA - base pay"], [], ["Code", "Name", "Basic Salary"]];
		expect(findColumns(t)).toMatchObject({ row: 2, id: 0, pay: 2 });
	});
	it("says nothing is found when there is no pay column", () => {
		expect(findColumns([["Code", "Name"]])).toBeNull();
	});
});

describe("matching rows to people", () => {
	const run = (rows) => matchBasePay([["Employee Code", "Employee Name", "Monthly Pay"], ...rows], WAITING, ALL);

	it("matches by employee ID or employee number, and by name when it is one person's", () => {
		const solo = [...WAITING, { name: "HR-EMP-00005", employee_name: "Solo Person" }];
		const r = matchBasePay([["Employee Code", "Employee Name", "Monthly Pay"], ["HR-EMP-00001", "", 21000], ["MRP-002", "x", "₹ 18,500"], ["", "solo  person", 15000]], solo, solo);
		expect(r.matched.map((m) => [m.employee, m.base, m.via])).toEqual([["HR-EMP-00001", 21000, "code"], ["HR-EMP-00002", 18500, "code"], ["HR-EMP-00005", 15000, "name"]]);
	});

	it("leaves out, and says why, a missing person, a bad amount, a shared name and somebody already set up", () => {
		const r = run([["NOPE", "Nobody", 5000], ["MRP-001", "", "abc"], ["", "Same Name", 9000], ["MRP-009", "", 7000], ["MRP-002", "", 0]]);
		expect(r.matched).toEqual([]);
		const said = r.problems.map((p) => p.text).join("\n");
		expect(said).toMatch(/nobody on this site matches/);
		expect(said).toMatch(/not a number above zero/);
		expect(said).toMatch(/two people have that name/);
		expect(said).toMatch(/already has a salary structure/);
		expect(r.problems).toHaveLength(5);
	});

	it("uses neither row of a person who is in the sheet twice", () => {
		const r = run([["MRP-001", "", 20000], ["MRP-002", "", 18000], ["HR-EMP-00001", "", 21000]]);
		expect(r.matched.map((m) => m.employee)).toEqual(["HR-EMP-00002"]);
		expect(r.problems.map((p) => p.text).join(" ")).toMatch(/appears 2 times/);
	});

	it("flags an amount that looks like a slip of the finger, but still reads it", () => {
		const r = run([["MRP-001", "", 250], ["MRP-002", "", 18000]]);
		expect(r.matched.find((m) => m.employee === "HR-EMP-00001").warn).toBe(true);
		expect(r.matched.find((m) => m.employee === "HR-EMP-00002").warn).toBe(false);
	});

	it("counts the people the sheet did not mention", () => {
		expect(run([["MRP-001", "", 20000]]).absent).toBe(3);
	});

	it("skips blank rows and fails clearly with no columns", () => {
		expect(run([[], ["", "", ""], ["MRP-001", "", 20000]]).matched).toHaveLength(1);
		const bad = matchBasePay([["foo", "bar"]], WAITING, ALL);
		expect(bad.ok).toBe(false);
		expect(bad.error).toMatch(/Could not find the columns/);
	});
});

describe("reading files", () => {
	it("reads a CSV with quotes and commas", () => {
		expect(parseCsv('Code,Name,Pay\r\nA1,"Doe, Jane","1,200"\n')).toEqual([["Code", "Name", "Pay"], ["A1", "Doe, Jane", "1,200"]]);
	});

	it("reads an .xlsx, formulas and all, and a list made here reads back", async () => {
		const wb = await basePayTemplate(WAITING.slice(0, 2), "Manna Rubber");
		const ws = wb.getWorksheet("Base pay");
		ws.getCell("C2").value = 21000;
		ws.getCell("C3").value = { formula: "9000+9500", result: 18500 };
		const file = new File([await wb.xlsx.writeBuffer()], "pay.xlsx");
		const table = await readTable(file);
		expect(table[0]).toEqual(["Employee Code", "Employee Name", "Monthly Base Pay"]);
		const r = matchBasePay(table, WAITING, ALL);
		expect(r.matched.map((m) => [m.employee, m.base])).toEqual([["HR-EMP-00001", 21000], ["HR-EMP-00002", 18500]]);
		expect(r.problems).toEqual([]);
	});
});
