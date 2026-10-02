import { apiCreateSubmitted, listAll } from "@/api/client";
import { assignmentDoc, structureDoc } from "@/lib/salarysetup";

/* ---------------------------------------------------------------------------
   Payroll → Salary Setup's reads and writes. All hrms's own documents: Salary
   Component (read), Salary Structure and Salary Structure Assignment (made and
   submitted — a draft of either is given to nobody, so a draft would read as
   done and change nothing). Nothing here touches a Salary Slip.
   --------------------------------------------------------------------------- */

const attempt = async (fn) => {
	try {
		return await fn();
	} catch {
		return null;
	}
};

/** Components, structures and the assignments in force. A refusal is `null`. */
export async function loadSetup(company) {
	const co = company ? [["company", "=", company]] : [];
	const [components, structures, assignments] = await Promise.all([
		attempt(() => listAll("Salary Component", ["name", "type", "salary_component_abbr", "disabled"], [["disabled", "=", 0]], 500)),
		attempt(() => listAll("Salary Structure", ["name", "company", "docstatus", "is_active", "payroll_frequency"],
			[["docstatus", "=", 1], ...co], 500)),
		attempt(() => listAll("Salary Structure Assignment", ["name", "employee", "employee_name", "salary_structure", "from_date", "base", "company", "docstatus"],
			[["docstatus", "=", 1], ...co], 500)),
	]);
	return { components, structures, assignments };
}

/** Make a Salary Structure and submit it. Throws what the site said. */
export async function createStructure(form, components) {
	const made = await apiCreateSubmitted("Salary Structure", structureDoc(form, components));
	return made.name || form.name;
}

/** Give people a structure, one at a time and each on its own, so a refusal on
    one person does not stop the rest and the page can say which it was.
    @returns {Promise<{made: string[], failed: {employee, name, error}[]}>} */
export async function assignStructure(rows, structure, from, company) {
	const made = [];
	const failed = [];
	for (const r of rows) {
		try {
			await apiCreateSubmitted("Salary Structure Assignment", assignmentDoc(r, structure, from, company));
			made.push(r.employee);
		} catch (e) {
			failed.push({ employee: r.employee, name: r.name, error: e.message || String(e) });
		}
	}
	return { made, failed };
}
