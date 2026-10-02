import { apiCreate, apiSubmitDraft, listAll } from "@/api/client";
import { COMPONENTS, planDocs } from "@/lib/advances";

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
