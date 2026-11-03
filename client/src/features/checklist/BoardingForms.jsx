/** Checklist → start an onboarding or an offboarding, and make or change a
 *  template — here, on hrms's own doctypes (29 October 2026). The rules are
 *  lib/boarding.js; the writes are api/checklist.js. */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { KINDS, readTemplate, readTemplates, saveTemplate, startOffboarding, startOnboarding } from "@/api/checklist";
import { activitiesFrom, checkOnboarding, checkSeparation, checkTemplate } from "@/lib/boarding";
import { todayIso, tidyDept } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { KitModal, ModalFoot, toast } from "@/components/kit/overlay";

const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 300);
const BLANK = { activity_name: "", user: "", role: "", begin_on: 0, duration: 1 };

/** The tasks of a checklist or a template, one row each. */
export function ActivityEditor({ list, onChange, idp }) {
	const put = (i, k, v) => onChange(list.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
	return (
		<div className="k-full">
			<div className="k-group-h">Tasks<span className="k-pill k-p-grey k-nodot" style={{ padding: "1px 8px" }}>{list.length}</span></div>
			{list.map((a, i) => (
				<div className="k-form-grid" key={i} style={{ alignItems: "end", marginBottom: 8 }}>
					<div className="k-field k-full">
						<label htmlFor={`${idp}-n${i}`}>Task {i + 1}</label>
						<input id={`${idp}-n${i}`} className="k-inp" value={a.activity_name} onChange={(e) => put(i, "activity_name", e.target.value)} />
					</div>
					<div className="k-field">
						<label htmlFor={`${idp}-u${i}`}>Done by (login email)</label>
						<input id={`${idp}-u${i}`} className="k-inp" type="email" value={a.user || ""} onChange={(e) => put(i, "user", e.target.value)} />
					</div>
					<div className="k-field">
						<label htmlFor={`${idp}-r${i}`}>Or everybody with the role</label>
						<input id={`${idp}-r${i}`} className="k-inp" value={a.role || ""} onChange={(e) => put(i, "role", e.target.value)} />
					</div>
					<div className="k-field">
						<label htmlFor={`${idp}-b${i}`}>Starts after (days)</label>
						<input id={`${idp}-b${i}`} className="k-inp" type="number" min="0" value={a.begin_on} onChange={(e) => put(i, "begin_on", e.target.value)} />
					</div>
					<div className="k-field">
						<label htmlFor={`${idp}-d${i}`}>Days to do it</label>
						<input id={`${idp}-d${i}`} className="k-inp" type="number" min="1" value={a.duration} onChange={(e) => put(i, "duration", e.target.value)} />
					</div>
					<div className="k-field">
						<button type="button" className="k-btn k-btn-ghost" style={{ color: "rgb(var(--bad))" }} onClick={() => onChange(list.filter((_, j) => j !== i))}>
							<KitIcon name="trash" size={16} stroke={2} />Remove
						</button>
					</div>
				</div>
			))}
			<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => onChange([...list, { ...BLANK }])}>
				<KitIcon name="plus" size={16} stroke={2} />Add task
			</button>
		</div>
	);
}

const label = (t) => t.title || t.name;

/** What an offboarding usually has to get back or close. Every line becomes
    one task on the separation; it is ticked off later, on the person's
    checklist, when it is done — never here, where nothing is done yet. */
export const OFFBOARD_ITEMS = [
	"Laptop received", "Mobile phone received", "ID card received", "Keys received", "SIM card received",
	"Uniform received", "Email and logins closed", "Fingerprint removed from the machine", "Advances and loans settled", "Handover done",
];

/** Offboarding's tasks as a plain list: remove a line, or add one. */
function OffboardChecklist({ list, onChange }) {
	const [extra, setExtra] = useState("");
	const add = () => {
		const n = extra.trim();
		if (!n) return;
		if (!list.some((a) => a.activity_name === n)) onChange([...list, { ...BLANK, activity_name: n }]);
		setExtra("");
	};
	return (
		<div className="k-full">
			<div className="k-group-h">Checklist<span className="k-pill k-p-grey k-nodot" style={{ padding: "1px 8px" }}>{list.length}</span></div>
			<div className="k-checks">
				{list.map((a, i) => (
					<div key={a.activity_name} className="k-check">
						<span style={{ flex: 1 }}>{a.activity_name}</span>
						<button type="button" className="k-check-x" aria-label={`Remove ${a.activity_name}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
							<KitIcon name="x" size={14} stroke={2} />
						</button>
					</div>
				))}
			</div>
			<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
				<input className="k-inp" aria-label="Add a checklist item" placeholder="Add an item, e.g. Laptop received" value={extra}
					onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
				<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={add}><KitIcon name="plus" size={16} stroke={2} />Add</button>
			</div>
		</div>
	);
}

/** Start an onboarding or an offboarding: who, when, and its tasks — copied
    off a template and changed as needed. Made submitted, so the Tasks exist. */
export function StartBoarding({ kind, onClose, onMade }) {
	const s = useApp();
	const off = kind === "Offboarding";
	const [f, setF] = useState({ employee: "", begins: todayIso(), resigned: "", name: "", email: "", phone: "", company: s.company || "", department: "", designation: "", joining: todayIso(), template: "", activities: off ? OFFBOARD_ITEMS.map((n) => ({ ...BLANK, activity_name: n })) : [] });
	const [tpls, setTpls] = useState([]);
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	useEffect(() => { void readTemplates(kind).then(setTpls); }, [kind]);
	const people = (s.employees || []).filter((e) => (!e.status || e.status === "Active") && (!s.company || e.company === s.company))
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const emp = people.find((e) => e.name === f.employee) || null;
	const put = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErr(""); };
	const pick = async (name) => {
		put("template", name);
		if (!name) return;
		const t = await readTemplate(kind, name).catch(() => null);
		if (t) put("activities", activitiesFrom(t));
	};
	const submit = async (e) => {
		e.preventDefault();
		const bad = off ? checkSeparation(f, emp) : checkOnboarding(f);
		if (bad) { setErr(bad); return; }
		setBusy(true);
		try {
			const name = off ? await startOffboarding(f, emp) : await startOnboarding(f);
			toast(`${kind} started — ${name}`);
			onMade?.(name);
			onClose();
		} catch (x) { setErr(why(x)); } finally { setBusy(false); }
	};
	return (
		<KitModal title={off ? "Start offboarding" : "Start onboarding"} onClose={onClose} wide>
			<form noValidate onSubmit={submit}>
				<div className="k-form-grid">
					{off ? (
						<>
							<div className="k-field k-full">
								<label htmlFor="sb-emp">Who is leaving</label>
								<select id="sb-emp" className="k-sel" value={f.employee} onChange={(e) => put("employee", e.target.value)}>
									<option value="">Pick a person…</option>
									{people.map((p) => <option key={p.name} value={p.name}>{p.employee_name} ({p.employee_number || p.name})</option>)}
								</select>
							</div>
							<div className="k-field">
								<label htmlFor="sb-begins">Handover begins</label>
								<input id="sb-begins" className="k-inp" type="date" value={f.begins} onChange={(e) => put("begins", e.target.value)} />
							</div>
							<div className="k-field">
								<label htmlFor="sb-resigned">Resignation letter date</label>
								<input id="sb-resigned" className="k-inp" type="date" value={f.resigned} onChange={(e) => put("resigned", e.target.value)} />
							</div>
						</>
					) : (
						<>
							<div className="k-field">
								<label htmlFor="sb-name">Name</label>
								<input id="sb-name" className="k-inp" value={f.name} onChange={(e) => put("name", e.target.value)} />
							</div>
							<div className="k-field">
								<label htmlFor="sb-email">Email</label>
								<input id="sb-email" className="k-inp" type="email" value={f.email} onChange={(e) => put("email", e.target.value)} />
							</div>
							<div className="k-field">
								<label htmlFor="sb-phone">Phone</label>
								<input id="sb-phone" className="k-inp" value={f.phone} onChange={(e) => put("phone", e.target.value)} />
							</div>
							<div className="k-field">
								<label htmlFor="sb-joining">Joining date</label>
								<input id="sb-joining" className="k-inp" type="date" value={f.joining} onChange={(e) => put("joining", e.target.value)} />
							</div>
							<div className="k-field">
								<label htmlFor="sb-co">Company</label>
								<select id="sb-co" className="k-sel" value={f.company} onChange={(e) => put("company", e.target.value)}>
									<option value="">Pick…</option>
									{(s.companies || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
								</select>
							</div>
							<div className="k-field">
								<label htmlFor="sb-dept">Department</label>
								<select id="sb-dept" className="k-sel" value={f.department} onChange={(e) => put("department", e.target.value)}>
									<option value="">—</option>
									{(s.departments || []).filter((d) => !f.company || !d.company || d.company === f.company)
										.map((d) => <option key={d.name} value={d.name}>{tidyDept(d.name)}</option>)}
								</select>
							</div>
							<div className="k-field">
								<label htmlFor="sb-desig">Designation</label>
								<select id="sb-desig" className="k-sel" value={f.designation} onChange={(e) => put("designation", e.target.value)}>
									<option value="">—</option>
									{(s.designations || []).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
								</select>
							</div>
						</>
					)}
					{off ? <OffboardChecklist list={f.activities} onChange={(v) => put("activities", v)} /> : (<>
					<div className="k-field k-full">
						<label htmlFor="sb-tpl">Template</label>
						<select id="sb-tpl" className="k-sel" value={f.template} onChange={(e) => void pick(e.target.value)}>
							<option value="">None — type the tasks below</option>
							{tpls.map((t) => <option key={t.name} value={t.name}>{label(t)}</option>)}
						</select>
					</div>
					<ActivityEditor idp="sb" list={f.activities} onChange={(v) => put("activities", v)} />
					</>)}
					{err ? <div className="k-field k-full k-bad"><small className="k-err" role="alert">{err}</small></div> : null}
				</div>
				<ModalFoot ok={off ? "Start offboarding" : "Start onboarding"} busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

/** Make a template, or change one (`doc` is the template as read). */
export function TemplateForm({ kind, doc, onClose, onSaved }) {
	const s = useApp();
	const [f, setF] = useState({
		title: doc ? doc.title || doc.name : "", company: doc?.company || "", department: doc?.department || "", designation: doc?.designation || "",
		activities: doc ? activitiesFrom(doc) : [],
	});
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	const put = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErr(""); };
	return (
		<KitModal title={doc ? "Edit template" : `New ${kind.toLowerCase()} template`} onClose={onClose} wide>
			<form noValidate onSubmit={async (e) => {
				e.preventDefault();
				const bad = checkTemplate(f);
				if (bad) { setErr(bad); return; }
				setBusy(true);
				try {
					const name = await saveTemplate(kind, f, doc?.name);
					toast("Template saved");
					onSaved?.(name);
					onClose();
				} catch (x) { setErr(why(x)); } finally { setBusy(false); }
			}}>
				<div className="k-form-grid">
					<div className="k-field k-full">
						<label htmlFor="tf-title">Template name</label>
						<input id="tf-title" className="k-inp" value={f.title} onChange={(e) => put("title", e.target.value)} />
					</div>
					<div className="k-field">
						<label htmlFor="tf-co">Company</label>
						<select id="tf-co" className="k-sel" value={f.company} onChange={(e) => put("company", e.target.value)}>
							<option value="">Every company</option>
							{(s.companies || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
						</select>
					</div>
					<div className="k-field">
						<label htmlFor="tf-dept">Department</label>
						<select id="tf-dept" className="k-sel" value={f.department} onChange={(e) => put("department", e.target.value)}>
							<option value="">Every department</option>
							{(s.departments || []).map((d) => <option key={d.name} value={d.name}>{tidyDept(d.name)}</option>)}
						</select>
					</div>
					<div className="k-field">
						<label htmlFor="tf-desig">Designation</label>
						<select id="tf-desig" className="k-sel" value={f.designation} onChange={(e) => put("designation", e.target.value)}>
							<option value="">Every designation</option>
							{(s.designations || []).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
						</select>
					</div>
					<ActivityEditor idp="tf" list={f.activities} onChange={(v) => put("activities", v)} />
					{err ? <div className="k-field k-full k-bad"><small className="k-err" role="alert">{err}</small></div> : null}
				</div>
				<ModalFoot ok="Save template" busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

export const kindDoc = (kind) => KINDS[kind].doctype;
