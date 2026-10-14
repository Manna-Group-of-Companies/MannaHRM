import { describe, expect, it } from "vitest";

import {
	cellValue, companyMethod, componentsFor, employeePatch, findUploadColumns, planUpload, rateOf, ratesOf, splitOf, structureName,
	toSave, uploadRow, uploadStructureDoc, verifyUpload,
} from "@/lib/salaryupload";

/* ---------------------------------------------------------------------------
   Salary Setup → Upload salaries (9 October 2026): actual salary, bank and
   cash, PF % and ESI % from one sheet. What is pinned: the rates choose the
   structure, PF and ESI are on the whole salary whatever goes by bank, and a
   row that cannot be read is said and left out rather than guessed at.
   --------------------------------------------------------------------------- */

const CO = "Manna Rubber";
const person = (name, code, extra = {}) => ({ name, employee_number: code, employee_name: `Person ${code}`, company: CO, status: "Active", ...extra });
const PEOPLE = [
	person("HR-EMP-1", "MR001"), person("HR-EMP-2", "MR002"), person("HR-EMP-3", "MR003"),
	person("HR-EMP-9", "MT001", { company: "Manna Treads" }), person("HR-EMP-8", "MR008", { status: "Left" }),
];
const COMPS = [
	{ name: "Basic", type: "Earning", salary_component_abbr: "B" },
	{ name: "Provident Fund", type: "Deduction", salary_component_abbr: "PF" },
];
const HEAD = ["Emp Code", "Name", "Actual Salary", "Bank ₹", "Cash ₹", "PF %", "ESI %"];
const plan = (rows, ctx = {}) => planUpload([HEAD, ...rows], { company: CO, people: PEOPLE, comps: COMPS, bankFields: true, method: "full", ...ctx });

/* hrms evaluates a structure's formula as Python; the two shapes these use —
   `x * r` and `(a if c else b) * r` — read the same in JavaScript once the
   conditional is turned round. */
const run = (formula, base) => {
	const js = formula.replace(/\(([^()]+?) if ([^()]+?) else ([^()]+?)\)/g, "(($2) ? ($1) : ($3))");
	return Math.round(new Function("base", `return ${js};`)(base) * 100) / 100;
};

describe("reading the sheet", () => {
	it("reads a rate as the percentage itself, a blank as not a member, and anything else as not a rate", () => {
		expect(rateOf("12")).toBe(12);
		expect(rateOf("12%")).toBe(12);
		expect(rateOf(0.75)).toBe(0.75);
		expect(rateOf("")).toBe(0);
		expect(Number.isNaN(rateOf("twelve"))).toBe(true);
	});

	it("reads an Excel cell formatted as a percentage as the percentage, not as its fraction", () => {
		expect(cellValue({ value: 0.12, numFmt: "0%" })).toBe("12%");
		expect(cellValue({ value: 0.0075, numFmt: "0.00%" })).toBe("0.75%");
		expect(rateOf(cellValue({ value: 0.0075, numFmt: "0.00%" }))).toBe(0.75);
		expect(cellValue({ value: 12, numFmt: "General" })).toBe(12);
	});

	it("never takes a PF number, an ESI number or a bank account for a rate or an amount", () => {
		const c = findUploadColumns([["Emp Code", "Name", "Bank Name", "Bank Account", "PF No", "ESI Number", "Actual Salary", "Bank ₹", "Cash ₹", "PF %", "ESI %"]]);
		expect(c.at).toMatchObject({ id: 0, name: 1, salary: 6, bank: 7, cash: 8, pf: 9, esi: 10 });
	});

	it("refuses a sheet without a PF column and an ESI column rather than reading everybody as a non-member", () => {
		const p = planUpload([["Emp Code", "Actual Salary"], ["MR001", 20000]], { company: CO, people: PEOPLE, method: "full" });
		expect(p.ok).toBe(false);
		expect(p.error).toContain("PF % column and an ESI % column");
	});

	it("needs a company, since a structure belongs to one", () => {
		expect(plan([], { company: "" }).error).toContain("Pick a company");
	});
});

describe("bank and cash", () => {
	it("takes bank and cash amounts that add up to the salary", () => {
		expect(splitOf({ salary: 20000, bank: 15000, cash: 5000 })).toEqual({ mode: "Bank", percent: 0, amount: 15000 });
	});

	it("refuses bank and cash amounts that do not add up to the salary", () => {
		expect(splitOf({ salary: 20000, bank: 15000, cash: 4000 }).error).toContain("add up to ₹19000, not the salary ₹20000");
	});

	it("works the bank part out from the cash alone", () => {
		expect(splitOf({ salary: 20000, cash: 8000 })).toEqual({ mode: "Bank", percent: 0, amount: 12000 });
	});

	it("records all-bank as 100% and all-cash as a Cash salary mode", () => {
		expect(splitOf({ salary: 20000, bank: 20000 })).toEqual({ mode: "Bank", percent: 100, amount: 0 });
		expect(splitOf({ salary: 20000, cash: 20000 })).toEqual({ mode: "Cash", percent: 0, amount: 0 });
		expect(splitOf({ salary: 20000, bankPct: "0%" })).toEqual({ mode: "Cash", percent: 0, amount: 0 });
	});

	it("keeps a percentage share as a percentage, and checks a cash figure against it", () => {
		expect(splitOf({ salary: 20000, bankPct: "60%" })).toEqual({ mode: "Bank", percent: 60, amount: 0 });
		expect(splitOf({ salary: 20000, bankPct: 60, cash: 8000 })).toEqual({ mode: "Bank", percent: 60, amount: 0 });
		expect(splitOf({ salary: 20000, bankPct: 60, cash: 5000 }).error).toContain("leaves ₹8000 in cash");
	});

	it("refuses a bank amount bigger than the salary", () => {
		expect(splitOf({ salary: 20000, bank: 25000 }).error).toContain("do not fit inside the salary");
	});

	it("leaves the record alone when no bank or cash cell is filled", () => {
		expect(splitOf({ salary: 20000, bank: "", cash: "" })).toBe(null);
	});
});

describe("the salary structure", () => {
	it("is chosen by the PF and ESI rates, and people with the same rates share one", () => {
		const p = plan([
			["MR001", "", 20000, "", "", 12, 0.75],
			["MR002", "", 18000, "", "", "12%", "0.75%"],
			["MR003", "", 40000, "", "", 12, ""],
		]);
		expect(p.lines.map((l) => l.structure)).toEqual([
			"Salary PF 12 ESI 0.75 - Manna Rubber", "Salary PF 12 ESI 0.75 - Manna Rubber", "Salary PF 12 no ESI - Manna Rubber",
		]);
		expect(p.structures).toEqual([
			{ name: "Salary PF 12 ESI 0.75 - Manna Rubber", pf: 12, esi: 0.75, exists: false, people: 2 },
			{ name: "Salary PF 12 no ESI - Manna Rubber", pf: 12, esi: 0, exists: false, people: 1 },
		]);
	});

	it("works PF and ESI out on the whole salary, whatever part of it goes by bank", () => {
		const p = plan([["MR001", "", 20000, 5000, 15000, 12, 0.75]]);
		expect(p.lines[0].salary).toBe(20000);
		const doc = uploadStructureDoc(12, 0.75, CO, p.roles, "full");
		expect(doc.earnings).toEqual([{ salary_component: "Basic", amount_based_on_formula: 1, formula: "base * 1" }]);
		expect(doc.deductions).toEqual([
			{ salary_component: "Provident Fund", amount_based_on_formula: 1, formula: "(base if base < 25000 else 25000) * 0.12" },
			{ salary_component: "Employee State Insurance", amount_based_on_formula: 1, formula: "(base * 0.0075 if base <= 21000 else 0)" },
		]);
	});

	it("puts no PF or ESI line on the structure of somebody who is in neither", () => {
		const doc = uploadStructureDoc(0, 0, CO, componentsFor(COMPS), "full");
		expect(doc.name).toBe("Salary no PF no ESI - Manna Rubber");
		expect(doc.deductions).toEqual([]);
	});

	it("reuses a structure the site already has under the same name", () => {
		const p = plan([["MR001", "", 20000, "", "", 12, 0]], { structures: [{ name: "Salary PF 12 no ESI - Manna Rubber" }] });
		expect(p.structures[0].exists).toBe(true);
		expect(p.components).toEqual([]);
	});

	it("makes only the components a new structure needs, with an abbreviation nobody else has", () => {
		const comps = [...COMPS, { name: "Extra Shift", type: "Earning", salary_component_abbr: "ESI" }];
		const p = plan([["MR001", "", 20000, "", "", 12, 0.75]], { comps });
		const esi = p.components.find((c) => c.role === "esi");
		expect(esi).toMatchObject({ name: "Employee State Insurance", abbr: "ESI2", exists: false });
		expect(p.components.find((c) => c.role === "pf").exists).toBe(true);
	});

	it("reads its two rates back off a name it made, and nothing off a hand-made one", () => {
		expect(ratesOf(structureName(12, 0.75, CO))).toEqual({ pf: 12, esi: 0.75, method: "full" });
		expect(ratesOf(structureName(0, 0, CO))).toEqual({ pf: 0, esi: 0, method: "full" });
		expect(ratesOf(structureName(12, 0, CO, "half"))).toEqual({ pf: 12, esi: 0, method: "half" });
		expect(ratesOf("Staff Monthly")).toBe(null);
	});
});

describe("who is saved", () => {
	it("leaves out a code nobody has, another company's person, and somebody who has left — and says why", () => {
		const p = plan([
			["NOPE", "Nobody", 5000, "", "", 0, 0],
			["MT001", "", 5000, "", "", 0, 0],
			["MR008", "", 5000, "", "", 0, 0],
		]);
		expect(p.lines).toEqual([]);
		expect(p.problems.map((x) => x.text)).toEqual([
			"Row 2, NOPE Nobody: nobody on this site has that code.",
			"Row 3, MT001: is on Manna Treads's payroll — pick that company in the top bar.",
			"Row 4, MR008: is Left, so is not paid.",
		]);
	});

	it("uses neither row of somebody who is in the sheet twice", () => {
		const p = plan([["MR001", "", 20000, "", "", 12, 0], ["MR001", "", 21000, "", "", 12, 0]]);
		expect(p.lines).toEqual([]);
		expect(p.problems[0].text).toContain("appears 2 times");
	});

	it("refuses a salary that is not a number and a rate that is not a percentage", () => {
		const p = plan([["MR001", "", "abc", "", "", 12, 0], ["MR002", "", 20000, "", "", 120, 0]]);
		expect(p.problems.map((x) => x.text)).toEqual([
			'Row 2, MR001: the actual salary "abc" is not a number above zero.',
			'Row 3, MR002: the PF % "120" is not a percentage between 0 and 100.',
		]);
	});

	it("counts a row of the downloaded list left without a salary, rather than calling it a mistake", () => {
		const p = plan([["MR001", "Person MR001", "", "", "", "", ""], ["MR002", "", 20000, "", "", 12, 0]]);
		expect(p.problems).toEqual([]);
		expect(p.blank).toBe(1);
		expect(p.lines.length).toBe(1);
	});

	it("never changes the pay of somebody who already has a salary, but still records their bank and cash", () => {
		const assignments = [{ employee: "HR-EMP-1", salary_structure: "Staff Monthly", base: 18000, from_date: "2026-04-01", docstatus: 1 }];
		const p = plan([["MR001", "", 20000, 15000, 5000, 12, 0]], { assignments });
		const l = p.lines[0];
		expect(l.assign).toBe(false);
		expect(l.patch).toEqual({ salary_mode: "Bank", custom_bank_amount: 15000 });
		expect(l.notes[0]).toContain("use Increments");
		expect(p.structures).toEqual([]);
	});

	it("says the usual rates when the sheet has others, without refusing them", () => {
		const p = plan([["MR001", "", 30000, "", "", 10, 1]]);
		expect(p.lines[0].notes).toEqual([
			"PF is 10%, not the usual 12%.", "ESI is 1%, not the usual 0.75%.",
			"The salary is over ₹21,000, so no ESI is taken.", "EPF is worked out on ₹25,000, the ceiling.",
		]);
	});
});

describe("the Employee record", () => {
	it("is patched with only what differs", () => {
		const emp = { salary_mode: "Bank", custom_bank_percent: 0, custom_bank_amount: 15000 };
		expect(employeePatch(emp, { mode: "Bank", percent: 0, amount: 15000 }, true).patch).toEqual({});
		expect(employeePatch(emp, { mode: "Cash", percent: 0, amount: 0 }, true).patch).toEqual({ salary_mode: "Cash", custom_bank_amount: 0 });
	});

	it("records only all-bank and all-cash on a site without the bank share fields, and says the rest is not saved", () => {
		expect(employeePatch({}, { mode: "Cash", percent: 0, amount: 0 }, false)).toEqual({ patch: { salary_mode: "Cash" }, unsaved: false });
		expect(employeePatch({}, { mode: "Bank", percent: 0, amount: 15000 }, false)).toEqual({ patch: {}, unsaved: true });
		const p = plan([["MR001", "", 20000, 15000, 5000, 12, 0]], { bankFields: false });
		expect(p.lines[0].notes).toContain("The bank and cash split is not saved: the site does not have the Bank share fields yet.");
	});

	it("leaves out of the save anybody with nothing to change", () => {
		const assignments = [{ employee: "HR-EMP-1", salary_structure: "Salary PF 12 no ESI - Manna Rubber", base: 20000, from_date: "2026-04-01", docstatus: 1 }];
		const people = [person("HR-EMP-1", "MR001", { salary_mode: "Bank", custom_bank_percent: 100 })];
		const p = plan([["MR001", "", 20000, 20000, 0, 12, 0]], { assignments, people });
		expect(p.lines[0].notes).toEqual([]);
		expect(toSave(p)).toEqual([]);
	});
});

describe("reading it back", () => {
	it("names a salary that is not on the site and a bank field that did not stick", () => {
		const lines = [{ employee: "E1", name: "Anand", assign: true, structure: "S", salary: 20000, patch: { custom_bank_amount: 15000 } }];
		expect(verifyUpload(lines, { assignments: [], employees: [{ name: "E1" }] }).map((w) => w.text)).toEqual([
			"has no S on the site", "Bank amount is empty on the site, not 15000",
		]);
		expect(verifyUpload(lines, { assignments: [{ employee: "E1", salary_structure: "S", base: 20000 }], employees: [{ name: "E1", custom_bank_amount: 15000 }] })).toEqual([]);
	});
});

describe("the list to fill in", () => {
	it("carries what the site holds, so a list sent back unchanged changes nothing", () => {
		const assignments = [{ employee: "HR-EMP-1", salary_structure: "Salary PF 12 ESI 0.75 - Manna Rubber", base: 20000, from_date: "2026-04-01", docstatus: 1 }];
		const p = person("HR-EMP-1", "MR001", { department: "Stores", salary_mode: "Bank", custom_bank_amount: 15000 });
		const row = uploadRow(p, assignments);
		expect(row).toEqual(["MR001", "Person MR001", "Stores", 20000, 15000, 5000, 12, 0.75]);
		expect(toSave(plan([row], { assignments, people: [p] }))).toEqual([]);
	});

	it("leaves a percentage share blank rather than turning it into rupees", () => {
		const assignments = [{ employee: "HR-EMP-1", salary_structure: "Staff", base: 20000, from_date: "2026-04-01", docstatus: 1 }];
		expect(uploadRow(person("HR-EMP-1", "MR001", { custom_bank_percent: 60 }), assignments).slice(3)).toEqual([20000, null, null, null, null]);
	});
});

describe("the EPF calculation, chosen once per company", () => {
	it("Calculation 1 works EPF out on the whole salary: ₹19,500 takes ₹2,340", () => {
		const doc = uploadStructureDoc(12, 0, CO, componentsFor(COMPS), "full");
		expect(doc.name).toBe("Salary PF 12 no ESI - Manna Rubber");
		expect(run(doc.deductions[0].formula, 19500)).toBe(2340);
	});

	it("Calculation 2 makes Basic half the salary and the rest Special Allowance, and EPF 12% of that half: ₹19,500 takes ₹1,170", () => {
		const doc = uploadStructureDoc(12, 0, CO, componentsFor(COMPS), "half");
		expect(doc.name).toBe("Salary Basic 50 PF 12 no ESI - Manna Rubber");
		expect(doc.earnings).toEqual([
			{ salary_component: "Basic", amount_based_on_formula: 1, formula: "base * 0.5" },
			{ salary_component: "Special Allowance", amount_based_on_formula: 1, formula: "base * 0.5" },
		]);
		expect(run(doc.deductions[0].formula, 19500)).toBe(1170);
	});

	it("works EPF out on ₹25,000 when the wages are over it, under either calculation", () => {
		const full = uploadStructureDoc(12, 0, CO, componentsFor(COMPS), "full").deductions[0].formula;
		const half = uploadStructureDoc(12, 0, CO, componentsFor(COMPS), "half").deductions[0].formula;
		expect([run(full, 30000), run(full, 25000), run(half, 60000), run(half, 40000)]).toEqual([3000, 3000, 3000, 2400]);
	});

	it("takes ESI at 0.75% up to ₹21,000 and none above it", () => {
		const esi = uploadStructureDoc(0, 0.75, CO, componentsFor(COMPS), "full").deductions[0].formula;
		expect([run(esi, 20000), run(esi, 21000), run(esi, 21001)]).toEqual([150, 157.5, 0]);
	});

	it("makes the Special Allowance component only for Calculation 2, and only when the site has none", () => {
		const half = plan([["MR001", "", 20000, "", "", 12, 0]], { method: "half" });
		expect(half.components.find((c) => c.role === "allowance")).toMatchObject({ name: "Special Allowance", exists: false });
		expect(plan([["MR001", "", 20000, "", "", 12, 0]]).components.some((c) => c.role === "allowance")).toBe(false);
	});

	it("does not ask for the calculation: a company with no structures gets Calculation 1, one with structures keeps its own", () => {
		const fresh = plan([["MR001", "", 20000, "", "", 12, 0]], { method: "" });
		expect(fresh.ok).toBe(true);
		expect(fresh.method).toBe("full");
		expect(fresh.lines[0].structure).toBe("Salary PF 12 no ESI - Manna Rubber");
		const structures = [{ name: "Salary Basic 50 PF 12 no ESI - Manna Rubber" }];
		expect(plan([["MR001", "", 20000, "", "", 12, 0]], { structures, method: "" }).method).toBe("half");
	});

	it("keeps a company on the calculation its structures already use", () => {
		const structures = [{ name: "Salary Basic 50 PF 12 no ESI - Manna Rubber" }, { name: "Staff Monthly" }];
		expect(companyMethod(structures, CO)).toBe("half");
		expect(plan([["MR001", "", 20000, "", "", 12, 0]], { structures, method: "full" }).error)
			.toBe("Manna Rubber already works EPF out by Calculation 2. A company keeps one calculation throughout.");
		expect(plan([["MR001", "", 20000, "", "", 12, 0]], { structures, method: "half" }).ok).toBe(true);
	});

	it("refuses to add to a company whose structures use both calculations", () => {
		const structures = [{ name: "Salary Basic 50 PF 12 no ESI - Manna Rubber" }, { name: "Salary PF 12 no ESI - Manna Rubber" }];
		expect(companyMethod(structures, CO)).toBe("mixed");
		expect(plan([["MR001", "", 20000, "", "", 12, 0]], { structures, method: "full" }).error).toContain("under both EPF calculations");
	});

	it("does not read another company's structures as this company's choice", () => {
		expect(companyMethod([{ name: "Salary Basic 50 PF 12 no ESI - Manna Treads" }], CO)).toBe("");
	});
});
