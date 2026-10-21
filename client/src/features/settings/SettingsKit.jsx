/** Settings, as the HRDashboard reference draws it (21 October 2026): a list
 *  of sections on the left and the section on the right, on the site's own
 *  records. Our own three — Setup readiness, Module coverage, Security — are in
 *  the same list, so nothing moved out of reach.
 *
 *  The list is the module's menu (`pagesOf`), so a login's menu and Settings →
 *  Security decide what is in it, exactly as they decided the strip.
 *
 *  Roles are shown and not changed (D8). Integrations and Subscription have
 *  nothing behind them on this site and are not drawn.
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { apiCall, apiWrite, getDoc, listAll } from "@/api/client";
import { create } from "@/api/crud";
import { employeesLocked } from "@/data/menus";
import { WorkLocations } from "@/features/attendance/AttendanceSettings";
import { pagesOf } from "@/data/nav";
import { deskUrl } from "@/lib/desk";
import { tidyDept } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, Pill } from "@/components/kit/ui";
import { KitModal, ModalFoot, toast } from "@/components/kit/overlay";

const ICON = {
	company: "building", offices: "pin", departments: "layers", titles: "brief", schedules: "clock",
	shifts: "timer", calendar: "calendar", permission: "shield", password: "lock", notifications: "bell", overview: "check", coverage: "chart", security: "eye",
};
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);

/** The reference's settings page around any settings section. */
export function SettingsFrame({ children }) {
	const s = useApp();
	const list = pagesOf("settings", s.user, s.admin);
	return (
		<div className="kit k-enter">
			<PageHead title="Settings" sub="Manage your company and account" />
			<div className="k-set-wrap">
				<nav className="k-set-nav" aria-label="Settings sections">
					{list.map(([k, l]) => (
						<button key={k} type="button" className={k === s.subtab ? "k-on" : undefined} aria-current={k === s.subtab ? "page" : undefined}
							onClick={() => navigate("settings", k)}>
							<KitIcon name={ICON[k] || "gear"} size={18} stroke={2} />{l}
						</button>
					))}
				</nav>
				<div style={{ minWidth: 0 }}>{children}</div>
			</div>
		</div>
	);
}

/** A section already built elsewhere, inside the frame. Its own heading is
    the section's title, so the frame does not repeat it. */
export const framed = (Page) => function Framed() {
	return <SettingsFrame><div className="setframe-body"><Page /></div></SettingsFrame>;
};

function Card({ title, act, children }) {
	return (
		<div className="k-card">
			<div className="k-sec-h"><h3>{title}</h3>{act}</div>
			{children}
		</div>
	);
}

const deskLink = (s, dt, name) => (s.site ? deskUrl(s.site, dt, name) : "");

/* --------------------------------------------------------------- company --- */

const CO_FIELDS = [["email", "Company email", "email"], ["phone_no", "Phone", "tel"], ["website", "Website", "url"]];

export function CompanyInfo() {
	const s = useApp();
	const [rows, setRows] = useState(null);
	const [pick, setPick] = useState("");
	const [f, setF] = useState({});
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		listAll("Company", ["name", "abbr", "country", "default_currency", "email", "phone_no", "website"])
			.catch(() => listAll("Company", ["name", "abbr", "country", "default_currency"]))
			.catch(() => listAll("Company", ["name"])).then(setRows).catch(() => setRows([]));
	}, []);
	const name = pick || s.company || rows?.[0]?.name || "";
	const c = (rows || []).find((r) => r.name === name);
	useEffect(() => { if (c) setF(Object.fromEntries(CO_FIELDS.map(([k]) => [k, c[k] || ""]))); }, [c?.name]);
	if (rows === null) return <SettingsFrame><div className="k-sk" style={{ height: 240 }} /></SettingsFrame>;
	const save = async (e) => {
		e.preventDefault();
		const patch = Object.fromEntries(CO_FIELDS.map(([k]) => [k, f[k]]).filter(([k, v]) => (c[k] || "") !== v));
		if (!Object.keys(patch).length) { toast("Nothing changed"); return; }
		setBusy(true);
		const r = await apiWrite("Company", name, patch);
		setBusy(false);
		if (!r.ok) { toast(`The site refused this: ${r.error}`); return; }
		setRows(rows.map((x) => (x.name === name ? { ...x, ...patch } : x)));
		toast("Company info saved");
	};
	return (
		<SettingsFrame>
			<form className="k-card" noValidate onSubmit={save}>
				<div className="k-sec-h"><h3>Company info</h3>
					{rows.length > 1 ? (
						<select className="k-sel" aria-label="Company" value={name} style={{ width: "auto", height: 38 }} onChange={(e) => setPick(e.target.value)}>
							{rows.map((r) => <option key={r.name}>{r.name}</option>)}
						</select>
					) : null}
				</div>
				{c ? (
					<>
						<div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
							<span className="k-icon-sq" style={{ width: 64, height: 64, fontSize: 22, background: "rgb(var(--live-dark))", color: "#fff", borderRadius: 16 }}>{(c.abbr || c.name).slice(0, 2)}</span>
							<div><b style={{ fontSize: 16 }}>{c.name}</b><div className="k-muted" style={{ fontSize: 13 }}>{[c.country, c.default_currency].filter(Boolean).join(" · ")}</div></div>
						</div>
						<div className="k-form-grid">
							{CO_FIELDS.filter(([k]) => k in c).map(([k, label, type]) => (
								<div className="k-field" key={k}>
									<label htmlFor={`co-${k}`}>{label}</label>
									<input id={`co-${k}`} className="k-inp" type={type} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
								</div>
							))}
						</div>
						{CO_FIELDS.some(([k]) => k in c) ? (
							<div className="k-modal-f"><button type="submit" className="k-btn k-btn-ink" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
						) : null}
					</>
				) : <EmptyState icon="building" title="No company" sub="" />}
			</form>
		</SettingsFrame>
	);
}

/* ------------------------------------------------- offices, departments --- */

/* The offices are the work locations: Attendance Settings → Location's own
   list, with its Add and Edit, since the Work Locations page left the menu
   (21 October 2026) and the button here pointed at it. */
export function Offices() {
	return <SettingsFrame><div className="k-card"><WorkLocations title="Offices" /></div></SettingsFrame>;
}

function CountList({ title, rows, field, label = (x) => x, dt, act }) {
	const s = useApp();
	const active = (s.employees || []).filter((e) => e.status === "Active");
	const list = rows.map((r) => ({ name: r.name || r, n: active.filter((e) => e[field] === (r.name || r)).length, off: Number(r.disabled) === 1 }))
		.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
	const href = deskLink(s, dt);
	return (
		<SettingsFrame>
			<Card title={title} act={act !== undefined ? act : href ? <a className="k-btn k-btn-line k-btn-sm" href={href} target="_blank" rel="noreferrer"><KitIcon name="edit" size={14} stroke={2} />Manage on the site</a> : null}>
				{list.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Name", "People", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{list.map((r) => (
									<tr key={r.name}>
										<td className="k-title-cell"><b>{label(r.name)}</b></td>
										<td data-label="People" className="k-num">{r.n}</td>
										<td data-label="">{r.off ? <Pill status="Closed">Disabled</Pill> : null}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="layers" title={`No ${title.toLowerCase()} yet`} sub="" />}
			</Card>
		</SettingsFrame>
	);
}

/* A department is made here rather than on the desk (21 October 2026, asked
   for by HR). ERPNext names it "<name> - <company abbreviation>" and files it
   under All Departments; the list is read again from the site afterwards, so
   the name shown is the one it gave. A duplicate is refused there, in its own
   words. */
function DeptForm({ onClose }) {
	const s = useApp();
	const cos = (s.companies || []).map((c) => c.name);
	const [f, setF] = useState({ name: "", company: s.company || cos[0] || "" });
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	const save = async (e) => {
		e.preventDefault();
		const name = f.name.trim();
		if (!name) { setErr("Name the department"); return; }
		if (!f.company) { setErr("Pick a company"); return; }
		setBusy(true);
		const r = await create("Department", { department_name: name, company: f.company });
		if (!r.ok) { setBusy(false); setErr(r.error || "The site refused this."); return; }
		const rows = await listAll("Department", ["name", "disabled"])
			.catch(() => listAll("Department", ["name"])).catch(() => null);
		if (rows) set({ departments: rows });
		setBusy(false);
		toast(`${tidyDept(r.name) || name} added`);
		onClose();
	};
	return (
		<KitModal title="Add department" onClose={onClose}>
			<form noValidate onSubmit={save}>
				<div className="k-form-grid">
					<div className={`k-field k-full${err ? " k-bad" : ""}`}>
						<label htmlFor="dp-name">Department name</label>
						<input id="dp-name" className="k-inp" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} />
						{err ? <small className="k-err">{err}</small> : null}
					</div>
					<div className="k-field k-full">
						<label htmlFor="dp-co">Company</label>
						<select id="dp-co" className="k-sel" value={f.company} onChange={(e) => { setF({ ...f, company: e.target.value }); setErr(""); }}>
							{cos.length ? null : <option value="">No company</option>}
							{cos.map((c) => <option key={c}>{c}</option>)}
						</select>
					</div>
				</div>
				<ModalFoot ok="Add department" busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

export const Departments = () => {
	const s = useApp();
	const [adding, setAdding] = useState(false);
	const add = employeesLocked(s.user) ? null : (
		<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => setAdding(true)}>
			<KitIcon name="plus" size={16} stroke={2} />Add department
		</button>
	);
	return (
		<>
			<CountList title="Departments" rows={s.departments || []} field="department" label={tidyDept} dt="Department" act={add} />
			{adding ? <DeptForm onClose={() => setAdding(false)} /> : null}
		</>
	);
};
/* A job title is made here rather than on the desk too (21 October 2026, asked
   for by HR). On the site it is a Designation, named by what was typed; the
   list is read again afterwards, and a duplicate is refused there, in its own
   words. */
function TitleForm({ onClose }) {
	const [name, setName] = useState("");
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);
	const save = async (e) => {
		e.preventDefault();
		const v = name.trim();
		if (!v) { setErr("Name the job title"); return; }
		setBusy(true);
		const r = await create("Designation", { designation_name: v });
		if (!r.ok) { setBusy(false); setErr(r.error || "The site refused this."); return; }
		const rows = await listAll("Designation", ["name"]).catch(() => null);
		if (rows) set({ designations: rows });
		setBusy(false);
		toast(`${r.name || v} added`);
		onClose();
	};
	return (
		<KitModal title="Add job title" onClose={onClose}>
			<form noValidate onSubmit={save}>
				<div className="k-form-grid">
					<div className={`k-field k-full${err ? " k-bad" : ""}`}>
						<label htmlFor="jt-name">Job title</label>
						<input id="jt-name" className="k-inp" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} />
						{err ? <small className="k-err">{err}</small> : null}
					</div>
				</div>
				<ModalFoot ok="Add job title" busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

export const Titles = () => {
	const s = useApp();
	const [adding, setAdding] = useState(false);
	const add = employeesLocked(s.user) ? null : (
		<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => setAdding(true)}>
			<KitIcon name="plus" size={16} stroke={2} />Add job title
		</button>
	);
	return (
		<>
			<CountList title="Job titles" rows={s.designations || []} field="designation" dt="Designation" act={add} />
			{adding ? <TitleForm onClose={() => setAdding(false)} /> : null}
		</>
	);
};

export function Schedules() {
	const s = useApp();
	const shifts = (s.shiftTypes || []).map((r) => r.name).sort();
	const active = (s.employees || []).filter((e) => e.status === "Active");
	return (
		<SettingsFrame>
			<Card title="Work schedules" act={<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("settings", "shifts")}><KitIcon name="edit" size={14} stroke={2} />Manage shifts</button>}>
				{shifts.length ? shifts.map((n) => (
					<div className="k-list-row" key={n}>
						<span className="k-icon-sq"><KitIcon name="clock" size={18} stroke={2} /></span>
						<div className="k-grow"><b>{n}</b><small>{active.filter((e) => e.default_shift === n).length} people on it by default</small></div>
						<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => navigate("attendance", "settings")}>Hours</button>
					</div>
				)) : <EmptyState icon="clock" title="No shifts yet" sub="" />}
			</Card>
		</SettingsFrame>
	);
}

/* ------------------------------------------------------------ permission --- */

export function Permission() {
	const s = useApp();
	const [users, setUsers] = useState(null);
	useEffect(() => {
		listAll("User", ["name", "full_name", "enabled", "role_profile_name", "last_login", "user_type"], [["user_type", "=", "System User"]], 500)
			.catch(() => listAll("User", ["name", "full_name", "enabled"], [["user_type", "=", "System User"]], 500))
			.then(setUsers).catch(() => setUsers([]));
	}, []);
	return (
		<SettingsFrame>
			<Card title="Permission">
				{users === null ? <div className="k-sk" style={{ height: 200 }} /> : users.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["User", "Role profile", "Last sign-in", "", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{users.filter((u) => !["Administrator", "Guest"].includes(u.name)).sort((a, b) => String(a.full_name || a.name).localeCompare(String(b.full_name || b.name))).map((u) => (
									<tr key={u.name}>
										<td className="k-title-cell"><b>{u.full_name || u.name}</b><small style={{ display: "block", color: "rgb(var(--ink-3))" }}>{u.name}</small></td>
										<td data-label="Role profile">{u.role_profile_name || "—"}</td>
										<td data-label="Last sign-in">{u.last_login ? String(u.last_login).slice(0, 16) : "—"}</td>
										<td data-label="">{Number(u.enabled) ? <Pill status="Active" /> : <Pill status="Inactive" />}</td>
										<td data-label="">{s.site ? <a className="k-btn k-btn-ghost k-btn-sm" href={deskLink(s, "User", u.name)} target="_blank" rel="noreferrer">Roles</a> : null}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="shield" title="Users could not be read" sub="This login may not read users on the site." />}
			</Card>
		</SettingsFrame>
	);
}

/* -------------------------------------------------------------- password --- */

export function Password() {
	const [f, setF] = useState({ old: "", next: "", again: "" });
	const [bad, setBad] = useState({});
	const [busy, setBusy] = useState(false);
	const put = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setBad({ ...bad, [k]: "" }); };
	const save = async (e) => {
		e.preventDefault();
		const b = {};
		if (!f.old) b.old = "Enter your current password";
		if (f.next.length < 8) b.next = "Use at least 8 characters";
		if (f.again !== f.next) b.again = "The two do not match";
		setBad(b);
		if (Object.values(b).some(Boolean)) return;
		setBusy(true);
		try {
			await apiCall("frappe.core.doctype.user.user.update_password", { old_password: f.old, new_password: f.next });
			setF({ old: "", next: "", again: "" });
			toast("Password changed");
		} catch (x) {
			setBad({ old: why(x) });
		} finally { setBusy(false); }
	};
	const field = (k, label) => (
		<div className={`k-field${bad[k] ? " k-bad" : ""}`}>
			<label htmlFor={`pw-${k}`}>{label}</label>
			<input id={`pw-${k}`} className="k-inp" type="password" autoComplete={k === "old" ? "current-password" : "new-password"} value={f[k]} onChange={put(k)} />
			{bad[k] ? <small className="k-err">{bad[k]}</small> : null}
		</div>
	);
	return (
		<SettingsFrame>
			<form className="k-card" noValidate onSubmit={save} style={{ maxWidth: 560 }}>
				<div className="k-sec-h"><h3>Change password</h3></div>
				<div className="k-form-grid" style={{ gridTemplateColumns: "1fr" }}>
					{field("old", "Current password")}{field("next", "New password")}{field("again", "New password again")}
				</div>
				<div className="k-modal-f"><button type="submit" className="k-btn k-btn-ink" disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
			</form>
		</SettingsFrame>
	);
}

/* --------------------------------------------------------- notifications --- */

const NOTE_SWITCHES = [
	["enabled", "Notifications", "Anything the site tells you, in the bell."],
	["enable_email_notifications", "By email", "A copy of each notification by email."],
	["enable_email_assignment", "Assigned to me", "When something is assigned to you."],
	["enable_email_mention", "Mentions", "When somebody mentions you."],
	["enable_email_share", "Shared with me", "When a document is shared with you."],
	["enable_email_event_reminders", "Event reminders", "Before an event in your calendar."],
];

export function NotificationSettings() {
	const s = useApp();
	const [doc, setDoc] = useState(undefined);
	useEffect(() => { getDoc("Notification Settings", s.user).then(setDoc); }, [s.user]);
	const flip = async (k, v) => {
		const r = await apiWrite("Notification Settings", s.user, { [k]: v ? 1 : 0 });
		if (!r.ok) { toast(`The site refused this: ${r.error}`); return; }
		setDoc({ ...doc, [k]: v ? 1 : 0 });
		toast(v ? "Turned on" : "Turned off");
	};
	return (
		<SettingsFrame>
			<Card title="Notifications">
				{doc === undefined ? <div className="k-sk" style={{ height: 200 }} /> : !doc ? (
					<EmptyState icon="bell" title="Your notification settings could not be read" sub="" />
				) : NOTE_SWITCHES.filter(([k]) => k in doc).map(([k, t]) => (
					<div className="k-tog-row" key={k}>
						<div><b>{t}</b></div>
						<label className="k-switch"><input type="checkbox" aria-label={t} checked={Boolean(Number(doc[k]))} onChange={(e) => void flip(k, e.target.checked)} /><span /></label>
					</div>
				))}
			</Card>
		</SettingsFrame>
	);
}
