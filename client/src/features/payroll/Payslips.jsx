import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadPayroll, payKey } from "@/api/payroll";
import { loadCompanyInfo } from "@/api/salarysheet";
import { periodOf } from "@/lib/payroll";
import { slipsHtml } from "@/lib/payslipdoc";
import { lastMonth, monthChoices } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { printPaper } from "@/lib/doc";
import { MONTHS } from "@/lib/format";
import { Empty, Note, Scroll, Tile, Tiles } from "@/components/ui";
import { money } from "@/features/payroll/SheetTable";

/* PAYROLL → PAYSLIPS. Ours, 2 October 2026.

   Pick a month, see everybody's slip, open one to read it and print it — or
   print the whole month, one slip to a page. Every figure on a payslip is the
   Salary Slip's own (lib/payslipdoc.js); a slip still in draft prints with
   DRAFT on it so it is not mistaken for a final one. */

export default function Payslips() {
	const s = useApp();
	const { company } = s;
	const [ym, setYm] = useState(lastMonth);
	const [info, setInfo] = useState(null);
	const [find, setFind] = useState("");
	const [which, setWhich] = useState("");

	const [start, end] = periodOf(ym).iso;
	const pay = (s.pay || {})[payKey(company, start, end)];
	const ok = pay && pay.state === "ok";

	useEffect(() => { void loadPayroll(company, start, end, { details: true }); }, [company, start, end]);
	useEffect(() => {
		let live = true;
		loadCompanyInfo(company).then((i) => { if (live) setInfo(i); });
		return () => { live = false; };
	}, [company]);

	const slips = useMemo(
		() => (ok ? pay.slips.filter((x) => Number(x.docstatus) < 2).sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))) : []),
		[pay, ok],
	);
	const shown = slips.filter((x) => !find || `${x.employee_name} ${x.employee}`.toLowerCase().includes(find.toLowerCase()));
	const html = (list) => slipsHtml(list, ok ? pay.details : [], info, s.employees, ym);
	const one = slips.find((x) => x.name === which);
	const label = periodLabel(ym);
	const drafts = slips.filter((x) => Number(x.docstatus) === 0).length;

	return (
		<div className="paypage pslpage">
			<div className="emhead">
				<h2>Payslips</h2>
				<span className="n">{label} · {company || "all companies"}</span>
				<span className="right">
					<label className="sr-only" htmlFor="pslmonth">Month</label>
					<select id="pslmonth" value={ym} onChange={(e) => { setYm(e.target.value); setWhich(""); }}>
						{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
					</select>
					<button type="button" className="embtn pri" disabled={!slips.length} onClick={() => printPaper(html(slips))}>
						Print all {slips.length || ""}
					</button>
				</span>
			</div>

			<Tiles>
				<Tile k="Payslips" n={ok ? slips.length : "…"} s={drafts ? `${drafts} still in draft` : ""} />
				<Tile k="Net pay" cls={ok && slips.length ? "good" : ""} n={ok ? "₹" + Math.round(slips.reduce((t, x) => t + (Number(x.net_pay) || 0), 0)).toLocaleString("en-IN") : "…"} />
			</Tiles>

			{pay && pay.state === "error" && <Note className="warn">The payslips could not be read: {pay.err}</Note>}
			{ok && drafts > 0 && <Note>Slips marked Draft print with DRAFT on them. Submit the salary run in Frappe to make them final.</Note>}

			<div className="ctl prrow payfind">
				<label className="sr-only" htmlFor="psl-find">Find</label>
				<input id="psl-find" type="search" placeholder="name or code" value={find} onChange={(e) => setFind(e.target.value)} />
			</div>

			{!ok ? <p className="muted">Reading {label}…</p> : !slips.length ? (
				<Empty title={`No payslips for ${label}`}>Run the salary for the month on the Payroll page; the slips appear here.</Empty>
			) : (
				<Scroll>
					<table className="fptable psltable" aria-label={`Payslips, ${label}`}>
						<thead><tr><th>Person</th><th>Pay days</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Slip</th><th /></tr></thead>
						<tbody>
							{shown.map((x) => (
								<tr key={x.name} className={which === x.name ? "on" : undefined}>
									<td>{x.employee_name}<small className="block muted">{x.employee}</small></td>
									<td className="num">{x.payment_days}</td>
									<td className="num">{money(x.gross_pay)}</td>
									<td className="num">{money(x.total_deduction)}</td>
									<td className="num"><b>{money(x.net_pay)}</b></td>
									<td><span className={"fpstate " + (Number(x.docstatus) === 1 ? "submitted" : "draft")}>{Number(x.docstatus) === 1 ? "Submitted" : "Draft"}</span></td>
									<td className="acts">
										<button type="button" className="embtn sm" aria-pressed={which === x.name} onClick={() => setWhich(which === x.name ? "" : x.name)}>{which === x.name ? "Close" : "View"}</button>
										<button type="button" className="embtn sm" onClick={() => printPaper(html([x]))}>Print</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			)}

			{one && (
				<section className="panel pslview" aria-label={`Payslip of ${one.employee_name}`}>
					<header>
						<h3>{one.employee_name} — {label}</h3>
						<span className="pslviewacts">
							<button type="button" className="embtn sm" onClick={() => printPaper(html([one]))}>Print this slip</button>
							<button type="button" className="embtn sm" onClick={() => setWhich("")}>Close</button>
						</span>
					</header>
					<div className="body">
						{/* The slip is paper, white in either palette — it is what prints. */}
						<iframe className="pslframe" title={`Payslip of ${one.employee_name}`} srcDoc={html([one])} />
					</div>
				</section>
			)}
		</div>
	);
}
