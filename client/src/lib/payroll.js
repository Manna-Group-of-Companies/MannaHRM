/* ---------------------------------------------------------------------------
   Payroll, as the site's own documents say it — pure, so the arithmetic can be
   argued about without a site. api/payroll.js reads; this decides what the
   reads mean.

   **Nothing here computes a salary.** Every amount is hrms's: a Salary Slip's
   gross, deductions and net, and its Salary Detail rows. What is ours is
   counting them, adding them up and saying which state a month is in. A
   payslip figure derived on this side would be a second answer to the one
   question nobody may get two answers to.
   --------------------------------------------------------------------------- */

const n = (v) => Number(v) || 0;

/** The days a slip did not pay: leave without pay **and** absences. Payroll
    Settings here are based on Attendance (manna_hr/payrollsetup.py), so hrms
    cuts an Absent day through `absent_days` and an LWP application through
    `leave_without_pay` — two fields for one thing. Reading only the second
    shows a month whose pay was cut for an absence as a month with no LWP. */
export const lossOfPay = (slip) => n(slip?.leave_without_pay) + n(slip?.absent_days);

/** First day, last day and the calendar-day count of a `YYYY-MM`. */
export function periodOf(ym) {
	const [y, m] = String(ym).split("-").map(Number);
	const from = new Date(y, m - 1, 1);
	const till = new Date(y, m, 0);
	const dd = String(till.getDate()).padStart(2, "0");
	return { from, till, days: till.getDate(), iso: [ym + "-01", ym + "-" + dd] };
}

/* Where one company's month is, in the order a run moves through it.

   `none`    no Payroll Entry for the period
   `draft`   an entry exists and has not been submitted — the people are picked
   `queued`  submitted, and hrms is still making the slips in the background
   `slips`   the slips exist as drafts — nothing is paid yet
   `final`   every slip is submitted — the month is paid, and changes are a
             cancel-and-amend on the site
   `failed`  hrms says the slip job failed; the entry's error log says why */
export const RUN_STATES = {
	none: "NOT GENERATED",
	draft: "PEOPLE PICKED",
	queued: "CREATING SLIPS",
	slips: "SLIPS IN DRAFT",
	final: "FINALIZED",
	failed: "FAILED",
};

/** The one Payroll Entry that stands for this period: a live submitted one
    over a draft, and the newest of either. A cancelled entry stands for
    nothing, and the read already leaves those out. */
export function entryFor(entries) {
	const live = (entries || []).filter((e) => Number(e.docstatus) < 2);
	const rank = (e) => (Number(e.docstatus) === 1 ? 1 : 0);
	return live.sort((a, b) => rank(b) - rank(a) || String(b.creation).localeCompare(String(a.creation)))[0] || null;
}

/** The state of a month, from its entry and its slips. */
export function runState(entry, slips) {
	const live = (slips || []).filter((s) => Number(s.docstatus) < 2);
	if (!entry) {
		/* Slips with no entry are slips made one at a time on the desk — still
		   the month's pay, so the state follows them rather than the entry. */
		if (!live.length) return "none";
		return live.every((s) => Number(s.docstatus) === 1) ? "final" : "slips";
	}
	if (String(entry.status || "") === "Failed") return "failed";
	if (Number(entry.docstatus) === 0) return "draft";
	if (!live.length) return "queued";
	return live.every((s) => Number(s.docstatus) === 1) ? "final" : "slips";
}

/** Totals over slips: how many, how many are submitted, and hrms's own three
    figures added up. */
export function slipTotals(slips) {
	const live = (slips || []).filter((s) => Number(s.docstatus) < 2);
	return {
		count: live.length,
		submitted: live.filter((s) => Number(s.docstatus) === 1).length,
		gross: live.reduce((t, s) => t + n(s.gross_pay), 0),
		deduction: live.reduce((t, s) => t + n(s.total_deduction), 0),
		net: live.reduce((t, s) => t + n(s.net_pay), 0),
	};
}

/** One entry per employee, their slips in the period added together — a month
    is one slip, a year is twelve. */
export function slipsByEmployee(slips) {
	const out = {};
	for (const s of slips || []) {
		if (Number(s.docstatus) >= 2) continue;
		const r = out[s.employee] ||= {
			slips: [], payment_days: 0, leave_without_pay: 0, loss_of_pay: 0, gross: 0, deduction: 0, net: 0, draft: 0,
		};
		r.slips.push(s);
		r.payment_days += n(s.payment_days);
		r.leave_without_pay += n(s.leave_without_pay);
		r.loss_of_pay += lossOfPay(s);
		r.gross += n(s.gross_pay);
		r.deduction += n(s.total_deduction);
		r.net += n(s.net_pay);
		if (Number(s.docstatus) === 0) r.draft += 1;
	}
	return out;
}

/** The salary structure that covers this person at the end of the period: the
    latest submitted assignment starting on or before it. */
export function structureFor(assignments, employee, end) {
	return (assignments || [])
		.filter((a) => a.employee === employee && Number(a.docstatus ?? 1) === 1 && String(a.from_date) <= end)
		.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))[0] || null;
}

/** Who in the run has no structure for the period. **hrms skips them without
    a word** — the Payroll Entry lists only people with an assignment, so a
    person missing one is simply not paid, and nothing on the entry says so. */
export const withoutStructure = (run, assignments, end) =>
	(run || []).filter((e) => !structureFor(assignments, e.name, end));

/** One slip's lines, from the Salary Detail rows read beside it. */
export function slipLines(details, slip) {
	const mine = (details || []).filter((d) => d.parent === slip);
	const line = (d) => [d.salary_component, n(d.amount)];
	return {
		earnings: mine.filter((d) => d.parentfield === "earnings").map(line),
		deductions: mine.filter((d) => d.parentfield === "deductions").map(line),
	};
}

/** The Payroll Entry to create for one company's month, with what the Company
    record has to supply. `missing` names the Company fields that are empty —
    the site would refuse the entry over each of them, and it is kinder to say
    so before anything is written. */
export function payrollEntryDoc({ company, start, end, posting, co }) {
	const missing = [];
	if (!co?.default_payroll_payable_account) missing.push("Default Payroll Payable Account");
	if (!co?.cost_center) missing.push("Default Cost Center");
	if (!co?.default_currency) missing.push("Default Currency");
	return {
		missing,
		doc: {
			company,
			posting_date: posting,
			payroll_frequency: "Monthly",
			start_date: start,
			end_date: end,
			currency: co?.default_currency || "",
			exchange_rate: 1,
			payroll_payable_account: co?.default_payroll_payable_account || "",
			cost_center: co?.cost_center || "",
		},
	};
}

/** The rows `fill_employee_details` found, in the shape the entry's child
    table stores. Anything else on a row — its name, its parent, its index —
    is the site's to give it when the entry is saved. */
export const employeeRows = (rows) => (rows || []).map((r) => ({
	employee: r.employee,
	employee_name: r.employee_name,
	department: r.department,
	designation: r.designation,
	is_salary_withheld: r.is_salary_withheld ? 1 : 0,
}));
