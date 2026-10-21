/* ---------------------------------------------------------------------------
   The front page's reads — the HRDashboard reference's Dashboard (D16), on
   this site.

   Everything else on the page is arithmetic on rows the first load already
   holds (lib/home.js). These are the few figures nothing else reads: how
   many applicants, this month's unpaid slips, the to-dos past their date,
   the job openings, and attendance by month for the chart. The greeting's
   first name is the store's `me`, read at sign-in (api/client.js whoIs).

   **Counts, not rows.** A count is one request whatever the size of the
   site, where reading a year of Attendance to count it would be thousands of
   rows a page load — so each month of the chart is two `get_count`s.

   **Never fatal.** Each read that fails leaves its figure as `null`, which
   the page draws as nothing rather than as a zero: the site saying "no" to
   one count must not take the front page down, and a zero would be a lie.
   --------------------------------------------------------------------------- */

import { api, listAll } from "@/api/client";
import { getState, set } from "@/store";
import { monthsBack } from "@/lib/home";

const count = (doctype, filters) =>
	api("/api/method/frappe.client.get_count", { doctype, filters: JSON.stringify(filters) })
		.then((r) => Number(r.message) || 0)
		.catch(() => null);

const co = (company) => (company ? [["company", "=", company]] : []);

const todayIso = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The figures for one company (or all) — read once per company picked. */
export async function loadHome(company) {
	const key = company || "*";
	if (getState().home?.key === key && getState().home.state !== "error") return;
	set({ home: { key, state: "loading" } });
	const today = todayIso();
	const month = today.slice(0, 8) + "01";
	const user = getState().user;

	const [applicants, unpaid, overdue, jobs] = await Promise.all([
		count("Job Applicant", [...co(company), ["status", "in", ["Open", "Replied", "Shortlisted", "Hold"]]]),
		count("Salary Slip", [...co(company), ["docstatus", "=", 0], ["start_date", ">=", month]]),
		count("ToDo", [["allocated_to", "=", user], ["status", "=", "Open"], ["date", "<", today]]),
		listAll("Job Opening", ["name", "job_title", "status"], co(company)).catch(() => null),
	]);
	if (getState().home?.key !== key) return;
	set({ home: { key, state: "ok", applicants, unpaid, overdue, jobs } });
}

/** Attendance by month for the chart: Present (a half day counts half) and
    Absent, per month, `n` months back. Read separately from the rest because
    the range is the chart's own control. */
export async function loadAttendanceMonths(company, n) {
	const key = `${company || "*"}:${n}`;
	if (getState().homeAtt?.key === key && getState().homeAtt.state === "ok") return;
	set({ homeAtt: { key, state: "loading", months: [] } });
	const months = monthsBack(n);
	const per = await Promise.all(months.map(async (m) => {
		const range = [["attendance_date", "between", [m.from, m.to]], ["docstatus", "=", 1], ...co(company)];
		const [present, half, absent] = await Promise.all([
			count("Attendance", [...range, ["status", "=", "Present"]]),
			count("Attendance", [...range, ["status", "=", "Half Day"]]),
			count("Attendance", [...range, ["status", "=", "Absent"]]),
		]);
		return { ...m, present: present == null ? null : present + (half || 0) / 2, absent };
	}));
	if (getState().homeAtt?.key !== key) return;
	const failed = per.some((m) => m.present == null || m.absent == null);
	set({ homeAtt: { key, state: failed ? "error" : "ok", months: per } });
}
