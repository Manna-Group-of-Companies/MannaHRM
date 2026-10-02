/* ---------------------------------------------------------------------------
   What payroll needs to find on the ERPNext site before the first run.

   **Mirrored in tools/setup_payroll.py** — that script is what puts these on the
   site, because manna_hr is not installed there and `install.py` does not run
   (CLAUDE.md §7). tests/payrollsetup.test.js reads the Python file and fails if
   the two lists drift, the way leave.test.js does for monthly leave.

   Three Salary Components, and only three, because they are the three the
   Salary Sheet needs to tell apart (lib/salarysheet.js `kindOf`): leave
   encashment arrives on a slip as an earning, an advance and a loan instalment
   leave it as deductions. What Basic, HRA, PF and ESI are, and what each
   person's base is, is HR's decision and is never made here.
   --------------------------------------------------------------------------- */

/** Salary Components the Salary Sheet and the loan and advance steps rely on.
    `type` is hrms's own field: Earning or Deduction. */
export const REQUIRED_COMPONENTS = [
	{ name: "Leave Encashment", abbr: "LENC", type: "Earning", why: "Leave encashment is paid through an Additional Salary of this component." },
	{ name: "Salary Advance", abbr: "SADV", type: "Deduction", why: "An advance taken is recovered from pay through this component." },
	{ name: "Loan EMI", abbr: "LEMI", type: "Deduction", why: "A loan instalment is recovered from pay through this component." },
];

/** The roles that can run payroll on the site. Stock hrms roles — checked,
    never created. */
export const PAYROLL_ROLES = ["HR Manager", "HR User"];

/** The stock hrms doctypes a payroll run touches. A site without one of them
    is a site without Frappe HR's Payroll module. */
export const PAYROLL_DOCTYPES = [
	"Salary Component", "Salary Structure", "Salary Structure Assignment", "Payroll Entry",
	"Salary Slip", "Additional Salary",
];

/** Which of the required components are not in `rows` (the Salary Component
    rows the site returned). `null` when the site could not be asked. */
export function missingComponents(rows) {
	if (!Array.isArray(rows)) return null;
	const have = new Set(rows.filter((r) => !Number(r.disabled)).map((r) => r.name));
	return REQUIRED_COMPONENTS.filter((c) => !have.has(c.name));
}
