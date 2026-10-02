import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { givePlan, loadInstalments } from "@/api/advances";
import { KINDS, checkPlan, ledger, ledgerTotals, planSaid } from "@/lib/advances";
import { lastMonth } from "@/lib/payrollrun";
import { todayIso } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { payRows } from "@/features/payroll/shared";
import { Desk, Empty, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* PAYROLL → ADVANCES & LOANS. Ours, 2 October 2026.

   Somebody takes an advance or a loan and pays it back out of their salary over
   some months. hrms does that with one Additional Salary a month; this page is
   where HR says "₹24,000 to Anand, twelve months from October" once and the
   twelve are made, and where the whole picture — what each person has taken,
   what has fallen due and what is still to come — is read back.

   The only arithmetic is splitting the amount HR typed into the instalments HR
   typed. What a slip takes in a month is hrms's own, off the instalment. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const nextMonth = () => {
	const [y, m] = lastMonth().split("-").map(Number);
	const d = new Date(y, m + 1, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AdvancesLoans() {
	const s = useApp();
	const { company, site } = s;

	const [rows, setRows] = useState(undefined);
	const [err, setErr] = useState("");
	const [form, setForm] = useState({ employee: "", kind: "advance", principal: "", instalments: "1", from: nextMonth() });
	const [busy, setBusy] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const [msg, setMsg] = useState(null);
	const [find, setFind] = useState("");
	const [openKey, setOpenKey] = useState("");

	const read = () => loadInstalments(company).then((r) => { setRows(r); setErr(""); }, (e) => { setRows([]); setErr(e.message || String(e)); });
	useEffect(() => {
		let live = true;
		setRows(undefined);
		loadInstalments(company).then((r) => { if (live) { setRows(r); setErr(""); } }, (e) => { if (live) { setRows([]); setErr(e.message || String(e)); } });
		return () => { live = false; };
	}, [company]);

	const people = payRows(s).slice().sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const lines = useMemo(() => ledger(rows, todayIso()), [rows]);
	const totals = ledgerTotals(lines);
	const shown = lines.filter((g) => !find || `${g.name} ${g.employee}`.toLowerCase().includes(find.toLowerCase()));
	const problem = checkPlan(form);
	const said = planSaid(form);
	const who = (id) => (people.find((p) => p.name === id) || {}).employee_name || id;

	async function onGive() {
		setBusy(true); setMsg(null);
		const r = await givePlan(form, company);
		await read();
		setBusy(false); setConfirm(false);
		if (r.error) setMsg({ kind: "warn", text: `${r.made.length} made, then it stopped — ${r.error}. What was made is below; the rest still has to be added.` });
		else {
			setMsg({ kind: "ok", text: `${KINDS.find((k) => k.key === form.kind).label} for ${who(form.employee)}: ${r.made.length} deduction${r.made.length === 1 ? "" : "s"} made and submitted. Each is taken from that month's salary slip.` });
			setForm({ ...form, employee: "", principal: "", instalments: "1" });
		}
	}

	return (
		<div className="paypage alpage">
			<div className="emhead">
				<h2>Advances &amp; Loans</h2>
				<span className="n">{company || "all companies"}</span>
				<span className="right">
					<button type="button" className="embtn" onClick={() => void read()}>Refresh</button>
				</span>
			</div>

			<Tiles>
				<Tile k="People with one" n={rows === undefined ? "…" : totals.people} />
				<Tile k="Taken from pay so far" n={rows === undefined ? "…" : rs(totals.due)} s="instalments whose month has come" />
				<Tile k="Still to come" n={rows === undefined ? "…" : rs(totals.ahead)} />
				<Tile k="Not submitted" n={rows === undefined ? "…" : rs(totals.drafts)} s={totals.drafts ? "taken from nobody's pay" : ""} />
			</Tiles>

			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}
			{err && <Note className="warn">The instalments could not be read: {err}</Note>}

			<Panel title="Give an advance or a loan" ico="＋">
				<div className="flds algive">
					<div className="fld wide">
						<label className="lab" htmlFor="al-person">Person</label>
						<select id="al-person" value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}>
							<option value="">Person…</option>
							{people.map((p) => <option key={p.name} value={p.name}>{p.employee_name} ({p.name})</option>)}
						</select>
					</div>
					<div className="fld">
						<label className="lab" htmlFor="al-kind">Advance or loan</label>
						<select id="al-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
							{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
						</select>
					</div>
					<div className="fld">
						<label className="lab" htmlFor="al-amt">Amount given ₹</label>
						<input id="al-amt" className="amt" type="number" inputMode="decimal" min="0" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
					</div>
					<div className="fld">
						<label className="lab" htmlFor="al-n">Paid back in (monthly instalments)</label>
						<input id="al-n" className="amt" type="number" inputMode="numeric" min="1" max="60" step="1" value={form.instalments} onChange={(e) => setForm({ ...form, instalments: e.target.value })} />
					</div>
					<div className="fld">
						<label className="lab" htmlFor="al-from">First instalment month</label>
						<input id="al-from" type="month" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
					</div>
				</div>
				<p className={"alsaid" + (said ? " on" : "")}>{said || "Fill in the person, the amount and the number of months."}</p>
				<div className="ctl prrow paygo">
					{confirm ? (
						<>
							<button type="button" className="embtn pri" disabled={busy} onClick={() => void onGive()}>
								{busy ? "Making…" : `Yes, make ${form.instalments}`}
							</button>
							<button type="button" className="embtn" onClick={() => setConfirm(false)}>Cancel</button>
						</>
					) : (
						<button type="button" className="embtn pri" onClick={() => (problem ? setMsg({ kind: "warn", text: problem }) : setConfirm(true))}>
							Make the deductions
						</button>
					)}
					<span className="hint">Each month's deduction is saved and submitted, so the salary slip for that month takes it.</span>
				</div>
			</Panel>

			<Panel title={`Who owes what — ${lines.length}`} ico="📒">
				<div className="ctl prrow payfind">
					<label className="sr-only" htmlFor="al-find">Find</label>
					<input id="al-find" type="search" placeholder="name or code" value={find} onChange={(e) => setFind(e.target.value)} />
					<Desk href={site && deskUrl(site, "Additional Salary")} label="Additional Salary in Frappe">Cancel or change one in Frappe</Desk>
				</div>
				{rows === undefined ? <p className="muted">Reading…</p> : shown.length === 0 ? (
					<Empty title="Nothing here yet">Advances and loans you give above appear here with what is left to come.</Empty>
				) : (
					<Scroll>
						<table className="fptable altable" aria-label="Advances and loans">
							<thead>
								<tr><th>Person</th><th>Kind</th><th>Total</th><th>Taken so far</th><th>Still to come</th><th>Not submitted</th><th>Next</th><th /></tr>
							</thead>
							<tbody>
								{shown.map((g) => (
									<RowWithItems key={g.key} g={g} open={openKey === g.key} onToggle={() => setOpenKey(openKey === g.key ? "" : g.key)} />
								))}
							</tbody>
						</table>
					</Scroll>
				)}
			</Panel>
		</div>
	);
}

function RowWithItems({ g, open, onToggle }) {
	return (
		<>
			<tr>
				<td>{g.name}<small className="block muted">{g.employee}</small></td>
				<td>{g.kind}</td>
				<td className="num">{rs(g.total)}</td>
				<td className="num">{rs(g.due)}</td>
				<td className="num"><b>{rs(g.ahead)}</b></td>
				<td className="num">{g.drafts ? rs(g.drafts) : ""}</td>
				<td>{g.next ? `${rs(g.next.amount)} on ${g.next.date}` : ""}</td>
				<td><button type="button" className="embtn sm" aria-expanded={open} onClick={onToggle}>{open ? "Hide" : "Months"}</button></td>
			</tr>
			{open && (
				<tr className="almonths">
					<td colSpan={8}>
						<div className="alchips">
							{g.items.map((x) => (
								<span key={x.name} className={"fpstate " + (Number(x.docstatus) === 1 ? "submitted" : "draft")}>
									{x.payroll_date.slice(0, 7)} · {rs(x.amount)}{Number(x.docstatus) === 0 ? " (draft)" : ""}
								</span>
							))}
						</div>
					</td>
				</tr>
			)}
		</>
	);
}
