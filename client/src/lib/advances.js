import { lastOfMonth } from "@/lib/format";

/* ---------------------------------------------------------------------------
   Payroll → Advances & Loans: giving one, and reading what is owed.

   hrms recovers an advance or a loan instalment through an **Additional
   Salary** in each month it is taken, so a loan paid back over twelve months is
   twelve of them. This is the page that makes those twelve and adds them up.

   Pure. The only arithmetic is splitting a principal HR typed into the number
   of instalments HR typed — the last instalment takes the odd paise so the
   parts always add back to the whole. Nothing is worked out about anybody's
   pay: the slip takes what each Additional Salary says.
   --------------------------------------------------------------------------- */

/** The two kinds, and the Salary Component each is recovered through. */
export const KINDS = [
	{ key: "advance", label: "Advance", component: "Salary Advance" },
	{ key: "loan", label: "Loan", component: "Loan EMI" },
];
export const COMPONENTS = KINDS.map((k) => k.component);
export const kindOfComponent = (c) => (KINDS.find((k) => k.component === c) || {}).label || c;

/** `YYYY-MM` plus `n` months. */
export function addMonths(ym, n) {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(y, m - 1 + n, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The instalments, in rupees and paise, as `[ym, amount]` pairs. */
export function split(principal, n, startYm) {
	const paise = Math.round(Number(principal) * 100);
	const each = Math.floor(paise / n);
	return Array.from({ length: n }, (_, i) => [
		addMonths(startYm, i),
		(i === n - 1 ? paise - each * (n - 1) : each) / 100,
	]);
}

/** What is wrong with the form, or "". */
export function checkPlan(f) {
	if (!f.employee) return "Pick the person.";
	if (!(Number(f.principal) > 0)) return "Type the amount given.";
	const n = Number(f.instalments);
	if (!Number.isInteger(n) || n < 1 || n > 60) return "Instalments must be a whole number from 1 to 60.";
	if (!/^\d{4}-\d{2}$/.test(f.from || "")) return "Choose the month the first instalment is taken.";
	if (Math.round(Number(f.principal) * 100) < n) return "That amount is too small to split that many ways.";
	return "";
}

/** One Additional Salary per instalment, dated the month's last day. */
export function planDocs(f, company) {
	const component = (KINDS.find((k) => k.key === f.kind) || KINDS[0]).component;
	return split(f.principal, Number(f.instalments), f.from).map(([ym, amount]) => ({
		employee: f.employee,
		company: company || undefined,
		salary_component: component,
		amount,
		payroll_date: lastOfMonth(ym),
		overwrite_salary_structure_amount: 1,
	}));
}

/** The words under the form: what is about to be made. */
export function planSaid(f) {
	if (checkPlan(f)) return "";
	const parts = split(f.principal, Number(f.instalments), f.from);
	const first = parts[0][1];
	const last = parts[parts.length - 1];
	const rs = (v) => "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
	return parts.length === 1
		? `One deduction of ${rs(first)} in ${parts[0][0]}.`
		: `${parts.length} deductions of ${rs(first)}${last[1] !== first ? ` (the last ${rs(last[1])})` : ""}, ${parts[0][0]} to ${last[0]}.`;
}

/** The ledger, one line per person and kind.

    `due` is submitted instalments whose date has come, `ahead` those still to
    come, `drafts` those not yet submitted — a draft is not taken from anybody's
    pay. @param rows Additional Salary rows  @param today `YYYY-MM-DD` */
export function ledger(rows, today) {
	const by = new Map();
	for (const r of rows || []) {
		if (!COMPONENTS.includes(r.salary_component) || Number(r.docstatus) > 1) continue;
		const key = r.employee + "|" + r.salary_component;
		const g = by.get(key) || { key, employee: r.employee, name: r.employee_name || r.employee, component: r.salary_component,
			kind: kindOfComponent(r.salary_component), total: 0, due: 0, ahead: 0, drafts: 0, count: 0, next: null, items: [] };
		const amount = Number(r.amount) || 0;
		g.items.push(r);
		g.count++;
		if (Number(r.docstatus) === 0) g.drafts += amount;
		else if (r.payroll_date <= today) g.due += amount;
		else {
			g.ahead += amount;
			if (!g.next || r.payroll_date < g.next.date) g.next = { date: r.payroll_date, amount };
		}
		g.total += amount;
		by.set(key, g);
	}
	const round = (v) => Math.round(v * 100) / 100;
	return [...by.values()].map((g) => ({
		...g, total: round(g.total), due: round(g.due), ahead: round(g.ahead), drafts: round(g.drafts),
		items: g.items.slice().sort((a, b) => String(a.payroll_date).localeCompare(String(b.payroll_date))),
	})).sort((a, b) => (b.ahead + b.drafts > 0) - (a.ahead + a.drafts > 0) || a.name.localeCompare(b.name));
}

/** Totals over a ledger. */
export function ledgerTotals(lines) {
	const t = { people: new Set(), total: 0, due: 0, ahead: 0, drafts: 0 };
	for (const g of lines) {
		t.people.add(g.employee);
		t.total += g.total; t.due += g.due; t.ahead += g.ahead; t.drafts += g.drafts;
	}
	return { people: t.people.size, total: t.total, due: t.due, ahead: t.ahead, drafts: t.drafts };
}
