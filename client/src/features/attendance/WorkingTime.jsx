import { useEffect, useState } from "react";

import { useApp } from "@/store";
import { apiWrite } from "@/api/client";
import { load } from "@/api/load";
import { loadShiftWindows } from "@/api/attendance";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept } from "@/lib/format";
import { changesFor, isSupervisor, shiftChoices, shiftText, shiftsFor } from "@/lib/worktime";
import { Empty, Note, Scroll } from "@/components/ui";
import ShiftWizard, { openShiftWizard } from "@/features/attendance/ShiftWizard";
import { set } from "@/store";

/* ---------------------------------------------------------------------------
   Attendance → Employee Working Time (16 September 2026).

   Pick the company, tick people, pick the working time, Apply. Each company
   keeps its own times: the list of shifts leads with the ones that company's
   people already use, and New working time opens the same Shift Type form as
   Manage Shift, so a time made for one company is named for it there.

   What it writes is `Employee.default_shift`, one PUT per person, as the person
   signed in — whether they may is their roles on the site (HR User / HR
   Manager), and the company login can only touch its own company because its
   User Permission says so. Past days hrms has already marked keep the shift
   they were marked with; the new time applies from the next day the shift job
   processes.
   --------------------------------------------------------------------------- */

export default function WorkingTime() {
	const s = useApp();
	const companies = (s.companies || []).map((c) => c.name);
	const [company, setCompany] = useState(s.company || "");
	const [q, setQ] = useState("");
	const [picked, setPicked] = useState(() => new Set());
	const [shift, setShift] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState({ text: "", bad: false });

	useEffect(() => { void loadShiftWindows(); }, [s.shiftWindowState]);
	useEffect(() => { if (s.company) setCompany(s.company); }, [s.company]);

	const people = scoped(s)
		.filter((e) => e.status === "Active" && (!company || e.company === company))
		.filter((e) => !q.trim() || `${e.employee_name} ${e.employee_number || ""} ${e.department || ""} ${e.default_shift || ""}`
			.toLowerCase().includes(q.trim().toLowerCase()))
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
	const shifts = shiftsFor(company, s.employees, s.shiftTypes);
	const todo = changesFor(people, picked, shift);
	const allOn = people.length > 0 && people.every((e) => picked.has(e.name));

	const toggle = (name) => setPicked((was) => {
		const next = new Set(was);
		if (next.has(name)) next.delete(name); else next.add(name);
		return next;
	});

	async function apply(list, to) {
		if (!list.length) return;
		setBusy(true);
		setMsg({ text: "", bad: false });
		const refused = [];
		let done = 0;
		for (const e of list) {
			const r = await apiWrite("Employee", e.name, { default_shift: to || null });
			if (r.ok) done++;
			else refused.push(`${e.employee_name}: ${r.error}`);
		}
		await load();
		setBusy(false);
		setPicked(new Set());
		setMsg({
			bad: refused.length > 0,
			text: `${fmt(done)} ${done === 1 ? "person" : "people"} now on ${to ? shiftText(to, s.shiftWindows) : "no working time"}.`
				+ (refused.length ? ` Refused by the site — ${refused.slice(0, 5).join("; ")}${refused.length > 5 ? ` and ${refused.length - 5} more` : ""}.` : ""),
		});
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">Employee Working Time</b>
				<span className="cov live">{fmt(people.length)} people</span>
				<span>Choose the company, tick people, pick their working time and Apply. Every company keeps its own times.</span>
			</div>

			<div className="embar">
				<label className="inline"><span>Company</span>
					<select value={company} onChange={(e) => { setCompany(e.target.value); setPicked(new Set()); setShift(""); }}>
						{companies.length > 1 ? <option value="">Every company</option> : null}
						{companies.map((c) => <option key={c} value={c}>{c}</option>)}
					</select>
				</label>
				<label className="inline"><span>Search</span>
					<input type="search" value={q} placeholder="Name, code, department, shift" onChange={(e) => setQ(e.target.value)} />
				</label>
				<span className="grow" />
				<button type="button" className="embtn" onClick={() => openShiftWizard()}>+ New working time</button>
			</div>

			{/* The company's working times, with how many of its people are on each. */}
			<div className="rgkey">
				{shifts.filter((x) => x.people || !company).slice(0, 12).map((x) => (
					<span key={x.name}>
						<b className="rgc full">{fmt(x.people)}</b>
						{shiftText(x.name, s.shiftWindows)}
						<button type="button" className="embtn ic" title="Change this working time's hours"
							aria-label={`Edit ${x.name}`} onClick={() => openShiftWizard(x.name)}>✎</button>
					</span>
				))}
				{company && !shifts.some((x) => x.people) ? <span>Nobody at {company} has a working time yet.</span> : null}
			</div>

			<div className="embar">
				<b>{fmt(picked.size)} ticked</b>
				<label className="inline"><span>Set working time to</span>
					<select value={shift} onChange={(e) => setShift(e.target.value)} aria-label="Working time to apply">
						<option value="">— choose —</option>
						{shifts.map((x) => (
							<option key={x.name} value={x.name}>
								{shiftText(x.name, s.shiftWindows)}{x.people ? ` — ${x.people} here` : ""}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="btn tpl" disabled={busy || !shift || !todo.length}
					onClick={() => apply(todo, shift)}>
					{busy ? "Saving…" : `Apply to ${fmt(todo.length)}`}
				</button>
				{picked.size ? <button type="button" className="embtn" disabled={busy} onClick={() => setPicked(new Set())}>Clear</button> : null}
			</div>

			{msg.text ? <div className={msg.bad ? "deerr" : "note"} role="status">{msg.text}</div> : null}

			{people.length ? (
				<Scroll>
					<table>
						<thead>
							<tr>
								<th><input type="checkbox" aria-label="Tick everybody shown" checked={allOn}
									onChange={() => setPicked(allOn ? new Set() : new Set(people.map((e) => e.name)))} /></th>
								<th>Emp Code</th><th>Name</th><th>Company</th><th>Department</th><th>Designation</th>
								<th>Working time</th><th>Change</th>
							</tr>
						</thead>
						<tbody>
							{people.map((e) => (
								<tr key={e.name}>
									<td><input type="checkbox" aria-label={`Tick ${e.employee_name}`} checked={picked.has(e.name)} onChange={() => toggle(e.name)} /></td>
									<td className="mono">{e.employee_number || e.name}</td>
									<td><b>{e.employee_name}</b></td>
									<td className="muted">{e.company}</td>
									<td>{tidyDept(e.department)}</td>
									<td className="muted">{e.designation || ""}{isSupervisor(e) ? " · 3 shifts" : ""}</td>
									<td>{e.default_shift ? shiftText(e.default_shift, s.shiftWindows) : <span className="text-bad">none — no attendance is generated</span>}</td>
									<td>
										<select value={e.default_shift || ""} disabled={busy} aria-label={`Working time for ${e.employee_name}`}
											onChange={(ev) => apply([e], ev.target.value)}>
											<option value="">— none —</option>
											{/* This person's company's Day and Night — and General for a supervisor. */}
											{shiftChoices(e, s.shiftTypes, s.companies, s.employees).map((n) => (
												<option key={n} value={n}>{shiftText(n, s.shiftWindows)}</option>
											))}
										</select>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			) : (
				<Empty title="Nobody here">No active employee matches this company and search.</Empty>
			)}

			<Note>
				The working time is the employee's <b>Default Shift</b>. It decides Late, Early and OT on every attendance
				report, and the shift job builds each day against it. Days already marked keep the time they were marked
				with. A dated roster — one time this week, another next — is a Shift Assignment, made on Manage Shift.
			</Note>

			{s.shw.open ? <ShiftWizard onClose={() => set({ shw: { ...s.shw, open: false } })} /> : null}
		</>
	);
}
