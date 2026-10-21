/** Checklist, as the HRDashboard reference draws it (21 October 2026): the
 *  signed-in person's to-do list, onboarding and offboarding as each person's
 *  progress through their checklist, and the templates those come from — on
 *  ToDo, Employee Onboarding / Employee Separation and their Tasks, and the
 *  two templates (api/checklist.js).
 *
 *  Starting an onboarding or a separation, and changing a template, stay on
 *  the site's desk: hrms makes each activity's Task when the document is
 *  saved there, and a checklist begun here without them would tick nothing.
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import {
	KINDS, addTodo, cancelTodo, loadBoarding, loadTodos, readChecklist, readTemplate, readTemplates, saveTodo,
	setTask, setTodo,
} from "@/api/checklist";
import { dmy, todayIso, tidyDept } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Pill, SegTabs, Who } from "@/components/kit/ui";
import { Confirm, KitModal, ModalFoot, toast } from "@/components/kit/overlay";

const day10 = (v) => String(v || "").slice(0, 10);
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);
const textOf = (html) => new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "";
const PRIORITY = { High: "High", Medium: "Medium", Low: "Low" };
const BOARD_PILL = { Pending: "Not started", "In Process": "In progress", Completed: "Completed" };

function Progress({ pct }) {
	return (
		<div className="k-progress"><div className="k-bar"><i style={{ width: `${Math.round(pct)}%` }} /></div><span>{Math.round(pct)}%</span></div>
	);
}

/** The site's desk, for what is started or changed there. */
function DeskButton({ s, doctype, label }) {
	const href = s.site ? `${deskUrl(s.site, doctype)}/new` : "";
	return href ? (
		<a className="k-btn k-btn-ink" href={href} target="_blank" rel="noreferrer"><KitIcon name="plus" size={18} stroke={2} />{label}</a>
	) : (
		<button type="button" className="k-btn k-btn-ink" disabled title="Which desk this opens has not been settled yet."><KitIcon name="plus" size={18} stroke={2} />{label}</button>
	);
}

/* ---------------------------------------------------------------- to-do --- */

function TodoForm({ t, onClose }) {
	const [f, setF] = useState({ description: t ? textOf(t.description) : "", date: t ? day10(t.date) : todayIso(), priority: t?.priority || "Medium" });
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<KitModal title={t ? "Edit task" : "New task"} onClose={onClose}>
			<form noValidate onSubmit={async (e) => {
				e.preventDefault();
				if (!f.description.trim()) { setErr("Name the task"); return; }
				setBusy(true);
				try {
					if (t) await saveTodo(t.name, { description: f.description.trim(), date: f.date || null, priority: f.priority });
					else await addTodo(f);
					toast("Task saved");
					onClose();
				} catch (x) { setErr(why(x)); } finally { setBusy(false); }
			}}>
				<div className="k-form-grid">
					<div className={`k-field k-full${err ? " k-bad" : ""}`}>
						<label htmlFor="td-desc">Task</label>
						<input id="td-desc" className="k-inp" value={f.description} onChange={(e) => { setF({ ...f, description: e.target.value }); setErr(""); }} />
						{err ? <small className="k-err">{err}</small> : null}
					</div>
					<div className="k-field">
						<label htmlFor="td-date">Due date</label>
						<input id="td-date" className="k-inp" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
					</div>
					<div className="k-field">
						<label htmlFor="td-pri">Priority</label>
						<select id="td-pri" className="k-sel" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
							{["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
						</select>
					</div>
				</div>
				<ModalFoot ok="Save task" busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

function TaskRow({ t, onOpen }) {
	const done = t.status === "Closed";
	const today = todayIso();
	const tick = async (e) => {
		try { await setTodo(t.name, e.target.checked); if (e.target.checked) toast("Task done"); } catch (x) { toast(why(x)); }
	};
	return (
		<div className={`k-task${done ? " k-done" : ""}`}>
			<input type="checkbox" className="k-chk" checked={done} onChange={tick} aria-label={`Mark ${textOf(t.description)} done`} />
			<button type="button" className="k-grow" style={{ textAlign: "left" }} onClick={onOpen}>
				<div className="k-t-title">{textOf(t.description)}</div>
				<small>
					<Pill status={PRIORITY[t.priority] || "Medium"} />
					{t.date ? <span style={{ color: !done && day10(t.date) < today ? "rgb(var(--bad))" : "inherit" }}>
						<KitIcon name="calendar" size={13} stroke={2} /> {day10(t.date) === today ? "Today" : dmy(day10(t.date))}
					</span> : null}
					{t.reference_type ? <span>{t.reference_type}</span> : null}
				</small>
			</button>
		</div>
	);
}

export function Todo() {
	const s = useApp();
	const [tab, setTab] = useState("Open");
	const [quick, setQuick] = useState("");
	const [form, setForm] = useState(null);
	useEffect(() => { void loadTodos(); }, []);
	const rows = s.todos.rows || [];
	const today = todayIso();
	const open = rows.filter((t) => t.status === "Open");
	const groups = tab === "Done"
		? [["Completed", rows.filter((t) => t.status === "Closed")]]
		: [["Overdue", open.filter((t) => t.date && day10(t.date) < today)],
			["Today", open.filter((t) => day10(t.date) === today)],
			["Upcoming", open.filter((t) => !t.date || day10(t.date) > today).sort((a, b) => day10(a.date).localeCompare(day10(b.date)))]];
	const add = async (e) => {
		e.preventDefault();
		if (!quick.trim()) return;
		try { await addTodo({ description: quick, date: today }); setQuick(""); toast("Task added"); } catch (x) { toast(why(x)); }
	};
	const openTask = (t) => { set({ chkTodo: t.name }); navigate("checklist", "todo"); };
	return (
		<div className="kit k-enter">
			<PageHead title="To-do" sub="Your tasks and reminders">
				<button type="button" className="k-btn k-btn-ink" onClick={() => setForm({})}><KitIcon name="plus" size={18} stroke={2} />New task</button>
			</PageHead>
			<div className="k-card">
				<div className="k-card-h">
					<SegTabs label="Show" value={tab} onChange={setTab} tabs={[["Open", "To do"], ["Done", "Done"]]}
						count={(t) => (t === "Open" ? open.length : rows.length - open.length)} />
					<form onSubmit={add} style={{ display: "flex", gap: 8, flex: 1, maxWidth: 420 }} noValidate>
						<input className="k-inp" placeholder="Quick add: type a task and press Enter" aria-label="New task" value={quick} onChange={(e) => setQuick(e.target.value)} />
						<button type="submit" className="k-btn k-btn-line" disabled={!quick.trim()}>Add</button>
					</form>
				</div>
				{s.todos.state === "error" ? <p className="k-err" role="alert">The to-do list could not be read.</p> : null}
				{s.todos.state !== "ok" && s.todos.state !== "error" ? <div className="k-sk" style={{ height: 200 }} /> : (
					groups.filter((g) => g[1].length).map(([g, L]) => (
						<div key={g}>
							<div className="k-group-h">{g}<span className="k-pill k-p-grey k-nodot" style={{ padding: "1px 8px" }}>{L.length}</span></div>
							{L.map((t) => <TaskRow key={t.name} t={t} onOpen={() => openTask(t)} />)}
						</div>
					)).concat(groups.every((g) => !g[1].length)
						? [<EmptyState key="none" icon="tick" title={tab === "Done" ? "Nothing finished yet" : "You’re all done"} sub="Enjoy the calm, or add a new task." />]
						: [])
				)}
			</div>
			{form ? <TodoForm t={form.name ? form : null} onClose={() => setForm(null)} /> : null}
		</div>
	);
}

export function TodoDetail() {
	const s = useApp();
	const [form, setForm] = useState(false);
	const [ask, setAsk] = useState(false);
	useEffect(() => { void loadTodos(); }, []);
	const t = (s.todos.rows || []).find((x) => x.name === s.chkTodo);
	const back = () => navigate("checklist", "overview");
	if (s.todos.state === "ok" && !t) return <div className="kit"><div className="k-card"><EmptyState icon="check" title="This task is not there" sub="It may have been cancelled."><button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go to To-do</button></EmptyState></div></div>;
	if (!t) return <div className="kit"><div className="k-sk" style={{ height: 240 }} /></div>;
	const done = t.status === "Closed";
	const today = todayIso();
	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />Task detail</button>
					<div className="k-crumbs"><button type="button" onClick={back}>To-do</button><KitIcon name="right" size={14} stroke={2} /><b>{textOf(t.description).slice(0, 60)}</b></div>
				</div>
				<div className="k-ph-act">
					<button type="button" className="k-btn k-btn-line" onClick={() => setForm(true)}><KitIcon name="edit" size={16} stroke={2} />Edit</button>
					<button type="button" className={`k-btn ${done ? "k-btn-line" : "k-btn-green"}`}
						onClick={async () => { try { await setTodo(t.name, !done); toast(done ? "Task reopened" : "Task done"); } catch (x) { toast(why(x)); } }}>
						<KitIcon name="tick" size={16} stroke={2} />{done ? "Reopen" : "Mark done"}
					</button>
				</div>
			</div>
			<div className="k-split">
				<div className="k-card">
					<dl style={{ margin: 0 }}>
						{[["Status", done ? "Done" : t.date && day10(t.date) < today ? "Overdue" : "Open"], ["Priority", t.priority || "Medium"],
							["Due", t.date ? dmy(day10(t.date)) : "—"], ["Assigned by", t.assigned_by || "—"], ["Created", dmy(day10(t.creation))]].map(([k, v]) => (
							<div className="k-kv" key={k}><dt>{k}</dt><dd>{k === "Status" || k === "Priority" ? <Pill status={v === "Open" ? "In progress" : v} /> : v}</dd></div>
						))}
					</dl>
					<button type="button" className="k-btn k-btn-ghost" style={{ color: "rgb(var(--bad))", marginTop: 14 }} onClick={() => setAsk(true)}>
						<KitIcon name="trash" size={16} stroke={2} />Cancel task
					</button>
				</div>
				<div className="k-card">
					<h2 style={{ margin: "0 0 8px", fontSize: 20, ...(done ? { textDecoration: "line-through", color: "rgb(var(--faint))" } : {}) }}>{textOf(t.description)}</h2>
					{t.reference_type ? <p className="k-muted">About {t.reference_type} {t.reference_name}</p> : null}
				</div>
			</div>
			{form ? <TodoForm t={t} onClose={() => setForm(false)} /> : null}
			{ask ? <Confirm title="Cancel this task?" sub="It comes off your list. The site keeps it as cancelled." ok="Cancel task"
				onClose={() => setAsk(false)}
				onOk={async () => { try { await cancelTodo(t.name); toast("Task cancelled"); back(); } catch (x) { toast(why(x)); setAsk(false); } }} /> : null}
		</div>
	);
}

/* --------------------------------------------- onboarding / offboarding --- */

export function Boarding({ kind }) {
	const s = useApp();
	useEffect(() => { void loadBoarding(); }, []);
	const rows = (s.boarding[kind] || []).filter((r) => !s.company || r.company === s.company);
	const open = (r) => { set({ chkList: { kind, name: r.name } }); navigate("checklist", "list"); };
	const dateOf = (r) => r[KINDS[kind].date] || s.byName[r.employee]?.[kind === "Onboarding" ? "date_of_joining" : "relieving_date"];
	return (
		<div className="kit k-enter">
			<PageHead title={kind} sub={kind === "Onboarding" ? "Help new people settle in" : "Make sure leavers hand over smoothly"}>
				<DeskButton s={s} doctype={KINDS[kind].doctype} label={kind === "Onboarding" ? "Start onboarding" : "Start offboarding"} />
			</PageHead>
			<div className="k-card">
				{s.boarding.state !== "ok" && s.boarding.state !== "error" ? <div className="k-sk" style={{ height: 200 }} /> : rows.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Employee", "Department", kind === "Onboarding" ? "Start date" : "Last day", "Progress", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.name} className="k-click" tabIndex={0} onClick={() => open(r)} onKeyDown={(ev) => { if (ev.key === "Enter") open(r); }}>
										<td className="k-title-cell"><Who name={r.employee_name || r.employee || r.name} sub={r.designation || ""} /></td>
										<td data-label="Department">{tidyDept(r.department) || "—"}</td>
										<td data-label="Date">{dateOf(r) ? dmy(day10(dateOf(r))) : "—"}</td>
										<td data-label="Progress"><Pill status={BOARD_PILL[r.boarding_status] || "Not started"}>{r.boarding_status || "Pending"}</Pill></td>
										<td data-label=""><span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="check" title={`No ${kind.toLowerCase()} in progress`} sub={`Start a checklist when someone ${kind === "Onboarding" ? "joins" : "leaves"}.`} />}
			</div>
		</div>
	);
}

export function ChecklistDetail() {
	const s = useApp();
	const { kind, name } = s.chkList || {};
	const [data, setData] = useState(undefined);
	const [busy, setBusy] = useState("");
	const reload = () => readChecklist(kind, name).then(setData).catch(() => setData(null));
	useEffect(() => { if (kind && name) void reload(); else setData(null); }, [kind, name]);
	const back = () => navigate("checklist", kind === "Offboarding" ? "offboarding" : "onboarding");
	if (data === undefined) return <div className="kit"><div className="k-sk" style={{ height: 300 }} /></div>;
	if (!data) return <div className="kit"><div className="k-card"><EmptyState icon="check" title="This checklist is not there" sub="It may have been cancelled on the site."><button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go back</button></EmptyState></div></div>;
	const { doc, items } = data;
	const isDone = (it) => it.taskDoc?.status === "Completed" || it.taskDoc?.status === "Cancelled";
	const done = items.filter(isDone).length;
	const e = s.byName[doc.employee] || { employee_name: doc.employee_name || doc.employee || "" };
	const tick = async (it, on) => {
		if (!it.task) { toast("This activity has no task on the site yet"); return; }
		setBusy(it.task);
		try { await setTask(it.task, on); await reload(); } catch (x) { toast(why(x)); } finally { setBusy(""); }
	};
	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />{kind} detail</button>
					<div className="k-crumbs"><button type="button" onClick={back}>{kind}</button><KitIcon name="right" size={14} stroke={2} /><b>{e.employee_name}</b></div>
				</div>
			</div>
			<div className="k-split">
				<div className="k-card k-profile-card">
					<div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}><KitAvatar name={e.employee_name} size={96} /></div>
					<h2 style={{ margin: 0, fontSize: 18 }}>{e.employee_name}</h2>
					<div className="k-muted">{e.designation || doc.designation || ""}</div>
					<div style={{ marginTop: 10 }}><Pill status={BOARD_PILL[doc.boarding_status] || "Not started"}>{doc.boarding_status || "Pending"}</Pill></div>
					<div className="k-pc-list">
						<div className="k-r" style={{ justifyContent: "space-between" }}><span className="k-muted">Progress</span><b>{done}/{items.length}</b></div>
						<Progress pct={items.length ? (done / items.length) * 100 : 0} />
					</div>
					{doc.employee ? <button type="button" className="k-btn k-btn-line" style={{ width: "100%", justifyContent: "center", marginTop: 16 }} onClick={() => openEmployee(doc.employee)}>View profile</button> : null}
				</div>
				<div className="k-card">
					{[["To do", items.filter((it) => !isDone(it))], ["Done", items.filter(isDone)]].map(([g, L]) => (
						<div key={g}>
							<div className="k-group-h">{g}<span className="k-pill k-p-grey k-nodot" style={{ padding: "1px 8px" }}>{L.length}</span></div>
							{L.length ? L.map((it) => (
								<div className={`k-task${isDone(it) ? " k-done" : ""}`} key={it.name || it.activity_name}>
									<input type="checkbox" className="k-chk" checked={isDone(it)} disabled={busy === it.task}
										onChange={(ev) => void tick(it, ev.target.checked)} aria-label={`Mark ${it.activity_name} done`} />
									<div className="k-grow">
										<div className="k-t-title">{it.activity_name}</div>
										<small>
											{it.role || it.user ? <span className="k-pill k-p-grey k-nodot" style={{ padding: "2px 8px" }}>{it.user || it.role}</span> : null}
											{it.taskDoc?.exp_end_date ? <span><KitIcon name="calendar" size={13} stroke={2} /> {dmy(day10(it.taskDoc.exp_end_date))}</span> : null}
										</small>
									</div>
								</div>
							)) : <p className="k-muted" style={{ margin: "8px 4px" }}>{g === "Done" ? "Nothing done yet." : "All tasks are done."}</p>}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/* -------------------------------------------------------------- settings --- */

export function ChecklistSettings() {
	const s = useApp();
	const [tab, setTab] = useState("Onboarding");
	const [lists, setLists] = useState({});
	useEffect(() => {
		readTemplates("Onboarding").then((r) => setLists((l) => ({ ...l, Onboarding: r })));
		readTemplates("Offboarding").then((r) => setLists((l) => ({ ...l, Offboarding: r })));
	}, []);
	const L = lists[tab];
	const open = (t) => { set({ chkTpl: { kind: tab, name: t.name } }); navigate("checklist", "template"); };
	return (
		<div className="kit k-enter">
			<PageHead title="Checklist Settings" sub="Templates used for onboarding and offboarding">
				<DeskButton s={s} doctype={KINDS[tab].template} label="New template" />
			</PageHead>
			<div className="k-card">
				<div className="k-card-h">
					<SegTabs label="Kind" value={tab} onChange={setTab} tabs={["Onboarding", "Offboarding"]} count={(t) => (lists[t] ? lists[t].length : "")} />
				</div>
				{!L ? <div className="k-sk" style={{ height: 140 }} /> : L.length ? (
					<div className="k-jobs">
						{L.map((t) => (
							<button type="button" className="k-tile" key={t.name} onClick={() => open(t)}>
								<span className="k-ti"><KitIcon name="check" size={20} stroke={2} /></span>
								<h3>{t.name}</h3>
								<p>{[t.designation, tidyDept(t.department), t.company].filter(Boolean).join(" · ") || "Everybody"}</p>
							</button>
						))}
					</div>
				) : <EmptyState icon="check" title="No templates yet" sub="Create one to reuse the same tasks." />}
			</div>
		</div>
	);
}

export function TemplateDetail() {
	const s = useApp();
	const { kind, name } = s.chkTpl || {};
	const [doc, setDoc] = useState(undefined);
	useEffect(() => { if (kind && name) readTemplate(kind, name).then(setDoc); else setDoc(null); }, [kind, name]);
	const back = () => navigate("checklist", "settings");
	if (doc === undefined) return <div className="kit"><div className="k-sk" style={{ height: 240 }} /></div>;
	if (!doc) return <div className="kit"><div className="k-card"><EmptyState icon="check" title="This template is not there" sub=""><button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go back</button></EmptyState></div></div>;
	const acts = doc.activities || [];
	const href = s.site ? `${deskUrl(s.site, KINDS[kind].template)}/${encodeURIComponent(name)}` : "";
	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />Template details</button>
					<div className="k-crumbs"><button type="button" onClick={back}>Checklist settings</button><KitIcon name="right" size={14} stroke={2} /><b>{name}</b></div>
				</div>
				<div className="k-ph-act">
					{href ? <a className="k-btn k-btn-line" href={href} target="_blank" rel="noreferrer"><KitIcon name="edit" size={16} stroke={2} />Edit on the site</a> : null}
				</div>
			</div>
			<div className="k-card">
				<div className="k-card-h"><div><h3>{name}</h3><span className="k-muted" style={{ fontSize: 13 }}>{kind} · {acts.length} task{acts.length === 1 ? "" : "s"}</span></div></div>
				{acts.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Task", "Owner", "Due"].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{acts.map((a) => (
									<tr key={a.name || a.activity_name}>
										<td className="k-title-cell"><b>{a.activity_name}</b></td>
										<td data-label="Owner"><Pill status="Low">{a.user || a.role || "—"}</Pill></td>
										<td data-label="Due">{a.begin_on ? `${a.begin_on} day${Number(a.begin_on) === 1 ? "" : "s"} in` : "On the day"}{a.duration ? `, ${a.duration} day${Number(a.duration) === 1 ? "" : "s"} to do` : ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="check" title="No tasks yet" sub="Add the steps everyone should go through." />}
			</div>
		</div>
	);
}

export default function Checklist() {
	const { subtab } = useApp();
	if (subtab === "todo") return <TodoDetail />;
	if (subtab === "onboarding") return <Boarding kind="Onboarding" />;
	if (subtab === "offboarding") return <Boarding kind="Offboarding" />;
	if (subtab === "list") return <ChecklistDetail />;
	if (subtab === "settings") return <ChecklistSettings />;
	if (subtab === "template") return <TemplateDetail />;
	return <Todo />;
}
