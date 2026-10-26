import { apiCreate, apiWrite, listAll } from "@/api/client";
import { BONUS_HEADS, bonusRow } from "@/lib/festivalbonus";
import { downloadWorkbook } from "@/lib/xlsx";
import { HEAD_FILL } from "@/lib/fills";

/* ---------------------------------------------------------------------------
   Payroll → Festival Bonus: the reads and writes. The rules are in
   lib/festivalbonus.js; this file only fetches and saves, under the signed-in
   person's own roles, with the site checking every document.
   --------------------------------------------------------------------------- */

/** Everybody, to match codes against. */
export const loadBonusPeople = () =>
	listAll("Employee", ["name", "employee_number", "employee_name", "company", "status", "department"], null, 500);

/** Every festival bonus already on the site, for one company or all. */
export const loadBonusRows = (company) =>
	listAll("Employee Festival Bonus", ["name", "employee", "employee_name", "festival", "bonus_date", "amount", "company"],
		company ? [["company", "=", company]] : undefined, 500);

/** The list to fill in: the company's Active people, with this festival's bonus where they have one. */
export async function downloadBonusList(people, existing, company, occasion) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	const ws = wb.addWorksheet("Festival Bonus");
	ws.addRow(BONUS_HEADS).eachCell((c) => {
		c.font = { bold: true, color: { argb: "FFFFFFFF" } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
	});
	for (const p of people) ws.addRow(bonusRow(p, existing, occasion));
	[14, 30, 28, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
	ws.getColumn(4).numFmt = "#,##0.00";
	ws.views = [{ state: "frozen", ySplit: 1 }];
	await downloadWorkbook(wb, `${occasion.festival || "Festival"} Bonus${company ? " " + company : ""}.xlsx`);
}

/** Save each line on its own — a refusal for one does not stop the rest.
    @returns {Promise<{made: object[], failed: {name, error}[]}>} */
export async function saveBonus(lines, onStep = () => {}) {
	const made = [];
	const failed = [];
	for (const l of lines) {
		onStep(`saving ${l.name}`);
		try {
			if (l.action === "update") {
				const r = await apiWrite("Employee Festival Bonus", l.existing.name, { amount: l.amount });
				if (!r.ok) throw new Error(r.error || "refused");
			} else {
				await apiCreate("Employee Festival Bonus", { employee: l.employee, festival: l.festival, bonus_date: l.date, amount: l.amount });
			}
			made.push(l);
		} catch (e) {
			failed.push({ name: l.name, error: e.message || String(e) });
		}
	}
	return { made, failed };
}
