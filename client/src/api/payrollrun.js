import { apiCreate, apiSubmitDraft, listAll } from "@/api/client";
import { REQUIRED_COMPONENTS } from "@/lib/payrollsetup";
import { componentDoc, extraDoc } from "@/lib/payrollrun";

/* ---------------------------------------------------------------------------
   What Payroll → Payroll reads and writes, beyond the month's own (api/payroll.js).

   **Writes, all of them hrms's own documents:** a Salary Component (a master,
   made once), and an Additional Salary — made as a draft, then submitted, which
   is what makes a slip pick it up. Neither is a payment. Nothing here touches a
   Salary Slip, and the step that pays — submitting the slips — is not here.
   --------------------------------------------------------------------------- */

const attempt = async (fn) => {
	try {
		return await fn();
	} catch {
		return null;
	}
};

/** The month's reads: the three required components, every enabled component
    (for the "Bonus or other" list), and the month's Additional Salary rows.
    A refusal is `null` — "the site would not say" is not "none". */
export async function loadRunReads(company, start, end) {
	const co = company ? [["company", "=", company]] : [];
	const [required, all, extras] = await Promise.all([
		attempt(() => listAll("Salary Component", ["name", "type", "disabled"],
			[["name", "in", REQUIRED_COMPONENTS.map((c) => c.name)]])),
		attempt(() => listAll("Salary Component", ["name", "type", "disabled"], [["disabled", "=", 0]], 500)),
		attempt(() => listAll("Additional Salary",
			["name", "employee", "employee_name", "salary_component", "amount", "docstatus"],
			[["payroll_date", ">=", start], ["payroll_date", "<=", end], ["docstatus", "<", 2], ...co], 500)),
	]);
	return { components: required, all, extras };
}

/** Make Salary Components, one at a time, each on its own: one refused must not
    hide the others. @returns {Promise<{made: string[], failed: {name, error}[]}>} */
export async function makeComponents(list) {
	const made = [];
	const failed = [];
	for (const c of list) {
		try {
			await apiCreate("Salary Component", componentDoc(c));
			made.push(c.name);
		} catch (e) {
			failed.push({ name: c.name, error: e.message || String(e) });
		}
	}
	return { made, failed };
}

/** One Additional Salary, made and — when `submit` — submitted. If the submit is
    refused the draft is left, and the error says so: a half-done add is a
    deduction that looks entered and takes nothing. */
export async function addExtra(form, end, company, submit) {
	const made = await apiCreate("Additional Salary", extraDoc(form, end, company));
	if (!submit) return { name: made.name, submitted: false };
	try {
		await apiSubmitDraft("Additional Salary", made.name);
		return { name: made.name, submitted: true };
	} catch (e) {
		const err = new Error(`${made.name} was made as a draft, but could not be submitted: ${e.message || e}`);
		err.draft = made.name;
		throw err;
	}
}

/** Submit drafts, one at a time. @returns {Promise<{done: string[], failed: {name, error}[]}>} */
export async function submitExtras(names) {
	const done = [];
	const failed = [];
	for (const name of names) {
		try {
			await apiSubmitDraft("Additional Salary", name);
			done.push(name);
		} catch (e) {
			failed.push({ name, error: e.message || String(e) });
		}
	}
	return { done, failed };
}
