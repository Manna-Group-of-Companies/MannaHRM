/** One payslip, as the HRDashboard reference's Payroll Detail draws it
 *  (21 October 2026): the person as a card with the period's facts and a month
 *  picker, and the slip — earnings, deductions, net pay — on the right. Print
 *  is the paper Payslips prints, so a slip printed from either page is the same.
 *
 *  Off the same read as Employee Payroll and Payslips (api/payroll.js), lines
 *  and all. Nothing here edits pay: a slip is changed by the run (D14).
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { loadPayroll, payKey } from "@/api/payroll";
import { loadCompanyInfo } from "@/api/salarysheet";
import { lossOfPay, periodOf } from "@/lib/payroll";
import { monthChoices } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { slipsHtml } from "@/lib/payslipdoc";
import { printPaper } from "@/lib/doc";
import { MONTHS, tidyDept } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, Pill } from "@/components/kit/ui";
import { rupees, slipState } from "@/features/payroll/EmployeePayroll";

function Lines({ title, rows, total, neg }) {
	return (
		<div className="k-sec" style={{ margin: 0 }}>
			<div className="k-sec-h"><h3>{title}</h3></div>
			{rows.length ? rows.map((r) => (
				<div className="k-kv" key={r.salary_component + r.idx} style={{ gridTemplateColumns: "1fr auto" }}>
					<dt>{r.salary_component}</dt>
					<dd className="k-num" style={neg ? { color: "rgb(var(--bad))" } : undefined}>{neg ? "−" : ""}{rupees(r.amount)}</dd>
				</div>
			)) : <p className="k-muted" style={{ margin: "8px 0" }}>None this month.</p>}
			<div className="k-kv" style={{ gridTemplateColumns: "1fr auto", border: 0 }}>
				<dt><b style={{ color: "rgb(var(--ink))" }}>{neg ? "Total deductions" : "Gross pay"}</b></dt>
				<dd className="k-num" style={neg ? { color: "rgb(var(--bad))" } : undefined}>{neg ? "−" : ""}{rupees(total)}</dd>
			</div>
		</div>
	);
}

export default function PayslipDetail() {
	const s = useApp();
	const { company } = s;
	const view = s.payView || {};
	const ym = view.ym;
	const [info, setInfo] = useState(null);
	const ok0 = Boolean(view.emp && ym);
	const [start, end] = ok0 ? periodOf(ym).iso : ["", ""];
	const pay = ok0 ? (s.pay || {})[payKey(company, start, end)] : null;
	useEffect(() => { if (ok0) void loadPayroll(company, start, end, { details: true }); }, [company, start, end, ok0]);
	useEffect(() => {
		let live = true;
		loadCompanyInfo(company).then((i) => { if (live) setInfo(i); });
		return () => { live = false; };
	}, [company]);

	const back = () => navigate("payroll", "employees");
	if (!ok0) {
		return (
			<div className="kit k-enter">
				<div className="k-card"><EmptyState icon="wallet" title="No payslip picked" sub="Open one from Employee Payroll.">
					<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go to Employee Payroll</button>
				</EmptyState></div>
			</div>
		);
	}
	const ok = pay && pay.state === "ok";
	const slip = ok ? pay.slips.find((x) => x.employee === view.emp && Number(x.docstatus) < 2) : null;
	const e = s.byName[view.emp] || { employee_name: slip?.employee_name || view.emp };
	const lines = ok && slip ? (pay.details || []).filter((d) => d.parent === slip.name) : [];
	const earn = lines.filter((d) => d.parentfield === "earnings");
	const ded = lines.filter((d) => d.parentfield === "deductions");

	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />Payroll Detail</button>
					<div className="k-crumbs">
						<button type="button" onClick={back}>Payroll</button>
						<KitIcon name="right" size={14} stroke={2} /><b>{e.employee_name}</b>
					</div>
				</div>
				<div className="k-ph-act">
					<button type="button" className="k-btn k-btn-line" disabled={!slip}
						onClick={() => printPaper(slipsHtml([slip], pay.details || [], info, s.employees, ym))}>
						<KitIcon name="print" size={16} stroke={2} />Print
					</button>
				</div>
			</div>
			<div className="k-split">
				<div className="k-card k-profile-card">
					<div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}><KitAvatar name={e.employee_name} size={96} /></div>
					<h2 style={{ margin: 0, fontSize: 18 }}>{e.employee_name}</h2>
					<div className="k-muted">{e.designation || slip?.designation || ""}</div>
					{slip ? <div style={{ marginTop: 10 }}><Pill status={slipState(slip)} /></div> : null}
					<div className="k-pc-list">
						{[["Employee ID", e.employee_number || view.emp], ["Department", tidyDept(e.department || slip?.department) || "—"],
							["Pay period", periodLabel(ym)], ["Payment days", slip ? `${slip.payment_days ?? "—"} of ${slip.total_working_days ?? "—"}` : "—"],
							["Loss of pay", slip ? `${lossOfPay(slip)} days` : "—"], ["Structure", slip?.salary_structure || "—"]].map(([k, v]) => (
							<div className="k-r" key={k} style={{ justifyContent: "space-between", gap: 10 }}><span className="k-muted">{k}</span><b style={{ textAlign: "right" }}>{v}</b></div>
						))}
					</div>
					<div className="k-field" style={{ marginTop: 16, textAlign: "left" }}>
						<label htmlFor="slip-month">Payslip for</label>
						<select id="slip-month" className="k-sel" value={ym} onChange={(ev) => set({ payView: { ...view, ym: ev.target.value } })}>
							{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
						</select>
					</div>
				</div>
				<div className="k-card">
					<div className="k-card-h"><h3>Payslip · {periodLabel(ym)}</h3><span className="k-muted">{slip?.company || company || ""}</span></div>
					{!ok ? <div className="k-sk" style={{ height: 260 }} /> : !slip ? (
						<EmptyState icon="wallet" title={`No payslip for ${periodLabel(ym)}`} sub="This month has not been run for them yet." />
					) : (
						<>
							<div className="k-grid2">
								<Lines title="Earnings" rows={earn} total={slip.gross_pay} />
								<Lines title="Deductions" rows={ded} total={slip.total_deduction} neg />
							</div>
							<div className="k-sec" style={{ marginTop: 16, background: "rgb(var(--brand-soft))", border: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
								<div><b style={{ fontSize: 15 }}>Net pay</b><div className="k-muted" style={{ fontSize: 13 }}>{slipState(slip) === "Submitted" ? "Submitted on the site" : "Still a draft on the site"}</div></div>
								<b className="k-num" style={{ fontSize: 28, color: "rgb(var(--accent))" }}>{rupees(slip.net_pay)}</b>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
