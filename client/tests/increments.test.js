import { describe, expect, it, vi, beforeEach } from "vitest";
import ExcelJS from "exceljs";

import {
	TEMPLATE_COLUMNS, cellDate, cellNumber, changesOn, defaultEffective, findColumns, incrementDoc, inForce, planIncrements,
	sheetProblem, tally, templateRows, verifyLine,
} from "@/lib/increments";

/* ---------------------------------------------------------------------------
   Payroll → Increments (5 October 2026): each January HR raises salaries from
   an Excel sheet, and each raise becomes a new Salary Structure Assignment
   from the effective date. lib/increments.js reads the sheet; nothing in it
   decides an amount.
   --------------------------------------------------------------------------- */

const EMPS = [
	{ name: "HR-EMP-00067", employee_number: "MRP-004", employee_name: "SAJI KUMAR K M", department: "Production" },
	{ name: "HR-EMP-00125", employee_number: "MRP-293", employee_name: "PAUL SUNNY", department: "IT" },
	{ name: "HR-EMP-00200", employee_number: "MRP-500", employee_name: "NEW JOINER", department: "Stores" },
];
const SSA = [
	{ name: "SSA-1", employee: "HR-EMP-00067", salary_structure: "Staff Monthly", company: "Manna Rubber", from_date: "2026-04-01", base: 40000, docstatus: 1, income_tax_slab: "New Regime" },
	{ name: "SSA-0", employee: "HR-EMP-00067", salary_structure: "Staff Monthly", company: "Manna Rubber", from_date: "2025-04-01", base: 36000, docstatus: 1 },
	{ name: "SSA-2", employee: "HR-EMP-00125", salary_structure: "Staff Monthly", company: "Manna Rubber", from_date: "2026-09-01", base: 25000, docstatus: 1 },
];
const COLS = findColumns(TEMPLATE_COLUMNS);
const ctx = { employees: EMPS, assignments: SSA, effective: "2027-01-01" };
const plan = (rows, c = COLS, x = ctx) => planIncrements(rows, c, x);

describe("reading HR's sheet", () => {
	it("the_downloaded_sheets_own_headers_are_all_recognised", () => {
		expect(COLS).toEqual({
			code: "Emp Code", name: "Name", newBase: "New Base", amount: "Increment Amount", pct: "Increment %", effective: "Effective From",
		});
	});

	it("last_years_sheet_spelled_differently_still_reads", () => {
		expect(findColumns(["Employee Code", "Employee Name", "Revised Salary", "Increment", "% Increase", "W.E.F"])).toEqual({
			code: "Employee Code", name: "Employee Name", newBase: "Revised Salary", amount: "Increment", pct: "% Increase", effective: "W.E.F",
		});
	});

	it("a_sheet_with_no_code_or_no_increment_column_is_refused_with_why", () => {
		expect(sheetProblem(findColumns(["Name", "New Base"]))).toMatch(/Emp Code/);
		expect(sheetProblem(findColumns(["Emp Code", "Name"]))).toMatch(/no New Base/);
	});

	it("amounts_and_dates_read_the_way_hr_types_them", () => {
		expect(cellNumber("₹ 12,500.50")).toBe(12500.5);
		expect(cellNumber("8%")).toBe(8);
		expect(cellNumber("")).toBe(null);
		expect(Number.isNaN(cellNumber("eight"))).toBe(true);
		expect(cellDate("01-01-2027")).toBe("2027-01-01");
		expect(cellDate("1/1/27")).toBe("2027-01-01");
		expect(cellDate("01-Jan-2027")).toBe("2027-01-01");
		expect(cellDate(new Date(Date.UTC(2027, 0, 1)))).toBe("2027-01-01");
		expect(cellDate("31-02-2027")).toBe(null);
	});

	it("the_increments_are_for_next_january_until_the_new_year_and_this_january_until_march", () => {
		expect(defaultEffective("2026-10-05")).toBe("2027-01-01");
		expect(defaultEffective("2027-01-20")).toBe("2027-01-01");
		expect(defaultEffective("2027-03-31")).toBe("2027-01-01");
	});
});

describe("what each row does", () => {
	it("a_new_base_an_amount_or_a_percentage_each_give_the_new_base", () => {
		const [a, b] = plan([
			{ "Emp Code": "MRP-004", "New Base": 44000 },
			{ "Emp Code": "MRP-293", "Increment %": 10 },
		]);
		expect(a).toMatchObject({ status: "ready", base: 40000, newBase: 44000, increase: 4000, pct: 10, from: "2027-01-01" });
		expect(b).toMatchObject({ status: "ready", base: 25000, newBase: 27500 });
		expect(plan([{ "Emp Code": "MRP-004", "Increment Amount": "2,500" }])[0]).toMatchObject({ status: "ready", newBase: 42500 });
	});

	it("the_increment_is_on_the_salary_in_force_on_the_effective_date", () => {
		expect(plan([{ "Emp Code": "MRP-004", "Increment Amount": 1000, "Effective From": "01-01-2026" }])[0])
			.toMatchObject({ base: 36000, newBase: 37000, from: "2026-01-01" });
	});

	it("an_empty_row_changes_nothing_for_that_person", () => {
		expect(plan([{ "Emp Code": "MRP-004" }])[0]).toMatchObject({ status: "skip" });
	});

	it("an_unknown_code_a_repeated_code_and_a_row_with_no_code_are_each_said", () => {
		const lines = plan([
			{ "Emp Code": "MRP-999", "New Base": 1 }, { "Emp Code": "MRP-004", "New Base": 44000 },
			{ "Emp Code": "mrp-004", "New Base": 45000 }, { Name: "Somebody", "New Base": 1 },
		]);
		expect(lines.map((l) => l.status)).toEqual(["problem", "ready", "problem", "problem"]);
		expect(lines[0].why).toMatch(/MRP-999/);
		expect(lines[2].why).toMatch(/twice/);
		expect(lines.map((l) => l.row)).toEqual([2, 3, 4, 5]);
	});

	it("somebody_with_no_salary_yet_is_sent_to_salary_setup", () => {
		expect(plan([{ "Emp Code": "MRP-500", "New Base": 20000 }])[0]).toMatchObject({ status: "problem", why: expect.stringMatching(/Salary Setup/) });
	});

	it("a_pay_cut_is_shown_as_a_decrease_and_never_counted_as_ready", () => {
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 38000 }])[0]).toMatchObject({ status: "decrease", increase: -2000, pct: -5 });
	});

	it("two_columns_that_disagree_are_a_typo_for_hr_to_settle", () => {
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 44000, "Increment Amount": 2000 }])[0].status).toBe("problem");
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 44000, "Increment Amount": 4000 }])[0].status).toBe("ready");
	});

	it("a_percentage_over_a_hundred_is_questioned", () => {
		expect(plan([{ "Emp Code": "MRP-004", "Increment %": 150 }])[0].status).toBe("problem");
	});

	it("uploading_the_same_sheet_again_skips_what_is_already_done", () => {
		const done = [...SSA, { name: "SSA-9", employee: "HR-EMP-00067", salary_structure: "Staff Monthly", from_date: "2027-01-01", base: 44000, docstatus: 1 }];
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 44000 }], COLS, { ...ctx, assignments: done })[0]).toMatchObject({ status: "done" });
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 45000 }], COLS, { ...ctx, assignments: done })[0])
			.toMatchObject({ status: "problem", why: expect.stringMatching(/SSA-9/) });
	});

	it("a_bad_date_or_a_word_where_a_number_goes_is_said", () => {
		expect(plan([{ "Emp Code": "MRP-004", "New Base": 44000, "Effective From": "next year" }])[0].status).toBe("problem");
		expect(plan([{ "Emp Code": "MRP-004", "New Base": "forty" }])[0].status).toBe("problem");
	});
});

describe("the documents", () => {
	it("an_increment_is_a_new_assignment_on_the_same_structure_carrying_its_settings", () => {
		const [l] = plan([{ "Emp Code": "MRP-004", "New Base": 44000 }]);
		expect(incrementDoc(l)).toEqual({
			employee: "HR-EMP-00067", salary_structure: "Staff Monthly", company: "Manna Rubber",
			from_date: "2027-01-01", base: 44000, income_tax_slab: "New Regime",
		});
	});

	it("the_salary_in_force_is_the_latest_one_started_by_that_day", () => {
		expect(inForce(SSA, "HR-EMP-00067", "2026-03-31").name).toBe("SSA-0");
		expect(inForce(SSA, "HR-EMP-00067", "2027-01-01").name).toBe("SSA-1");
		expect(inForce(SSA, "HR-EMP-00200", "2027-01-01")).toBe(null);
	});

	it("the_template_lists_everybody_with_a_salary_and_their_current_base", () => {
		expect(templateRows(EMPS, SSA, "2027-01-01")).toEqual([
			["MRP-004", "SAJI KUMAR K M", "Production", "Staff Monthly", 40000, "", "", "", ""],
			["MRP-293", "PAUL SUNNY", "IT", "Staff Monthly", 25000, "", "", "", ""],
		]);
	});

	it("the_preview_adds_up_what_will_be_applied", () => {
		const t = tally(plan([{ "Emp Code": "MRP-004", "New Base": 44000 }, { "Emp Code": "MRP-293", "Increment %": 10 }, { "Emp Code": "MRP-500" }]));
		expect(t).toMatchObject({ ready: 2, skip: 1, problem: 0, increase: 6500 });
		expect(tally(plan([{ "Emp Code": "MRP-004", "New Base": 38000 }]))).toMatchObject({ ready: 0, decrease: 1, cut: -2000 });
	});

	it("the_site_list_says_which_way_each_salary_from_that_date_went", () => {
		const after = [...SSA,
			{ name: "SSA-9", employee: "HR-EMP-00067", from_date: "2027-01-01", base: 44000, docstatus: 1 },
			{ name: "SSA-8", employee: "HR-EMP-00125", from_date: "2027-01-01", base: 24000, docstatus: 1 },
			{ name: "SSA-7", employee: "HR-EMP-00200", from_date: "2027-01-01", base: 15000, docstatus: 1 }];
		expect(changesOn(after, "2027-01-01", EMPS).map((c) => [c.code, c.before, c.after, c.way, c.change])).toEqual([
			["MRP-004", 40000, 44000, "up", 4000], ["MRP-293", 25000, 24000, "down", -1000], ["MRP-500", null, 15000, "first", null],
		]);
	});

	it("an_applied_row_is_checked_against_what_the_site_stored", () => {
		const [l] = plan([{ "Emp Code": "MRP-004", "New Base": 44000 }]);
		expect(verifyLine(l, [...SSA, { name: "SSA-9", employee: "HR-EMP-00067", from_date: "2027-01-01", base: 44000, docstatus: 1 }]))
			.toEqual({ way: "up", base: 44000, made: "SSA-9" });
		expect(verifyLine(l, [...SSA, { name: "SSA-9", employee: "HR-EMP-00067", from_date: "2027-01-01", base: 43000, docstatus: 1 }]).way).toBe("differs");
		expect(verifyLine(l, SSA)).toEqual({ way: "missing" });
	});
});

/* --------------------------------------------------------------- the writes */

const made = [];
let refuse = "";
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	apiCreateSubmitted: (label, doc) => {
		made.push([label, doc.employee, doc.base, doc.from_date]);
		return refuse && doc.employee === refuse ? Promise.reject(new Error("Date of joining is after From Date")) : Promise.resolve({ name: "SSA-NEW" });
	},
}));

const { applyIncrements, readSheet } = await import("@/api/increments");

async function xlsxFile(rows) {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet("Increments");
	ws.addRow(TEMPLATE_COLUMNS);
	for (const r of rows) ws.addRow(r);
	const buf = await wb.xlsx.writeBuffer();
	/* What a browser's File offers the reader; jsdom's has no arrayBuffer(). */
	return { name: "Increments 2027.xlsx", arrayBuffer: async () => buf };
}

describe("uploading and applying", () => {
	beforeEach(() => { made.length = 0; refuse = ""; });

	it("an_uploaded_excel_sheet_is_read_into_the_preview", async () => {
		const file = await xlsxFile([
			["MRP-004", "SAJI KUMAR K M", "Production", "Staff Monthly", 40000, 44000, "", "", ""],
			["MRP-293", "PAUL SUNNY", "IT", "Staff Monthly", 25000, "", "", 10, new Date(Date.UTC(2027, 0, 1))],
		]);
		const { lines } = await readSheet(file, ctx);
		expect(lines.map((l) => [l.code, l.status, l.newBase, l.from])).toEqual([
			["MRP-004", "ready", 44000, "2027-01-01"], ["MRP-293", "ready", 27500, "2027-01-01"],
		]);
	});

	it("a_decrease_is_applied_only_when_hr_ticks_for_it", async () => {
		const lines = plan([{ "Emp Code": "MRP-004", "New Base": 38000 }, { "Emp Code": "MRP-293", "Increment %": 10 }]);
		await applyIncrements(lines);
		expect(made.map((m) => m[1])).toEqual(["HR-EMP-00125"]);
		made.length = 0;
		await applyIncrements(lines, () => {}, { decreases: true });
		expect(made.map((m) => [m[1], m[2]])).toEqual([["HR-EMP-00067", 38000], ["HR-EMP-00125", 27500]]);
	});

	it("each_ready_row_becomes_a_submitted_assignment_and_a_refusal_stops_only_that_person", async () => {
		refuse = "HR-EMP-00067";
		const lines = plan([{ "Emp Code": "MRP-004", "New Base": 44000 }, { "Emp Code": "MRP-293", "Increment %": 10 }, { "Emp Code": "MRP-500" }]);
		const r = await applyIncrements(lines);
		expect(made).toEqual([
			["Salary Structure Assignment", "HR-EMP-00067", 44000, "2027-01-01"],
			["Salary Structure Assignment", "HR-EMP-00125", 27500, "2027-01-01"],
		]);
		expect(r.made.map((x) => x.code)).toEqual(["MRP-293"]);
		expect(r.failed).toMatchObject([{ code: "MRP-004", error: "Date of joining is after From Date" }]);
	});
});
