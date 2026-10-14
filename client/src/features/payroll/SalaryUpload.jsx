import { useState } from "react";

import { downloadUploadList, loadUploadPeople, readUploadTable, saveUpload } from "@/api/salaryupload";
import {
	companyMethod, lineAction, planUpload, splitSaid, toSave, verifyUpload,
} from "@/lib/salaryupload";
import { lastMonth } from "@/lib/payrollrun";
import { Note, Panel, Scroll } from "@/components/ui";

/* SALARY SETUP → UPLOAD SALARIES (9 October 2026). One sheet: each person's
   actual salary, the part paid by bank and the part in cash, and their PF and
   ESI percentages. The rules — which structure a person gets, what is refused —
   are lib/salaryupload.js; this is the screen round them.

   Nothing is saved until HR has seen every row and said yes, and every row is
   read back off the site afterwards. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pc = (v) => (v > 0 ? `${v}%` : "—");

export default function SalaryUpload({ company, data, open, onToggle, onSaved }) {
	const [from, setFrom] = useState(`${lastMonth()}-01`);
	const [upload, setUpload] = useState(null);
	const [confirm, setConfirm] = useState(false);
	const [step, setStep] = useState("");
	const [prog, setProg] = useState(null);
	const [result, setResult] = useState(null);
	/* Not asked here (HR, 13 October 2026): the 5-tab Excel asks which EPF
	   calculation a file uses when it is downloaded, and asking twice gave two
	   answers to disagree. New structures follow the company's own, else
	   Calculation 1. */
	const fixed = companyMethod(data.structures || [], company);
	const method = fixed && fixed !== "mixed" ? fixed : "full";

	const plan = upload && upload.plan;
	const saving = toSave(plan);

	async function onFile(e) {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		setResult(null); setConfirm(false);
		setUpload({ busy: true, name: file.name });
		try {
			const [table, who] = await Promise.all([readUploadTable(file), loadUploadPeople()]);
			const p = planUpload(table, {
				company, people: who.people, bankFields: who.bankFields, method,
				assignments: data.assignments || [], structures: data.structures || [], comps: data.components || [],
			});
			setUpload({ name: file.name, plan: p, bankFields: who.bankFields });
		} catch (err) {
			setUpload({ name: file.name, plan: { ok: false, error: "That file could not be read — " + (err.message || err) } });
		}
	}

	async function onDownload() {
		const { people } = await loadUploadPeople();
		const mine = people.filter((p) => p.company === company && (!p.status || p.status === "Active"))
			.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
		await downloadUploadList(mine, data.assignments || [], company);
	}

	async function onSave() {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return setResult({ kind: "warn", text: "Choose the date the new salaries apply from." });
		setConfirm(false); setStep("starting"); setProg({ done: 0, total: 0 });
		const r = await saveUpload(plan, from, company, data.components || [], (text, done, total) => {
			setStep(text); setProg({ done, total });
		});
		const fresh = await onSaved();
		const { people } = await loadUploadPeople().catch(() => ({ people: [] }));
		const wrong = verifyUpload(r.made, { assignments: (fresh && fresh.assignments) || [], employees: people });
		setStep(""); setProg(null); setUpload(null);
		const parts = [];
		if (r.setupError) parts.push(r.setupError);
		if (r.made.length) parts.push(`${r.made.length} ${r.made.length === 1 ? "person is" : "people are"} saved.`);
		if (r.failed.length) parts.push(`Not saved: ${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}.`);
		if (wrong.length) parts.push(`Read back from the site and different: ${wrong.map((w) => `${w.name} ${w.text}`).join("; ")}.`);
		setResult({ kind: r.setupError || r.failed.length || wrong.length ? "warn" : "ok", text: parts.join(" ") || "Nothing needed saving." });
	}

	const comps = plan && plan.ok ? plan.components : [];
	const toMake = comps.filter((c) => !c.exists);
	const notCut = comps.filter((c) => c.exists && c.prorated === false);
	const newStructures = plan && plan.ok ? plan.structures.filter((x) => !x.exists) : [];

	return (
		<Panel title="Upload salaries — salary, bank and cash, PF and ESI" ico="⇪" shut={!open} onToggle={onToggle}>
			{!company && <Note className="warn">Pick a company in the top bar first.</Note>}
			{fixed === "mixed" && <Note className="warn">This company has salary structures under both EPF calculations. Settle that in Frappe before uploading more.</Note>}
			<div className="flds">
				<div className="fld">
					<label className="lab" htmlFor="su-up-from">New salaries apply from</label>
					<input id="su-up-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
				</div>
				<div className="fld wide">
					<label className="lab" htmlFor="su-up-file">The sheet (Excel or CSV)</label>
					<span className="fldrow">
						<input id="su-up-file" type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e)} />
						<button type="button" className="embtn" disabled={!company} onClick={() => void onDownload()}>Download the list to fill in</button>
					</span>
				</div>
			</div>

			{step && (() => {
				const pct = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
				return (
					<div className="suprog" role="status">
						<progress max={100} value={pct} aria-label="Saving salaries" />
						<p className="muted">
							Saving — <b>{pct}%</b>{prog && prog.total ? ` (${Math.min(prog.done, prog.total)} of ${prog.total})` : ""} — {step}…
						</p>
					</div>
				);
			})()}
			{result && <Note className={result.kind === "warn" ? "warn" : undefined}>{result.text}</Note>}
			{upload && upload.busy && <p className="muted">Reading {upload.name}…</p>}
			{plan && !plan.ok && <Note className="warn">{plan.error}</Note>}

			{plan && plan.ok && (
				<>
					<Note className={plan.problems.length ? "warn" : undefined}>
						<b>{upload.name}</b>: {saving.length} to save
						{plan.lines.length - saving.length ? `, ${plan.lines.length - saving.length} with nothing to change` : ""}
						{plan.problems.length ? `, ${plan.problems.length} left out` : ""}
						{plan.blank ? `, ${plan.blank} with no salary filled in` : ""}.
						{newStructures.length > 0 && <> New salary structures: {newStructures.map((x) => `${x.name} (${x.people})`).join(", ")}.</>}
						{toMake.length > 0 && <> The site has no {toMake.map((c) => c.name).join(" or ")} salary component, so {toMake.length === 1 ? "it" : "they"} will be made too.</>}
						{notCut.length > 0 && <> {notCut.map((c) => c.name).join(" and ")} on the site {notCut.length === 1 ? "is" : "are"} not cut for days not worked — check {notCut.length === 1 ? "it" : "them"} in Frappe before the salary run.</>}
						{!upload.bankFields && <> The site does not have the Bank share fields yet, so only all-bank and all-cash people can be recorded.</>}
						{plan.problems.length > 0 && (
							<ul className="sulist">
								{plan.problems.slice(0, 12).map((x) => <li key={x.row + x.text}>{x.text}</li>)}
								{plan.problems.length > 12 && <li>…and {plan.problems.length - 12} more.</li>}
							</ul>
						)}
					</Note>

					{plan.lines.length > 0 && (
						<Scroll>
							<table className="fptable" aria-label="Salaries in the sheet">
								<thead>
									<tr><th>Person</th><th>Actual salary</th><th>Bank and cash</th><th>PF</th><th>ESI</th><th>Salary structure</th><th>What happens</th></tr>
								</thead>
								<tbody>
									{plan.lines.map((l) => (
										<tr key={l.employee}>
											<td>{l.name}<small className="block muted">{l.code}</small></td>
											<td className="num">{rs(l.salary)}</td>
											<td>{splitSaid(l.split, l.salary)}</td>
											<td className="num">{pc(l.pf)}</td>
											<td className="num">{pc(l.esi)}</td>
											<td>{l.assign ? l.structure : (l.current && l.current.structure) || ""}</td>
											<td>
												{lineAction(l)}
												{l.notes.map((n) => <small key={n} className="block muted">{n}</small>)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Scroll>
					)}

					<div className="ctl prrow paygo">
						{saving.length === 0 ? (
							<button type="button" className="embtn" onClick={() => setUpload(null)}>Close</button>
						) : confirm ? (
							<>
								<button type="button" className="embtn pri" disabled={Boolean(step)} onClick={() => void onSave()}>
									Yes, save {saving.length}
								</button>
								<button type="button" className="embtn" onClick={() => setConfirm(false)}>Cancel</button>
							</>
						) : (
							<>
								<button type="button" className="embtn pri" onClick={() => setConfirm(true)}>Save {saving.length}</button>
								<button type="button" className="embtn" onClick={() => setUpload(null)}>Cancel</button>
							</>
						)}
					</div>
				</>
			)}
		</Panel>
	);
}
