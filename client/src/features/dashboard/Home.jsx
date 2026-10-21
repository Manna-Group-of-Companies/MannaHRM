/** The front page: the HRDashboard reference's Dashboard, Layouts 1 and 2,
 *  on this site's records (21 October 2026, docs/kit-pages.md D16).
 *
 *  Its markup is the reference's `R.dashboard` with the classes prefixed
 *  `k-`; its figures are lib/home.js over the rows the first load holds, and
 *  the handful nothing else reads are api/home.js. Where the reference makes
 *  a number up — its trends, its team performance — this shows the real one
 *  or nothing (lib/home.js says which).
 *
 *  Layout 2 carries Start Up underneath, as asked: the panels HR read every
 *  morning before this page existed are still here, one switch away.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp, set } from "@/store";
import Link from "@/routes/Link";
import { navigate } from "@/routes/router";
import { loadSeparations } from "@/api/load";
import { loadHome, loadAttendanceMonths } from "@/api/home";
import { attention, greeting, stateSegments, tableRows, tiles, typeBand } from "@/lib/home";
import { saveLayout } from "@/lib/homelayout";
import { groupsFor, shown } from "@/data/nav";
import { employeesLocked } from "@/data/menus";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import { CountUp, EmptyState, PageHead, Pager, Pill, Seg, Who, stagger } from "@/components/kit/ui";
import { DonutBlock, LineChart } from "@/components/kit/charts";
import Dashboard from "@/features/dashboard/Dashboard";

const PER_PAGE = 5;

/** The chart's figures: 4,200 reads as 4.2k on the axis, as the reference's.
    Below a thousand a fraction keeps its one decimal — a small site's axis
    runs 0, 0.5, 1, and rounding it read "1, 1, 2, 2". */
const short = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k`
	: Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

/** The login's first name: the User record's (`me`, read at sign-in for the
    account button too), else the part of the address before the @. */
const firstOf = (me, user) => {
	if (me?.first_name) return me.first_name;
	const local = String(user || "").split("@")[0];
	return local ? local[0].toUpperCase() + local.slice(1) : "";
};

/** While the first load is in: the reference's boot skeleton, shaped like the
    page that is coming. */
function Skeleton() {
	return (
		<div className="kit k-home-sk" aria-busy="true" aria-label="Loading the dashboard">
			<div className="k-sk" style={{ height: 28, width: 240, marginBottom: 10 }} />
			<div className="k-sk" style={{ height: 16, width: 300, marginBottom: 26 }} />
			<div className="k-card k-dash-top">
				<div className="k-stat-grid">
					{[0, 1, 2, 3].map((i) => (
						<div className="k-stat" key={i}>
							<div className="k-sk" style={{ width: 48, height: 48, borderRadius: "50%", marginBottom: 22 }} />
							<div className="k-sk" style={{ height: 30, width: "60%", marginBottom: 12 }} />
							<div className="k-sk" style={{ height: 14, width: "45%" }} />
						</div>
					))}
				</div>
				<div>
					<div className="k-sk" style={{ height: 22, width: 180, marginBottom: 18 }} />
					<div className="k-sk" style={{ height: 230 }} />
				</div>
			</div>
			<div className="k-dash-bot">
				<div className="k-card">
					<div className="k-sk" style={{ height: 22, width: 140, marginBottom: 20 }} />
					{[0, 1, 2, 3].map((i) => <div className="k-sk" key={i} style={{ height: 42, marginBottom: 10 }} />)}
				</div>
				<div className="k-card">
					<div className="k-sk" style={{ height: 200, width: 200, borderRadius: "50%", margin: "10px auto" }} />
				</div>
			</div>
		</div>
	);
}

/** The yellow strip: what is waiting, and the one button that deals with it. */
function Attention({ s, home }) {
	const a = attention({
		leave: (s.approvals.leave || []).length,
		corrections: (s.approvals.attendance || []).length,
		unpaid: home?.unpaid || 0,
		overdue: home?.overdue || 0,
	});
	if (!a) return null;
	return (
		<div className="k-alert k-anim" style={stagger(1)}>
			<span className="k-a-ic"><KitIcon name="bell" size={18} stroke={2} /></span>
			<p>
				{a.bits.map(([b, rest], i) => (
					<span key={i}>{i ? " · " : ""}<b>{b}</b>{rest}</span>
				))}
			</p>
			<Link section={a.go.section} subtab={a.go.subtab} className="k-btn k-btn-ink k-btn-sm">{a.go.label}</Link>
		</div>
	);
}

/** The attendance chart's card head and chart (D16: the reference's Team
    Performance, as Present and Absent by month). */
function AttendanceChart({ s, range, setRange }) {
	const att = s.homeAtt;
	const months = att?.months || [];
	return (
		<>
			<div className="k-card-h" style={{ marginBottom: 6 }}>
				<div>
					<h3>Attendance</h3>
					<div className="k-legend">
						<span><i style={{ background: "rgb(var(--chart-1))" }} />Present</span>
						<span><i style={{ background: "rgb(var(--chart-3))" }} />Absent</span>
					</div>
				</div>
				<select className="k-sel" value={range} aria-label="Chart range" style={{ width: "auto", height: 40 }}
					onChange={(e) => setRange(Number(e.target.value))}>
					<option value={7}>Last 7 months</option>
					<option value={12}>Last 12 months</option>
				</select>
			</div>
			{att?.state === "ok" ? (
				<LineChart
					labels={months.map((m) => m.label)}
					series={[
						{ name: "Present", tone: "chart-1", data: months.map((m) => m.present) },
						{ name: "Absent", tone: "chart-3", data: months.map((m) => m.absent) },
					]}
					min={0}
					fmt={short}
					label="Attendance by month"
				/>
			) : att?.state === "error" ? (
				<EmptyState icon="chart" title="Attendance could not be read" sub="The site did not answer for every month." />
			) : (
				<div className="k-sk" style={{ height: 230 }} />
			)}
		</>
	);
}

/** The employees card: search, three filters, five to a page. */
function EmployeesCard({ s, sepsByEmp }) {
	const [q, setQ] = useState("");
	const [f, setF] = useState({ department: "", designation: "", state: "" });
	const [page, setPage] = useState(1);
	const rows = tableRows(s.employees, sepsByEmp, { q, ...f, company: s.company });
	const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
	const at = Math.min(page, pages);
	const shownRows = rows.slice((at - 1) * PER_PAGE, at * PER_PAGE);
	const opts = (key) => [...new Set(s.employees
		.filter((e) => e.status === "Active" && (!s.company || e.company === s.company))
		.map((e) => e[key]).filter(Boolean))].sort();
	const filter = (key) => (e) => { setF({ ...f, [key]: e.target.value }); setPage(1); };
	const manager = (e) => {
		const m = s.byName[e.reports_to];
		return m ? "@" + String(m.employee_name || m.name).split(" ")[0].toLowerCase() : "—";
	};

	return (
		<div className="k-card k-anim" style={stagger(4)}>
			<div className="k-card-h">
				<h3>Employees</h3>
				<div className="k-inp-ic" style={{ minWidth: 260 }}>
					<KitIcon name="search" size={18} stroke={2} />
					<input className="k-inp" placeholder="Search employee" value={q} aria-label="Search employees"
						onChange={(e) => { setQ(e.target.value); setPage(1); }} />
				</div>
			</div>
			<div className="k-filters" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
				<select className="k-sel" aria-label="Department" value={f.department} onChange={filter("department")}>
					<option value="">All departments</option>
					{opts("department").map((d) => <option key={d}>{d}</option>)}
				</select>
				<select className="k-sel" aria-label="Job title" value={f.designation} onChange={filter("designation")}>
					<option value="">All job titles</option>
					{opts("designation").map((d) => <option key={d}>{d}</option>)}
				</select>
				<select className="k-sel" aria-label="Status" value={f.state} onChange={filter("state")}>
					<option value="">All status</option>
					{["Active", "Onboarding", "Offboarding"].map((d) => <option key={d}>{d}</option>)}
				</select>
			</div>
			{shownRows.length ? (
				<>
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead>
								<tr>
									{["Employee name", "Job title", "Line manager", "Department", "Company", "Status"].map((c) => (
										<th key={c}><span>{c}</span></th>
									))}
								</tr>
							</thead>
							<tbody>
								{shownRows.map((e) => (
									<tr key={e.name} className="k-click" tabIndex={0}
										onClick={() => openEmployee(e.name)}
										onKeyDown={(ev) => { if (ev.key === "Enter") openEmployee(e.name); }}>
										<td className="k-title-cell"><Who name={e.employee_name || e.name} sub={e.employee_number || e.name} /></td>
										<td data-label="Job title">{e.designation || "—"}</td>
										<td data-label="Line manager">{manager(e)}</td>
										<td data-label="Department">{e.department || "—"}</td>
										<td data-label="Company">{e.company || "—"}</td>
										<td data-label="Status">
											<Pill status={e.state} />{" "}
											<span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<Pager total={rows.length} page={at} per={PER_PAGE} onPage={setPage} />
				</>
			) : (
				<EmptyState icon="search" title="No one matches" sub="Try another name or clear the filters." />
			)}
		</div>
	);
}

/** The donut of everybody active, by the reference's three states. */
function TotalCard({ segments, i }) {
	return (
		<div className="k-card k-anim" style={stagger(i)}>
			<div className="k-card-h" style={{ marginBottom: 4 }}><h3>Total Employee</h3></div>
			<DonutBlock segments={segments} sub="Total Emp." onPick={() => navigate("employees")} />
		</div>
	);
}

export default function Home() {
	const s = useApp();
	const { company, user, admin, home } = s;
	const layout = s.homeLayout || 1;
	const [range, setRange] = useState(7);
	const [entering, setEntering] = useState(true);

	useEffect(() => { void loadSeparations(); }, []);
	useEffect(() => { if (s.connState === "live") void loadHome(company); }, [company, s.connState]);
	useEffect(() => { if (s.connState === "live") void loadAttendanceMonths(company, range); }, [company, range, s.connState]);
	/* The reference's arrival: the blocks rise in, once. */
	useEffect(() => {
		const t = setTimeout(() => setEntering(false), 1400);
		return () => clearTimeout(t);
	}, [layout]);

	const sepsByEmp = useMemo(() => Object.fromEntries((s.seps || []).map((x) => [x.name, x])), [s.seps]);
	const now = new Date();

	if (!s.connState) return <Skeleton />;

	const first = firstOf(s.me, user);
	const segments = stateSegments(s.employees, sepsByEmp, company, now);
	const canAdd = shown("employees", user, admin) && !employeesLocked(user);
	const canLeave = shown("leave", user, admin);
	const layoutSeg = (
		<Seg label="Dashboard layout" value={layout} options={[[1, "Layout 1"], [2, "Layout 2"]]}
			onChange={(v) => set({ homeLayout: saveLayout(v) })} />
	);
	const root = `kit k-home${entering ? " k-enter" : ""}`;

	if (layout === 2) {
		const band = typeBand(s.employees, s.seps || [], company, now);
		const jobs = home?.jobs || [];
		const jobSegs = [
			{ label: "Open", value: jobs.filter((j) => j.status === "Open").length, tone: "chart-1" },
			{ label: "Closed", value: jobs.filter((j) => j.status !== "Open").length, tone: "chart-3" },
		];
		return (
			<div className={root}>
				<div className="k-v2-band k-anim" style={stagger(0)}>
					<div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
						<div>
							<h1>Hi, {first}</h1>
							<p>This is your HR report so far</p>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
							<div className="k-v2-nav">
								{groupsFor(user, admin).map((g) => (
									<button key={g.key} type="button" onClick={() => navigate(g.items[0].section, g.items[0].subtab)}>{g.label}</button>
								))}
							</div>
							{layoutSeg}
						</div>
					</div>
				</div>
				<div className="k-card k-v2-types k-anim" style={stagger(1)}>
					{band.map((t) => (
						<div key={t.type}>
							<b style={{ fontWeight: 600 }}>{t.type}</b>
							<b className="k-n"><CountUp value={t.value} /></b>
							<span className="k-chg">
								{t.change == null ? "new this month" : (
									<>
										<em style={{ color: t.change >= 0 ? "rgb(var(--accent))" : "rgb(var(--bad))" }}>
											{t.change >= 0 ? "↑" : "↓"} {Math.abs(t.change)}%
										</em>{" "}
										{t.change >= 0 ? "increased" : "decreased"} vs last month
									</>
								)}
							</span>
						</div>
					))}
				</div>
				<Attention s={s} home={home} />
				<div className="k-v2-mid">
					<TotalCard segments={segments} i={2} />
					<div className="k-card k-anim" style={stagger(3)}>
						<div className="k-card-h" style={{ marginBottom: 4 }}><h3>Job Summary</h3></div>
						<DonutBlock segments={jobSegs} center={jobs.length} sub="Total Jobs"
							onPick={() => navigate("employees", "hierarchy")} />
					</div>
					<div className="k-card k-anim" style={stagger(4)}>
						<AttendanceChart s={s} range={range} setRange={setRange} />
					</div>
				</div>
				<div style={{ marginTop: 24 }}><EmployeesCard s={s} sepsByEmp={sepsByEmp} /></div>
				{/* Start Up, as it was: the morning's panels, under the reference's page. */}
				<div className="k-startup" style={{ marginTop: 24 }}><Dashboard embedded /></div>
			</div>
		);
	}

	const stats = tiles({ employees: s.employees, seps: s.seps || [], applicants: home?.applicants ?? null, company, now });
	const go = {
		total: ["employees", "overview"],
		applicants: ["employees", "hierarchy"],
		new: ["employees", "joining"],
		left: ["employees", "overview"],
	};

	return (
		<div className={root}>
			<PageHead title={`${greeting(now)}, ${first}`} sub="This is your HR report so far" className="k-anim">
				<div className="k-greet-acts">
					{layoutSeg}
					{canAdd ? (
						<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => navigate("employees", "new")}>
							<KitIcon name="plus" size={16} stroke={2} />Add employee
						</button>
					) : null}
					{canLeave ? (
						<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => navigate("leave")}>
							<KitIcon name="clock" size={16} stroke={2} />Request time off
						</button>
					) : null}
				</div>
			</PageHead>
			<Attention s={s} home={home} />
			<div className="k-card k-dash-top k-anim" style={stagger(2)}>
				<div className="k-stat-grid">
					{stats.map((t) => (
						<button key={t.key} type="button" className="k-stat" onClick={() => navigate(...go[t.key])}>
							<div className="k-stat-ic"><KitIcon name={t.icon} size={20} stroke={1.7} /></div>
							<div className="k-stat-v">
								{t.value == null ? <b>—</b> : <CountUp value={t.value} />}
								{t.trend == null ? null : (
									<span className={`k-trend ${t.trend >= 0 ? "k-up" : "k-down"}`}>
										<KitIcon name={t.trend >= 0 ? "trend" : "trendd"} size={14} stroke={2.2} />
										{t.trend > 0 ? "+" : ""}{t.trend}%
									</span>
								)}
							</div>
							<div className="k-stat-l">{t.label}<KitIcon name="arrow" size={16} stroke={2} /></div>
						</button>
					))}
				</div>
				<div><AttendanceChart s={s} range={range} setRange={setRange} /></div>
			</div>
			<div className="k-dash-bot">
				<EmployeesCard s={s} sepsByEmp={sepsByEmp} />
				<TotalCard segments={segments} i={5} />
			</div>
		</div>
	);
}
