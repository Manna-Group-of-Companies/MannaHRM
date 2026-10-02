/* ---------------------------------------------------------------------------
   Frappe HR's payroll, as the site holds it — asked for on 29 September 2026.

   The rest of the Payroll module is Factor HR's menu, item for item, and most
   of it says what a page *would* take. This is the other way round: the stock
   hrms doctypes that already run payroll on this site, how many of each the
   site holds, and the way into each one on the desk. It is the same shape as
   hrms' own Payroll workspace, because that is where anybody who has used
   Frappe HR will look for them.

   **`company` is a claim about the doctype, not a guess.** A filter on a field
   the doctype lacks is a 417 — the same code a refused read gives — so only the
   doctypes that carry `company` in stock hrms are filtered by the top-bar
   picker. The rest are counted group-wide and say so.
   --------------------------------------------------------------------------- */

/** `[doctype, what it is, has a company field]`, in the groups hrms uses. */
export const FRAPPE_PAYROLL = [
	{
		title: "Set up",
		what: "What a salary is made of, before anybody is paid",
		rows: [
			["Salary Component", "An earning or a deduction — Basic, HRA, PF, Professional Tax", false],
			["Salary Structure", "Which components make up a salary, and how each is worked out", true],
			["Salary Structure Assignment", "Who is on which structure, from when, at what base", true],
			["Payroll Period", "The tax year payroll is counted in", true],
			["Income Tax Slab", "The income-tax brackets a slip is taxed against", false],
		],
	},
	{
		title: "Run payroll",
		what: "One month, for one company",
		rows: [
			["Payroll Entry", "One run: picks the people and makes their salary slips", true],
			["Salary Slip", "What one person is paid for one period", true],
			["Additional Salary", "A one-off amount added to or taken off a slip", true],
			["Employee Incentive", "An incentive paid through the next slip", true],
		],
	},
	{
		title: "Tax",
		what: "What employees claim against their income tax",
		rows: [
			["Employee Tax Exemption Declaration", "What an employee says they will claim this year", true],
			["Employee Tax Exemption Proof Submission", "The proof behind a declaration", true],
		],
	},
];

/** hrms' own payroll reports, opened on the desk. Only the ones that ship in
    stock hrms — a report link that 404s is a worse answer than no link. */
export const FRAPPE_PAYROLL_REPORTS = [
	["Salary Register", "Every slip in a period, component by component"],
	["Bank Remittance", "What to pay into each bank account"],
	["Income Tax Deductions", "Tax deducted per employee"],
	["Income Tax Computation", "How each employee's tax was worked out"],
];

/** Every doctype on the page, flat. */
export const FRAPPE_PAYROLL_DOCTYPES = FRAPPE_PAYROLL.flatMap((g) => g.rows.map((r) => r[0]));

/** Whether the top-bar company can narrow a doctype's count. */
export const hasCompany = (dt) => FRAPPE_PAYROLL.some((g) => g.rows.some((r) => r[0] === dt && r[2]));

/** A slip's state in words. `status` where hrms keeps one (Draft, Submitted,
    Withheld, Cancelled), otherwise what `docstatus` means. */
export function docState(r) {
	if (r && r.status) return String(r.status);
	return ["Draft", "Submitted", "Cancelled"][Number(r && r.docstatus)] || "Draft";
}
