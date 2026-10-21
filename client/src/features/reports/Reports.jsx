/** Reports, as the HRDashboard reference draws them (21 October 2026): eight
 *  tiles, each opening one report — a chart, the figures behind it and an
 *  Export — on the site's own records. All Reports, every report this app
 *  builds as Excel or PDF, stays as the section under the tiles (D2).
 *
 *  Where the reference makes a figure up (its turnover, its leavers), this
 *  counts the real ones or draws nothing.
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { listAll } from "@/api/client";
import { loadSeparations } from "@/api/load";
import { loadLeaveList } from "@/api/leavelist";
import { loadRecruitment, REJECTED, STAGES, STAGE_LABEL } from "@/api/jobs";
import { scoped } from "@/lib/scope";
import { dmy, tidyDept, todayIso, ymd } from "@/lib/format";
import { sheetsXlsx } from "@/lib/export";
import { openEmployee } from "@/features/employees/openEmployee";
import ReportsHub from "@/features/reports/ReportsHub";
import report from "@/features/reports/makeReport";
import InOut from "@/features/attendance/InOut";
import DailyDetail from "@/features/attendance/DailyDetail";
import MonthlyBasic from "@/features/attendance/MonthlyBasic";
import MonthlySummary from "@/features/attendance/MonthlySummary";
import { AbsentReport, OtReport, WeeklyReport } from "@/features/attendance/RangeReports";
import { allowedFor } from "@/data/menus";
import { ATT_TILES, REPORT_PAGES, REPORT_TILES } from "@/data/reportpages";

export { ATT_TILES, REPORT_PAGES, REPORT_TILES };
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { CountUp, EmptyState, PageHead, Pill, SegTabs, Who, stagger } from "@/components/kit/ui";
import { DonutBlock, LineChart } from "@/components/kit/charts";
import { toast } from "@/components/kit/overlay";
import { typeTone } from "@/features/leave/TeamTimeOff";



const day10 = (v) => String(v || "").slice(0, 10);
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return ymd(new Date(y, m, 0)); };
/** The last twelve months, oldest first, as `YYYY-MM`. */
export function last12(now = new Date()) {
	return Array.from({ length: 12 }, (_, i) => ymd(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)).slice(0, 7));
}
const mLabel = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" });

/** Who was on the books at the end of a month: joined by then, and not yet
    relieved. `relieved` is employee → relieving date. */
export function headcountAt(people, relieved, ym) {
	const end = monthEnd(ym);
	return people.filter((e) => e.date_of_joining && day10(e.date_of_joining) <= end
		&& !(relieved[e.name] && relieved[e.name] <= end)).length;
}

/** Bars of whole numbers, the reference's bar chart: one per label. */
function Bars({ labels, values, tone = "chart-1", label }) {
	const max = Math.max(1, ...values);
	return (
		<div role="img" aria-label={label} style={{ display: "grid", gridTemplateColumns: `repeat(${labels.length}, minmax(0,1fr))`, gap: 8, alignItems: "end", height: 220, paddingTop: 8 }}>
			{labels.map((l, i) => (
				<div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
					<b className="k-num" style={{ fontSize: 12 }}>{values[i] || ""}</b>
					<div style={{ width: "70%", height: `${(values[i] / max) * 160}px`, minHeight: values[i] ? 4 : 0, borderRadius: 6, background: `rgb(var(--${tone}))` }} />
					<small className="k-muted" style={{ fontSize: 11.5 }}>{l}</small>
				</div>
			))}
		</div>
	);
}

/** A labelled horizontal bar: the reference's `hbar`. */
function HBar({ label, n, max, tone = "chart-1" }) {
	return (
		<div className="k-hbar">
			<span>{label}</span>
			<div className="k-bar"><i style={{ width: `${max ? (n / max) * 100 : 0}%`, background: `rgb(var(--${tone}))` }} /></div>
			<b className="k-num">{n}</b>
		</div>
	);
}

function Mini({ items }) {
	return (
		<div className="k-mini-grid">
			{items.map(([t, v], i) => (
				<div className="k-mini k-anim" style={stagger(i)} key={t}>
					<div className="k-mini-t">{t}</div>
					<div className="k-mini-v">{typeof v === "number" ? <CountUp value={v} /> : <b>{v}</b>}</div>
				</div>
			))}
		</div>
	);
}

/** The heading every report has: back to Reports, the crumbs, and Export. */
function Head({ title, onExport }) {
	const back = () => navigate("reports", "overview");
	return (
		<div className="k-ph">
			<div>
				<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />{title}</button>
				<div className="k-crumbs"><button type="button" onClick={back}>Report</button><KitIcon name="right" size={14} stroke={2} /><b>{title}</b></div>
			</div>
			<div className="k-ph-act">
				{onExport ? <button type="button" className="k-btn k-btn-line" onClick={onExport}><KitIcon name="upload" size={18} stroke={2} />Export</button> : null}
			</div>
		</div>
	);
}

const exportSheet = async (title, head, rows) => {
	if (!rows.length) { toast("Nothing to export"); return; }
	const name = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayIso()}.xlsx`;
	await sheetsXlsx([{ title, sub: todayIso(), head, rows }], name);
	toast(`Downloaded ${name}`);
};

/* --------------------------------------------------------------- reports --- */

function useSeps() {
	const s = useApp();
	useEffect(() => { void loadSeparations(); }, []);
	return Object.fromEntries((s.seps || []).filter((x) => x.relieving_date).map((x) => [x.name, day10(x.relieving_date)]));
}

function Headcount() {
	const s = useApp();
	const relieved = useSeps();
	const people = scoped(s);
	const active = people.filter((e) => e.status === "Active");
	const M = last12();
	const by = (f) => {
		const m = new Map();
		for (const e of active) { const k = (f === "department" ? tidyDept(e[f]) : e[f]) || "Not set"; m.set(k, (m.get(k) || 0) + 1); }
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	};
	return (
		<>
			<Head title="Headcount" onExport={() => void exportSheet("Headcount", ["Name", "Code", "Company", "Department", "Designation", "Type", "Status", "Joined"],
				people.map((e) => [e.employee_name, e.employee_number || e.name, e.company, tidyDept(e.department), e.designation || "", e.employment_type || "", e.status, day10(e.date_of_joining)]))} />
			<Mini items={[["Total headcount", people.length], ["Active", active.length], ["Inactive", people.filter((e) => e.status === "Inactive").length], ["Left", people.filter((e) => e.status === "Left").length]]} />
			<div className="k-card" style={{ marginBottom: 24 }}>
				<div className="k-card-h"><h3>Headcount over time</h3><span className="k-muted">Last 12 months</span></div>
				<LineChart labels={M.map(mLabel)} series={[{ name: "Headcount", tone: "chart-1", data: M.map((m) => headcountAt(people, relieved, m)) }]} min={0} label="Headcount" />
			</div>
			<div className="k-grid3">
				{[["By department", "department"], ["By company", "company"], ["By type", "employment_type"]].map(([t, f]) => (
					<div className="k-card" key={f}>
						<h3 style={{ marginBottom: 14, fontSize: 16 }}>{t}</h3>
						{by(f).map(([k, n]) => <HBar key={k} label={k} n={n} max={active.length} />)}
					</div>
				))}
			</div>
		</>
	);
}

function Boarding({ on }) {
	const s = useApp();
	const relieved = useSeps();
	const people = scoped(s);
	const M = last12();
	const first = M[0] + "-01";
	const list = on
		? people.filter((e) => day10(e.date_of_joining) >= first).sort((a, b) => day10(b.date_of_joining).localeCompare(day10(a.date_of_joining)))
		: people.filter((e) => relieved[e.name] && relieved[e.name] >= first).sort((a, b) => relieved[b.name].localeCompare(relieved[a.name]));
	const when = (e) => (on ? day10(e.date_of_joining) : relieved[e.name]);
	const title = on ? "Onboarding" : "Offboarding";
	return (
		<>
			<Head title={title} onExport={() => void exportSheet(title, ["Name", "Department", "Designation", on ? "Joined" : "Last day"],
				list.map((e) => [e.employee_name, tidyDept(e.department), e.designation || "", when(e)]))} />
			<div className="k-card" style={{ marginBottom: 24 }}>
				<div className="k-card-h"><h3>{on ? "Joiners" : "Leavers"} by month</h3><span className="k-muted">Last 12 months</span></div>
				<Bars labels={M.map(mLabel)} values={M.map((m) => list.filter((e) => (when(e) || "").slice(0, 7) === m).length)}
					tone={on ? "chart-1" : "chart-2"} label={`${on ? "Joiners" : "Leavers"} by month`} />
			</div>
			<div className="k-card">
				<div className="k-card-h"><h3>{on ? "New employees" : "Leaving employees"}</h3><span className="k-muted">{list.length} {list.length === 1 ? "person" : "people"}</span></div>
				{list.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Employee", "Department", "Job title", on ? "Join date" : "Last working day", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{list.map((e) => (
									<tr key={e.name} className="k-click" tabIndex={0} onClick={() => openEmployee(e.name)} onKeyDown={(ev) => { if (ev.key === "Enter") openEmployee(e.name); }}>
										<td className="k-title-cell"><Who name={e.employee_name} sub={e.employee_number || ""} /></td>
										<td data-label="Department">{tidyDept(e.department) || "—"}</td>
										<td data-label="Job title">{e.designation || "—"}</td>
										<td data-label="Date">{dmy(when(e))}</td>
										<td data-label=""><span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="users" title="No one in this period" sub="" />}
			</div>
		</>
	);
}

function Pipeline() {
	const s = useApp();
	useEffect(() => { void loadRecruitment(); }, []);
	const apps = s.rec.apps || [];
	const live = apps.filter((a) => a.status !== REJECTED);
	const reach = STAGES.map((st, i) => live.filter((a) => STAGES.indexOf(a.status) >= i).length);
	const sources = [...new Set(apps.map((a) => a.source || "No source"))].sort();
	return (
		<>
			<Head title="Recruitment Pipeline" onExport={() => void exportSheet("Recruitment Pipeline", ["Candidate", "Job", "Stage", "Source", "Applied"],
				apps.map((a) => [a.applicant_name, (s.rec.jobs || []).find((j) => j.name === a.job_title)?.job_title || a.job_title, STAGE_LABEL[a.status] || a.status, a.source || "", day10(a.creation)]))} />
			<Mini items={[["Applicants", apps.length], ["In progress", live.filter((a) => a.status !== "Accepted").length], ["Hired", apps.filter((a) => a.status === "Accepted").length], ["Rejected", apps.filter((a) => a.status === REJECTED).length]]} />
			<div className="k-grid2">
				<div className="k-card">
					<h3 style={{ marginBottom: 14 }}>Funnel</h3>
					{STAGES.map((st, i) => <div className="k-funnel-row" key={st}><span>{STAGE_LABEL[st]}</span><div className="k-bar"><i style={{ width: `${reach[0] ? (reach[i] / reach[0]) * 100 : 0}%`, opacity: 1 - i * 0.12 }} /></div><b className="k-num">{reach[i]}</b></div>)}
				</div>
				<div className="k-card">
					<h3 style={{ marginBottom: 14 }}>By source</h3>
					{sources.map((x) => <HBar key={x} label={x} n={apps.filter((a) => (a.source || "No source") === x).length} max={apps.length} tone="chart-2" />)}
				</div>
			</div>
			<div className="k-card" style={{ marginTop: 24 }}>
				<div className="k-tbl-wrap">
					<table className="k-rt">
						<thead><tr>{["Job", "Status", "Applicants", ...STAGES.slice(1).map((st) => STAGE_LABEL[st])].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
						<tbody>
							{(s.rec.jobs || []).map((j) => {
								const c = apps.filter((a) => a.job_title === j.name);
								return (
									<tr key={j.name} className="k-click" tabIndex={0} onClick={() => { set({ recJob: j.name }); navigate("recruitment", "job"); }}>
										<td className="k-title-cell"><b>{j.job_title}</b></td>
										<td data-label="Status"><Pill status={j.status === "Open" ? "Open" : "Closed"} /></td>
										<td data-label="Applicants" className="k-num">{c.length}</td>
										{STAGES.slice(1).map((st, i) => <td key={st} data-label={STAGE_LABEL[st]} className="k-num">{c.filter((a) => a.status !== REJECTED && STAGES.indexOf(a.status) >= i + 1).length}</td>)}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</>
	);
}

function DataReport() {
	const s = useApp();
	const [tab, setTab] = useState("age");
	const [rows, setRows] = useState(null);
	useEffect(() => {
		listAll("Employee", ["name", "employee_name", "gender", "date_of_birth", "department", "company", "status"], [["status", "=", "Active"]], 500)
			.then(setRows).catch(() => setRows([]));
	}, []);
	const people = (rows || []).filter((e) => !s.company || e.company === s.company);
	const today = new Date();
	const ageOf = (dob) => { const b = new Date(day10(dob) + "T00:00:00"); let a = today.getFullYear() - b.getFullYear(); if (today < new Date(today.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
	/* The bridge gives a record it made from a punch 2000-01-01 as a placeholder
	   birth date (lib/scope.js); counting it would put every one at 26. */
	const dated = people.filter((e) => e.date_of_birth && day10(e.date_of_birth) !== "2000-01-01");
	const ages = dated.map((e) => ageOf(e.date_of_birth));
	const BANDS = [["Under 25", 0, 24], ["25–29", 25, 29], ["30–34", 30, 34], ["35–39", 35, 39], ["40–49", 40, 49], ["50+", 50, 200]];
	const genders = [...new Set(people.map((e) => e.gender || "Not set"))];
	const TONES = ["chart-1", "chart-2", "chart-3", "rest"];
	const up = dated.map((e) => {
		const b = new Date(day10(e.date_of_birth) + "T00:00:00");
		let n = new Date(today.getFullYear(), b.getMonth(), b.getDate());
		if (ymd(n) < todayIso()) n = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
		return { e, n, days: Math.round((n - new Date(todayIso() + "T00:00:00")) / 864e5) };
	}).sort((a, b) => a.n - b.n);
	return (
		<>
			<Head title="Employee Data" onExport={() => void exportSheet("Employee Data", ["Name", "Gender", "Date of birth", "Age", "Department"],
				people.map((e) => [e.employee_name, e.gender || "", day10(e.date_of_birth), e.date_of_birth ? ageOf(e.date_of_birth) : "", tidyDept(e.department)]))} />
			<div className="k-card">
				<SegTabs label="Report" value={tab} onChange={setTab} tabs={[["age", "Age"], ["gender", "Gender"], ["birthday", "Birthday"]]} />
				{rows === null ? <div className="k-sk" style={{ height: 240, marginTop: 20 }} /> : tab === "age" ? (
					<>
						<div className="k-mini-grid" style={{ marginTop: 20 }}>
							{[["Average age", ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "—"], ["Youngest", ages.length ? Math.min(...ages) : "—"], ["Oldest", ages.length ? Math.max(...ages) : "—"]].map(([t, v]) => (
								<div className="k-mini" key={t} style={{ background: "rgb(var(--wash))", boxShadow: "none" }}><div className="k-mini-t">{t}</div><div className="k-mini-v"><b>{v}</b></div></div>
							))}
						</div>
						<Bars labels={BANDS.map((b) => b[0])} values={BANDS.map((b) => ages.filter((a) => a >= b[1] && a <= b[2]).length)} label="Age distribution" />
					</>
				) : tab === "gender" ? (
					<div className="k-grid2" style={{ marginTop: 20, alignItems: "center" }}>
						<DonutBlock segments={genders.map((g, i) => ({ label: g, value: people.filter((e) => (e.gender || "Not set") === g).length, tone: TONES[i % TONES.length] }))} sub="Employees" />
						<div>
							{[...new Set(people.map((e) => tidyDept(e.department) || "No department"))].sort().map((d) => {
								const L = people.filter((e) => (tidyDept(e.department) || "No department") === d);
								return (
									<div key={d} style={{ marginBottom: 12 }}>
										<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><b>{d}</b><span className="k-muted">{L.length}</span></div>
										<div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "rgb(var(--wash))" }}>
											{genders.map((g, i) => { const n = L.filter((e) => (e.gender || "Not set") === g).length; return n ? <i key={g} title={`${g}: ${n}`} style={{ width: `${(n / L.length) * 100}%`, background: `rgb(var(--${TONES[i % TONES.length]}))` }} /> : null; })}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<div className="k-grid2" style={{ marginTop: 20 }}>
						<div className="k-sec" style={{ margin: 0 }}>
							<div className="k-sec-h"><h3>Coming up</h3></div>
							{up.slice(0, 8).map((x) => (
								<div className="k-list-row" key={x.e.name}>
									<KitAvatar name={x.e.employee_name} />
									<div className="k-grow"><b>{x.e.employee_name}</b><small>{x.n.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} · turns {ageOf(x.e.date_of_birth) + 1}</small></div>
									{x.days === 0 ? <Pill status="Hired">Today</Pill> : x.days <= 7 ? <Pill status="Pending">in {x.days} day{x.days === 1 ? "" : "s"}</Pill> : <span className="k-muted" style={{ fontSize: 12.5 }}>in {x.days} days</span>}
								</div>
							))}
							{!up.length ? <p className="k-muted">No birth dates on file.</p> : null}
						</div>
						<div className="k-sec" style={{ margin: 0 }}>
							<div className="k-sec-h"><h3>By month</h3></div>
							<Bars labels={Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("en-US", { month: "short" }))}
								values={Array.from({ length: 12 }, (_, i) => dated.filter((e) => Number(day10(e.date_of_birth).slice(5, 7)) === i + 1).length)} tone="chart-3" label="Birthdays by month" />
						</div>
					</div>
				)}
			</div>
		</>
	);
}

function Schedule() {
	const s = useApp();
	useEffect(() => { void loadLeaveList(); }, []);
	const days = 30;
	const from = todayIso();
	const to = ymd(new Date(Date.now() + (days - 1) * 864e5));
	const L = (s.lvAll.rows || []).filter((l) => (l.status === "Approved" || l.status === "Open") && day10(l.to_date) >= from && day10(l.from_date) <= to
		&& (!s.company || l.company === s.company)).sort((a, b) => day10(a.from_date).localeCompare(day10(b.from_date)));
	const pos = (iso) => Math.max(0, Math.min(days, (new Date(iso + "T00:00:00") - new Date(from + "T00:00:00")) / 864e5));
	const types = [...new Set(L.map((l) => l.leave_type))];
	return (
		<>
			<Head title="Time Off Schedule" onExport={() => void exportSheet("Time Off Schedule", ["Employee", "Type", "From", "To", "Status"],
				L.map((l) => [l.employee_name, l.leave_type, day10(l.from_date), day10(l.to_date), l.status === "Open" ? "Pending" : l.status]))} />
			<div className="k-card">
				<div className="k-card-h"><h3>Next 30 days</h3>
					<div className="k-legend">{types.map((t) => <span key={t}><i style={{ background: `rgb(var(--av${typeTone(t)}-ink))` }} />{t}</span>)}</div>
				</div>
				{s.lvAll.state !== "ok" && s.lvAll.state !== "error" ? <div className="k-sk" style={{ height: 200 }} /> : L.length ? (
					<div className="k-gantt">
						{L.map((l) => {
							const a = pos(day10(l.from_date));
							const b = pos(ymd(new Date(new Date(day10(l.to_date) + "T00:00:00").getTime() + 864e5)));
							return (
								<div className="k-gantt-row" key={l.name}>
									<div className="k-who"><KitAvatar name={l.employee_name} /><div><b style={{ fontSize: 13 }}>{l.employee_name}</b><small>{dmy(day10(l.from_date))} – {dmy(day10(l.to_date))}</small></div></div>
									<div className="k-gantt-track">
										<span className="k-gantt-bar" title={`${l.leave_type} · ${l.status === "Open" ? "Pending" : l.status}`}
											style={{ left: `${(a / days) * 100}%`, width: `${Math.max(3, ((b - a) / days) * 100)}%`, background: `rgb(var(--av${typeTone(l.leave_type)}-ink))`, opacity: l.status === "Open" ? 0.55 : 1 }}>
											{l.total_leave_days ?? ""}d
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : <EmptyState icon="calendar" title="No time off in the next 30 days" sub="" />}
			</div>
		</>
	);
}

function Turnover() {
	const s = useApp();
	const relieved = useSeps();
	const people = scoped(s);
	const M = last12();
	const left = (m) => people.filter((e) => (relieved[e.name] || "").slice(0, 7) === m).length;
	const rates = M.map((m) => { const h = headcountAt(people, relieved, m); return h ? Math.round((left(m) / h) * 1000) / 10 : 0; });
	const avg = rates.length ? (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1) : "0";
	return (
		<>
			<Head title="Employee Turnover Rate" onExport={() => void exportSheet("Employee Turnover Rate", ["Month", "Headcount", "Leavers", "Rate %"],
				M.map((m, i) => [m, headcountAt(people, relieved, m), left(m), rates[i]]))} />
			<Mini items={[["Average monthly rate", `${avg}%`], ["This month", `${rates[rates.length - 1]}%`], ["Leavers (12 months)", M.reduce((t, m) => t + left(m), 0)], ["Current headcount", people.filter((e) => e.status === "Active").length]]} />
			<div className="k-card">
				<div className="k-card-h"><h3>Turnover rate by month</h3><span className="k-muted">Leavers ÷ headcount</span></div>
				<LineChart labels={M.map(mLabel)} series={[{ name: "Rate", tone: "bad", data: rates }]} min={0} fmt={(v) => `${v}%`} label="Turnover" />
			</div>
		</>
	);
}

/* --------------------------------------------------------------- the page --- */


const ATT_PAGE = {
	inout: InOut, daily: DailyDetail, monthly: MonthlyBasic, summary: MonthlySummary,
	present: report("attendance", "present"), absent: AbsentReport, msp: report("attendance", "msp"),
	iocount: report("attendance", "iocount"), shiftrep: report("attendance", "shiftrep"),
	ot: OtReport, weekly: WeeklyReport,
};


/** The attendance boxes this login may open: those its attendance menu names,
    or all of them where its menu is the whole module. */
export function attTilesFor(user, admin) {
	const only = allowedFor("attendance", user, admin);
	return ATT_TILES.filter((t) => !only || only.includes(t[0]));
}

function Box({ t, d, i, n, onClick }) {
	return (
		<button type="button" className="k-tile k-anim" style={stagger(n)} onClick={onClick}>
			<span className="k-ti"><KitIcon name={i} size={20} stroke={1.8} /></span>
			<h3>{t}</h3>
			<p>{d}</p>
		</button>
	);
}

function Tiles() {
	const s = useApp();
	const att = attTilesFor(s.user, s.admin);
	const open = (k) => (k === "balance" ? navigate("leave", "balances") : navigate("reports", k));
	return (
		<div className="kit k-enter">
			<PageHead title="Report" sub="Here’s the report so far" />
			{att.length ? (
				<>
					<h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Attendance</h2>
					<div className="k-grid2" style={{ marginBottom: 28 }}>
						{att.map(([k, t, d, i], n) => <Box key={k} t={t} d={d} i={i} n={n} onClick={() => open(k)} />)}
					</div>
				</>
			) : null}
			<h2 style={{ margin: "0 0 12px", fontSize: 18 }}>People and hiring</h2>
			<div className="k-grid2">
				{REPORT_TILES.map(([k, t, d, i], n) => <Box key={k} t={t} d={d} i={i} n={n + att.length} onClick={() => open(k)} />)}
				<Box t="All reports" d="Every report, to download as Excel or PDF." i="file" n={att.length + REPORT_TILES.length} onClick={() => open("all")} />
			</div>
		</div>
	);
}

/** A report opened from its box: back to Reports above it, the report under. */
function Opened({ title, children }) {
	return (
		<div className="repopen">
			<div className="kit"><Head title={title} /></div>
			{children}
		</div>
	);
}

export default function Reports() {
	const s = useApp();
	const k = s.subtab;
	const att = ATT_TILES.find((t) => t[0] === k);
	if (att) {
		const Page = ATT_PAGE[k];
		/* Only what this login's attendance menu had; another address lands on
		   the boxes rather than on a report its menu did not give it. */
		if (!attTilesFor(s.user, s.admin).some((t) => t[0] === k)) return <Tiles />;
		return <Opened title={att[1]}><Page /></Opened>;
	}
	if (k === "all") return <Opened title="All reports"><ReportsHub /></Opened>;
	const body = k === "headcount" ? <Headcount /> : k === "onboarding" ? <Boarding on /> : k === "offboarding" ? <Boarding on={false} />
		: k === "pipeline" ? <Pipeline /> : k === "data" ? <DataReport /> : k === "schedule" ? <Schedule /> : k === "turnover" ? <Turnover /> : null;
	if (body) return <div className="kit k-enter">{body}</div>;
	return <Tiles />;
}
