import { apiCreate, apiWrite, listAll } from "@/api/client";
import { ACTUAL_HEADS, actualRow } from "@/lib/actualsalary";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";

/* ---------------------------------------------------------------------------
   Payroll → Actual Salary → Upload: the reads and writes. The rules are in
   lib/actualsalary.js; this file only fetches and saves, under the signed-in
   person's own roles, with the site checking every document.
   --------------------------------------------------------------------------- */

/** Everybody, to match codes against. */
export const loadActualPeople = () =>
	listAll("Employee", ["name", "employee_number", "employee_name", "company", "status", "department"], null, 500);

/** Every actual salary already on the site, for one company or all. */
export const loadActualRows = (company) =>
	listAll("Employee Actual Salary", ["name", "employee", "from_date", "actual_salary", "company"],
		company ? [["company", "=", company]] : undefined, 500);

/** The list to fill in: the company's Active people, with their latest actual salary. */
export async function downloadActualList(people, existing, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Actual Salary");
	ws.addRow(ACTUAL_HEADS).eachCell((c) => {
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	ws.getCell("E1").note = "The date this salary starts. Leave empty to use the date chosen on the page.";
	for (const p of people) {
		const r = actualRow(p, existing);
		ws.addRow([r[0], r[1], r[2], r[3], r[4] ? new Date(`${r[4]}T00:00:00Z`) : null]);
	}
	[14, 30, 28, 16, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	ws.getColumn(4).numFmt = "#,##0.00";
	ws.getColumn(5).numFmt = "dd-mm-yyyy";
	ws.views = [{ state: "frozen", ySplit: 1 }];
	await downloadWorkbook(wb, `Actual Salary${company ? " " + company : ""}.xlsx`);
}

/** Save each line on its own — a refusal for one does not stop the rest.
    @returns {Promise<{made: object[], failed: {name, error}[]}>} */
export async function saveActual(lines, onStep = () => {}) {
	const made = [];
	const failed = [];
	for (const l of lines) {
		onStep(`saving ${l.name}`);
		try {
			if (l.action === "update") {
				const r = await apiWrite("Employee Actual Salary", l.existing.name, { actual_salary: l.salary });
				if (!r.ok) throw new Error(r.error || "refused");
			} else {
				await apiCreate("Employee Actual Salary", { employee: l.employee, from_date: l.from, actual_salary: l.salary });
			}
			made.push(l);
		} catch (e) {
			failed.push({ name: l.name, error: e.message || String(e) });
		}
	}
	return { made, failed };
}
