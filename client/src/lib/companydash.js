/* ---------------------------------------------------------------------------
   The three company dashboards — HR, Attendance, Payroll — as arithmetic.

   Pure functions over rows the site returned, so the numbers can be argued
   about in a test rather than on a screen. The pages in
   features/dashboard/CompanyDash.jsx do the reading and the drawing only.

   The same rule as the Start Up page: every figure is one the site answered.
   A company with no salary slips shows zero slips, never an estimate.
   --------------------------------------------------------------------------- */

import { tally } from "@/lib/format";

/** The four companies these dashboards were asked for, in the order given
 *  (16 September 2026). Each has its own company-locked login — see
 *  tools/create_company_users.py and docs/COMPANY_USERS.md. */
export const DASH_COMPANIES = [
	"Hi-Tech Rubber Industries",
	"Manna Rubber Products Private Limited",
	"Manna Treads",
	"Manna Tyre Retreads",
];

/** The companies to offer on the strip: the four, narrowed to what the site
 *  actually let this user read. A company-locked login gets one company back
 *  from `Company` and so gets one button — the lock is the site's User
 *  Permission, and this only mirrors it so the page does not offer a company
 *  that would read as empty. */
export function offered(siteCompanies) {
	const names = (siteCompanies || []).map((c) => (typeof c === "string" ? c : c.name));
	if (!names.length) return DASH_COMPANIES;
	const mine = DASH_COMPANIES.filter((c) => names.includes(c));
	return mine.length ? mine : names;
}

const ymOf = (d) => String(d || "").slice(0, 7);

/** Headcount, joiners, leavers and the breakdowns for one company's staff.
 *  `today` is an ISO date so the month is the caller's local one. */
export function hrSummary(employees, today) {
	const rows = employees || [];
	const ym = today.slice(0, 7);
	const act = rows.filter((e) => e.status === "Active");
	return {
		total: rows.length,
		active: act.length,
		inactive: rows.length - act.length,
		joinedMonth: rows.filter((e) => ymOf(e.date_of_joining) === ym).length,
		left: rows.filter((e) => e.status === "Left").length,
		noDevice: act.filter((e) => !String(e.attendance_device_id || "").trim()).length,
		noManager: act.filter((e) => !e.reports_to).length,
		byDept: tally(act, "department").slice(0, 10),
		byDesig: tally(act, "designation").slice(0, 10),
		byType: tally(act, "employment_type").slice(0, 6),
	};
}

/** Joiners over the last six months, oldest first, for a column chart. */
export function joinTrend(employees, today) {
	const [y, m] = today.split("-").map(Number);
	const out = [];
	for (let i = 5; i >= 0; i--) {
		const d = new Date(y, m - 1 - i, 1);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		out.push({
			key,
			label: d.toLocaleString("en", { month: "short" }),
			n: (employees || []).filter((e) => ymOf(e.date_of_joining) === key).length,
		});
	}
	return out;
}

/** Today at the gate: who punched in, who is on approved leave, who is neither.
 *
 *  A person counts as present on their first punch of the day whatever
 *  `log_type` says — a machine not set up for in/out reports every punch the
 *  same way (CLAUDE.md §5), and refusing to count those would mark a whole gate
 *  absent. */
export function todayAtGate(activeEmps, checkins, leaves, today) {
	const ids = new Set((activeEmps || []).map((e) => e.name));
	const punched = new Set(
		(checkins || [])
			.filter((c) => ids.has(c.employee) && String(c.time || "").slice(0, 10) === today)
			.map((c) => c.employee),
	);
	const onLeave = new Set(
		(leaves || [])
			.filter((l) => ids.has(l.employee) && l.status === "Approved"
				&& String(l.from_date) <= today && today <= String(l.to_date))
			.map((l) => l.employee),
	);
	for (const p of punched) onLeave.delete(p);
	const present = punched.size;
	const leave = onLeave.size;
	return { present, leave, notIn: Math.max(0, ids.size - present - leave), of: ids.size };
}

/** The month's Attendance rows, counted by status. Only submitted rows count:
 *  a draft or cancelled Attendance is not a day anybody is paid for. */
export function monthAttendance(rows) {
	const live = (rows || []).filter((r) => Number(r.docstatus) === 1);
	const by = { Present: 0, Absent: 0, "On Leave": 0, "Half Day": 0, "Work From Home": 0 };
	let late = 0;
	let early = 0;
	for (const r of live) {
		by[r.status] = (by[r.status] || 0) + 1;
		if (Number(r.late_entry)) late++;
		if (Number(r.early_exit)) early++;
	}
	const marked = live.length;
	const worked = by.Present + by["Work From Home"] + by["Half Day"] * 0.5;
	return { by, late, early, marked, rate: marked ? Math.round((worked / marked) * 100) : null };
}

/** Present per day of the month so far, for a column chart. */
export function dailyPresent(rows, today) {
	const [y, m, d] = today.split("-").map(Number);
	const ym = today.slice(0, 7);
	const days = Math.min(d, new Date(y, m, 0).getDate());
	const count = new Map();
	for (const r of rows || []) {
		if (Number(r.docstatus) !== 1) continue;
		if (r.status !== "Present" && r.status !== "Work From Home" && r.status !== "Half Day") continue;
		const k = String(r.attendance_date || "");
		if (k.slice(0, 7) === ym) count.set(k, (count.get(k) || 0) + 1);
	}
	const out = [];
	for (let i = 1; i <= days; i++) {
		const k = `${ym}-${String(i).padStart(2, "0")}`;
		out.push({ key: k, label: String(i), n: count.get(k) || 0 });
	}
	return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** One month's salary slips, totalled. Cancelled slips (docstatus 2) are
 *  dropped; drafts are counted separately because a draft is money nobody has
 *  approved yet, and adding it to "paid" is how a payroll total gets quoted
 *  wrong. */
export function payrollSummary(slips) {
	const rows = (slips || []).filter((r) => Number(r.docstatus) !== 2);
	const sub = rows.filter((r) => Number(r.docstatus) === 1);
	const draft = rows.filter((r) => Number(r.docstatus) === 0);
	const sum = (list, f) => Math.round(list.reduce((a, r) => a + num(r[f]), 0));
	return {
		slips: rows.length,
		submitted: sub.length,
		draft: draft.length,
		gross: sum(sub, "gross_pay"),
		deductions: sum(sub, "total_deduction"),
		net: sum(sub, "net_pay"),
		draftNet: sum(draft, "net_pay"),
		lwp: rows.reduce((a, r) => a + num(r.leave_without_pay), 0),
	};
}

/** Net pay by department, biggest first — submitted slips only. */
export function netByDept(slips) {
	const m = new Map();
	for (const r of slips || []) {
		if (Number(r.docstatus) !== 1) continue;
		const k = r.department || "—";
		m.set(k, (m.get(k) || 0) + num(r.net_pay));
	}
	return [...m.entries()].map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

/** Active people with no active Salary Structure Assignment — who a payroll
 *  run would skip without saying so. */
export function withoutStructure(activeEmps, assignments) {
	const has = new Set((assignments || []).filter((a) => Number(a.docstatus) === 1).map((a) => a.employee));
	return (activeEmps || []).filter((e) => !has.has(e.name));
}

/** ₹ in the Indian grouping, whole rupees. */
export const inr = (n) => "₹" + Math.round(num(n)).toLocaleString("en-IN");
