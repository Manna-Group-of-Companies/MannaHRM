import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { readUploadTable } from "@/api/salaryupload";
import { downloadBonusList, loadBonusPeople, loadBonusRows, saveBonus } from "@/api/festivalbonus";
import { loadBankDetails } from "@/api/banksheet";
import { loadCompanyInfo } from "@/api/salarysheet";
import { bonusAsSlips, bonusOccasions, bonusToSave, checkBonusOccasion, planBonus, verifyBonus } from "@/lib/festivalbonus";
import { bankSheet } from "@/lib/banksheet";
import { bankSheetXlsx } from "@/lib/banksheetxlsx";
import { todayIso } from "@/lib/format";
import RecordList from "@/features/records/RecordList";
import { Note, Panel, Scroll } from "@/components/ui";

/* PAYROLL → FESTIVAL BONUS (22 October 2026, asked for by HR). A festival's
   bonuses, uploaded as HR's sheet, previewed and saved as Employee Festival
   Bonus rows; a bank sheet for any festival already given; the list of them
   under it. **Paid apart from the salary** — no salary slip reads these. The
   rules are lib/festivalbonus.js. Nothing is saved until HR has seen every row
   and said yes, and every row is read back afterwards. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const SAID = { new: "new", update: "change", same: "no change" };
const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function FestivalBonus() {
	const { company } = useApp();
	const [open, setOpen] = useState(true);
	const [bankOpen, setBankOpen] = useState(true);
	const [festival, setFestival] = useState("");
	const [date, setDate] = useState(todayIso);
	const [upload, setUpload] = useState(null);
	const [confirm, setConfirm] = useState(false);
	const [step, setStep] = useState("");
	const [result, setResult] = useState(null);
	const [listKey, setListKey] = useState(0);
	const [given, setGiven] = useState(undefined);
	const [pick, setPick] = useState("");
	const [bankMsg, setBankMsg] = useState("");

	const plan = upload && upload.plan;
	const saving = bonusToSave(plan);
	const occasion = { festival: festival.trim(), date };
	const occasionWhy = checkBonusOccasion(occasion);

	useEffect(() => {
		let live = true;
		setGiven(undefined);
		loadBonusRows(company).then((r) => { if (live) setGiven(r); }, () => { if (live) setGiven(null); });
		return () => { live = false; };
	}, [company, listKey]);
	const occasions = useMemo(() => bonusOccasions(given || []), [given]);
	const chosen = occasions.find((o) => o.key === pick) || occasions[0] || null;

	async function onFile(e) {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		setResult(null); setConfirm(false);
		setUpload({ busy: true, name: file.name });
		try {
			const [table, people, existing] = await Promise.all([readUploadTable(file), loadBonusPeople(), loadBonusRows("")]);
			setUpload({ name: file.name, plan: planBonus(table, { people, existing, company, ...occasion }) });
		} catch (err) {
			setUpload({ name: file.name, plan: { ok: false, error: "That file could not be read — " + (err.message || err) } });
		}
	}

	async function onDownload() {
		const [people, existing] = await Promise.all([loadBonusPeople(), loadBonusRows(company)]);
		const mine = people.filter((p) => p.company === company && (!p.status || p.status === "Active"))
			.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
		await downloadBonusList(mine, existing, company, occasion);
	}

	async function onSave() {
		setConfirm(false); setStep("starting");
		const r = await saveBonus(saving, setStep);
		const after = await loadBonusRows("").catch(() => []);
		const wrong = verifyBonus(r.made, after);
		setStep(""); setUpload(null); setListKey((k) => k + 1);
		const parts = [];
		if (r.made.length) parts.push(`${r.made.length} ${r.made.length === 1 ? "bonus is" : "bonuses are"} saved.`);
		if (r.failed.length) parts.push(`Not saved: ${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}.`);
		if (wrong.length) parts.push(`Read back from the site and different: ${wrong.map((w) => `${w.name} ${w.text}`).join("; ")}.`);
		setResult({ kind: r.failed.length || wrong.length ? "warn" : "ok", text: parts.join(" ") || "Nothing needed saving." });
	}

	async function onBankSheet() {
		setBankMsg("");
		try {
			const [emps, info] = await Promise.all([loadBankDetails(company), loadCompanyInfo(company)]);
			const sheet = bankSheet(bonusAsSlips(given, chosen), emps);
			await bankSheetXlsx(sheet, {
				ym: chosen.date.slice(0, 7), company, info,
				title: `${chosen.festival.toUpperCase()} BONUS — ${chosen.date.split("-").reverse().join("-")}`,
				amountHead: "Bonus",
				filename: `bonus-${slug(chosen.festival)}-${slug(company || "group")}-${chosen.date}.xlsx`,
			});
		} catch (e) {
			setBankMsg("The Excel file could not be made: " + (e.message || e));
		}
	}

	const chosenRows = bonusAsSlips(given, chosen);
	const chosenTotal = chosenRows.reduce((t, r) => t + Number(r.net_pay || 0), 0);

	return (
		<>
			<Panel title="Upload festival bonus" ico="⇪" shut={!open} onToggle={() => setOpen(!open)}>
				{!company && <Note className="warn">Pick a company in the top bar first.</Note>}
				<div className="flds">
					<div className="fld">
						<label className="lab" htmlFor="fb-festival">Festival</label>
						<input id="fb-festival" type="text" placeholder="e.g. Onam 2026" value={festival} onChange={(e) => { setFestival(e.target.value); setUpload(null); }} />
					</div>
					<div className="fld">
						<label className="lab" htmlFor="fb-date">Bonus date</label>
						<input id="fb-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setUpload(null); }} />
					</div>
					<div className="fld wide">
						<label className="lab" htmlFor="fb-file">The sheet (Excel or CSV)</label>
						<span className="fldrow">
							<input id="fb-file" type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e)} />
							<button type="button" className="embtn" disabled={!company || Boolean(occasionWhy)} onClick={() => void onDownload()}>Download the list to fill in</button>
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
							{plan.blank ? `, ${plan.blank} with no bonus filled in` : ""}.
							{plan.problems.length > 0 && (
								<ul className="sulist">
									{plan.problems.slice(0, 12).map((x) => <li key={x.row + x.text}>{x.text}</li>)}
									{plan.problems.length > 12 && <li>…and {plan.problems.length - 12} more.</li>}
								</ul>
							)}
						</Note>

						{plan.lines.length > 0 && (
							<Scroll>
								<table className="fptable stacktbl" aria-label="Bonuses in the sheet">
									<thead>
										<tr><th>Person</th><th>Bonus</th><th>On the site now</th><th>What happens</th></tr>
									</thead>
									<tbody>
										{plan.lines.map((l) => (
											<tr key={l.employee}>
												<td className="stackhead" data-label="">{l.name}<small className="block muted">{l.code}</small></td>
												<td className="num" data-label="Bonus">{rs(l.amount)}</td>
												<td className="num" data-label="On the site now">{l.existing ? rs(l.existing.amount) : "—"}</td>
												<td data-label="What happens">{SAID[l.action]}</td>
											</tr>
										))}
									</tbody>
									<tfoot>
										<tr><td><b>Total</b></td><td className="num"><b>{rs(plan.lines.reduce((t, l) => t + l.amount, 0))}</b></td><td /><td /></tr>
									</tfoot>
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

			<Panel title="Bank sheet for a festival" ico="🏦" shut={!bankOpen} onToggle={() => setBankOpen(!bankOpen)}>
				{given === null && <Note className="warn">The bonuses could not be read from the site.</Note>}
				{given && !occasions.length && <p className="muted">No festival bonus yet.</p>}
				{occasions.length > 0 && (
					<div className="flds">
						<div className="fld wide">
							<label className="lab" htmlFor="fb-occasion">Festival</label>
							<span className="fldrow">
								<select id="fb-occasion" value={chosen ? chosen.key : ""} onChange={(e) => setPick(e.target.value)}>
									{occasions.map((o) => <option key={o.key} value={o.key}>{o.festival} — {o.date}</option>)}
								</select>
								<button type="button" className="embtn pri" disabled={!chosenRows.length} onClick={() => void onBankSheet()}>Download bank sheet</button>
							</span>
						</div>
					</div>
				)}
				{chosen && <p className="muted">{chosenRows.length} {chosenRows.length === 1 ? "person" : "people"} · {rs(chosenTotal)}</p>}
				{bankMsg && <Note className="warn">{bankMsg}</Note>}
			</Panel>

			<RecordList key={listKey} doctype="Employee Festival Bonus" title="Festival Bonus" stack />
		</>
	);
}
