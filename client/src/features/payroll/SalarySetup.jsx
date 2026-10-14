import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { assignStructure, createStructure, loadSetup } from "@/api/salarysetup";
import { periodOf } from "@/lib/payroll";
import {
	HOW, basicAbbrMissing, checkAssign, checkStructure, lineSaid, needsStructure, newLine, structureComponents,
} from "@/lib/salarysetup";
import { lastMonth } from "@/lib/payrollrun";
import { deskUrl } from "@/lib/desk";
import { payRows } from "@/features/payroll/shared";
import SalaryUpload from "@/features/payroll/SalaryUpload";
import { Desk, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* PAYROLL → SALARY SETUP. Ours, 2 October 2026 — where payroll starts.

   hrms leaves anybody without a Salary Structure Assignment off the salary run
   without a word, so the first job on a new site is to say, once, what a slip
   is made of and give each person a structure and a base pay. Two steps: make a
   structure (HR types the rates — none is chosen here), then tick people, type
   their base pay and give it to them. Both documents are hrms's own, made and
   submitted; hrms checks them on the site.

   **Nothing here picks a rate or works out a wage.** Whatever is typed is what
   is stored.

   Above both, since 9 October 2026, one sheet does the two steps at once for
   everybody — salary, bank and cash, PF and ESI (features/payroll/SalaryUpload.jsx).
   It replaced the base-pay-only upload that used to sit in step 2. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function SalarySetup() {
	const s = useApp();
	const { company, site } = s;

	const [data, setData] = useState({ components: undefined, structures: undefined, assignments: undefined });
	const [msg, setMsg] = useState(null);
	const [busy, setBusy] = useState("");
	const [confirm, setConfirm] = useState("");
	const [folded, setFolded] = useState({});

	const [form, setForm] = useState({ name: "", earnings: [newLine("Basic")], deductions: [] });
	const [pick, setPick] = useState({ structure: "", from: `${lastMonth()}-01`, bulk: "" });
	const [ticks, setTicks] = useState({});
	const [bases, setBases] = useState({});
	const [find, setFind] = useState("");

	const end = periodOf(lastMonth()).iso[1];
	const read = async () => {
		const d = await loadSetup(company);
		setData(d);
		return d;
	};
	useEffect(() => {
		let live = true;
		setData({ components: undefined, structures: undefined, assignments: undefined });
		loadSetup(company).then((d) => { if (live) setData(d); });
		return () => { live = false; };
	}, [company]);

	const comps = structureComponents(data.components);
	const structures = data.structures || [];
	const people = payRows(s);
	const waiting = useMemo(
		() => needsStructure(people, data.assignments || [], end, company),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[data.assignments, s.employees, company, end],
	);
	const shown = waiting.filter((p) => !find || `${p.employee_name} ${p.name} ${p.department || ""}`.toLowerCase().includes(find.toLowerCase()));
	const assigned = (data.assignments || []).slice().sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const chosen = waiting.filter((p) => ticks[p.name]);
	const say = (kind, text) => setMsg({ kind, text });
	const reading = data.structures === undefined;

	const setLine = (list, i, patch) => setForm({ ...form, [list]: form[list].map((l, j) => (j === i ? { ...l, ...patch } : l)) });
	const dropLine = (list, i) => setForm({ ...form, [list]: form[list].filter((_, j) => j !== i) });
	const addLine = (list) => setForm({ ...form, [list]: [...form[list], newLine("")] });

	const problem = checkStructure({ ...form, company });

	async function onStructure() {
		const p = checkStructure({ ...form, company });
		if (p) return say("warn", p);
		if (basicAbbrMissing(form, data.components)) return say("warn", "The Basic salary component has no abbreviation on the site, so a % of Basic cannot be worked out.");
		setBusy("structure"); setMsg(null);
		try {
			const name = await createStructure({ ...form, company }, data.components);
			say("ok", `${name} is made. Now give it to the people below.`);
			setPick({ ...pick, structure: name });
			setForm({ name: "", earnings: [newLine("Basic")], deductions: [] });
		} catch (e) {
			say("warn", e.message || String(e));
		}
		setConfirm("");
		await read();
		setBusy("");
	}

	const rows = chosen.map((p) => ({ employee: p.name, name: p.employee_name, base: bases[p.name] }));
	async function onAssign() {
		const p = checkAssign({ structure: pick.structure, from: pick.from, rows });
		if (p) return say("warn", p);
		setBusy("assign"); setMsg(null);
		const r = await assignStructure(rows, pick.structure, pick.from, company);
		setTicks({}); setConfirm("");
		await read();
		setBusy("");
		say(r.failed.length ? "warn" : "ok", r.failed.length
			? `${r.made.length} done. Not done: ${r.failed.map((f) => `${f.name} — ${f.error}`).join("; ")}`
			: `${r.made.length} ${r.made.length === 1 ? "person has" : "people have"} a salary structure now and will be on the salary run.`);
	}

	const fillBulk = () => {
		const next = { ...bases };
		for (const p of chosen) next[p.name] = pick.bulk;
		setBases(next);
	};
	const allTicked = shown.length > 0 && shown.every((p) => ticks[p.name]);
	const tickAll = (on) => {
		const next = { ...ticks };
		for (const p of shown) next[p.name] = on;
		setTicks(next);
	};

	const LineEditor = ({ list, title, options }) => (
		<fieldset className={"sufield " + list}>
			<legend><b>{title}</b></legend>
			{form[list].map((l, i) => (
				<div className="ctl suline" key={list + i}>
					<label className="sr-only" htmlFor={`su-${list}-c${i}`}>Component</label>
					<select id={`su-${list}-c${i}`} className="comp" value={l.component} onChange={(e) => setLine(list, i, { component: e.target.value })}>
						<option value="">Choose…</option>
						{options.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
					</select>
					<label className="sr-only" htmlFor={`su-${list}-h${i}`}>How it is worked out</label>
					<select id={`su-${list}-h${i}`} className="how" value={l.how} onChange={(e) => setLine(list, i, { how: e.target.value })}>
						{HOW.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
					</select>
					<label className="sr-only" htmlFor={`su-${list}-v${i}`}>Value</label>
					<input id={`su-${list}-v${i}`} className="val" type="number" inputMode="decimal" min="0" step="0.01" placeholder={l.how === "fixed" ? "₹" : "%"} value={l.value}
						onChange={(e) => setLine(list, i, { value: e.target.value })} />
					<button type="button" className="embtn drop" aria-label={`Remove ${l.component || "line"}`} onClick={() => dropLine(list, i)}>Remove</button>
					<span className="hint">{lineSaid(l)}</span>
				</div>
			))}
			<button type="button" className="embtn suadd" onClick={() => addLine(list)}>+ Add {list === "earnings" ? "an earning" : "a deduction"}</button>
		</fieldset>
	);

	const open = (id, dflt) => (folded[id] === undefined ? dflt : !folded[id]);
	const toggle = (id, dflt) => () => setFolded({ ...folded, [id]: open(id, dflt) });

	return (
		<div className="paypage susetup">
			<div className="emhead">
				<h2>Salary Setup</h2>
				<span className="n">{company || "pick a company"}</span>
				<span className="right">
					<button type="button" className="embtn" onClick={() => void read()}>Refresh</button>
				</span>
			</div>

			<Tiles>
				<Tile k="People" n={people.length} s={company || "all companies"} />
				<Tile k="Have a structure" n={reading ? "…" : people.length - waiting.length} />
				<Tile k="Still to set up" n={reading ? "…" : waiting.length} s={waiting.length ? "not on the salary run" : ""} />
				<Tile k="Structures" n={reading ? "…" : structures.length} />
			</Tiles>

			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}
			{!company && <Note className="warn">Pick a company in the top bar. A salary structure belongs to one company, and so does everybody you give it to.</Note>}
			{data.structures === null && <Note className="warn">This login may not read salary structures on the site — it needs HR Manager.</Note>}

			<SalaryUpload company={company} data={data} open={open("upload", true)} onToggle={toggle("upload", true)} onSaved={read} />

			<Panel title={`1. Salary structure — ${structures.length ? `${structures.length} made` : "none yet"}`} ico="▦"
				shut={!open("structure", structures.length === 0)} onToggle={toggle("structure", structures.length === 0)}>
				{structures.length > 0 && (
					<p>
						{structures.map((x) => x.name).join(", ")}.{" "}
						<Desk href={site && deskUrl(site, "Salary Structure")} label="Salary Structures in Frappe">Open in Frappe</Desk>
					</p>
				)}
				<div className="flds">
					<div className="fld wide">
						<label className="lab" htmlFor="su-name">Name of the structure</label>
						<input id="su-name" type="text" placeholder="e.g. Staff Monthly" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
					</div>
				</div>
				<div className="sulists">
					{LineEditor({ list: "earnings", title: "Earnings", options: comps.earnings })}
					{LineEditor({ list: "deductions", title: "Deductions", options: comps.deductions })}
				</div>
				<div className="ctl prrow paygo">
					{confirm === "structure" ? (
						<>
							<button type="button" className="embtn pri" disabled={busy === "structure"} onClick={() => void onStructure()}>
								{busy === "structure" ? "Making…" : `Yes, make ${form.name.trim()}`}
							</button>
							<button type="button" className="embtn" onClick={() => setConfirm("")}>Cancel</button>
						</>
					) : (
						<button type="button" className="embtn pri" onClick={() => (problem ? say("warn", problem) : setConfirm("structure"))}>
							Make the structure
						</button>
					)}
				</div>
			</Panel>

			<Panel title={`2. Give people their salary — ${reading ? "reading…" : waiting.length ? `${waiting.length} still to do` : "everybody has one"}`} ico="👥"
				shut={!open("assign", structures.length > 0)} onToggle={toggle("assign", structures.length > 0)}>
				{structures.length === 0 && <p className="muted">Make a salary structure above first.</p>}
				{waiting.length === 0 && !reading && <p>Everybody in {company || "the group"} has a salary structure.</p>}
				{waiting.length > 0 && structures.length > 0 && (
					<>
						<div className="flds">
							<div className="fld">
								<label className="lab" htmlFor="su-struct">Structure</label>
								<select id="su-struct" value={pick.structure} onChange={(e) => setPick({ ...pick, structure: e.target.value })}>
									<option value="">Choose…</option>
									{structures.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
								</select>
							</div>
							<div className="fld">
								<label className="lab" htmlFor="su-from">Applies from</label>
								<input id="su-from" type="date" value={pick.from} onChange={(e) => setPick({ ...pick, from: e.target.value })} />
							</div>
							<div className="fld">
								<label className="lab" htmlFor="su-find">Find</label>
								<input id="su-find" type="search" placeholder="name, code or department" value={find} onChange={(e) => setFind(e.target.value)} />
							</div>
						</div>
						<div className="ctl prcallout subulk">
							<div className="fld">
								<label className="lab" htmlFor="su-bulk">Same base pay for the ticked</label>
								<span className="fldrow">
									<input id="su-bulk" type="number" inputMode="decimal" min="0" step="0.01" placeholder="₹ a month" value={pick.bulk} onChange={(e) => setPick({ ...pick, bulk: e.target.value })} />
									<button type="button" className="embtn" disabled={!chosen.length || !pick.bulk} onClick={fillBulk}>Fill</button>
								</span>
							</div>
						</div>
						<Scroll>
							<table className="fptable sutable" aria-label="People without a salary structure">
								<thead>
									<tr>
										<th className="tick"><input type="checkbox" aria-label="Tick everybody shown" checked={allTicked} onChange={(e) => tickAll(e.target.checked)} /></th>
										<th>Person</th><th>Department</th><th>Joined</th><th>Base pay ₹ a month</th>
									</tr>
								</thead>
								<tbody>
									{shown.map((p) => (
										<tr key={p.name}>
											<td className="tick"><input type="checkbox" aria-label={`Tick ${p.employee_name}`} checked={Boolean(ticks[p.name])} onChange={(e) => setTicks({ ...ticks, [p.name]: e.target.checked })} /></td>
											<td>{p.employee_name}<small className="block muted">{p.employee_number || p.name}</small></td>
											<td>{p.department || ""}</td>
											<td>{p.date_of_joining || ""}</td>
											<td>
												<label className="sr-only" htmlFor={`su-base-${p.name}`}>Base pay for {p.employee_name}</label>
												<input id={`su-base-${p.name}`} className="base" type="number" inputMode="decimal" min="0" step="0.01" value={bases[p.name] || ""}
													onChange={(e) => setBases({ ...bases, [p.name]: e.target.value, })} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Scroll>
						<div className="ctl prrow paygo">
							{confirm === "assign" ? (
								<>
									<button type="button" className="embtn pri" disabled={busy === "assign"} onClick={() => void onAssign()}>
										{busy === "assign" ? "Giving…" : `Yes, give it to ${chosen.length}`}
									</button>
									<button type="button" className="embtn" onClick={() => setConfirm("")}>Cancel</button>
								</>
							) : (
								<button type="button" className="embtn pri" onClick={() => {
									const p = checkAssign({ structure: pick.structure, from: pick.from, rows });
									return p ? say("warn", p) : setConfirm("assign");
								}}>
									Give the structure to {chosen.length || "the ticked"}
								</button>
							)}
							<span className="hint">{chosen.length} ticked.</span>
						</div>
					</>
				)}
			</Panel>

			<Panel title={`Already set up — ${assigned.length}`} ico="✔" shut={!open("done", false)} onToggle={toggle("done", false)}>
				{assigned.length === 0 ? <p className="muted">Nobody yet.</p> : (
					<Scroll>
						<table className="fptable" aria-label="People with a salary structure">
							<thead><tr><th>Person</th><th>Structure</th><th>From</th><th>Base pay</th></tr></thead>
							<tbody>
								{assigned.map((a) => (
									<tr key={a.name}>
										<td>{a.employee_name || a.employee}</td><td>{a.salary_structure}</td><td>{a.from_date}</td><td className="num">{rs(a.base)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				)}
			</Panel>
		</div>
	);
}
