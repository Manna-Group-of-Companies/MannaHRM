import { REQUIRED_COMPONENTS } from "@/lib/payrollsetup";
import { withoutStructure } from "@/lib/payroll";

/* ---------------------------------------------------------------------------
   Payroll → Salary Setup: a salary structure, and who has one.

   A **Salary Structure** says which earnings and deductions a slip carries and
   how each is worked out; a **Salary Structure Assignment** gives one person a
   structure and a base pay. hrms leaves anybody without an assignment off the
   salary run without a word, so this is where payroll starts.

   Pure, so the rules can be argued about without a site. **Nothing here picks a
   rate.** Whether Basic is half the base, what the provident fund takes and
   what a person's base pay is are HR's decisions and are typed in; this only
   turns what was typed into the documents hrms reads, and says what is missing.
   --------------------------------------------------------------------------- */

/** How a line's amount is worked out, as HR would say it. */
export const HOW = [
	{ key: "pct_base", label: "% of base pay" },
	{ key: "pct_basic", label: "% of Basic" },
	{ key: "fixed", label: "Fixed ₹ a month" },
];

/** The components that only ever arrive through an Additional Salary, so they
    do not belong in a structure. */
const EXTRA_ONLY = new Set(REQUIRED_COMPONENTS.map((c) => c.name));

/** The components worth offering for a structure, split by type. */
export function structureComponents(rows) {
	const live = (rows || []).filter((r) => !Number(r.disabled) && !EXTRA_ONLY.has(r.name));
	return {
		earnings: live.filter((r) => r.type === "Earning"),
		deductions: live.filter((r) => r.type === "Deduction"),
	};
}

export const newLine = (component = "") => ({ component, how: "pct_base", value: "" });

/** hrms's own formula for a line — `base` is the base pay and a component is
    named by its abbreviation. `null` for a fixed amount. */
export function formulaOf(line, basicAbbr) {
	const v = Number(line.value);
	if (line.how === "fixed") return null;
	const rate = Number((v / 100).toFixed(6));
	return line.how === "pct_basic" ? `${basicAbbr} * ${rate}` : `base * ${rate}`;
}

/** What the line says in words, for the preview under the form. */
export function lineSaid(line) {
	const v = Number(line.value);
	if (!line.component || !(v > 0)) return "";
	if (line.how === "fixed") return `${line.component}: ₹${v.toLocaleString("en-IN")} a month`;
	return `${line.component}: ${v}% of ${line.how === "pct_basic" ? "Basic" : "base pay"}`;
}

/** What is wrong with a structure, or "". `f` is `{name, company, earnings, deductions}`. */
export function checkStructure(f) {
	if (!String(f.name || "").trim()) return "Give the structure a name.";
	if (!f.company) return "Pick a company in the top bar — a structure belongs to one company.";
	const earn = (f.earnings || []).filter((l) => l.component);
	if (!earn.length) return "Add at least one earning, such as Basic.";
	const all = [...earn, ...(f.deductions || []).filter((l) => l.component)];
	const seen = new Set();
	for (const l of all) {
		if (seen.has(l.component)) return `${l.component} is in the structure twice.`;
		seen.add(l.component);
		const v = Number(l.value);
		if (!(v > 0)) return `Type the ${l.how === "fixed" ? "amount" : "percentage"} for ${l.component}.`;
		if (l.how !== "fixed" && v > 100) return `${l.component} cannot be more than 100%.`;
		if (l.how === "pct_basic" && !earn.some((e) => e.component === "Basic")) {
			return `${l.component} is a % of Basic, so Basic has to be one of the earnings.`;
		}
	}
	return "";
}

/** The Salary Structure to make — submitted by the page, since a draft one
    cannot be given to anybody. `comps` is the site's Salary Component rows. */
export function structureDoc(f, comps) {
	const abbr = (name) => ((comps || []).find((c) => c.name === name) || {}).salary_component_abbr || "";
	const basicAbbr = abbr("Basic");
	const row = (l) => {
		const formula = formulaOf(l, basicAbbr);
		return formula
			? { salary_component: l.component, amount_based_on_formula: 1, formula }
			: { salary_component: l.component, amount_based_on_formula: 0, amount: Number(l.value) };
	};
	return {
		name: String(f.name).trim(),
		company: f.company,
		is_active: "Yes",
		payroll_frequency: "Monthly",
		earnings: f.earnings.filter((l) => l.component).map(row),
		deductions: (f.deductions || []).filter((l) => l.component).map(row),
	};
}

/** Whether the structure's Basic has an abbreviation to refer to. */
export const basicAbbrMissing = (f, comps) =>
	(f.deductions || []).concat(f.earnings || []).some((l) => l.how === "pct_basic")
	&& !((comps || []).find((c) => c.name === "Basic") || {}).salary_component_abbr;

/** Who still needs a structure, in this company, at the month's end. */
export const needsStructure = (people, assignments, end, company) =>
	withoutStructure((people || []).filter((p) => !company || p.company === company), assignments, end)
		.filter((p) => !p.date_of_joining || p.date_of_joining <= end);

/** What is wrong with an assignment, or "". `rows` is `[{employee, base}]`. */
export function checkAssign({ structure, from, rows }) {
	if (!structure) return "Choose the salary structure.";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "")) return "Choose the date it applies from.";
	if (!rows.length) return "Tick the people to give it to.";
	const bad = rows.find((r) => !(Number(r.base) > 0));
	if (bad) return `Type a base pay for ${bad.name || bad.employee}.`;
	return "";
}

/** The Salary Structure Assignment to make for one person. */
export const assignmentDoc = (row, structure, from, company) => ({
	employee: row.employee,
	salary_structure: structure,
	from_date: from,
	base: Math.round(Number(row.base) * 100) / 100,
	company: company || undefined,
});
