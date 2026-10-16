import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { tidyDept, todayIso } from "@/lib/format";
import { MODES, assignLabel, candidates, checkBulk, hoursOf, shiftLabel, shiftsFor } from "@/lib/bulkshift";
import { assignShiftMany } from "@/api/shiftassign";
import { loadShiftWindows } from "@/api/attendance";
import { Modal, Scroll } from "@/components/ui";

/* Manage Shift → Assign shift (16 October 2026): tick the people, choose the
   shift, and each is given it. The rule is lib/bulkshift.js; the writes are
   api/shiftassign.js, the same ones a person's month makes. */

export default function AssignShift({ onClose }) {
	const s = useApp();
	const [q, setQ] = useState("");
	const [dept, setDept] = useState("");
	const [picked, setPicked] = useState(() => new Set());
	const [form, setForm] = useState({ shift: "", mode: "dates", from: todayIso(), to: "" });
	const [step, setStep] = useState(0);
	const [done, setDone] = useState(null);
	const [problem, setProblem] = useState("");
	/* Each shift's hours, read once and kept — the same read the roster uses. */
	useEffect(() => { void loadShiftWindows(); }, []);
	const windows = s.shiftWindows || {};
	const picks = hoursOf(windows[form.shift]);

	const people = scoped(s);
	const shown = candidates(people, { q, dept });
	const depts = [...new Set(candidates(people).map((e) => e.department).filter(Boolean))].sort();
	const chosen = people.filter((e) => picked.has(e.name));
	const shifts = shiftsFor(s.shiftTypes, chosen);
	const allShown = shown.length > 0 && shown.every((e) => picked.has(e.name));
	const busy = step > 0;

	const toggle = (name) => setPicked((p) => {
		const n = new Set(p);
		if (n.has(name)) n.delete(name); else n.add(name);
		return n;
	});
	const toggleShown = () => setPicked((p) => {
		const n = new Set(p);
		for (const e of shown) { if (allShown) n.delete(e.name); else n.add(e.name); }
		return n;
	});

	async function assign() {
		const why = checkBulk({ picked: chosen, ...form }, s.shiftTypes);
		if (why) { setProblem(why); return; }
		setProblem(""); setDone(null);
		const r = await assignShiftMany(chosen, form, setStep);
		setStep(0);
		setDone(r);
		/* Only the ones that went in are untouched; a refused person stays ticked
		   so trying again is one press. */
		setPicked(new Set(r.results.filter((x) => !x.ok).map((x) => x.emp.name)));
	}

	const body = (
		<div className="bshift">
			<div className="bshbar">
				<label className="lbl">Search
					<input type="search" aria-label="Search people" value={q} placeholder="name, code or designation"
						onChange={(e) => setQ(e.target.value)} />
				</label>
				<label className="lbl">Department
					<select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
						<option value="">All</option>
						{depts.map((d) => <option key={d} value={d}>{tidyDept(d)}</option>)}
					</select>
				</label>
				<span className="bshn">{picked.size} ticked</span>
			</div>

			<Scroll>
				<table className="bshtable">
					<thead>
						<tr>
							<th className="bshtick">
								<input type="checkbox" aria-label="Tick everybody shown" checked={allShown} disabled={!shown.length || busy}
									onChange={toggleShown} />
							</th>
							<th>Employee</th><th>Department</th><th>Working time</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((e) => (
							<tr key={e.name} className={picked.has(e.name) ? "on" : undefined}>
								<td className="bshtick">
									<input type="checkbox" aria-label={`Tick ${e.employee_name}`} checked={picked.has(e.name)} disabled={busy}
										onChange={() => toggle(e.name)} />
								</td>
								<td>{e.employee_name}<small className="block muted">{e.employee_number || e.name}</small></td>
								<td className="muted">{tidyDept(e.department) || "—"}</td>
								<td className="muted">{e.default_shift ? shiftLabel(e.default_shift, windows) : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>
			{!shown.length ? <p className="muted">Nobody matches.</p> : null}

			<div className="flds bshform">
				<div className="fld">
					<label className="lab" htmlFor="bsh-shift">Shift</label>
					<select id="bsh-shift" value={form.shift} disabled={busy} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
						<option value="">Choose…</option>
						{shifts.map((t) => <option key={t.name} value={t.name}>{shiftLabel(t.name, windows)}</option>)}
					</select>
					{picks ? <span className="bshhours">{picks}</span> : null}
				</div>
				<div className="fld wide" role="radiogroup" aria-label="How">
					<span className="lab">How</span>
					{MODES.map((m) => (
						<label key={m.key} className="block">
							<input type="radio" name="bsh-mode" checked={form.mode === m.key} disabled={busy}
								onChange={() => setForm({ ...form, mode: m.key })} /> {m.label}
						</label>
					))}
				</div>
				{form.mode === "dates" ? (
					<>
						<div className="fld">
							<label className="lab" htmlFor="bsh-from">From</label>
							<input id="bsh-from" type="date" value={form.from} disabled={busy} onChange={(e) => setForm({ ...form, from: e.target.value })} />
						</div>
						<div className="fld">
							<label className="lab" htmlFor="bsh-to">To (blank = ongoing)</label>
							<input id="bsh-to" type="date" value={form.to} disabled={busy} onChange={(e) => setForm({ ...form, to: e.target.value })} />
						</div>
					</>
				) : null}
			</div>

			{problem ? <p className="bsherr" role="alert">{problem}</p> : null}
			{busy ? <p className="muted">Assigning {step} of {chosen.length}…</p> : null}
			{done ? (
				<div className="bshdone" role="status">
					<b>{done.ok} of {done.results.length} assigned.</b>
					<ul>
						{done.results.map((x) => (
							<li key={x.emp.name} className={x.ok ? "ok" : "bad"}>
								<b>{x.emp.employee_name}</b>: {x.msg}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);

	return (
		<Modal title="Assign shift" wide extra={body} onClose={busy ? () => {} : onClose}
			foot={(
				<button type="button" className="btn tpl" disabled={busy || !picked.size} onClick={() => void assign()}>
					{busy ? "Assigning…" : assignLabel(picked.size, form.mode)}
				</button>
			)} />
	);
}
