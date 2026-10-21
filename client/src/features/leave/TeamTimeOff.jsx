/** Team Time Off, as the HRDashboard reference draws it (21 October 2026):
 *  what is waiting, who is away today and who is in the next thirty days, then
 *  every request as a list under Pending / Approved / Declined / All or as a
 *  month calendar with the holidays on it. A request opens in the reference's
 *  side drawer, with Approve and Decline while it is open.
 *
 *  Deciding is features/approvals/decideLeave — the site's own submit, which
 *  refuses what hrms refuses (a balance that does not cover it, an overlap,
 *  approving your own where HR Settings says so). Add request is Apply Leave,
 *  which raises an Open draft and decides nothing.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { navigate } from "@/routes/router";
import { loadLeaveList } from "@/api/leavelist";
import { decideLeave, leaveSpan } from "@/features/approvals/decideLeave";
import { ownEmployee } from "@/features/attendance/attstate";
import { dmy, todayIso, ymd } from "@/lib/format";
import { avatarTone } from "@/components/kit/KitAvatar";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Pill, Seg, SegTabs, Who, stagger } from "@/components/kit/ui";
import { KitDrawer, toast } from "@/components/kit/overlay";

/* hrms's words for a status, and the reference's. Open is the queue. */
const STATUS = { Open: "Pending", Approved: "Approved", Rejected: "Rejected", Cancelled: "Cancelled" };
const TABS = [["Pending", "Pending"], ["Approved", "Approved"], ["Rejected", "Declined"], ["All", "All"]];

/** A leave type's colour, from its name — the avatar pairs, so every type is
    the same colour wherever it is drawn and every pairing is checked. */
export const typeTone = (t) => avatarTone(t || "?");
const typeStyle = (t, dashed) => ({
	background: `rgb(var(--av${typeTone(t)}))`, color: `rgb(var(--av${typeTone(t)}-ink))`,
	...(dashed ? { outline: "1px dashed currentColor", outlineOffset: -1 } : {}),
});
function TypePill({ type }) {
	return <span className="k-pill k-nodot" style={typeStyle(type)}>{type || "—"}</span>;
}

const day10 = (v) => String(v || "").slice(0, 10);
const daysOf = (r) => (r.total_leave_days != null ? Number(r.total_leave_days) : null);

/** The reference's drawer: who, what, when, the balance, the note, and what
    has happened to it. */
function Detail({ r, s, onClose, onDecide, busy }) {
	const e = s.byName[r.employee] || { employee_name: r.employee_name || r.employee, designation: "" };
	const st = STATUS[r.status] || r.status;
	return (
		<KitDrawer title="Time off request" onClose={onClose}>
			<div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 4 }}>
				<KitAvatar name={e.employee_name} size={64} />
				<div><h2 style={{ margin: 0, fontSize: 19 }}>{e.employee_name}</h2><div className="k-muted">{e.designation || ""}</div></div>
			</div>
			<div className="k-sec" style={{ marginTop: 20 }}>
				<div className="k-sec-h"><h3>{r.leave_type}</h3><Pill status={st} /></div>
				<dl style={{ margin: 0 }}>
					{[["From", dmy(day10(r.from_date))], ["To", dmy(day10(r.to_date))],
						["Days", daysOf(r) == null ? "—" : `${daysOf(r)}${Number(r.half_day) ? " (half day)" : ""}`],
						["Balance", r.leave_balance != null ? `${r.leave_balance} days before this` : "—"],
						["Approver", r.leave_approver_name || r.leave_approver || "—"],
						["Note", r.description || "—"]].map(([k, v]) => (
						<div className="k-kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>
					))}
				</dl>
			</div>
			<h3 style={{ fontSize: 15, margin: "20px 0 6px" }}>Timeline</h3>
			<div className="k-tl">
				<div className="k-tl-i"><b>Requested</b><small>{dmy(day10(r.posting_date))}</small></div>
				{r.status === "Open"
					? <div className="k-tl-i"><b>Waiting for approval</b><small>{r.leave_approver_name || r.leave_approver || "No approver named"}</small></div>
					: <div className="k-tl-i"><b>{st === "Rejected" ? "Declined" : st}</b><small>{r.modified_by ? `by ${r.modified_by}` : ""} {dmy(day10(r.modified))}</small></div>}
			</div>
			<div className="k-modal-f">
				{r.status === "Open" ? (
					<>
						<button type="button" className="k-btn k-btn-line" disabled={busy} onClick={() => onDecide(r, "Reject")}>Decline</button>
						<button type="button" className="k-btn k-btn-green" disabled={busy} onClick={() => onDecide(r, "Approve")}>
							<KitIcon name="tick" size={16} stroke={2.4} />Approve
						</button>
					</>
				) : <button type="button" className="k-btn k-btn-ink" onClick={onClose}>Done</button>}
			</div>
		</KitDrawer>
	);
}

/** The month as the reference draws it: Monday first, six weeks, each day
    with up to two requests on it and the holiday it is. */
function Calendar({ rows, holidays, onOpen }) {
	const t = new Date();
	const [m, setM] = useState(new Date(t.getFullYear(), t.getMonth(), 1));
	const first = new Date(m.getFullYear(), m.getMonth(), 1);
	const start = new Date(first);
	start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
	const today = todayIso();
	const cells = Array.from({ length: 42 }, (_, i) => {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		return d;
	});
	const types = [...new Set(rows.map((r) => r.leave_type).filter(Boolean))].sort();
	const shift = (n) => setM(n === 0 ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(m.getFullYear(), m.getMonth() + n, 1));
	return (
		<>
			<div className="k-card-h">
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><KitIcon name="left" size={18} stroke={2} /></button>
					<h3 style={{ minWidth: 170, textAlign: "center" }}>{m.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
					<button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><KitIcon name="right" size={18} stroke={2} /></button>
					<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => shift(0)}>Today</button>
				</div>
				<div className="k-legend" style={{ flexWrap: "wrap" }}>
					{types.map((ty) => <span key={ty}><i style={{ background: `rgb(var(--av${typeTone(ty)}-ink))` }} />{ty}</span>)}
					<span><i style={{ background: "rgb(var(--bad-fill))" }} />Holiday</span>
				</div>
			</div>
			<div style={{ overflowX: "auto" }}>
				<div className="k-cal" style={{ minWidth: 640 }}>
					{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div className="k-dh" key={d}>{d}</div>)}
					{cells.map((d) => {
						const iso = ymd(d);
						const ev = rows.filter((r) => r.status !== "Rejected" && r.status !== "Cancelled"
							&& day10(r.from_date) <= iso && day10(r.to_date) >= iso);
						const hol = holidays.get(iso);
						return (
							<div key={iso} className={`k-dc${d.getMonth() !== m.getMonth() ? " k-out" : ""}${iso === today ? " k-today" : ""}`}>
								<span className="k-dn">{d.getDate()}</span>
								{hol ? <span className="k-ev" style={{ background: "rgb(var(--bad-wash))", color: "rgb(var(--bad))" }} title={hol}>{hol}</span> : null}
								{ev.slice(0, 2).map((r) => (
									<button type="button" className="k-ev" key={r.name} style={typeStyle(r.leave_type, r.status === "Open")}
										title={`${r.employee_name} · ${r.leave_type}`} onClick={() => onOpen(r)}>
										{String(r.employee_name || r.employee).split(" ")[0]}
									</button>
								))}
								{ev.length > 2 ? <span className="k-more">+{ev.length - 2} more</span> : null}
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}

export default function TeamTimeOff() {
	const s = useApp();
	const [tab, setTab] = useState("Pending");
	const [view, setView] = useState("list");
	const [open, setOpen] = useState(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => { void loadLeaveList(); }, []);

	const inCo = (r) => !s.company || r.company === s.company || s.byName[r.employee]?.company === s.company;
	const all = (s.lvAll.rows || []).filter(inCo);
	/* The queue the first load holds is the truth for Pending until this read
	   is in; after a decision both are read back. */
	const byName = new Map(all.map((r) => [r.name, r]));
	for (const r of (s.approvals.leave || []).filter(inCo)) if (!byName.has(r.name)) byName.set(r.name, r);
	const rows = [...byName.values()];
	const today = todayIso();
	const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return ymd(d); })();
	const pending = rows.filter((r) => r.status === "Open");
	const away = rows.filter((r) => r.status === "Approved" && day10(r.from_date) <= today && day10(r.to_date) >= today);
	const soon = rows.filter((r) => r.status === "Approved" && day10(r.from_date) > today && day10(r.from_date) <= in30);
	const list = rows.filter((r) => tab === "All" || (tab === "Pending" ? r.status === "Open" : r.status === tab))
		.sort((a, b) => day10(a.from_date).localeCompare(day10(b.from_date)));
	const holidays = new Map();
	for (const rowsOf of Object.values(s.holidays || {})) {
		for (const h of rowsOf || []) if (!Number(h.weekly_off)) holidays.set(day10(h.holiday_date), h.description || "Holiday");
	}
	const count = (t) => (t === "All" ? rows.length : t === "Pending" ? pending.length : rows.filter((r) => r.status === t).length);

	async function decide(r, action) {
		setBusy(true);
		const res = await decideLeave(r, action);
		setBusy(false);
		if (!res.ok) { toast(res.msg); return; }
		setOpen(null);
		toast(action === "Approve" ? `Approved for ${String(r.employee_name || "").split(" ")[0] || "them"}` : "Request declined");
		void loadLeaveList({ fresh: true });
	}

	return (
		<div className="kit k-enter">
			<PageHead title="Team Time Off" sub="Review requests and see who’s away">
				<Seg label="View" value={view} onChange={setView} options={[["list", "List"], ["cal", "Calendar"]]} />
				{ownEmployee(s) ? (
					<button type="button" className="k-btn k-btn-line" onClick={() => navigate("leave", "mine")}>
						<KitIcon name="user" size={18} stroke={2} />My time off
					</button>
				) : null}
				<button type="button" className="k-btn k-btn-ink" onClick={() => navigate("leave", "overview")}>
					<KitIcon name="plus" size={18} stroke={2} />Add request
				</button>
			</PageHead>
			<div className="k-mini-grid">
				{[["Awaiting review", pending.length, pending.length === 1 ? "request" : "requests"],
					["Away today", away.length, away.length === 1 ? "person" : "people"],
					["Next 30 days", soon.length, "approved"]].map(([t, n, w], i) => (
					<div className="k-mini k-anim" style={stagger(i)} key={t}>
						<div className="k-mini-t">{t}</div>
						<div className="k-mini-v"><b>{n}</b>{w}</div>
					</div>
				))}
			</div>
			<div className="k-card">
				{s.lvAll.state === "error" ? <p className="k-err" role="alert">Only the open requests could be read; the rest did not come back from the site.</p> : null}
				{view === "cal" ? (
					<Calendar rows={rows} holidays={holidays} onOpen={setOpen} />
				) : (
					<>
						<div className="k-card-h">
							<SegTabs label="Status" value={tab} onChange={setTab} tabs={TABS} count={count} />
						</div>
						{list.length ? (
							<div className="k-tbl-wrap">
								<table className="k-rt">
									<thead><tr>{["Employee", "Type", "From", "To", "Days", "Note", "Status", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
									<tbody>
										{list.map((r) => (
											<tr key={r.name} className="k-click" tabIndex={0} onClick={() => setOpen(r)}
												onKeyDown={(ev) => { if (ev.key === "Enter") setOpen(r); }}>
												<td className="k-title-cell"><Who name={r.employee_name || r.employee} sub={s.byName[r.employee]?.designation || ""} /></td>
												<td data-label="Type"><TypePill type={r.leave_type} /></td>
												<td data-label="From">{dmy(day10(r.from_date))}</td>
												<td data-label="To">{dmy(day10(r.to_date))}</td>
												<td data-label="Days" className="k-num">{daysOf(r) ?? "—"}</td>
												<td data-label="Note" className="k-muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.description || "—"}</td>
												<td data-label="Status"><Pill status={STATUS[r.status] || r.status} /></td>
												<td data-label="" onClick={(ev) => ev.stopPropagation()}>
													{r.status === "Open" ? (
														<div className="k-row-act">
															<button type="button" className="k-btn k-btn-green k-btn-sm" disabled={busy}
																aria-label={`Approve ${r.employee_name}, ${leaveSpan(r)}`} onClick={() => void decide(r, "Approve")}>
																<KitIcon name="tick" size={14} stroke={2.4} />Approve
															</button>
															<button type="button" className="k-btn k-btn-line k-btn-sm" disabled={busy}
																aria-label={`Decline ${r.employee_name}, ${leaveSpan(r)}`} onClick={() => void decide(r, "Reject")}>
																Decline
															</button>
														</div>
													) : null}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<EmptyState icon="tick" title="Nothing here" sub="No requests with this status." />
						)}
					</>
				)}
			</div>
			{open ? <Detail r={open} s={s} busy={busy} onClose={() => setOpen(null)} onDecide={(r, a) => void decide(r, a)} /> : null}
		</div>
	);
}
