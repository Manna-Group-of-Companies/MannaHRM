import { listAll } from "@/api/client";
import { loadFrappePayroll } from "@/api/frappepayroll";
import { REQUIRED_COMPONENTS } from "@/lib/payrollsetup";

/* ---------------------------------------------------------------------------
   The two reads Payroll → Payroll adds to the month's own (api/payroll.js):
   which of the three Salary Components exist, and what has been added to the
   month with an Additional Salary. Read-only, and a refusal comes back as
   `null` — "the site would not say" is a different answer from "none".
   --------------------------------------------------------------------------- */

const attempt = async (fn) => {
	try {
		return await fn();
	} catch {
		return null;
	}
};

/** @returns {Promise<{components: object[]|null, extras: object[]|null, counts: object|null}>} */
export async function loadHomeReads(company, start, end) {
	const co = company ? [["company", "=", company]] : [];
	const [components, extras, fp] = await Promise.all([
		attempt(() => listAll("Salary Component", ["name", "type", "disabled"],
			[["name", "in", REQUIRED_COMPONENTS.map((c) => c.name)]])),
		attempt(() => listAll("Additional Salary",
			["name", "employee", "employee_name", "salary_component", "amount", "docstatus"],
			[["payroll_date", ">=", start], ["payroll_date", "<=", end], ["docstatus", "<", 2], ...co], 500)),
		attempt(() => loadFrappePayroll(company)),
	]);
	return { components, extras, counts: fp ? fp.counts : null };
}
