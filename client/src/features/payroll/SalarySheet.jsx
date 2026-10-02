import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadPayroll, payKey } from "@/api/payroll";
import { addLoanDeductions, loadCompanyInfo, loadLoansDue } from "@/api/salarysheet";
import { RUN_STATES, entryFor, periodOf, runState } from "@/lib/payroll";
import { buildSheet, periodLabel, postingState } from "@/lib/salarysheet";
import { salarySheetXlsx } from "@/lib/salarysheetxlsx";
import { MONTHS, thisMonth } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { Desk, Empty, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import SheetTable, { money } from "@/features/payroll/SheetTable";
import Link from "@/routes/Link";

/* PAYROLL → SALARY SHEET. Ours, 2 October 2026 — there is nothing of Factor HR's
   behind it, so it sits at the top of the module rather than among their menu.

   One month of pay on one page, for the person who has to answer "what did we
   pay, and why". Every earning and every deduction is a column — leave
   encashment, an advance and a loan instalment included — with the slip's own
   gross, deductions and net, and a button that puts the same table, under the
   company's heading, into Excel.

   **It computes nothing.** The figures are hrms's Salary Slips (lib/salarysheet.js
   says why that matters). The one thing it writes is a draft Additional Salary
   for each loan instalment falling due, because that is how hrms deducts one,
   and the draft deducts nothing until HR submits it on the desk — see
   api/salarysheet.js. */

/** Last month, which is the month that is being paid at the start of this one. */
const lastMonth = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	const d = new Date(y, m - 2, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** The months worth choosing from: this one and the eighteen before it. */
const monthChoices = () => {
	const [y, m] = thisMonth().split("-").map(Number);
	return Array.from({ length: 19 }, (_, i) => {
		const d = new Date(y, m - 1 - i, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	});
};

const rupees = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const SLIP_WORDS = {
	on: "On the slip",
	missing: "Not on the slip — make the slip again",
	noslip: "No slip yet",
};

function deductionWords(g) {
	if (!g.existing) return "Not added yet";
	return g.existing.docstatus === 1 ? "Submitted" : "Added as a draft — submit it in Frappe";
}

export default function SalarySheet() {
	const s = useApp();
	const { company, site } = s;

	const [ym, setYm] = useState(lastMonth);
	const [address, setAddress] = useState("");
	const [info, setInfo] = useState(null);
	const [loans, setLoans] = useState({ state: "loading", due: [], groups: [], components: [], err: "" });
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState(null);

	const [start, end] = periodOf(ym).iso;
	const pay = (s.pay || {})[payKey(company, start, end)];

	useEffect(() => { void loadPayroll(company, start, end, { details: true }); }, [company, start, end]);

	const readLoans = async () => setLoans(await loadLoansDue(company, ym));
	useEffect(() => {
		let live = true;
		setLoans((l) => ({ ...l, state: "loading" }));
		loadLoansDue(company, ym).then((d) => { if (live) setLoans(d); });
		return () => { live = false; };
	}, [company, ym]);

	useEffect(() => {
		let live = true;
		loadCompanyInfo(company).then((i) => { if (live) setInfo(i); });
		return () => { live = false; };
	}, [company]);

	const sheet = useMemo(
		() => buildSheet({
			slips: pay && pay.state === "ok" ? pay.slips : [],
			details: pay && pay.state === "ok" ? pay.details : [],
			loanComponents: loans.components,
		}),
		[pay, loans.components],
	);

	const groups = loans.groups.map((g) => ({ ...g, state: postingState(g, sheet.rows) }));
	const toAdd = groups.filter((g) => !g.existing);
	const entry = pay && pay.state === "ok" ? entryFor(pay.entries) : null;
	const run = pay && pay.state === "ok" ? runState(entry, pay.slips) : "none";
	const reading = !pay || pay.state === "" || pay.state === "loading";

	const refresh = async () => {
		setMsg(null);
		await Promise.all([loadPayroll(company, start, end, { fresh: true, details: true }), readLoans()]);
	};

	const addLoans = async () => {
		setBusy("loans");
		setMsg(null);
		const r = await addLoanDeductions(loans.groups, ym);
		await readLoans();
		setBusy("");
		const bits = [];
		if (r.made.length) {
			bits.push(`${r.made.length} loan deduction${r.made.length === 1 ? "" : "s"} added as drafts. A draft takes nothing `
				+ "from anybody's pay yet — open them in Frappe, select them all and choose Actions → Submit, then run Salary Process.");
		}
		if (r.existed.length) bits.push(`${r.existed.length} already had one and were left alone.`);
		if (r.failed.length) {
			bits.push(`${r.failed.length} could not be added: ${r.failed.map((f) => `${f.employee_name} — ${f.error}`).join("; ")}`);
		}
		setMsg({ kind: r.failed.length ? "warn" : "ok", text: bits.join(" ") || "Nothing to add." });
	};

	const download = async () => {
		setBusy("xlsx");
		try {
			await salarySheetXlsx(sheet, { ym, company, info, address, loans: groups });
		} catch (e) {
			setMsg({ kind: "warn", text: "The Excel file could not be made: " + (e.message || e) });
		}
		setBusy("");
	};

	const missing = groups.filter((g) => g.state === "missing");
	const label = periodLabel(ym);
	const hasRows = sheet.rows.length > 0;

	return (
		<>
			<div className="emhead">
				<h2>Salary Sheet</h2>
				<span className="n">{label} · {company || "all companies"}</span>
				<span className="right">
					<label className="sr-only" htmlFor="ssmonth">Month</label>
					<select id="ssmonth" value={ym} onChange={(e) => { setYm(e.target.value); setMsg(null); }}>
						{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
					</select>
					<button type="button" className="embtn" disabled={reading} onClick={() => void refresh()}>Refresh</button>
					<button type="button" className="embtn pri" disabled={!hasRows || busy === "xlsx"} onClick={() => void download()}>
						{busy === "xlsx" ? "Making the file…" : "Download Excel"}
					</button>
				</span>
			</div>

			<Panel title={`Getting ${label} paid`} ico="✔">
				<ol className="list-decimal pl-[1.2rem] leading-[1.7]">
					<li>
						<b>Loan and advance deductions.</b>{" "}
						{loans.state === "loading" ? "Reading the loans…"
							: loans.state === "error" ? `The loans could not be read — ${loans.err}`
							: groups.length === 0 ? `No loan or advance instalment falls due in ${label}.`
							: `${groups.length} deduction${groups.length === 1 ? "" : "s"} to take in ${label}, ${rupees(groups.reduce((t, g) => t + g.amount, 0))} in all — ${toAdd.length} still to add.`}
						{" "}
						{groups.length > 0 && (
							<button type="button" className="embtn pri" disabled={!toAdd.length || busy === "loans"} onClick={() => void addLoans()}>
								{busy === "loans" ? "Adding…" : "Add loan deductions"}
							</button>
						)}
					</li>
					<li>
						<b>Submit them, then run the salary.</b> Frappe only deducts what has been submitted.{" "}
						<Desk className="embtn" href={site && deskUrl(site, "Additional Salary")} label="Open Additional Salary in Frappe">
							Open Additional Salary
						</Desk>{" "}
						<Link section="payroll" subtab="process">Salary Process</Link> makes the slips.
					</li>
					<li><b>Check the sheet below</b> and download it as Excel.</li>
				</ol>
				{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}
				{missing.length > 0 && (
					<Note className="warn">
						{missing.map((g) => g.employee_name).join(", ")} {missing.length === 1 ? "has a slip" : "have slips"} made before the
						loan deduction was submitted, so {missing.length === 1 ? "it does" : "they do"} not carry it. Cancel
						{missing.length === 1 ? " that slip" : " those slips"} on the desk and make {missing.length === 1 ? "it" : "them"} again.
					</Note>
				)}
			</Panel>

			<Tiles>
				<Tile k="People" n={sheet.totals.count} s={sheet.totals.count ? `${sheet.totals.submitted} slips submitted` : "no slips"} />
				<Tile k="Gross salary" n={rupees(sheet.totals.gross)} />
				<Tile k="Deductions" n={rupees(sheet.totals.deduction)} />
				<Tile k="Net pay" n={rupees(sheet.totals.net)} />
				<Tile k="Month is" n={RUN_STATES[run]} />
			</Tiles>

			<div className="ctl" style={{ margin: ".6rem 0" }}>
				<label className="lab" htmlFor="ssaddress">Address line for the Excel heading</label>{" "}
				<input id="ssaddress" type="text" className="wide" value={address}
					placeholder="e.g. Industrial Estate, Perumbavoor, Kerala"
					onChange={(e) => setAddress(e.target.value)} />
				<span className="hint">
					{" "}The heading also carries the company's name, tax ID, registration details, phone and email from its
					Company record in Frappe.
				</span>
			</div>

			{reading ? <p className="muted">Reading {label}…</p>
				: pay.state === "error" ? <Empty title="The salary slips could not be read">{pay.err}</Empty>
				: !hasRows ? (
					<Empty title={`No salary slips for ${label}`}>
						Make them from <Link section="payroll" subtab="process">Salary Process</Link>. Until then there is
						nothing to total.
					</Empty>
				) : (
					<Panel title={`${label} — every earning and deduction`} ico="🧾">
						<SheetTable sheet={sheet} label={label} />
					</Panel>
				)}

			{(groups.length > 0 || loans.due.some((d) => d.problem)) && (
				<Panel title={`Loan and advance deductions — ${label}`} ico="🏦">
					<Scroll>
						<table className="fptable" aria-label={`Loan deductions, ${label}`}>
							<thead>
								<tr><th>Employee</th><th>Loan</th><th>Taken through</th><th>Amount</th><th>Deduction</th><th>Salary slip</th></tr>
							</thead>
							<tbody>
								{groups.map((g) => (
									<tr key={g.key}>
										<td>{g.employee_name}</td>
										<td className="mono">{g.loans.join(", ")}</td>
										<td>{g.component}</td>
										<td className="num">{money(g.amount)}</td>
										<td>{deductionWords(g)}</td>
										<td>{SLIP_WORDS[g.state]}</td>
									</tr>
								))}
								{loans.due.filter((d) => d.problem).map((d) => (
									<tr key={"p" + d.loan}>
										<td>{d.employee_name}</td>
										<td className="mono">{d.loan}</td>
										<td colSpan={4}>{d.problem} Set one on the loan scheme and it will be picked up.</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				</Panel>
			)}
		</>
	);
}
