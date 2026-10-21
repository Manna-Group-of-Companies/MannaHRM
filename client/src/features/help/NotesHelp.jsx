/** Notifications and the Help center, as the HRDashboard reference draws them
 *  (21 October 2026).
 *
 *  Notifications are the site's own Notification Log for the signed-in person
 *  — what the desk's bell shows — with the reference's tabs and its bell on the
 *  top bar. Help is fixed text (D18): the FAQ is this app's, the privacy policy
 *  is the reference's marked as a draft for HR, and support goes by email to IT.
 */

import { useEffect, useRef, useState } from "react";
import { getState, set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { apiCall, apiWrite, listAll } from "@/api/client";
import { dmy } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, SegTabs } from "@/components/kit/ui";
import { toast } from "@/components/kit/overlay";

/* ---------------------------------------------------------- the reads --- */

const NOTE_FIELDS = ["name", "subject", "type", "document_type", "document_name", "from_user", "read", "creation"];

export async function loadNotes({ fresh = false } = {}) {
	const cur = getState().notes;
	if (!fresh && (cur.state === "loading" || cur.state === "ok")) return;
	set({ notes: { ...cur, state: "loading" } });
	const rows = await listAll("Notification Log", NOTE_FIELDS, [["for_user", "=", getState().user]], 100).catch(() => null);
	set({ notes: rows ? { state: "ok", rows: rows.sort((a, b) => String(b.creation).localeCompare(String(a.creation))) } : { state: "error", rows: [] } });
}

async function markRead(name, read = true) {
	const r = await apiWrite("Notification Log", name, { read: read ? 1 : 0 });
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
	const { notes } = getState();
	set({ notes: { ...notes, rows: notes.rows.map((n) => (n.name === name ? { ...n, read: read ? 1 : 0 } : n)) } });
}
async function markAll() {
	await apiCall("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read", {});
	const { notes } = getState();
	set({ notes: { ...notes, rows: notes.rows.map((n) => ({ ...n, read: 1 })) } });
}

const textOf = (html) => new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "";
const ICON = { Mention: "chat", Assignment: "check", Share: "users", Alert: "bell", "Energy Point": "star" };
const ago = (iso) => {
	const m = Math.round((Date.now() - Date.parse(String(iso).replace(" ", "T"))) / 60000);
	if (!Number.isFinite(m)) return "";
	if (m < 1) return "just now";
	if (m < 60) return `${m} min ago`;
	if (m < 1440) return `${Math.round(m / 60)} h ago`;
	return dmy(String(iso).slice(0, 10));
};
const openDoc = (s, n) => {
	if (n.document_type && n.document_name && s.site) {
		window.open(`${s.site}/app/${n.document_type.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(n.document_name)}`, "_blank", "noreferrer");
	}
};

/* ---------------------------------------------------- the top bar's bell --- */

/** The reference's bell: the newest few, a dot while any is unread, and the
    way to them all. */
export function NoteBell() {
	const s = useApp();
	const [open, setOpen] = useState(false);
	const box = useRef(null);
	useEffect(() => { if (s.user) void loadNotes(); }, [s.user]);
	useEffect(() => {
		if (!open) return undefined;
		const shut = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
		document.addEventListener("mousedown", shut);
		return () => document.removeEventListener("mousedown", shut);
	}, [open]);
	const rows = s.notes.rows || [];
	const unread = rows.filter((n) => !Number(n.read)).length;
	return (
		<span className="empdrop" ref={box}>
			<button type="button" className="tbicon icon-btn" aria-haspopup="menu" aria-expanded={open}
				aria-label={unread ? `${unread} unread notifications` : "Notifications"}
				onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
				<KitIcon name="bell" size={22} stroke={1.8} />
				{unread ? <span className="dot-n" aria-hidden="true" /> : null}
			</button>
			<div className="emmenu end tbmenu" role="menu" aria-label="Notifications" hidden={!open}>
				<h4>Notifications <span className="n">{unread}</span></h4>
				{rows.length ? rows.slice(0, 6).map((n) => (
					<button type="button" key={n.name} role="menuitem" className="tbnote"
						onClick={() => { setOpen(false); if (!Number(n.read)) void markRead(n.name).catch(() => {}); openDoc(s, n); }}>
						<KitIcon name={ICON[n.type] || "bell"} size={16} stroke={2} />
						<span className="tbnote-t"><b>{textOf(n.subject)}</b><span>{ago(n.creation)}</span></span>
					</button>
				)) : <p className="tbnone">You’re all caught up.</p>}
				<button type="button" role="menuitem" className="tbnote foot" onClick={() => { setOpen(false); navigate("notifications"); }}>
					<b>See all</b>
				</button>
			</div>
		</span>
	);
}

/* ------------------------------------------------- the notifications page --- */

export function Notifications() {
	const s = useApp();
	const [tab, setTab] = useState("All");
	useEffect(() => { void loadNotes({ fresh: true }); }, []);
	const rows = s.notes.rows || [];
	const L = rows.filter((n) => tab === "All" || (tab === "Unread" ? !Number(n.read) : Number(n.read)));
	const today = new Date().toDateString();
	const groups = [["Today", L.filter((n) => new Date(String(n.creation).replace(" ", "T")).toDateString() === today)],
		["Earlier", L.filter((n) => new Date(String(n.creation).replace(" ", "T")).toDateString() !== today)]];
	return (
		<div className="kit k-enter">
			<PageHead title="Notifications" sub="Everything that needs your attention">
				<button type="button" className="k-btn k-btn-line" disabled={!rows.some((n) => !Number(n.read))}
					onClick={async () => { try { await markAll(); toast("All marked as read"); } catch (x) { toast(String(x?.message || x)); } }}>
					<KitIcon name="tick" size={16} stroke={2} />Mark all as read
				</button>
				<button type="button" className="k-btn k-btn-line" onClick={() => navigate("settings", "notifications")}>
					<KitIcon name="gear" size={16} stroke={2} />Settings
				</button>
			</PageHead>
			<div className="k-card">
				<div className="k-card-h">
					<SegTabs label="Show" value={tab} onChange={setTab} tabs={["All", "Unread", "Read"]}
						count={(t) => (t === "All" ? rows.length : rows.filter((n) => (t === "Unread" ? !Number(n.read) : Number(n.read))).length)} />
				</div>
				{s.notes.state === "error" ? <p className="k-err" role="alert">Your notifications could not be read.</p> : null}
				{s.notes.state !== "ok" && s.notes.state !== "error" ? <div className="k-sk" style={{ height: 200 }} /> : L.length ? groups.filter((g) => g[1].length).map(([g, G]) => (
					<div key={g}>
						<div className="k-group-h">{g}</div>
						{G.map((n) => (
							<div key={n.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
								<button type="button" className={`k-notif${Number(n.read) ? "" : " k-unread"}`}
									onClick={() => { if (!Number(n.read)) void markRead(n.name).catch(() => {}); openDoc(s, n); }}>
									<span className="k-icon-sq"><KitIcon name={ICON[n.type] || "bell"} size={18} stroke={2} /></span>
									<div className="k-grow"><b style={{ fontWeight: 600 }}>{textOf(n.subject)}</b><p>{[n.document_type, n.document_name].filter(Boolean).join(" ")}</p><small>{ago(n.creation)}</small></div>
								</button>
								<button type="button" className="icon-btn" aria-label={Number(n.read) ? "Mark as unread" : "Mark as read"}
									onClick={() => void markRead(n.name, !Number(n.read)).catch((x) => toast(String(x?.message || x)))}>
									<KitIcon name="tick" size={16} stroke={2} />
								</button>
							</div>
						))}
					</div>
				)) : <EmptyState icon="bell" title="Nothing here" sub="You’re all caught up." />}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ help --- */

/** Who support goes to (D18): IT, by email. */
export const SUPPORT_EMAIL = "it@mannarubber.com";

export const FAQ = [
	["How do I add a new employee?", "Employees → Employee Master → Add new profile. Fill in the three steps and save. They appear on the list, the directory and the org chart straight away."],
	["Somebody’s punches are missing. What do I do?", "Open Attendance → Employee Attendance, pick the person and the day, and choose Correct this day. A correction writes the missing punch; the day is worked out again from the punches."],
	["How do people ask for leave?", "Time Off → Apply Leave raises the request as a draft. The approver decides it on Dashboard → Approvals."],
	["Where are the attendance reports?", "Attendance → Team Attendance → Download report. Pick the report, its dates and Excel or PDF."],
	["How is a month paid?", "Payroll → Payroll runs the month step by step: the salary slips, then the bank sheet. Employee Payroll shows each slip and its status."],
	["Why can I not see a page?", "Each login sees its own menu. Ask HR if a page you need is missing."],
	["Is anything deleted when I deactivate somebody?", "No. Deactivate sets the status to Inactive and hides their details until they are activated again."],
];

/* The reference's own policy (D18), kept as it is except the two places it
   describes its demo, which are not true of this app. Marked a draft until HR
   has read it. */
const PRIVACY = [
	["What we collect", "We store the information you enter about your company and your people: names, contact details, job details, time off, attendance and pay."],
	["How we use it", "Only to run HR features for your company: showing profiles, calculating balances and pay, and sending notifications you’ve turned on."],
	["Who can see it", "People in your company, based on the roles each login has on the site. We never sell your data."],
	["Where it lives", "On the company’s own ERPNext site. This app reads and writes it there, as the person signed in."],
	["Your choices", "You can correct any record you are allowed to change. Ask HR to change one you cannot."],
	["Contact", "Questions? Reach us from Help center → Contact support."],
];

/** The shortcuts this app has — and only those. */
export const SHORTCUTS = [
	[["/"], "Search people, pages and actions"],
	[["Ctrl", "K"], "Go to any page by name"],
	[["↑", "↓"], "Move through the search results"],
	[["Enter"], "Open the highlighted result"],
	[["Esc"], "Close a window or menu"],
];

function Crumbs({ title }) {
	const back = () => navigate("help", "overview");
	return (
		<div className="k-ph">
			<div>
				<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />{title}</button>
				<div className="k-crumbs"><button type="button" onClick={back}>Help center</button><KitIcon name="right" size={14} stroke={2} /><b>{title}</b></div>
			</div>
		</div>
	);
}

function Acc({ q, a, open: start = false }) {
	const [open, setOpen] = useState(start);
	return (
		<div className={`k-acc${open ? " k-open" : ""}`}>
			<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{q}<KitIcon name="plus" size={18} stroke={2} /></button>
			<div className="k-acc-b"><div><p>{a}</p></div></div>
		</div>
	);
}

function Contact() {
	const s = useApp();
	const [f, setF] = useState({ cat: "Question", subject: "", msg: "" });
	const [bad, setBad] = useState({});
	const send = (e) => {
		e.preventDefault();
		const b = {};
		if (!f.subject.trim()) b.subject = "Add a subject";
		if (!f.msg.trim()) b.msg = "Tell us what’s going on";
		setBad(b);
		if (Object.values(b).some(Boolean)) return;
		const body = `${f.msg.trim()}\n\n— ${s.me?.full_name || s.user} (${s.user})`;
		window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${f.cat}] ${f.subject.trim()}`)}&body=${encodeURIComponent(body)}`;
		toast("Your email is ready to send");
	};
	return (
		<>
			<Crumbs title="Contact Support" />
			<div className="k-split" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
				<form className="k-card" noValidate onSubmit={send}>
					<div className="k-sec-h"><h3>Send us a message</h3></div>
					<div className="k-form-grid">
						<div className="k-field k-full">
							<label htmlFor="cs-cat">Topic</label>
							<select id="cs-cat" className="k-sel" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
								{["Question", "Something is wrong", "A page I need", "Access"].map((x) => <option key={x}>{x}</option>)}
							</select>
						</div>
						<div className={`k-field k-full${bad.subject ? " k-bad" : ""}`}>
							<label htmlFor="cs-subject">Subject</label>
							<input id="cs-subject" className="k-inp" value={f.subject} onChange={(e) => { setF({ ...f, subject: e.target.value }); setBad({ ...bad, subject: "" }); }} />
							{bad.subject ? <small className="k-err">{bad.subject}</small> : null}
						</div>
						<div className={`k-field k-full${bad.msg ? " k-bad" : ""}`}>
							<label htmlFor="cs-msg">Message</label>
							<textarea id="cs-msg" className="k-inp" rows={6} value={f.msg} onChange={(e) => { setF({ ...f, msg: e.target.value }); setBad({ ...bad, msg: "" }); }} />
							{bad.msg ? <small className="k-err">{bad.msg}</small> : null}
						</div>
					</div>
					<div className="k-modal-f"><button type="submit" className="k-btn k-btn-ink"><KitIcon name="send" size={16} stroke={2} />Send message</button></div>
				</form>
				<div className="k-card">
					<div className="k-list-row"><span className="k-icon-sq"><KitIcon name="mail" size={18} stroke={2} /></span><div className="k-grow"><small>Email</small><b>{SUPPORT_EMAIL}</b></div></div>
					<div className="k-list-row"><span className="k-icon-sq"><KitIcon name="headset" size={18} stroke={2} /></span><div className="k-grow"><small>Goes to</small><b>IT</b></div></div>
				</div>
			</div>
		</>
	);
}

export function Help() {
	const s = useApp();
	const [q, setQ] = useState("");
	const sub = s.subtab;
	if (sub === "faq") {
		const t = q.toLowerCase();
		const L = FAQ.filter(([a, b]) => !t || `${a} ${b}`.toLowerCase().includes(t));
		return (
			<div className="kit k-enter">
				<Crumbs title="FAQ" />
				<div className="k-card">
					<div className="k-inp-ic" style={{ maxWidth: 420, marginBottom: 10 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search questions" value={q} aria-label="Search FAQ" onChange={(e) => setQ(e.target.value)} />
					</div>
					{L.length ? L.map(([a, b], i) => <Acc key={a} q={a} a={b} open={Boolean(t) && i === 0} />) : (
						<EmptyState icon="search" title="No questions match" sub="Try different words, or contact support.">
							<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => navigate("help", "contact")}>Contact support</button>
						</EmptyState>
					)}
				</div>
			</div>
		);
	}
	if (sub === "privacy") {
		return (
			<div className="kit k-enter">
				<Crumbs title="Privacy Policy" />
				<div className="k-card">
					<p style={{ marginTop: 0 }}><span className="k-pill k-p-yellow k-nodot">Draft — HR to review</span></p>
					<div className="k-prose">{PRIVACY.map(([h, p]) => <div key={h}><h3>{h}</h3><p>{p}</p></div>)}</div>
				</div>
			</div>
		);
	}
	if (sub === "shortcuts") {
		return (
			<div className="kit k-enter">
				<Crumbs title="Keyboard Shortcuts" />
				<div className="k-card">
					{SHORTCUTS.map(([k, d]) => (
						<div className="k-tog-row" key={d}>
							<span>{d}</span>
							<span style={{ display: "flex", gap: 6, alignItems: "center" }}>{k.map((x) => <kbd key={x} className="k-kbd-k">{x}</kbd>)}</span>
						</div>
					))}
				</div>
			</div>
		);
	}
	if (sub === "contact") return <div className="kit k-enter"><Contact /></div>;
	return (
		<div className="kit k-enter">
			<div className="k-help-hero">
				<h1>How can we help?</h1>
				<p>Search the answers, or browse the topics below.</p>
				<div className="k-inp-ic">
					<KitIcon name="search" size={18} stroke={2} />
					<input className="k-inp" placeholder="Search for answers" aria-label="Search help" value={q} onChange={(e) => setQ(e.target.value)}
						onKeyDown={(e) => { if (e.key === "Enter") navigate("help", "faq"); }} />
				</div>
			</div>
			<div className="k-grid2">
				{[["faq", "FAQ", "Answers to common questions.", "help"], ["shortcuts", "Keyboard shortcuts", "Move faster around the app.", "kbd"],
					["privacy", "Privacy policy", "How your data is handled.", "shield"], ["contact", "Contact support", "Get in touch with IT.", "headset"]].map(([g, t, d, i]) => (
					<button type="button" className="k-tile" key={g} onClick={() => navigate("help", g)}>
						<span className="k-ti"><KitIcon name={i} size={20} stroke={1.8} /></span><h3>{t}</h3><p>{d}</p>
					</button>
				))}
			</div>
			<div className="k-card" style={{ marginTop: 24 }}>
				<h3 style={{ marginBottom: 8 }}>Popular questions</h3>
				{FAQ.slice(0, 4).map(([a, b]) => <Acc key={a} q={a} a={b} />)}
			</div>
		</div>
	);
}
