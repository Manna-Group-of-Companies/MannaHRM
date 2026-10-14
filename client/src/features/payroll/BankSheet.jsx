import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadPayroll, payKey } from "@/api/payroll";
import { loadBankDetails } from "@/api/banksheet";
import { loadCompanyInfo } from "@/api/salarysheet";
import { bankSheet } from "@/lib/banksheet";
import { bankSheetXlsx } from "@/lib/banksheetxlsx";
import { periodOf } from "@/lib/payroll";
import { lastMonth, monthChoices } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { MONTHS } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { Desk, Empty, Note, Scroll, Tile, Tiles } from "@/components/ui";
import { money } from "@/features/payroll/SheetTable";

/* PAYROLL → BANK TRANSFER. Ours, 2 October 2026.

   Who is paid how much and where to send it, for a month, as a sheet that goes
   to the bank or into Excel. Each person's **whole net pay** is the Salary
   Slip's own figure — the page splits nothing. Somebody with no bank details on
   their Employee record is listed and flagged, so the record can be fixed or
   they can be paid another way, and they stay in the total. */

const rupees = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function BankSheet() {
	const s = useApp();
	const { company, site } = s;
	const [ym, setYm] = useState(lastMonth);
	const [emps, setEmps] = useState(undefined);
	const [empErr, setEmpErr] = useState("");
	const [info, setInfo] = useState(null);
	const [address, setAddress] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState("");
	const [find, setFind] = useState("");

	const [start, end] = periodOf(ym).iso;
	const pay = (s.pay || {})[payKey(company, start, end)];
	const ok = pay && pay.state === "ok";

	useEffect(() => { void loadPayroll(company, start, end); }, [company, start, end]);
	useEffect(() => {
		let live = true;
		setEmps(undefined);
		loadBankDetails(company).then((r) => { if (live) { setEmps(r); setEmpErr(""); } }, (e) => { if (live) { setEmps([]); setEmpErr(e.message || String(e)); } });
		loadCompanyInfo(company).then((i) => { if (live) setInfo(i); });
		return () => { live = false; };
	}, [company]);

	const sheet = useMemo(() => bankSheet(ok ? pay.slips : [], emps || []), [pay, ok, emps]);
	const t = sheet.totals;
	const shown = sheet.rows.filter((r) => !find || `${r.name} ${r.code}`.toLowerCase().includes(find.toLowerCase()));
	const label = periodLabel(ym);

	async function onDownload() {
		setBusy(true); setMsg("");
		try {
			await bankSheetXlsx(sheet, { ym, company, info, address });
		} catch (e) {
			setMsg("The Excel file could not be made: " + (e.message || e));
		}
		setBusy(false);
	}

	return (
		<div className="paypage bkpage">
			<div className="emhead">
				<h2>Bank Transfer</h2>
				<span className="n">{label} · {company || "all companies"}</span>
				<span className="right">
					<label className="sr-only" htmlFor="bkmonth">Month</label>
					<select id="bkmonth" value={ym} onChange={(e) => setYm(e.target.value)}>
						{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
					</select>
					<button type="button" className="embtn pri" disabled={!sheet.rows.length || busy} onClick={() => void onDownload()}>
						{busy ? "Making the file…" : "Download Excel"}
					</button>
				</span>
			</div>

			<Tiles>
				<Tile k="To pay" n={ok ? rupees(t.net) : "…"} s={ok ? `${t.count} people` : ""} />
				<Tile k="By bank" n={ok ? rupees(t.bank) : "…"} s={ok ? `${t.bankCount} people` : ""} />
				<Tile k="No bank details" n={ok ? t.otherCount : "…"} s={t.otherCount ? rupees(t.other) : ""} />
			</Tiles>

			{msg && <Note className="warn">{msg}</Note>}
			{pay && pay.state === "error" && <Note className="warn">The month could not be read: {pay.err}</Note>}
			{empErr && <Note className="warn">Bank details could not be read: {empErr}</Note>}
			{ok && t.otherCount > 0 && emps && (
				<Note className="warn">
					{t.otherCount} {t.otherCount === 1 ? "person has" : "people have"} no bank account on their Employee record, so the bank
					cannot be paid for them until it is added.{" "}
					<Desk href={site && deskUrl(site, "Employee")} label="Employees in Frappe">Open Employees in Frappe</Desk>
				</Note>
			)}
			{ok && t.count > 0 && sheet.rows.some((r) => r.state === "Draft") && (
				<Note>Slips marked Draft are listed so the month can be checked. Nothing is paid until the salary run is submitted in Frappe.</Note>
			)}

			<div className="flds">
				<div className="fld">
					<label className="lab" htmlFor="bk-find">Find</label>
					<input id="bk-find" type="search" placeholder="name or code" value={find} onChange={(e) => setFind(e.target.value)} />
				</div>
				<div className="fld wide">
					<label className="lab" htmlFor="bk-address">Address line for the Excel heading</label>
					<input id="bk-address" type="text" value={address} placeholder="e.g. Industrial Estate, Perumbavoor, Kerala"
						onChange={(e) => setAddress(e.target.value)} />
				</div>
			</div>

			{!ok ? <p className="muted">Reading {label}…</p> : !sheet.rows.length ? (
				<Empty title={`No salary slips for ${label}`}>Run the salary for the month on the Payroll page first.</Empty>
			) : (
				<Scroll>
					<table className="fptable" aria-label={`Bank transfer, ${label}`}>
						<thead><tr><th>Person</th><th>Bank</th><th>Account number</th><th>IFSC</th><th>Pay by</th><th>Net pay</th></tr></thead>
						<tbody>
							{shown.map((r) => (
								<tr key={r.slip}>
									<td>{r.name}<small className="block muted">{r.code}</small></td>
									<td>{r.bank}</td><td className="mono">{r.account}</td><td className="mono">{r.ifsc}</td>
									<td><span className={"fpstate " + (r.mode === "Bank" ? "submitted" : "draft")}>{r.mode}</span></td>
									<td className="num"><b>{money(r.net)}</b></td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr><td><b>Total</b></td><td /><td /><td /><td /><td className="num"><b>{money(t.net)}</b></td></tr>
						</tfoot>
					</table>
				</Scroll>
			)}
		</div>
	);
}
