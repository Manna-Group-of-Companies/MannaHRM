import { useEffect, useMemo, useRef, useState } from "react";

import { useApp } from "@/store";
import { createSalarySlips, loadPayroll, payKey, startSalaryProcess, submitSalarySlips } from "@/api/payroll";
import { loadBankDetails } from "@/api/banksheet";
import { loadCompanyInfo } from "@/api/salarysheet";
import { bankSheet } from "@/lib/banksheet";
import { bankSheetXlsx } from "@/lib/banksheetxlsx";
import { transferQuestion, transferStep } from "@/lib/banktransfer";
import { entryFor, periodOf, runState } from "@/lib/payroll";
import { lastMonth, monthChoices } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { MONTHS, thisMonth } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { salaryLocked } from "@/data/menus";
import { navigate } from "@/routes/router";
import { Desk, Empty, Note, Scroll, Tile, Tiles } from "@/components/ui";
import { money } from "@/features/payroll/SheetTable";

/* PAYROLL → BANK TRANSFER. Ours, 2 October 2026.

   Who is paid how much and where to send it, for a month, as a sheet that goes
   to the bank or into Excel. Each person's **whole net pay** is the Salary
   Slip's own figure — the page splits nothing. Somebody with no bank details on
   their Employee record is listed and flagged, so the record can be fixed or
   they can be paid another way, and they stay in the total.

   22 October 2026, asked for by HR: the page also moves the month along.
   Opened on a month that is over, it works the salary out by itself — the
   Payroll page's own two steps, a run and its draft slips — so the amounts are
   there to send. **Transferred**, pressed once the bank has been paid, submits
   the slips through the run, which makes the payslips. lib/banktransfer.js
   says which step is taken when. */

const rupees = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/* hrms makes and submits slips in the background past thirty people, so the
   page reads the month again until they arrive — every few seconds, for a few
   minutes, and then leaves a Refresh to the person. */
const POLL_MS = 6000;
const POLL_TRIES = 40;

export default function BankSheet() {
	const s = useApp();
	const { company, site } = s;
	const [ym, setYm] = useState(lastMonth);
	const [emps, setEmps] = useState(undefined);
	const [empErr, setEmpErr] = useState("");
	const [info, setInfo] = useState(null);
	const [address, setAddress] = useState("");
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState(null);
	const [find, setFind] = useState("");
	const [asking, setAsking] = useState(false);
	const [sent, setSent] = useState(false);
	const tried = useRef(new Set());

	const [start, end] = periodOf(ym).iso;
	const pay = (s.pay || {})[payKey(company, start, end)];
	const ok = pay && pay.state === "ok";
	const now = thisMonth();
	const locked = salaryLocked(s.user);
	const say = (kind, text) => setMsg({ kind, text });
	const readPay = (fresh) => loadPayroll(company, start, end, { fresh });

	useEffect(() => { void readPay(); }, [company, start, end]);
	useEffect(() => { setAsking(false); setSent(false); setMsg(null); }, [company, ym]);
	useEffect(() => {
		let live = true;
		setEmps(undefined);
		loadBankDetails(company).then((r) => { if (live) { setEmps(r); setEmpErr(""); } }, (e) => { if (live) { setEmps([]); setEmpErr(e.message || String(e)); } });
		loadCompanyInfo(company).then((i) => { if (live) setInfo(i); });
		return () => { live = false; };
	}, [company]);

	const entry = ok ? entryFor(pay.entries) : null;
	const run = ok ? runState(entry, pay.slips) : "";
	const step = transferStep({ company, ym, now, locked, ok, state: run, entry });

	const sheet = useMemo(() => bankSheet(ok ? pay.slips : [], emps || []), [pay, ok, emps]);
	const t = sheet.totals;
	const shown = sheet.rows.filter((r) => !find || `${r.name} ${r.code}`.toLowerCase().includes(find.toLowerCase()));
	const label = periodLabel(ym);

	/* The run's first two steps, from wherever the month stands. Each is hrms's
	   own and refuses what it should — no salary structure, no payroll account,
	   a run already there. */
	async function calculate(from) {
		setBusy("calc"); setMsg(null);
		try {
			let name = entry?.name;
			if (from === "start") name = await startSalaryProcess(company, start, end, end);
			await createSalarySlips(name);
			say("ok", `${label}'s salary is being worked out — ${name}. The amounts appear here as the slips are made.`);
		} catch (e) {
			say("warn", `${label}'s salary could not be worked out: ${e.message || e}`);
		}
		await readPay(true);
		setBusy("");
	}

	/* Opened on a month that is over, the salary is worked out without being
	   asked — once a visit for each company's month, so a refusal is said and
	   not retried in a loop. */
	useEffect(() => {
		if (!step.auto || busy) return;
		const key = payKey(company, start, end);
		if (tried.current.has(key)) return;
		tried.current.add(key);
		void calculate(step.auto);
	}, [step.auto, company, start, end, busy]);

	const waiting = run === "queued" || (sent && run === "slips");
	useEffect(() => {
		if (!waiting) return undefined;
		let n = 0;
		const id = setInterval(() => { if (++n > POLL_TRIES) clearInterval(id); else void readPay(true); }, POLL_MS);
		return () => clearInterval(id);
	}, [waiting, company, start, end]);

	async function onTransferred() {
		setBusy("transfer"); setMsg(null);
		try {
			await submitSalarySlips(entry.name);
			setSent(true);
			say("ok", `${label}'s salary is marked transferred. The payslips are being made.`);
		} catch (e) {
			say("warn", `The payslips could not be made: ${e.message || e}`);
		}
		setAsking(false);
		await readPay(true);
		setBusy("");
	}

	async function onDownload() {
		setBusy("xlsx"); setMsg(null);
		try {
			await bankSheetXlsx(sheet, { ym, company, info, address });
		} catch (e) {
			say("warn", "The Excel file could not be made: " + (e.message || e));
		}
		setBusy("");
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
					{step.calc && (
						<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => void calculate(step.calc)}>
							{busy === "calc" ? "Working out…" : "Calculate salary"}
						</button>
					)}
					<button type="button" className="embtn" disabled={!sheet.rows.length || Boolean(busy)} onClick={() => void onDownload()}>
						{busy === "xlsx" ? "Making the file…" : "Download Excel"}
					</button>
					{step.transfer && !asking && (
						<button type="button" className="embtn pri" disabled={Boolean(busy) || waiting} onClick={() => setAsking(true)}>
							{waiting ? "Making payslips…" : "Transferred"}
						</button>
					)}
				</span>
			</div>

			<Tiles>
				<Tile k="To pay" n={ok ? rupees(t.net) : "…"} s={ok ? `${t.count} people` : ""} />
				<Tile k="By bank" n={ok ? rupees(t.bank) : "…"} s={ok ? `${t.bankCount} people` : ""} />
				<Tile k="No bank details" n={ok ? t.otherCount : "…"} s={t.otherCount ? rupees(t.other) : ""} />
			</Tiles>

			{asking && (
				<div className="note" role="alertdialog" aria-label="Mark the salary as transferred">
					<p>{transferQuestion({ label, count: t.count, net: t.net, noBank: t.otherCount })}</p>
					<div className="ctl prrow">
						<button type="button" className="embtn pri" disabled={busy === "transfer"} onClick={() => void onTransferred()}>
							{busy === "transfer" ? "Making payslips…" : "Yes, transferred"}
						</button>
						<button type="button" className="embtn" disabled={busy === "transfer"} onClick={() => setAsking(false)}>Cancel</button>
					</div>
				</div>
			)}
			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}
			{busy === "calc" && <Note>Working out {label}'s salary…</Note>}
			{run === "queued" && <Note>hrms is making {label}'s salary slips. This page fills in as they arrive.</Note>}
			{step.why && <Note>{step.why}</Note>}
			{run === "failed" && entry && site && (
				<Note className="warn"><Desk href={deskUrl(site, "Payroll Entry", entry.name)} label="Open the run in Frappe">Open {entry.name} in Frappe</Desk></Note>
			)}
			{ok && run === "final" && t.count > 0 && (
				<Note>
					{label}'s salary is transferred and the payslips are made.{" "}
					<button type="button" className="embtn" onClick={() => navigate("payroll", "slips")}>See the payslips</button>
				</Note>
			)}
			{pay && pay.state === "error" && <Note className="warn">The month could not be read: {pay.err}</Note>}
			{empErr && <Note className="warn">Bank details could not be read: {empErr}</Note>}
			{ok && t.otherCount > 0 && emps && (
				<Note className="warn">
					{t.otherCount} {t.otherCount === 1 ? "person has" : "people have"} no bank account on their Employee record, so the bank
					cannot be paid for them until it is added.{" "}
					<Desk href={site && deskUrl(site, "Employee")} label="Employees in Frappe">Open Employees in Frappe</Desk>
				</Note>
			)}
			{ok && t.count > 0 && run === "slips" && !waiting && (
				<Note>Draft slips — not yet transferred.</Note>
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
				<Empty title={`No salary slips for ${label}`}>
					{step.calc ? "Press Calculate salary to work the month out." : busy === "calc" || run === "queued" ? "They appear here as they are made." : "The salary has not been worked out for this month."}
				</Empty>
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
