/** Team Attendance, as the HRDashboard reference draws it (21 October 2026):
 *  who is in today — four figures, a row of tabs, and everybody active in the
 *  company picked with their first in and last out — on the same read and the
 *  same arithmetic as Daily Detail (api/attendance.js `loadDda`,
 *  lib/dailydetail.js), so a person reads the same here as on every report.
 *
 *  Each day's state is features/attendance/attstate.js.
 */

import { useEffect, useState } from "react";
import { useApp, set } from "@/store";
import { navigate } from "@/routes/router";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { rangeRowsFrom } from "@/features/attendance/RangeReports";
import { tidyDept, todayIso } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { CountUp, EmptyState, PageHead, Pill, SegTabs, Who, stagger } from "@/components/kit/ui";
import DownloadReport from "@/features/attendance/DownloadReport";
import { PILL_OF, ownEmployee, teamState } from "@/features/attendance/attstate";

const TONE = { Present: "chart-1", Late: "chart-3", "On leave": "chart-2", Absent: "bad" };

export default function TeamAttendance() {
	const s = useApp();
	const today = todayIso();
	const [tab, setTab] = useState("All");
	useEffect(() => {
		void loadShiftWindows();
		void loadDda(today, today, "");
	}, [today]);
	const { ready, rows, err } = rangeRowsFrom(s, today, today);
	const list = rows.map((r) => ({ r, st: teamState(r) }))
		.sort((a, b) => String(a.r.emp.employee_name).localeCompare(String(b.r.emp.employee_name)));
	const count = (st) => list.filter((x) => x.st === st).length;
	const shown = list.filter((x) => tab === "All" || x.st === tab);
	const open = (e) => { set({ attEmp: e.name }); navigate("attendance", "employee"); };
	const when = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

	return (
		<div className="kit k-enter">
			<PageHead title="Team Attendance" sub={`Who’s in today, ${when}`}>
				{ownEmployee(s) ? (
					<button type="button" className="k-btn k-btn-line" onClick={() => navigate("attendance", "mine")}>
						<KitIcon name="user" size={18} stroke={2} />My attendance
					</button>
				) : null}
				<DownloadReport />
			</PageHead>
			<div className="k-mini-grid">
				{["Present", "Late", "On leave", "Absent"].map((st, i) => (
					<div className="k-mini k-anim" style={stagger(i)} key={st}>
						<div className="k-mini-t">{st}<i style={{ width: 10, height: 10, borderRadius: "50%", background: `rgb(var(--${TONE[st]}))` }} /></div>
						<div className="k-mini-v">{ready ? <CountUp value={count(st)} /> : <b>—</b>} of {list.length}</div>
					</div>
				))}
			</div>
			<div className="k-card">
				<div className="k-card-h">
					<div style={{ overflowX: "auto", maxWidth: "100%" }}>
						<SegTabs label="Show" value={tab} onChange={setTab}
							tabs={["All", "Present", "Late", "On leave", "Absent", "Not in yet"]}
							count={(t) => (t === "All" ? list.length : count(t))} />
					</div>
				</div>
				{err ? <p className="k-err" role="alert">{err}</p> : null}
				{!ready ? <div className="k-sk" style={{ height: 240 }} /> : shown.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead>
								<tr>{["Employee", "Department", "Shift", "Clock in", "Clock out", "Status", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr>
							</thead>
							<tbody>
								{shown.map(({ r, st }) => (
									<tr key={r.emp.name} className="k-click" tabIndex={0} onClick={() => open(r.emp)}
										onKeyDown={(ev) => { if (ev.key === "Enter") open(r.emp); }}>
										<td className="k-title-cell"><Who name={r.emp.employee_name} sub={r.emp.designation || r.emp.employee_number || ""} /></td>
										<td data-label="Department">{tidyDept(r.emp.department) || "—"}</td>
										<td data-label="Shift">{r.shift || "—"}{r.shiftWindow ? <small className="k-muted"> {r.shiftWindow}</small> : null}</td>
										<td data-label="Clock in" className="k-num">{r.in || "—"}{st === "Late" && r.late ? <small className="k-muted"> +{r.late}</small> : null}</td>
										<td data-label="Clock out" className="k-num">{r.out || (r.in ? "Working" : "—")}</td>
										<td data-label="Status"><Pill status={PILL_OF[st]}>{st}</Pill></td>
										<td data-label=""><span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState icon="cal" title="Nobody here" sub="No one matches this tab today." />
				)}
			</div>
		</div>
	);
}
