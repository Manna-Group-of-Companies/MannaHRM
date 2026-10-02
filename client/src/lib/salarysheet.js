/* ---------------------------------------------------------------------------
   The Salary Sheet — one month of pay, every figure laid out in a row — and the
   loan deductions that have to be on the slips for it to be right. Pure, so the
   arithmetic can be argued about without a site; api/salarysheet.js reads.

   **Nothing here computes a salary.** Gross, deductions and net are the Salary
   Slip's own, as hrms worked them out, and the component columns are its Salary
   Detail rows. What is ours is laying them side by side and adding up a column.
   A figure derived on this side would be a second answer to the one question
   nobody may get two answers to (lib/payroll.js says the same).

   **What the sheet shows is the whole of the pay.** There is no "paid by bank"
   and "paid in cash" that add to less than the gross: every rupee on the slip is
   a column here and in the workbook, because the sheet is the record somebody
   will be asked for.
   --------------------------------------------------------------------------- */

import { MONTHS, lastOfMonth } from "@/lib/format";

const n = (v) => Number(v) || 0;
const cents = (v) => Math.round(n(v) * 100) / 100;
const total = (o) => Object.values(o).reduce((t, v) => t + n(v), 0);

/** "2026-09" → "September 2026". */
export function periodLabel(ym) {
	const [y, m] = String(ym || "").split("-").map(Number);
	return MONTHS[m - 1] && y ? `${MONTHS[m - 1]} ${y}` : String(ym || "");
}

/** What a component is, by its name, for the columns that need pointing out.

    Leave encashment reaches a slip as an ordinary earning, by hrms's Leave
    Encashment → Additional Salary, so the only way to know which column it is
    is its name. A loan scheme names its own component (`loanComponents`), which
    is exact; the name is the fallback for an advance somebody keyed by hand.

    @returns {"encash"|"advance"|"loan"|""} */
export function kindOf(component, loanComponents = []) {
	const c = String(component || "");
	if (/encash/i.test(c)) return "encash";
	if (/advance/i.test(c)) return "advance";
	if ((loanComponents || []).includes(c) || /\bloan\b|\bemi\b/i.test(c)) return "loan";
	return "";
}

const RANK = { "": 0, encash: 1, advance: 2, loan: 3 };

/** One month's slips as a table.

    Columns are the components the slips actually hold, in the order hrms lists
    them, with leave encashment after the ordinary earnings and advance and loan
    last among the deductions — the same place on every month's sheet, which is
    what lets somebody compare two of them by eye.

    @param {object} p
    @param {object[]} p.slips   Salary Slip rows
    @param {object[]} p.details Salary Detail rows (parent, parentfield, salary_component, amount, idx)
    @param {string[]} [p.loanComponents] salary components the loan schemes deduct through */
export function buildSheet({ slips = [], details = [], loanComponents = [] } = {}) {
	const live = (slips || [])
		.filter((s) => Number(s.docstatus) < 2)
		.sort((a, b) => String(a.employee_name || a.employee).localeCompare(String(b.employee_name || b.employee)));

	const lines = new Map(live.map((s) => [s.name, { earn: {}, ded: {} }]));
	const seen = { earn: new Map(), ded: new Map() };
	for (const d of details || []) {
		const mine = lines.get(d.parent);
		const side = d.parentfield === "earnings" ? "earn" : d.parentfield === "deductions" ? "ded" : null;
		if (!mine || !side || !d.salary_component) continue;
		mine[side][d.salary_component] = cents((mine[side][d.salary_component] || 0) + n(d.amount));
		const at = seen[side].get(d.salary_component);
		seen[side].set(d.salary_component, at === undefined ? n(d.idx) : Math.min(at, n(d.idx)));
	}

	const order = (side) => [...seen[side].entries()]
		.map(([name, idx]) => ({ name, idx, kind: kindOf(name, loanComponents) }))
		.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.idx - b.idx || a.name.localeCompare(b.name));
	const earnCols = order("earn");
	const dedCols = order("ded");

	const rows = live.map((s) => {
		const { earn, ded } = lines.get(s.name);
		return {
			slip: s.name,
			employee: s.employee,
			name: s.employee_name || s.employee,
			department: s.department || "",
			designation: s.designation || "",
			workingDays: n(s.total_working_days),
			paymentDays: n(s.payment_days),
			lwp: n(s.leave_without_pay),
			earn,
			ded,
			gross: n(s.gross_pay),
			deduction: n(s.total_deduction),
			net: n(s.net_pay),
			state: Number(s.docstatus) === 1 ? "Submitted" : "Draft",
			/* A component the slip does not count towards its total — hrms lets a
			   component opt out — or a rounding difference. Said, not hidden: the
			   column adds to something other than the gross beside it. */
			off: Math.abs(total(earn) - n(s.gross_pay)) > 0.5 || Math.abs(total(ded) - n(s.total_deduction)) > 0.5,
		};
	});

	const sum = (pick) => rows.reduce((t, r) => t + pick(r), 0);
	const totals = {
		count: rows.length,
		submitted: rows.filter((r) => r.state === "Submitted").length,
		gross: cents(sum((r) => r.gross)),
		deduction: cents(sum((r) => r.deduction)),
		net: cents(sum((r) => r.net)),
		earn: Object.fromEntries(earnCols.map((c) => [c.name, cents(sum((r) => n(r.earn[c.name])))])),
		ded: Object.fromEntries(dedCols.map((c) => [c.name, cents(sum((r) => n(r.ded[c.name])))])),
	};

	return { rows, earnCols, dedCols, totals, hasLines: seen.earn.size + seen.ded.size > 0 };
}

/* ---------------------------------------------------------------------------
   Loans and advances → deductions on the slip
   --------------------------------------------------------------------------- */

/** A loan is deducted from pay only once the money has been handed over.
    Applied and Sanctioned are promises; Closed is finished. */
export const DEDUCTIBLE = new Set(["Disbursed", "Running"]);

/** What each open loan owes in `ym`, from its repayment schedule.

    **Never more than the schedule says, and never more than what is left.**
    Taking too much out of somebody's wages is the expensive mistake — it is
    their money and an argument with HR — while taking too little is a number
    on a report that gets corrected next month. So an instalment already part
    paid asks only for the rest, and a loan whose own outstanding figure is
    positive and smaller than the instalment asks only for that.

    `outstanding_amount` is trusted only when it is above zero: on a site where
    the loan controller is not installed it is never worked out (CLAUDE.md §7),
    and a blank read as "nothing owed" would silently skip every loan.

    @param {object[]} p.loans  Employee Loan Application rows
    @param {object[]} p.lines  Employee Loan Repayment Schedule rows for the month (parent, period, total_amount, paid_amount, status)
    @param {object[]} p.types  Employee Loan Type rows (name, salary_component) */
export function loanInstalmentsDue({ loans = [], lines = [], types = [] } = {}) {
	const byLoan = new Map((loans || []).map((l) => [l.name, l]));
	const scheme = new Map((types || []).map((t) => [t.name, t]));
	const out = [];
	for (const ln of lines || []) {
		const loan = byLoan.get(ln.parent);
		if (!loan || !DEDUCTIBLE.has(loan.loan_status)) continue;
		if (ln.status === "Paid" || ln.status === "Skipped") continue;

		let amount = cents(n(ln.total_amount) - n(ln.paid_amount));
		if (n(loan.outstanding_amount) > 0) amount = Math.min(amount, cents(loan.outstanding_amount));
		if (amount <= 0) continue;

		const component = loan.salary_component || (scheme.get(loan.loan_type) || {}).salary_component || "";
		out.push({
			loan: loan.name,
			employee: loan.employee,
			employee_name: loan.employee_name || loan.employee,
			company: loan.company || "",
			loan_type: loan.loan_type || "",
			period: ln.period,
			amount,
			component,
			problem: component ? "" : "No salary component on the loan or on its scheme, so there is nothing to deduct it through.",
		});
	}
	return out.sort((a, b) => a.employee_name.localeCompare(b.employee_name) || a.loan.localeCompare(b.loan));
}

/** The instalments that can be posted, one group per person and component.

    hrms refuses two Additional Salary documents for the same person, component
    and date, so two loans on one component in one month are one deduction of
    their sum. A reference back to the loan is kept only when there is exactly
    one — a deduction standing for two loans points at neither. */
export function groupForPosting(due) {
	const groups = new Map();
	for (const d of due || []) {
		if (d.problem) continue;
		const key = d.employee + "|" + d.component;
		const g = groups.get(key) || {
			key, employee: d.employee, employee_name: d.employee_name, company: d.company,
			component: d.component, amount: 0, loans: [],
		};
		g.amount = cents(g.amount + d.amount);
		g.loans.push(d.loan);
		groups.set(key, g);
	}
	return [...groups.values()];
}

/** The Additional Salary to create for one group — a draft, for the month's
    last day, which is the date hrms reads when it makes that month's slip. */
export function additionalSalaryDoc(g, ym, { withRef = true } = {}) {
	return {
		employee: g.employee,
		company: g.company || undefined,
		salary_component: g.component,
		amount: g.amount,
		payroll_date: lastOfMonth(ym),
		overwrite_salary_structure_amount: 1,
		...(withRef && g.loans.length === 1 ? { ref_doctype: "Employee Loan Application", ref_docname: g.loans[0] } : {}),
	};
}

/** Whether a group's deduction has made it onto the month's slip.

    `noslip`  the person has no slip yet — create the slips after the deductions
    `on`      the slip carries the component for at least this much
    `missing` the slip is there without it — the deduction was added after the
              slip was made, and the slip has to be made again

    @param {object} g     a group from groupForPosting
    @param {object[]} rows buildSheet's rows */
export function postingState(g, rows) {
	const row = (rows || []).find((r) => r.employee === g.employee);
	if (!row) return "noslip";
	return n(row.ded[g.component]) >= g.amount - 0.5 ? "on" : "missing";
}
