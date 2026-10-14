import { useState } from "react";

import { useApp } from "@/store";
import { readUploadTable } from "@/api/salaryupload";
import { downloadActualList, loadActualPeople, loadActualRows, saveActual } from "@/api/actualsalary";
import { actualToSave, planActual, verifyActual } from "@/lib/actualsalary";
import { lastMonth } from "@/lib/payrollrun";
import RecordList from "@/features/records/RecordList";
import { Note, Panel, Scroll } from "@/components/ui";

/* PAYROLL → ACTUAL SALARY (14 October 2026). HR's sheet of actual salaries,
   uploaded, previewed and saved as Employee Actual Salary rows; the list of
   them under it. The rules are lib/actualsalary.js. Nothing is saved until HR
   has seen every row and said yes, and every row is read back afterwards. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const SAID = { new: "new", update: "change", same: "no change" };

export default function ActualSalary() {
	const { company } = useApp();
	const [open, setOpen] = useState(true);
	const [from, setFrom] = useState(`${lastMonth()}-01`);
	const [upload, setUpload] = useState(null);
	const [confirm, setConfirm] = useState(false);
	const [step, setStep] = useState("");
	const [result, setResult] = useState(null);
	const [listKey, setListKey] = useState(0);

	const plan = upload && upload.plan;
	const saving = actualToSave(plan);

	async function onFile(e) {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		setResult(null); setConfirm(false);
		setUpload({ busy: true, name: file.name });
		try {
			const [table, people, existing] = await Promise.all([readUploadTable(file), loadActualPeople(), loadActualRows("")]);
			setUpload({ name: file.name, plan: planActual(table, { people, existing, company, defaultFrom: from }) });
		} catch (err) {
			setUpload({ name: file.name, plan: { ok: false, error: "That file could not be read — " + (err.message || err) } });
		}
	}

	async function onDownload() {
		const [people, existing] = await Promise.all([loadActualPeople(), loadActualRows(company)]);
		const mine = people.filter((p) => p.company === company && (!p.status || p.status === "Active"))
			.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
		await downloadActualList(mine, existing, company);
	}

	async function onSave() {
		setConfirm(false); setStep("starting");
		const r = await saveActual(saving, setStep);
		const after = await loadActualRows("").catch(() => []);
		const wrong = verifyActual(r.made, after);
		setStep(""); setUpload(null); setListKey((k) => k + 1);
		const parts = [];
		if (r.made.length) parts.push(`${r.made.length} ${r.made.length === 1 ? "actual salary is" : "actual salaries are"} saved.`);
		if (r.failed.length) parts.push(`Not saved: ${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}.`);
		if (wrong.length) parts.push(`Read back from the site and different: ${wrong.map((w) => `${w.name} ${w.text}`).join("; ")}.`);
		setResult({ kind: r.failed.length || wrong.length ? "warn" : "ok", text: parts.join(" ") || "Nothing needed saving." });
	}

	return (
		<>
			<Panel title="Upload actual salaries" ico="⇪" shut={!open} onToggle={() => setOpen(!open)}>
				{!company && <Note className="warn">Pick a company in the top bar first.</Note>}
				<div className="flds">
					<div className="fld">
						<label className="lab" htmlFor="as-from">From Date for rows without one</label>
						<input id="as-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
					</div>
					<div className="fld wide">
						<label className="lab" htmlFor="as-file">The sheet (Excel or CSV)</label>
						<span className="fldrow">
							<input id="as-file" type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e)} />
							<button type="button" className="embtn" disabled={!company} onClick={() => void onDownload()}>Download the list to fill in</button>
						</span>
					</div>
				</div>

				{step && <p className="muted">Saving — {step}…</p>}
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
							{plan.problems.length > 0 && (
								<ul className="sulist">
									{plan.problems.slice(0, 12).map((x) => <li key={x.row + x.text}>{x.text}</li>)}
									{plan.problems.length > 12 && <li>…and {plan.problems.length - 12} more.</li>}
								</ul>
							)}
						</Note>

						{plan.lines.length > 0 && (
							<Scroll>
								<table className="fptable stacktbl" aria-label="Actual salaries in the sheet">
									<thead>
										<tr><th>Person</th><th>From Date</th><th>Actual salary</th><th>On the site now</th><th>What happens</th></tr>
									</thead>
									<tbody>
										{plan.lines.map((l) => (
											<tr key={`${l.employee}|${l.from}`}>
												<td className="stackhead" data-label="">{l.name}<small className="block muted">{l.code}</small></td>
												<td data-label="From Date">{l.from}</td>
												<td className="num" data-label="Actual salary">{rs(l.salary)}</td>
												<td className="num" data-label="On the site now">{l.existing ? rs(l.existing.salary) : "—"}</td>
												<td data-label="What happens">{SAID[l.action]}</td>
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
									<button type="button" className="embtn pri" disabled={Boolean(step)} onClick={() => void onSave()}>Yes, save {saving.length}</button>
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
			<RecordList key={listKey} doctype="Employee Actual Salary" title="Actual Salary" stack />
		</>
	);
}
