/** Employee Payroll, as the HRDashboard reference draws it (21 October 2026):
 *  the month's slips — what each person earns, what comes off and what they
 *  are paid — with the month's totals and how far the run has got.
 *
 *  **It pays nobody (D14).** The reference's Pay and Pay all mark people paid
 *  with a click. Here a month is paid by the Payroll page's run — the slips,
 *  submitted, then the bank sheet — so the button is Open the run, and a slip
 *  is Draft or Submitted, which is what the site says it is.
 *
 *  Reads exactly what Payslips reads (api/payroll.js loadPayroll), so the two
 *  pages cannot disagree about a figure.
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { loadPayroll, payKey } from "@/api/payroll";
import { periodOf } from "@/lib/payroll";
import { lastMonth, monthChoices } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { MONTHS } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, Pager, Pill, Who } from "@/components/kit/ui";
import { toast } from "@/components/kit/overlay";

const PER = 10;
export const rupees = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
export const slipState = (x) => (Number(x.docstatus) === 1 ? "Submitted" : "Draft");

export default function EmployeePayroll() {
	const s = useApp();
	const { company } = s;
	const [ym, setYm] = useState(() => s.payView?.ym || lastMonth());
	const [q, setQ] = useState("");
	const [page, setPage] = useState(1);
	const [start, end] = periodOf(ym).iso;
	const pay = (s.pay || {})[payKey(company, start, end)];
	const ok = pay && pay.state === "ok";
	useEffect(() => { void loadPayroll(company, start, end, { details: true }); }, [company, start, end]);

	const slips = ok ? pay.slips.filter((x) => Number(x.docstatus) < 2)
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))) : [];
	const total = slips.reduce((t, x) => t + (Number(x.net_pay) || 0), 0);
	const done = slips.filter((x) => Number(x.docstatus) === 1);
	const doneNet = done.reduce((t, x) => t + (Number(x.net_pay) || 0), 0);
	const pct = total ? Math.round((doneNet / total) * 100) : 0;
	const shown = slips.filter((x) => !q || `${x.employee_name} ${x.employee}`.toLowerCase().includes(q.toLowerCase()));
	const pages = Math.max(1, Math.ceil(shown.length / PER));
	const at = Math.min(page, pages);
	const code = (x) => s.byName[x.employee]?.employee_number || x.employee;
	const open = (x) => { set({ payView: { emp: x.employee, ym } }); navigate("payroll", "slip"); };

	const exportAs = async (kind) => {
		if (!slips.length) { toast("No slips this month"); return; }
		const name = `payroll-${ym}.${kind === "PDF" ? "pdf" : "xlsx"}`;
		await (kind === "PDF" ? sheetsPdf : sheetsXlsx)([{
			title: `Payroll — ${periodLabel(ym)}`,
			sub: company || "All companies",
			head: ["Employee", "Emp Code", "Gross", "Deductions", "Net pay", "Status"],
			rows: slips.map((x) => [x.employee_name, code(x), Number(x.gross_pay) || 0, Number(x.total_deduction) || 0, Number(x.net_pay) || 0, slipState(x)]),
		}], name);
		toast(`Downloaded ${name}`);
	};

	return (
		<div className="kit k-enter">
			<div className="k-card">
				<div className="k-ph" style={{ marginBottom: 18 }}>
					<div>
						<h1>Payroll</h1>
						<p>Your payroll report so far · {periodLabel(ym)} · {company || "all companies"}</p>
					</div>
					<div className="k-ph-act">
						<select className="k-sel" style={{ width: "auto" }} aria-label="Pay period" value={ym}
							onChange={(e) => { setYm(e.target.value); setPage(1); }}>
							{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
						</select>
						<button type="button" className="k-btn k-btn-line" disabled={!slips.length} onClick={() => void exportAs("Excel")}>
							<KitIcon name="upload" size={18} stroke={2} />Export
						</button>
						<button type="button" className="k-btn k-btn-ink" onClick={() => navigate("payroll", "overview")}>
							<KitIcon name="wallet" size={18} stroke={2} />Open the run
						</button>
					</div>
				</div>
				<div className="k-mini-grid" style={{ marginBottom: 14 }}>
					{[["Total payroll", ok ? rupees(total) : "—"], ["Submitted", ok ? rupees(doneNet) : "—"],
						["Still in draft", ok ? String(slips.length - done.length) : "—"], ["Employees", ok ? String(slips.length) : "—"]].map(([t, v]) => (
						<div className="k-mini" key={t} style={{ background: "rgb(var(--wash))", boxShadow: "none" }}>
							<div className="k-mini-t">{t}</div>
							<div className="k-mini-v"><b className="k-num">{v}</b></div>
						</div>
					))}
				</div>
				<div className="k-progress" style={{ marginBottom: 20 }}>
					<div className="k-bar" style={{ height: 10 }}><i style={{ width: `${pct}%` }} /></div>
					<span>{pct}% submitted</span>
				</div>
				{pay?.state === "error" ? <p className="k-err" role="alert">{pay.err}</p> : null}
				<div className="k-inp-ic" style={{ maxWidth: 320, marginBottom: 14 }}>
					<KitIcon name="search" size={18} stroke={2} />
					<input className="k-inp" placeholder="Search employee" value={q} aria-label="Search payroll"
						onChange={(e) => { setQ(e.target.value); setPage(1); }} />
				</div>
				{!ok && pay?.state !== "error" ? <div className="k-sk" style={{ height: 240 }} /> : shown.length ? (
					<>
						<div className="k-tbl-wrap">
							<table className="k-rt">
								<thead>
									<tr>{["Employee Name", "Employee ID", "Gross", "Deductions", "Net pay", "Status", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr>
								</thead>
								<tbody>
									{shown.slice((at - 1) * PER, at * PER).map((x) => (
										<tr key={x.name} className="k-click" tabIndex={0} onClick={() => open(x)}
											onKeyDown={(ev) => { if (ev.key === "Enter") open(x); }}>
											<td className="k-title-cell"><Who name={x.employee_name} sub={x.designation || x.department || ""} /></td>
											<td data-label="Employee ID" className="k-num">{code(x)}</td>
											<td data-label="Gross" className="k-num">{rupees(x.gross_pay)}</td>
											<td data-label="Deductions" className="k-num">{Number(x.total_deduction) ? `−${rupees(x.total_deduction)}` : rupees(0)}</td>
											<td data-label="Net pay" className="k-num"><b>{rupees(x.net_pay)}</b></td>
											<td data-label="Status"><Pill status={slipState(x)} /></td>
											<td data-label=""><span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<Pager total={shown.length} page={at} per={PER} onPage={setPage} />
					</>
				) : (
					<EmptyState icon="wallet" title={slips.length ? "No one matches" : `No salary slips for ${periodLabel(ym)}`}
						sub={slips.length ? "Try another name." : "Run the month on the Payroll page; the slips appear here."}>
						{!slips.length ? <button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("payroll", "overview")}>Open the run</button> : null}
					</EmptyState>
				)}
			</div>
		</div>
	);
}
