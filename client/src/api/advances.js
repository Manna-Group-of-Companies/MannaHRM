import { apiCreate, apiSubmitDraft, listAll } from "@/api/client";
import { COMPONENTS, planDocs } from "@/lib/advances";
import { OLD_LOAN_HEADS, asPlan } from "@/lib/oldloans";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";

/* ---------------------------------------------------------------------------
   Payroll → Advances & Loans: the instalments on the site, and making them.
   Each instalment is an Additional Salary — hrms's own document — made as a
   draft and submitted, which is what a salary slip reads. Nothing here touches
   a Salary Slip, and a submitted instalment is taken back by cancelling it on
   the site.
   --------------------------------------------------------------------------- */

/** Every advance and loan instalment, in any month, that is a draft or
    submitted. A refusal throws, so the page says so rather than showing none. */
export function loadInstalments(company) {
	const co = company ? [["company", "=", company]] : [];
	return listAll("Additional Salary",
		["name", "employee", "employee_name", "salary_component", "amount", "payroll_date", "docstatus"],
		[["salary_component", "in", COMPONENTS], ["docstatus", "<", 2], ...co], 2000);
}

/** Make and submit every instalment of a plan, in date order. If one is refused
    the rest are not made, and what was made is reported — a plan stopped halfway
    is better known than guessed at. @returns {Promise<{made: string[], error: string}>} */
export async function givePlan(form, company) {
	const made = [];
	for (const doc of planDocs(form, company)) {
		try {
			const row = await apiCreate("Additional Salary", doc);
			await apiSubmitDraft("Additional Salary", row.name);
			made.push(row.name);
		} catch (e) {
			return { made, error: `${doc.payroll_date}: ${e.message || e}` };
		}
	}
	return { made, error: "" };
}

/** The sheet of old loans to fill in: everybody in the company, the amounts
    blank. A row left blank is somebody with no old loan. */
export async function downloadOldLoanList(people, company) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Old loans");
	ws.addRow(OLD_LOAN_HEADS).eachCell((c) => {
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	ws.getCell("C1").note = "Loan or Advance. Blank means Loan.";
	ws.getCell("E1").note = "What the person has already paid back. Only what is left is taken from salary.";
	ws.getCell("G1").note = "The month the first instalment is taken, e.g. 2026-11. Blank uses the month chosen on the page.";
	for (const p of people) ws.addRow([p.employee_number || p.name, p.employee_name || p.name, "", null, null, null, ""]);
	[14, 30, 16, 18, 18, 13, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	ws.getColumn(4).numFmt = "#,##0.00";
	ws.getColumn(5).numFmt = "#,##0.00";
	ws.views = [{ state: "frozen", ySplit: 1 }];
	await downloadWorkbook(wb, `Old loans${company ? " " + company : ""}.xlsx`);
}

/** Make every line's instalments, one person at a time. One person refused
    does not stop the next; each line's own result is kept.
    @returns {Promise<{done: object[], failed: {line: object, made: number, error: string}[]}>} */
export async function giveOldLoans(lines, company, onStep = () => {}) {
	const done = [];
	const failed = [];
	for (let i = 0; i < lines.length; i++) {
		onStep(i + 1);
		const r = await givePlan(asPlan(lines[i]), company);
		if (r.error) failed.push({ line: lines[i], made: r.made.length, error: r.error });
		else done.push(lines[i]);
	}
	return { done, failed };
}
