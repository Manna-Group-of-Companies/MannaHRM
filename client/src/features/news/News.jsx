/** News, as the HRDashboard reference draws it (21 October 2026): the posts
 *  as cards under category tabs and a search, one post with "More news" beside
 *  it, and the form that writes one — on `Manna Announcement` (api/news.js).
 *
 *  The reference's `R.news`, `newsDetail` and `newsForm`. Its pin, cover
 *  colour and notify switch have no field behind them yet (D4), so they are
 *  not drawn; the cover takes its colour from the category, and Published and
 *  the dates the front page obeys are on the form instead. A draft carries a
 *  Draft pill, because the people who can see one are the people who could
 *  publish it by mistake.
 */

import { useCallback, useEffect, useState } from "react";
import { useApp, set } from "@/store";
import { navigate } from "@/routes/router";
import { KINDS, bodyHtml, bodyText, dateOf, deleteNews, readNews, saveNews } from "@/api/news";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Pill, SegTabs, stagger } from "@/components/kit/ui";
import { Confirm, toast } from "@/components/kit/overlay";
import { todayIso } from "@/lib/format";

const COVER = { Announcement: "chart-1", "CEO Speak": "chart-2" };
const cover = (kind) => ({ background: `rgb(var(--${COVER[kind] || "rest"}))` });
const fmt = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);
const author = (n) => n.posted_by || n.owner || "HR";

/** Read once per page open, and again after a save. */
function useNews() {
	const [rows, setRows] = useState(null);
	const [err, setErr] = useState("");
	const reload = useCallback(() => {
		readNews().then((r) => { setRows(r); setErr(""); }).catch((x) => { setRows([]); setErr(why(x)); });
	}, []);
	useEffect(() => { reload(); }, [reload]);
	return { rows, err, reload };
}

const open = (id, view = "item") => { set({ newsId: id }); navigate("news", view); };

function Back({ title, onBack, children }) {
	return (
		<div className="k-ph">
			<div>
				<button type="button" className="k-back" onClick={onBack}><KitIcon name="left" size={22} stroke={2} />{title}</button>
			</div>
			{children ? <div className="k-ph-act">{children}</div> : <div className="k-ph-act" />}
		</div>
	);
}

/** Every post, as the reference's cards. */
function List() {
	const s = useApp();
	const { rows, err } = useNews();
	const [cat, setCat] = useState("All");
	const [q, setQ] = useState("");
	const t = q.trim().toLowerCase();
	const shown = (rows || []).filter((n) => (cat === "All" || n.kind === cat)
		&& (!t || `${n.title} ${bodyText(n.body)}`.toLowerCase().includes(t)));
	const create = s.admin ? (
		<button type="button" className="k-btn k-btn-ink" onClick={() => navigate("news", "new")}>
			<KitIcon name="plus" size={18} stroke={2} />Create news
		</button>
	) : null;

	return (
		<div className="kit k-enter">
			<PageHead title="News" sub="Updates and announcements for everyone">{create}</PageHead>
			<div className="k-card" style={{ marginBottom: 20 }}>
				<div className="k-card-h" style={{ margin: 0 }}>
					<div style={{ overflowX: "auto", maxWidth: "100%" }}>
						<SegTabs tabs={["All", ...KINDS]} value={cat} onChange={setCat} label="Category" />
					</div>
					<div className="k-inp-ic" style={{ minWidth: 240 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search news" value={q} aria-label="Search news" onChange={(e) => setQ(e.target.value)} />
					</div>
				</div>
			</div>
			{err ? <div className="k-card" style={{ marginBottom: 20 }}><EmptyState icon="info" title="The news could not be read" sub={err} /></div> : null}
			{rows === null ? <div className="k-sk" style={{ height: 260 }} /> : shown.length ? (
				<div className="k-news-grid">
					{shown.map((n, i) => (
						<button type="button" className="k-news-card k-anim" style={stagger(i)} key={n.name} onClick={() => open(n.name)}>
							<div className="k-cover" style={cover(n.kind)}>
								<span className="k-pill k-nodot">{n.kind}</span>
								{Number(n.published) ? null : <span className="k-pill k-nodot" style={{ marginLeft: 6 }}>Draft</span>}
							</div>
							<div className="k-nb">
								<h3>{n.title}</h3>
								<p>{bodyText(n.body)}</p>
								<div className="k-news-meta">
									<KitAvatar name={author(n)} size={22} />
									{author(n)} · {fmt(dateOf(n))}
								</div>
							</div>
						</button>
					))}
				</div>
			) : (
				<div className="k-card">
					<div className="k-empty-st" style={{ padding: "60px 20px" }}>
						<div className="k-e-ic" style={{ width: 72, height: 72 }}><KitIcon name="news" size={30} stroke={1.8} /></div>
						<b>{rows.length ? "No news matches" : "No news yet"}</b>
						{rows.length ? "Try another category or search." : "Share an update with the whole company."}
						{create ? <div>
							<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("news", "new")}>
								<KitIcon name="plus" size={18} stroke={2} />Create news
							</button>
						</div> : null}
					</div>
				</div>
			)}
		</div>
	);
}

/** One post, and three more beside it. */
function Item() {
	const s = useApp();
	const { rows } = useNews();
	const [ask, setAsk] = useState(false);
	const [err, setErr] = useState("");
	const n = (rows || []).find((x) => x.name === s.newsId);

	if (rows === null) return <div className="kit k-enter"><div className="k-sk" style={{ height: 320 }} /></div>;
	if (!n) {
		return (
			<div className="kit k-enter">
				<div className="k-card">
					<EmptyState icon="news" title="This post is not there" sub="It may have been deleted.">
						<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("news")}>Go to News</button>
					</EmptyState>
				</div>
			</div>
		);
	}
	const more = rows.filter((x) => x.name !== n.name).slice(0, 3);
	const paras = bodyText(n.body).split("\n").filter((p) => p.trim());

	return (
		<div className="kit k-enter">
			<Back title="News detail" onBack={() => navigate("news")}>
				{s.admin ? (
					<>
						<button type="button" className="k-btn k-btn-line" onClick={() => open(n.name, "edit")}><KitIcon name="edit" size={16} stroke={2} />Edit</button>
						<button type="button" className="k-btn k-btn-line" style={{ color: "rgb(var(--bad))" }} onClick={() => setAsk(true)}>
							<KitIcon name="trash" size={16} stroke={2} />Delete
						</button>
					</>
				) : null}
			</Back>
			{err ? <p className="k-err" style={{ marginBottom: 12 }}>{err}</p> : null}
			<div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24 }} className="k-news-split">
				<article className="k-card k-article">
					<div className="k-cover" style={cover(n.kind)}>
						<span className="k-pill k-nodot">{n.kind}</span>
						{Number(n.published) ? null : <span className="k-pill k-nodot" style={{ marginLeft: 6 }}>Draft</span>}
					</div>
					<h1 style={{ fontSize: 28, margin: "0 0 12px", letterSpacing: "-.02em" }}>{n.title}</h1>
					<div className="k-news-meta" style={{ margin: "0 0 24px", padding: 0 }}>
						<KitAvatar name={author(n)} size={28} />
						<b style={{ color: "rgb(var(--ink))" }}>{author(n)}</b> · {fmt(dateOf(n))}
						{n.to_date ? <> · until {fmt(String(n.to_date).slice(0, 10))}</> : null}
					</div>
					<div className="k-prose">
						{paras.map((p, i) => <p key={i} style={{ color: "rgb(var(--ink))" }}>{p}</p>)}
					</div>
				</article>
				<aside>
					<div className="k-card">
						<h3 style={{ fontSize: 16, marginBottom: 12 }}>More news</h3>
						{more.length ? more.map((x) => (
							<button type="button" className="k-list-row" style={{ width: "100%", textAlign: "left" }} key={x.name} onClick={() => open(x.name)}>
								<span className="k-icon-sq" style={{ ...cover(x.kind), color: "rgb(var(--on-brand))" }}><KitIcon name="news" size={18} stroke={2} /></span>
								<div className="k-grow"><b style={{ fontSize: 13.5 }}>{x.title}</b><small>{fmt(dateOf(x))}</small></div>
							</button>
						)) : <p className="k-muted">Nothing else yet.</p>}
					</div>
				</aside>
			</div>
			{ask ? (
				<Confirm title="Delete this news?" sub="It will be removed for everyone." ok="Delete" onClose={() => setAsk(false)}
					onOk={async () => {
						try { await deleteNews(n.name); toast("News deleted"); setAsk(false); navigate("news"); } catch (x) { setErr(why(x)); setAsk(false); }
					}} />
			) : null}
		</div>
	);
}

/** Create a post, or change one. */
function Form({ editing }) {
	const s = useApp();
	const { rows } = useNews();
	const n = editing ? (rows || []).find((x) => x.name === s.newsId) : null;
	const [v, setV] = useState(null);
	const [bad, setBad] = useState({});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	useEffect(() => {
		if (v) return;
		if (!editing) {
			setV({ title: "", kind: KINDS[0], body: "", published: false, from_date: todayIso(), to_date: "", company: s.company || "" });
		} else if (n) {
			setV({
				title: n.title || "", kind: n.kind || KINDS[0], body: bodyText(n.body), published: !!Number(n.published),
				from_date: String(n.from_date || "").slice(0, 10), to_date: String(n.to_date || "").slice(0, 10), company: n.company || "",
			});
		}
	}, [editing, n, v, s.company]);

	const back = () => (editing && n ? open(n.name) : navigate("news"));
	if (editing && rows !== null && !n) {
		return (
			<div className="kit k-enter">
				<div className="k-card"><EmptyState icon="news" title="This post is not there" sub="It may have been deleted." /></div>
			</div>
		);
	}
	if (!v) return <div className="kit k-enter"><div className="k-sk" style={{ height: 320 }} /></div>;

	const put = (k) => (e) => {
		const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
		setV({ ...v, [k]: val });
		setBad({ ...bad, [k]: "" });
	};
	const submit = async (e) => {
		e.preventDefault();
		const b = {};
		if (!v.title.trim()) b.title = "Add a headline";
		if (!v.body.trim()) b.body = "Write the story";
		if (v.from_date && v.to_date && v.to_date < v.from_date) b.to_date = "Ends before it starts";
		setBad(b);
		if (Object.values(b).some(Boolean)) return;
		setBusy(true);
		try {
			const doc = {
				title: v.title.trim(), kind: v.kind, body: bodyHtml(v.body), published: v.published ? 1 : 0,
				from_date: v.from_date || null, to_date: v.to_date || null, company: v.company || null,
			};
			if (!editing) Object.assign(doc, { posted_by: s.me?.full_name || s.user || "", posted_on: todayIso() });
			const id = await saveNews(editing ? n.name : "", doc);
			toast(editing ? "News updated" : v.published ? "News published" : "Draft saved");
			open(id);
		} catch (x) {
			setErr(why(x));
		} finally {
			setBusy(false);
		}
	};
	const field = (k, label, input, full = false) => (
		<div className={`k-field${full ? " k-full" : ""}${bad[k] ? " k-bad" : ""}`}>
			<label htmlFor={`news-${k}`}>{label}</label>
			{input}
			{bad[k] ? <small className="k-err">{bad[k]}</small> : null}
		</div>
	);

	return (
		<div className="kit k-enter">
			<Back title={editing ? "Edit news" : "Create news"} onBack={back} />
			<form className="k-card" style={{ maxWidth: 820 }} noValidate onSubmit={submit}>
				<div className="k-cover" style={{ ...cover(v.kind), borderRadius: 16, marginBottom: 20 }}>
					<span className="k-pill k-nodot">{v.kind}</span>
				</div>
				<div className="k-form-grid">
					{field("title", "Headline", <input id="news-title" className="k-inp" maxLength={140} value={v.title} onChange={put("title")} />, true)}
					{field("kind", "Category", (
						<select id="news-kind" className="k-sel" value={v.kind} onChange={put("kind")}>
							{KINDS.map((k) => <option key={k}>{k}</option>)}
						</select>
					))}
					{field("company", "Who sees it", (
						<select id="news-company" className="k-sel" value={v.company} onChange={put("company")}>
							<option value="">Everybody in the group</option>
							{(s.companies || []).map((c) => {
								const name = typeof c === "string" ? c : c.name;
								return <option key={name} value={name}>{name}</option>;
							})}
						</select>
					))}
					{field("from_date", "Show from", <input id="news-from_date" type="date" className="k-inp" value={v.from_date} onChange={put("from_date")} />)}
					{field("to_date", "Show until", <input id="news-to_date" type="date" className="k-inp" value={v.to_date} onChange={put("to_date")} />)}
					{field("body", "Story", <textarea id="news-body" className="k-inp" rows={10} value={v.body} onChange={put("body")} />, true)}
				</div>
				<div className="k-tog-row">
					<div><b>Published</b><span className="k-s">On the front page for everybody it is meant for, between those dates.</span></div>
					<label className="k-switch">
						<input type="checkbox" aria-label="Published" checked={v.published} onChange={put("published")} /><span />
					</label>
				</div>
				{err ? <p className="k-err">{err}</p> : null}
				<div className="k-modal-f">
					<button type="button" className="k-btn k-btn-line" onClick={back}>Cancel</button>
					<button type="submit" className="k-btn k-btn-ink" disabled={busy}>
						{busy ? "Working…" : editing ? "Save changes" : v.published ? "Publish" : "Save draft"}
					</button>
				</div>
			</form>
		</div>
	);
}

export default function News() {
	const { subtab } = useApp();
	if (subtab === "item") return <Item />;
	if (subtab === "new") return <Form editing={false} />;
	if (subtab === "edit") return <Form editing />;
	return <List />;
}
