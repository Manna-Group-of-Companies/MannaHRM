import { apiCreateSubmitted, listAll } from "@/api/client";
import { readResponses } from "@/lib/onboardimport";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";
import { TEMPLATE_COLUMNS, findColumns, incrementDoc, planIncrements, sheetProblem, templateRows } from "@/lib/increments";

/* ---------------------------------------------------------------------------
   Payroll → Increments' reads and writes. One doctype is written, hrms's own
   Salary Structure Assignment, made and submitted — a draft one pays nobody.
   hrms checks each on the site: the structure, the company, the date against
   joining, and a second assignment on the same day.
   --------------------------------------------------------------------------- */

const BASE_FIELDS = ["name", "employee", "employee_name", "salary_structure", "from_date", "base", "company", "docstatus"];
const EXTRA_FIELDS = ["variable", "income_tax_slab", "payroll_payable_account", "currency"];

/** Every submitted assignment — the whole history, not only the current one,
    because the sheet's date decides which is in force and whether the
    increment is already there. Asked with the fields an increment carries
    over, and without them on a site that refuses one. */
export async function loadAssignments(company) {
	const f = [["docstatus", "=", 1], ...(company ? [["company", "=", company]] : [])];
	try {
		return await listAll("Salary Structure Assignment", [...BASE_FIELDS, ...EXTRA_FIELDS], f, 500);
	} catch {
		return listAll("Salary Structure Assignment", BASE_FIELDS, f, 500);
	}
}

/** Download the sheet HR fills: everybody with a salary on `day`, their
    current base, and the four columns to fill. */
export async function downloadTemplate(employees, assignments, day, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Increments");
	const head = ws.addRow(TEMPLATE_COLUMNS);
	head.eachCell((c) => {
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	for (const r of templateRows(employees, assignments, day)) ws.addRow(r);
	[12, 26, 20, 22, 13, 13, 16, 12, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	ws.getColumn(9).numFmt = "dd-mm-yyyy";
	ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
	await downloadWorkbook(wb, `Increments ${day.slice(0, 4)}${company ? " " + company : ""}.xlsx`);
}

/** Read an uploaded sheet and plan it. Throws a sentence when the file
    cannot be read or says nothing. */
export async function readSheet(file, ctx) {
	const rows = await readResponses(file);
	if (!rows.length) throw new Error("The sheet has no rows under its header.");
	const cols = findColumns(Object.keys(rows[0]));
	const bad = sheetProblem(cols);
	if (bad) throw new Error(bad);
	return { cols, lines: planIncrements(rows, cols, ctx) };
}

/** Make every ready increment — and the decreases, only when `decreases` is
    set because HR ticked for them — one at a time and each on its own, so a
    refusal on one person names that person and the rest still go.
    @returns {Promise<{made: object[], failed: object[]}>} */
export async function applyIncrements(lines, onStep = () => {}, { decreases = false } = {}) {
	const made = [];
	const failed = [];
	for (const l of lines.filter((x) => x.status === "ready" || (decreases && x.status === "decrease"))) {
		try {
			const doc = await apiCreateSubmitted("Salary Structure Assignment", incrementDoc(l));
			made.push({ ...l, made: doc?.name || "" });
		} catch (e) {
			failed.push({ ...l, error: e.message || String(e) });
		}
		onStep(made.length + failed.length);
	}
	return { made, failed };
}
