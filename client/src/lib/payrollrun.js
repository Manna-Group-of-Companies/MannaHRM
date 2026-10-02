import { thisMonth } from "@/lib/format";
import { REQUIRED_COMPONENTS } from "@/lib/payrollsetup";

/* ---------------------------------------------------------------------------
   Payroll → Payroll, the part that adds something to a month: an advance, a
   loan instalment, a leave encashment or a bonus.

   Pure, so the form's rules can be argued about without a site. **Nothing here
   works out an amount.** The person types what was taken or what is owed, and
   hrms does the rest on the slip — this only shapes it into the one document
   hrms reads, an Additional Salary dated the last day of the month.
   --------------------------------------------------------------------------- */

/** The four things HR adds to a month. `component` is the Salary Component the
    amount travels through; "other" lets the person choose one, because a bonus
    or an allowance is whatever HR calls it. */
export const EXTRA_KINDS = [
	{ key: "advance", label: "Advance taken", component: "Salary Advance", hint: "Taken from the person's pay this month." },
	{ key: "loan", label: "Loan instalment", component: "Loan EMI", hint: "This month's instalment of a loan, taken from pay." },
	{ key: "encash", label: "Leave encashment", component: "Leave Encashment", hint: "Paid on top of the salary." },
	{ key: "other", label: "Bonus or other", component: "", hint: "Choose the salary component it belongs to." },
];

export const kindFor = (key) => EXTRA_KINDS.find((k) => k.key === key) || EXTRA_KINDS[0];

/** The component a form entry travels through. */
export const componentOf = (f) => {
	const k = kindFor(f.kind);
	return k.key === "other" ? (f.component || "") : k.component;
};

/** What is wrong with the form, in the words the person would use — or "". */
export function checkExtra(f, people) {
	if (!f.employee) return "Pick the person.";
	if (people && !people.some((p) => p.name === f.employee)) return "That person is not on this month's list.";
	if (!componentOf(f)) return "Choose the salary component.";
	const amount = Number(f.amount);
	if (!(amount > 0)) return "Type the amount, more than zero.";
	if (amount > 10000000) return "That amount looks too large — check it.";
	return "";
}

/** The Additional Salary to make. A draft until it is submitted, and a draft
    takes nothing from — and adds nothing to — anybody's pay. */
export function extraDoc(f, end, company) {
	return {
		employee: f.employee,
		company: company || undefined,
		salary_component: componentOf(f),
		amount: Math.round(Number(f.amount) * 100) / 100,
		payroll_date: end,
		overwrite_salary_structure_amount: 1,
	};
}

/** Salary Components still to make, given what the site returned. Not the same
    as lib/payrollsetup's `missingComponents`: that one answers `null` when the
    site would not say, and a form has to know whether to offer the button. */
export function componentsToMake(rows) {
	if (!Array.isArray(rows)) return [];
	const have = new Set(rows.filter((r) => !Number(r.disabled)).map((r) => r.name));
	return REQUIRED_COMPONENTS.filter((c) => !have.has(c.name));
}

/** A Salary Component document, in hrms's own fields. */
export const componentDoc = (c) => ({
	salary_component: c.name,
	salary_component_abbr: c.abbr,
	type: c.type,
	is_tax_applicable: c.type === "Earning" ? 1 : 0,
	depends_on_payment_days: 0,
	description: c.why,
});

/** The extras of a month in the order a person scans them: drafts first, since
    those are the ones that need something done. */
export function sortExtras(rows) {
	return (rows || []).slice().sort((a, b) =>
		(Number(a.docstatus) - Number(b.docstatus)) || String(a.employee_name || a.employee).localeCompare(String(b.employee_name || b.employee)));
}

/** "Draft" / "Submitted" for an Additional Salary's docstatus. */
export const extraState = (x) => (Number(x.docstatus) === 1 ? "Submitted" : "Draft");

/** Last month, which is the month being paid at the start of this one. */
export const lastMonth = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	const d = new Date(y, m - 2, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** This month and the eighteen before it. */
export const monthChoices = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	return Array.from({ length: 19 }, (_, i) => {
		const d = new Date(y, m - 1 - i, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	});
};

/** Why "Start the salary run" is refused, in the order somebody would fix it —
    or "". A run is one company's month. */
export function startWhy({ company, ym, now, ok, entry }) {
	if (!company) return "Pick a company in the top bar — a salary run is one company's month.";
	if (ym > now) return "That month has not happened yet.";
	if (!ok) return "Reading this month's payroll…";
	if (entry) return `${entry.name} is already this month's run.`;
	return "";
}
