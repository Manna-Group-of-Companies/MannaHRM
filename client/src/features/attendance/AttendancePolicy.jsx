/** Attendance → Attendance Policy: factoHR's Manage Attendance Policy and
    Assign Attendance Policy, on one page (19 Nov 2026).

    What the numbers mean for a day is manna_hr/attpolicy.py, on the server, as
    hrms's shift job makes each day — never this page (CLAUDE.md §1). This page
    reads the policies and saves them; the site checks every number again and
    refuses ones that disagree, in its own words, shown here as they come.

    A new policy starts with every rule off. Nothing about anybody's pay
    changes until somebody fills a number in and saves. */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import {
	DEDUCT, HOLIDAY, HOURS_FROM, MODES, MSP, OT_BASIS, SCOPES, blank, loadPolicies, loadPolicy, savePolicy, summary,
} from "@/api/policy";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead } from "@/components/kit/ui";
import { toast } from "@/components/kit/overlay";

const names = (rows) => (rows || []).map((r) => (typeof r === "string" ? r : r.name)).filter(Boolean).sort();

/** The values a scope row may name, from what the dashboard already read. */
function choicesFor(s, on) {
	if (on === "Employee") return (s.employees || []).map((e) => [e.name, `${e.name} · ${e.employee_name || ""}`]);
	if (on === "Shift Type") return names(s.shiftTypes).map((n) => [n, n]);
	if (on === "Designation") return names(s.designations).map((n) => [n, n]);
	if (on === "Department") return names(s.departments).map((n) => [n, n]);
	return names(s.companies).map((n) => [n, n]);
}

function Num({ id, label, value, onChange, hint, step = "1", min }) {
	return (
		<div className="k-field">
			<label htmlFor={id}>{label}</label>
			<input id={id} className="k-inp" type="number" step={step} min={min} value={value ?? ""}
				onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
			{hint ? <span className="k-hint">{hint}</span> : null}
		</div>
	);
}

function Pick({ id, label, value, options, onChange, hint, blankLabel = "As each shift has it" }) {
	return (
		<div className="k-field">
			<label htmlFor={id}>{label}</label>
			<select id={id} className="k-sel" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
				{options.map((o) => <option key={o} value={o}>{o || blankLabel}</option>)}
			</select>
			{hint ? <span className="k-hint">{hint}</span> : null}
		</div>
	);
}

function Editor({ start, onDone }) {
	const s = useApp();
	const [p, setP] = useState(start);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const up = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
	const shifts = names(s.shiftTypes);
	const leaveTypes = names(s.leaveTypes);
	const chosen = new Set((p.shift_types || []).map((r) => r.shift_type));

	const save = async (e) => {
		e.preventDefault();
		if (!String(p.policy_name || "").trim()) { setErr("Give the policy a name."); return; }
		setBusy(true);
		setErr("");
		const r = await savePolicy(p);
		setBusy(false);
		if (!r.ok) { setErr(`The site refused this: ${r.error}`); return; }
		toast(`${r.name} saved`);
		onDone();
	};
	const setScope = (i, patch) => setP((x) => ({
		...x, scopes: x.scopes.map((r, j) => (j === i ? { ...r, ...patch } : r)),
	}));

	return (
		<form noValidate onSubmit={save} className="k-card">
			<div className="k-sec-h"><h3>{p.name ? `Edit ${p.name}` : "New attendance policy"}</h3></div>

			<div className="k-form-grid">
				<div className="k-field">
					<label htmlFor="ap-name">Policy name</label>
					<input id="ap-name" className="k-inp" value={p.policy_name} disabled={Boolean(p.name)}
						onChange={(e) => up("policy_name")(e.target.value)} />
				</div>
				<Pick id="ap-co" label="Company" value={p.company || ""} options={["", ...names(s.companies)]}
					onChange={up("company")} blankLabel="Any company" />
				<div className="k-field">
					<label className="k-check"><input type="checkbox" checked={Boolean(Number(p.is_active))}
						onChange={(e) => up("is_active")(e.target.checked ? 1 : 0)} /> Active</label>
					<label className="k-check"><input type="checkbox" checked={Boolean(Number(p.is_default))}
						onChange={(e) => up("is_default")(e.target.checked ? 1 : 0)} /> Default for everybody no other policy names</label>
				</div>
				<Num id="ap-pri" label="Priority" value={p.priority} onChange={up("priority")}
					hint="Between two policies equally specific for a person, the higher wins." />
			</div>

			<div className="k-sec-h" style={{ marginTop: 20 }}><h3>Applies to</h3></div>
			<p className="k-muted" style={{ fontSize: 13 }}>
				The most specific match wins: an employee, then a shift, a designation, a department, a company.
			</p>
			{(p.scopes || []).map((r, i) => {
				const list = `ap-scope-${i}`;
				return (
					<div className="k-form-grid" key={i} style={{ alignItems: "end" }}>
						<Pick id={`ap-on-${i}`} label="Applies on" value={r.applies_on} options={SCOPES}
							onChange={(v) => setScope(i, { applies_on: v, value: "" })} />
						<div className="k-field">
							<label htmlFor={`ap-val-${i}`}>Which</label>
							<input id={`ap-val-${i}`} className="k-inp" list={list} value={r.value}
								onChange={(e) => setScope(i, { value: e.target.value })} />
							<datalist id={list}>
								{choicesFor(s, r.applies_on).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
							</datalist>
						</div>
						<button type="button" className="k-btn k-btn-line k-btn-sm" aria-label={`Remove row ${i + 1}`}
							onClick={() => setP((x) => ({ ...x, scopes: x.scopes.filter((_, j) => j !== i) }))}>Remove</button>
					</div>
				);
			})}
			<button type="button" className="k-btn k-btn-line k-btn-sm" style={{ marginTop: 8 }}
				onClick={() => setP((x) => ({ ...x, scopes: [...(x.scopes || []), { applies_on: "Department", value: "" }] }))}>
				<KitIcon name="plus" size={16} stroke={2} />Add a row
			</button>

			<div className="k-sec-h" style={{ marginTop: 20 }}><h3>Shifts it sets</h3></div>
			<p className="k-muted" style={{ fontSize: 13 }}>
				Saving writes this policy's hours and grace onto these shifts, so the site's first reading of a day agrees
				with it. One policy sets a shift.
			</p>
			<div className="k-checks">
				{shifts.map((n) => (
					<label className="k-check" key={n}>
						<input type="checkbox" checked={chosen.has(n)} onChange={(e) => setP((x) => ({
							...x,
							shift_types: e.target.checked
								? [...(x.shift_types || []), { shift_type: n }]
								: (x.shift_types || []).filter((r) => r.shift_type !== n),
						}))} /> {n}
					</label>
				))}
			</div>

			<div className="k-sec-h" style={{ marginTop: 20 }}><h3>The day</h3></div>
			<div className="k-form-grid">
				<Pick id="ap-mode" label="Punch direction" value={p.check_in_out_mode} options={MODES}
					onChange={up("check_in_out_mode")}
					hint="Strict needs machines that send IN and OUT; most here send neither." />
				<Pick id="ap-hours" label="Hours worked from" value={p.hours_based_on} options={HOURS_FROM}
					onChange={up("hours_based_on")} />
				<Num id="ap-full" label="Full day (hours)" step="0.25" value={p.full_day_hours} onChange={up("full_day_hours")}
					hint="Under this a day is flagged Short hours." />
				<Num id="ap-half" label="Half day below (hours)" step="0.25" value={p.half_day_below_hours}
					onChange={up("half_day_below_hours")} hint="0 = off" />
				<Num id="ap-abs" label="Absent below (hours)" step="0.25" value={p.absent_below_hours}
					onChange={up("absent_below_hours")} hint="0 = off" />
				<Num id="ap-halfp" label="Half day when worked up to (% of shift)" step="1" value={p.half_day_upto_percent}
					onChange={up("half_day_upto_percent")} hint="factoHR: 99. Replaces the hours above. 0 = off" />
				<Num id="ap-absp" label="Absent when worked up to (% of shift)" step="1" value={p.absent_upto_percent}
					onChange={up("absent_upto_percent")} hint="factoHR: 12. 0 = off" />
				<Num id="ap-brk" label="Break (minutes)" value={p.break_minutes} onChange={up("break_minutes")} />
				<Num id="ap-brka" label="Break taken after (hours)" step="0.25" value={p.break_after_hours}
					onChange={up("break_after_hours")} />
				<Pick id="ap-msp" label="One punch only counts as" value={p.msp_status} options={MSP}
					onChange={up("msp_status")} blankLabel="As the hours say" />
			</div>

			{[["late", "Late arrival", "later"], ["early", "Early going", "earlier"]].map(([k, title, word]) => (
				<div key={k}>
					<div className="k-sec-h" style={{ marginTop: 20 }}><h3>{title}</h3></div>
					<div className="k-form-grid">
						<Num id={`ap-${k}-g`} label="Grace (minutes)" value={p[`${k}_grace_minutes`]} onChange={up(`${k}_grace_minutes`)} />
						<Num id={`ap-${k}-h`} label={`Half day when ${word} than (minutes)`} value={p[`${k}_half_day_after_minutes`]}
							onChange={up(`${k}_half_day_after_minutes`)} hint="0 = off" />
						<Num id={`ap-${k}-f`} label="Forgiven per month" min="-1" value={p[`${k}_forgiven_per_month`]}
							onChange={up(`${k}_forgiven_per_month`)} hint="-1 = no monthly rule. 3: the 4th costs a penalty." />
						<Num id={`ap-${k}-e`} label="Then a penalty every" min="1" value={p[`${k}_penalty_every`]}
							onChange={up(`${k}_penalty_every`)} hint="1: every one past the forgiven ones." />
						<Pick id={`ap-${k}-d`} label="Penalty (days)" value={String(p[`${k}_penalty_days`])} options={["0.5", "1"]}
							onChange={up(`${k}_penalty_days`)} />
					</div>
				</div>
			))}

			<div className="k-sec-h" style={{ marginTop: 20 }}><h3>Penalties and overtime</h3></div>
			<div className="k-form-grid">
				<Pick id="ap-ded" label="Late penalties come from" value={p.penalty_deduct_from} options={DEDUCT}
					onChange={up("penalty_deduct_from")} />
				<Pick id="ap-dede" label="Early going penalties come from" value={p.early_deduct_from} options={DEDUCT}
					onChange={up("early_deduct_from")} />
				<Pick id="ap-dedh" label="Short hours come from" value={p.hours_deduct_from} options={DEDUCT}
					onChange={up("hours_deduct_from")} />
				{[p.penalty_deduct_from, p.early_deduct_from, p.hours_deduct_from].some((x) => x && x !== DEDUCT[0]) ? (
					<Pick id="ap-cl" label="Casual Leave type" value={p.casual_leave_type || ""} options={["", ...leaveTypes]}
						onChange={up("casual_leave_type")} blankLabel="Choose…" />
				) : null}
				<div className="k-field">
					<label className="k-check"><input type="checkbox" checked={Boolean(Number(p.ot_enabled))}
						onChange={(e) => up("ot_enabled")(e.target.checked ? 1 : 0)} /> Overtime counted</label>
				</div>
				{Number(p.ot_enabled) ? (
					<>
						<Pick id="ap-otb" label="Overtime on a working day is" value={p.ot_basis} options={OT_BASIS}
							onChange={up("ot_basis")} />
						<Num id="ap-otmin" label="Overtime minimum (minutes)" value={p.ot_min_minutes} onChange={up("ot_min_minutes")} />
						<Num id="ap-otr" label="Rounded down to (minutes)" value={p.ot_round_minutes} onChange={up("ot_round_minutes")} />
						<Num id="ap-otmax" label="Most in a day (minutes)" value={p.ot_max_minutes} onChange={up("ot_max_minutes")}
							hint="0 = no cap" />
						<Pick id="ap-hol" label="Work on a weekly off or holiday" value={p.holiday_work} options={HOLIDAY}
							onChange={up("holiday_work")} />
					</>
				) : null}
			</div>

			{err ? <p className="k-err" role="alert" style={{ marginTop: 12 }}>{err}</p> : null}
			<div className="k-modal-f">
				<button type="button" className="k-btn k-btn-line" onClick={onDone} disabled={busy}>Cancel</button>
				<button type="submit" className="k-btn k-btn-ink" disabled={busy}>{busy ? "Saving…" : "Save policy"}</button>
			</div>
		</form>
	);
}

export default function AttendancePolicy() {
	const [rows, setRows] = useState(null);
	const [err, setErr] = useState("");
	const [open, setOpen] = useState(null);
	const reload = () => {
		setErr("");
		loadPolicies().then((r) => setRows(r || [])).catch((e) => { setRows([]); setErr(e.message || String(e)); });
	};
	useEffect(reload, []);
	const edit = async (name) => {
		const doc = await loadPolicy(name).catch(() => null);
		if (!doc) { toast("The site would not open this policy."); return; }
		setOpen(doc);
	};

	return (
		<div className="kit k-enter">
			<PageHead title="Attendance Policy"
				sub="What a day's punches mean for that day's pay: hours, late and early, missed punches, penalties and overtime">
				<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => setOpen(blank())}>
					<KitIcon name="plus" size={16} stroke={2} />New policy
				</button>
			</PageHead>
			{open ? <Editor start={open} onDone={() => { setOpen(null); reload(); }} /> : null}
			{err ? <p className="k-err" role="alert">{err}</p> : null}
			{rows === null ? <div className="k-sk" style={{ height: 120 }} /> : rows.length ? (
				<div className="k-grid2" style={{ marginTop: 16 }}>
					{rows.map((r) => (
						<div className="k-sec" style={{ margin: 0 }} key={r.name}>
							<div className="k-sec-h" style={{ margin: "0 0 6px" }}>
								<h3>{r.policy_name || r.name}</h3>
								{Number(r.is_active) ? null : <span className="k-pill k-p-grey k-nodot">Not in use</span>}
								{Number(r.is_default) ? <span className="k-pill k-nodot">Default</span> : null}
								<button type="button" className="k-btn k-btn-line k-btn-sm" aria-label={`Edit ${r.name}`}
									onClick={() => void edit(r.name)}>
									<KitIcon name="edit" size={16} stroke={2} />Edit
								</button>
							</div>
							<div className="k-muted" style={{ fontSize: 13 }}>{r.company || "Any company"}</div>
							<p style={{ fontSize: 13, margin: "6px 0 0" }}>{summary(r)}</p>
						</div>
					))}
				</div>
			) : (
				<EmptyState icon="clock" title="No attendance policy yet"
					sub="Until there is one, every day is exactly as the shift's own settings make it." />
			)}
		</div>
	);
}

