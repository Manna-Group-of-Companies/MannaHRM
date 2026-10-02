import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadPayroll, payKey, createSalarySlips, startSalaryProcess } from "@/api/payroll";
import { addLoanDeductions, loadCompanyInfo, loadLoansDue } from "@/api/salarysheet";
import { addExtra, loadRunReads, makeComponents, submitExtras } from "@/api/payrollrun";
import { entryFor, periodOf, runState } from "@/lib/payroll";
import { homeSteps } from "@/lib/payrollhome";
import {
	EXTRA_KINDS, checkExtra, componentOf, componentsToMake, extraState, kindFor, lastMonth, monthChoices, sortExtras, startWhy,
} from "@/lib/payrollrun";
import { buildSheet, periodLabel, postingState } from "@/lib/salarysheet";
import { salarySheetXlsx } from "@/lib/salarysheetxlsx";
import { MONTHS, thisMonth } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { payRows } from "@/features/payroll/shared";
import SheetTable, { money } from "@/features/payroll/SheetTable";
import { Desk, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* PAYROLL → PAYROLL. Ours, 2 October 2026 — the one page payroll is run from.

   HR picks the month and goes down the page: check the set-up, add what is
   owed or taken (an advance, a loan instalment, leave encashment, a bonus), run
   the salary, and read the whole month in one table that goes into Excel.
   Every step is done here, on the website; ERPNext only holds the documents —
   Salary Component, Additional Salary, Payroll Entry, Salary Slip.

   **It computes nothing.** Every figure in the table is hrms's own, off the
   Salary Slip (lib/salarysheet.js says why that matters). What the page writes
   is a Salary Component (once), an Additional Salary (an advance, loan or
   bonus, which a slip reads once it is submitted), and the two steps of a run
   that api/payroll.js already takes — a Payroll Entry, then its slips.

   **The one step that stays on the desk is the last: submitting the slips.**
   That books the pay to the ledger, and it is deliberately somebody opening the
   run on the site and pressing Submit (api/client.js, apiSubmitDraft). */

const rupees = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** The month's state in a word short enough for a tile. */
const MONTH_IS = { none: "Not run", draft: "Picked", queued: "Making", slips: "In draft", final: "Final", failed: "Failed" };

const CHIP = { done: "Done", warn: "Needs you", wait: "Working", todo: "To do", unknown: "Not known" };

/** The month's tile in the colour of where it stands: final is done, failed
    is trouble, anything part-way is work in progress. */
const MONTH_CLS = { final: "good", failed: "bad", draft: "warn", queued: "warn", slips: "warn" };

const reportUrl = (site, name) => site && `${site}/app/query-report/${encodeURIComponent(name)}`;

export default function PayrollRun() {
	const s = useApp();
	const { company, site } = s;

	const [ym, setYm] = useState(lastMonth);
	const [reads, setReads] = useState({ components: undefined, all: undefined, extras: undefined });
	const [loans, setLoans] = useState({ state: "loading", due: [], groups: [], components: [], err: "" });
	const [info, setInfo] = useState(null);
	const [address, setAddress] = useState("");
	const [form, setForm] = useState({ employee: "", kind: "advance", component: "", amount: "" });
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState(null);
	const [confirm, setConfirm] = useState("");
	const [folded, setFolded] = useState({});

	const [start, end] = periodOf(ym).iso;
	const now = thisMonth();
	const label = periodLabel(ym);
	const pay = (s.pay || {})[payKey(company, start, end)];
	const people = payRows(s);

	const readExtras = async () => setReads(await loadRunReads(company, start, end));
	const readPay = (fresh) => loadPayroll(company, start, end, { details: true, fresh });

	useEffect(() => { void readPay(false); }, [company, start, end]);
	useEffect(() => {
		let live = true;
		setReads({ components: undefined, all: undefined, extras: undefined });
		loadRunReads(company, start, end).then((r) => { if (live) setReads(r); });
		return () => { live = false; };
	}, [company, start, end]);
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

	const ok = pay && pay.state === "ok";
	const entry = ok ? entryFor(pay.entries) : null;
	const run = ok ? runState(entry, pay.slips) : "none";

	const view = useMemo(
		() => homeSteps({ setup: { components: reads.components }, extras: reads.extras, pay, people, end }),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[reads, pay, s.employees, company, end],
	);
	const sheet = useMemo(
		() => buildSheet({ slips: ok ? pay.slips : [], details: ok ? pay.details : [], loanComponents: loans.components }),
		[pay, ok, loans.components],
	);
	const groups = loans.groups.map((g) => ({ ...g, state: postingState(g, sheet.rows) }));
	const loansToAdd = groups.filter((g) => !g.existing);

	const extras = sortExtras(reads.extras);
	const drafts = extras.filter((x) => Number(x.docstatus) === 0);
	const toMake = componentsToMake(reads.components);
	const t = view.totals;
	const doing = view.steps[view.current];
	const why = startWhy({ company, ym, now, ok, entry });
	const slipsExist = ok && pay.slips.some((x) => Number(x.docstatus) < 2);

	const who = (id) => (people.find((p) => p.name === id) || {}).employee_name || id;
	const say = (kind, text) => setMsg({ kind, text });

	const reload = async () => {
		setConfirm("");
		await Promise.all([readPay(true), readExtras(), loadLoansDue(company, ym).then(setLoans)]);
	};

	async function onMake() {
		setBusy("make"); setMsg(null);
		const r = await makeComponents(toMake);
		await readExtras();
		setBusy("");
		if (r.failed.length) say("warn", `${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}`);
		else say("ok", `Made ${r.made.join(", ")}. You can change them later in Frappe.`);
	}

	async function onAdd() {
		const problem = checkExtra(form, people);
		if (problem) return say("warn", problem);
		setBusy("add"); setMsg(null);
		try {
			const r = await addExtra(form, end, company, true);
			say("ok", `${kindFor(form.kind).label} of ${rupees(form.amount)} for ${who(form.employee)} is in ${label} (${r.name}). `
				+ (slipsExist ? "Slips already made do not change — cancel them in Frappe and make them again to include it." : "The next salary slips will carry it."));
			setForm({ ...form, amount: "" });
		} catch (e) {
			say("warn", e.message || String(e));
		}
		await readExtras();
		setBusy("");
	}

	async function onSubmitDrafts() {
		setBusy("submit"); setMsg(null);
		const r = await submitExtras(drafts.map((d) => d.name));
		await readExtras();
		setConfirm(""); setBusy("");
		say(r.failed.length ? "warn" : "ok", r.failed.length
			? `${r.done.length} submitted; ${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}`
			: `${r.done.length} submitted. The next salary slips will carry them.`);
	}

	async function onLoans() {
		setBusy("loans"); setMsg(null);
		const r = await addLoanDeductions(loans.groups, ym);
		const sub = r.made.length ? await submitExtras(r.made.map((m) => m.name).filter(Boolean)) : { done: [], failed: [] };
		await reload();
		setBusy("");
		const bits = [];
		if (sub.done.length) bits.push(`${sub.done.length} loan instalment${sub.done.length === 1 ? "" : "s"} added and submitted.`);
		if (r.existed.length) bits.push(`${r.existed.length} already had one.`);
		if (r.failed.length) bits.push(`Could not add: ${r.failed.map((f) => `${f.employee_name} — ${f.error}`).join("; ")}`);
		if (sub.failed.length) bits.push(`Could not submit: ${sub.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}`);
		say(r.failed.length || sub.failed.length ? "warn" : "ok", bits.join(" ") || "Nothing to add.");
	}

	async function onStart() {
		setBusy("start"); setMsg(null);
		try {
			const name = await startSalaryProcess(company, start, end, end);
			say("ok", `${name} made, and hrms has picked who is on it. Create the salary slips when you are ready.`);
		} catch (e) {
			say("warn", e.message || String(e));
		}
		await readPay(true);
		setBusy("");
	}

	async function onSlips() {
		setBusy("slips"); setMsg(null);
		try {
			await createSalarySlips(entry.name);
			say("ok", `${entry.name} submitted — hrms is making the draft salary slips. Nothing is paid until they are submitted.`);
		} catch (e) {
			say("warn", e.message || String(e));
		}
		setConfirm("");
		await readPay(true);
		setBusy("");
	}

	async function onDownload() {
		setBusy("xlsx"); setMsg(null);
		try {
			await salarySheetXlsx(sheet, { ym, company, info, address, loans: groups });
		} catch (e) {
			say("warn", "The Excel file could not be made: " + (e.message || e));
		}
		setBusy("");
	}

	/** Each step's body. */
	const bodies = {
		setup: (st) => (
			<>
				<p>{st.text}</p>
				{toMake.length > 0 && (
					<div className="ctl prrow">
						<button type="button" className="embtn pri" disabled={busy === "make"} onClick={() => void onMake()}>
							{busy === "make" ? "Making…" : `Make ${toMake.map((c) => c.name).join(", ")}`}
						</button>
						<span className="hint">Salary components are the headings on a slip. These three carry leave encashment, an advance and a loan instalment.</span>
					</div>
				)}
				{st.bare && st.bare.length > 0 && (
					<>
						<small className="muted block prwho">
							{st.bare.slice(0, 12).map((e) => e.employee_name || e.name).join(", ")}
							{st.bare.length > 12 ? ` and ${st.bare.length - 12} more` : ""}
						</small>
						<div className="ctl prrow">
							<Desk className="embtn pri" href={site && deskUrl(site, "Bulk Salary Structure Assignment", "new")} label="Assign salary structures in Frappe">
								Assign salary structures
							</Desk>
							<span className="hint">A salary structure says what each person earns and what is taken. It is made once, in Frappe, and the run below uses it.</span>
						</div>
					</>
				)}
			</>
		),
		extras: (st) => (
			<>
				<p>{st.text}</p>
				<div className="ctl prform">
					<label className="sr-only" htmlFor="pr-person">Person</label>
					<select id="pr-person" className="who" value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}>
						<option value="">Person…</option>
						{people.slice().sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))).map((p) => (
							<option key={p.name} value={p.name}>{p.employee_name} ({p.name})</option>
						))}
					</select>
					<label className="sr-only" htmlFor="pr-kind">What</label>
					<select id="pr-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
						{EXTRA_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
					</select>
					{form.kind === "other" && (
						<>
							<label className="sr-only" htmlFor="pr-comp">Salary component</label>
							<select id="pr-comp" value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })}>
								<option value="">Component…</option>
								{(reads.all || []).map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
							</select>
						</>
					)}
					<label className="sr-only" htmlFor="pr-amt">Amount in rupees</label>
					<input id="pr-amt" className="amt" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Amount ₹" value={form.amount}
						onChange={(e) => setForm({ ...form, amount: e.target.value })} />
					<button type="button" className="embtn pri" disabled={busy === "add"} onClick={() => void onAdd()}>
						{busy === "add" ? "Adding…" : `Add to ${label}`}
					</button>
				</div>
				<small className="muted block prnote">
					{kindFor(form.kind).hint} Goes to {componentOf(form) || "the component you choose"} on the slip.
				</small>
				{extras.length > 0 && (
					<Scroll>
						<table className="fptable prtable" aria-label={`Added to ${label}`}>
							<thead><tr><th>Person</th><th>What</th><th>Amount</th><th>State</th></tr></thead>
							<tbody>
								{extras.map((x) => (
									<tr key={x.name}>
										<td>{x.employee_name || who(x.employee)}</td>
										<td>{x.salary_component}</td>
										<td className="num">{money(x.amount)}</td>
										<td><span className={"fpstate " + extraState(x).toLowerCase()}>{extraState(x)}</span></td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				)}
				{drafts.length > 0 && (
					<div className="ctl prrow">
						{confirm === "drafts" ? (
							<>
								<button type="button" className="embtn pri" disabled={busy === "submit"} onClick={() => void onSubmitDrafts()}>
									{busy === "submit" ? "Submitting…" : `Yes, submit ${drafts.length}`}
								</button>
								<button type="button" className="embtn" onClick={() => setConfirm("")}>Cancel</button>
							</>
						) : (
							<button type="button" className="embtn pri" onClick={() => setConfirm("drafts")}>
								Submit {drafts.length} draft{drafts.length === 1 ? "" : "s"}
							</button>
						)}
						<span className="hint">A slip only picks up what has been submitted.</span>
					</div>
				)}
				{loans.state === "ok" && groups.length > 0 && (
					<div className="ctl prcallout">
						<span>
							<b>{groups.length}</b> loan instalment{groups.length === 1 ? "" : "s"} fall due in {label},{" "}
							{rupees(groups.reduce((n, g) => n + g.amount, 0))} in all — {loansToAdd.length} still to add.
						</span>
						<button type="button" className="embtn pri" disabled={!loansToAdd.length || busy === "loans"} onClick={() => void onLoans()}>
							{busy === "loans" ? "Adding…" : "Add loan instalments"}
						</button>
					</div>
				)}
				{loans.state === "error" && (
					<small className="muted block">Loans are not on this site, so add each instalment above as a Loan instalment.</small>
				)}
			</>
		),
		run: (st) => (
			<>
				<p>{st.text}</p>
				<div className="ctl prrow">
					{!entry && (
						<button type="button" className="embtn pri" disabled={Boolean(why) || busy === "start"} onClick={() => void onStart()}>
							{busy === "start" ? "Starting…" : "Start the salary run"}
						</button>
					)}
					{run === "draft" && (confirm === "slips" ? (
						<>
							<button type="button" className="embtn pri" disabled={busy === "slips"} onClick={() => void onSlips()}>
								{busy === "slips" ? "Creating…" : `Yes, create ${entry.number_of_employees || ""} salary slips`.replace("  ", " ")}
							</button>
							<button type="button" className="embtn" onClick={() => setConfirm("")}>Cancel</button>
						</>
					) : (
						<button type="button" className="embtn pri" onClick={() => setConfirm("slips")}>Create salary slips</button>
					))}
					{run === "slips" && (
						<Desk className="embtn pri" href={site && deskUrl(site, "Payroll Entry", entry.name)} label="Submit the salary slips in Frappe">
							Submit the slips in Frappe
						</Desk>
					)}
					{entry && run !== "slips" && (
						<Desk className="embtn" href={site && deskUrl(site, "Payroll Entry", entry.name)} label="Open the salary run in Frappe">
							Open {entry.name}
						</Desk>
					)}
					<button type="button" className="embtn" onClick={() => void reload()}>Refresh</button>
				</div>
				{!entry && why && <small className="muted block">{why}</small>}
				{run === "slips" && (
					<small className="muted block">
						Submitting the slips is what books the pay, so it is done in Frappe: open the run, select the slips and choose Submit.
					</small>
				)}
			</>
		),
		review: (st) => (
			<>
				<p>{st.text}</p>
				<div className="ctl prform praddr">
					<label className="lab" htmlFor="pr-address">Address line for the Excel heading</label>
					<input id="pr-address" type="text" className="wide" value={address} placeholder="e.g. Industrial Estate, Perumbavoor, Kerala"
						onChange={(e) => setAddress(e.target.value)} />
					<button type="button" className="embtn pri" disabled={!sheet.rows.length || busy === "xlsx"} onClick={() => void onDownload()}>
						{busy === "xlsx" ? "Making the file…" : "Download Excel"}
					</button>
				</div>
				{sheet.rows.length > 0 && <SheetTable sheet={sheet} label={label} />}
				<div className="ctl prlinks">
					<span className="lab">Open in Frappe</span>
					<Desk href={site && deskUrl(site, "Salary Slip")} label="Salary slips in Frappe">Salary slips</Desk>
					<Desk href={reportUrl(site, "Salary Register")} label="Salary Register in Frappe">Salary Register</Desk>
					<Desk href={reportUrl(site, "Bank Remittance")} label="Bank Remittance in Frappe">Bank Remittance</Desk>
				</div>
			</>
		),
	};

	return (
		<div className="paypage prun">
			<div className="emhead">
				<h2>Payroll</h2>
				<span className="n">{label} · {company || "all companies"}</span>
				<span className="right">
					<label className="sr-only" htmlFor="prmonth">Month</label>
					<select id="prmonth" value={ym} onChange={(e) => { setYm(e.target.value); setMsg(null); setConfirm(""); }}>
						{monthChoices().map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</option>)}
					</select>
					<button type="button" className="embtn" onClick={() => void reload()}>Refresh</button>
				</span>
			</div>

			<Tiles>
				<Tile k="People to pay" n={people.length} s={company || "all companies"} />
				<Tile k="Slips made" n={t ? t.count : "—"} s={t && t.count ? `${t.submitted} submitted` : ""} />
				<Tile k="Gross" n={t && t.count ? rupees(sheet.totals.gross) : "—"} />
				<Tile k="Net pay" n={t && t.count ? rupees(sheet.totals.net) : "—"} cls={t && t.count ? "good" : ""} />
				<Tile k="Month is" n={MONTH_IS[run] || "—"} cls={"word " + (MONTH_CLS[run] || "")} s={doing ? `Next: ${doing.title}` : "All done"} />
			</Tiles>

			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}

			<ol className="prsteps">
				{view.steps.map((st, i) => {
					const open = folded[st.id] === undefined ? i === view.current : !folded[st.id];
					const now = i === view.current;
					return (
						<li key={st.id} className={"prstep " + (st.state || "unknown") + (now ? " now" : "")}>
							<Panel ico={st.state === "done" ? "✓" : String(i + 1)} title={st.title} tag={CHIP[st.state]}
								shut={!open} onToggle={() => setFolded({ ...folded, [st.id]: open })}>
								{now ? <p className="prnext">Do this next.</p> : null}
								{bodies[st.id](st)}
							</Panel>
						</li>
					);
				})}
			</ol>
		</div>
	);
}
