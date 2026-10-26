import { describe, expect, it } from "vitest";

import { bankSheet } from "@/lib/banksheet";
import {
	bonusAsSlips, bonusOccasions, bonusRow, bonusToSave, checkBonusOccasion, findBonusColumns, planBonus, verifyBonus,
} from "@/lib/festivalbonus";

/* ---------------------------------------------------------------------------
   Payroll → Festival Bonus (22 October 2026): HR's sheet of one festival's
   bonuses, each row an Employee Festival Bonus, paid apart from the salary.
   --------------------------------------------------------------------------- */

const MR = "Manna Rubber";
const people = [
	{ name: "HR-EMP-1", employee_number: "MR001", employee_name: "Anand Raghavan", company: MR },
	{ name: "HR-EMP-2", employee_number: "MR002", employee_name: "Priya Menon", company: MR },
	{ name: "HR-EMP-3", employee_number: "HT001", employee_name: "Joseph K", company: "Hitech" },
];
const ON = { festival: "Onam 2026", date: "2026-08-25" };
const plan = (table, more = {}) => planBonus(table, { people, existing: [], company: MR, ...ON, ...more });

describe("reading HR's bonus sheet", () => {
	it("finds the code and the amount under HR's own headings, wherever the heading row is", () => {
		const t = [["Onam bonus list"], [], ["Emp Code", "Name", "Department", "Bonus Amount"]];
		expect(findBonusColumns(t)).toEqual({ row: 2, at: { id: 0, name: 1, amount: 3 } });
	});

	it("makes one bonus a person, for the festival and date chosen on the page", () => {
		const p = plan([["Emp Code", "Bonus"], ["MR001", 5000], ["MR002", "3,500"]]);
		expect(p.ok).toBe(true);
		expect(p.lines.map((l) => [l.employee, l.amount, l.festival, l.date, l.action])).toEqual([
			["HR-EMP-1", 5000, "Onam 2026", "2026-08-25", "new"],
			["HR-EMP-2", 3500, "Onam 2026", "2026-08-25", "new"],
		]);
	});

	it("skips a row left without an amount — somebody not given this bonus — and counts it", () => {
		const p = plan([["Emp Code", "Bonus"], ["MR001", ""], ["MR002", 2000]]);
		expect(p.lines).toHaveLength(1);
		expect(p.blank).toBe(1);
		expect(p.problems).toEqual([]);
	});

	it("says which rows it left out and why: an unknown code, another company's person, a bonus that is not a number", () => {
		const p = plan([["Emp Code", "Name", "Bonus"], ["ZZ9", "Nobody", 100], ["HT001", "Joseph K", 100], ["MR001", "Anand", "lots"]]);
		expect(p.lines).toEqual([]);
		expect(p.problems.map((x) => x.text)).toEqual([
			"Row 2, ZZ9 Nobody: nobody on this site has that code.",
			"Row 3, HT001 Joseph K: is on Hitech's payroll — pick that company in the top bar.",
			'Row 4, MR001 Anand: the bonus "lots" is not a number above zero.',
		]);
	});

	it("uses neither row when a person is named twice, since the sheet has not decided", () => {
		const p = plan([["Emp Code", "Bonus"], ["MR001", 5000], ["MR001", 6000], ["MR002", 1000]]);
		expect(p.lines.map((l) => l.employee)).toEqual(["HR-EMP-2"]);
		expect(p.problems.map((x) => x.text)).toEqual([
			"Row 2, MR001: appears 2 times, so none of them is used until it appears once.",
			"Row 3, MR001: appears 2 times, so none of them is used until it appears once.",
		]);
	});

	it("writes nothing for the same sheet twice, and changes only the amounts that moved", () => {
		const existing = [
			{ name: "B-1", employee: "HR-EMP-1", festival: "onam 2026", bonus_date: "2026-08-25", amount: 5000 },
			{ name: "B-2", employee: "HR-EMP-2", festival: "Onam 2026", bonus_date: "2026-08-25", amount: 3000 },
		];
		const p = plan([["Emp Code", "Bonus"], ["MR001", 5000], ["MR002", 3500]], { existing });
		expect(p.lines.map((l) => l.action)).toEqual(["same", "update"]);
		expect(bonusToSave(p).map((l) => [l.employee, l.existing.name])).toEqual([["HR-EMP-2", "B-2"]]);
	});

	it("treats another festival, or the same festival on another date, as a new bonus", () => {
		const existing = [{ name: "B-1", employee: "HR-EMP-1", festival: "Christmas 2026", bonus_date: "2026-08-25", amount: 5000 },
			{ name: "B-2", employee: "HR-EMP-1", festival: "Onam 2026", bonus_date: "2025-08-25", amount: 5000 }];
		expect(plan([["Emp Code", "Bonus"], ["MR001", 5000]], { existing }).lines[0].action).toBe("new");
	});

	it("reads nothing until the festival and the date are chosen", () => {
		expect(plan([["Emp Code", "Bonus"], ["MR001", 5000]], { festival: "  " })).toEqual({ ok: false, error: "Type the festival." });
		expect(plan([["Emp Code", "Bonus"], ["MR001", 5000]], { date: "" })).toEqual({ ok: false, error: "Pick the bonus date." });
		expect(checkBonusOccasion(ON)).toBe("");
	});

	it("says so when the sheet has no code or no amount heading", () => {
		expect(plan([["Name", "Department"], ["Anand", "Stores"]]).error).toMatch(/employee code and one for the bonus amount/);
	});
});

describe("after saving", () => {
	it("names everybody the site does not hold as the sheet said", () => {
		const lines = [{ employee: "HR-EMP-1", name: "Anand", amount: 5000, ...ON }, { employee: "HR-EMP-2", name: "Priya", amount: 3500, ...ON }];
		const after = [{ employee: "HR-EMP-1", festival: "Onam 2026", bonus_date: "2026-08-25", amount: 4000 }];
		expect(verifyBonus(lines, after)).toEqual([
			{ name: "Anand", text: "has ₹4000 on the site, not ₹5000" },
			{ name: "Priya", text: "has no Onam 2026 bonus on 2026-08-25 on the site" },
		]);
	});
});

describe("the bank sheet for a festival", () => {
	const rows = [
		{ name: "B-1", employee: "HR-EMP-1", employee_name: "Anand Raghavan", festival: "Onam 2026", bonus_date: "2026-08-25", amount: 5000 },
		{ name: "B-2", employee: "HR-EMP-2", employee_name: "Priya Menon", festival: "Onam 2026 ", bonus_date: "2026-08-25", amount: 3500 },
		{ name: "B-3", employee: "HR-EMP-1", employee_name: "Anand Raghavan", festival: "Christmas 2026", bonus_date: "2026-12-20", amount: 2000 },
	];

	it("lists each festival once, newest first", () => {
		expect(bonusOccasions(rows).map((o) => `${o.festival}|${o.date}`)).toEqual(["Christmas 2026|2026-12-20", "Onam 2026|2026-08-25"]);
	});

	it("pays that festival's bonuses and nothing else, through the same bank sheet as salary", () => {
		const onam = bonusOccasions(rows)[1];
		const emps = [{ name: "HR-EMP-1", employee_number: "MR001", bank_ac_no: "123456", bank_name: "SBI", ifsc_code: "SBIN0001" }, { name: "HR-EMP-2" }];
		const sheet = bankSheet(bonusAsSlips(rows, onam), emps);
		expect(sheet.totals).toMatchObject({ count: 2, net: 8500, bankCount: 1, bank: 5000, otherCount: 1, other: 3500 });
	});

	it("fills the list to download with what each person already has for this festival", () => {
		const existing = [{ employee: "HR-EMP-1", festival: "Onam 2026", bonus_date: "2026-08-25", amount: 5000 }];
		expect(bonusRow(people[0], existing, ON)).toEqual(["MR001", "Anand Raghavan", "", 5000]);
		expect(bonusRow(people[1], existing, ON)).toEqual(["MR002", "Priya Menon", "", null]);
	});
});
