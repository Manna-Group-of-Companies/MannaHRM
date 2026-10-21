/** Employee Attendance and My Attendance, as the HRDashboard reference draws
 *  them (21 October 2026): one person's days over a range — the person as a
 *  card with their figures, the days as a table — on the same read and
 *  arithmetic as Daily Detail.
 *
 *  My Attendance is the same page fixed to the signed-in person's own record,
 *  for a login an Employee carries in `user_id` (D3). It has no Check in: a
 *  punch from a browser would be a second punch route with no server rule
 *  behind it (CLAUDE.md §1).
 *
 *  The reference's Edit paid time is a correction here, and a correction is
 *  the missing punch written through Employee Attendance Regularization —
 *  never `Attendance` (CLAUDE.md §5). So Correct opens the register on them.
 */

import { useEffect, useState } from "react";
import { getState, useApp, set } from "@/store";
import { navigate } from "@/routes/router";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { rangeRowsFrom } from "@/features/attendance/RangeReports";
import { PILL_OF, ownEmployee, teamState } from "@/features/attendance/attstate";
import { hm } from "@/lib/dailydetail";
import { active } from "@/lib/scope";
import { dmy, monthStart, todayIso } from "@/lib/format";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { openEmployee } from "@/features/employees/openEmployee";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Pager, Pill, SegTabs } from "@/components/kit/ui";
import { DotsMenu, toast } from "@/components/kit/overlay";
import DownloadReport from "@/features/attendance/DownloadReport";

const PER = 8;
const COLS = ["Date", "Clock in", "Clock out", "Shift", "Worked", "Overtime", "Status"];

function minutesOf(t) {
	const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export default function EmployeeAttendance({ mine = false }) {
	const s = useApp();
	const people = active(s).slice().sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const me = ownEmployee(s);
	const emp = mine ? me : (s.attEmp && people.some((p) => p.name === s.attEmp) ? s.attEmp : people[0]?.name || "");
	const [from, setFrom] = useState(monthStart());
	const [to, setTo] = useState(todayIso());
	const [tab, setTab] = useState("All");
	const [page, setPage] = useState(1);
	const ok = from && to && to >= from;
	useEffect(() => {
		void loadShiftWindows();
		if (emp && ok) void loadDda(from, to, emp);
	}, [emp, from, to, ok]);

	if (mine && !me) {
		return (
			<div className="kit k-enter">
				<PageHead title="My Attendance" sub="Your attendance records" />
				<div className="k-card"><EmptyState icon="user" title="No employee record for this login" sub="My Attendance is for a login an Employee record is linked to." /></div>
			</div>
		);
	}

	const e = s.byName[emp];
	const { ready, rows, err } = emp && ok ? rangeRowsFrom(s, from, to, emp) : { ready: true, rows: [], err: "" };
	const days = rows.map((r) => ({ r, st: teamState(r) })).sort((a, b) => b.r.date.localeCompare(a.r.date));
	const worked = days.filter((d) => d.r.in || d.r.out);
	const late = days.filter((d) => d.st === "Late").length;
	const ins = worked.map((d) => minutesOf(d.r.in)).filter((m) => m != null);
	const avgIn = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;
	const logged = days.reduce((a, d) => a + (d.r.ms || 0) / 60000, 0);
	const shown = days.filter((d) => tab === "All" || (tab === "Late" ? d.st === "Late" : d.st === "Present"));
	const pages = Math.max(1, Math.ceil(shown.length / PER));
	const at = Math.min(page, pages);

	const cells = (d) => [dmy(d.r.date), d.r.in || "", d.r.out || "", d.r.shift || "", d.r.work || "", d.r.ot || "", d.st];
	const exportAs = async (kind) => {
		if (!days.length) { toast("Nothing to export for this range"); return; }
		const name = `attendance-${(e?.employee_number || emp).toString().toLowerCase()}-${from}-to-${to}.${kind === "PDF" ? "pdf" : "xlsx"}`;
		await (kind === "PDF" ? sheetsPdf : sheetsXlsx)([{
			title: `Attendance — ${e?.employee_name || emp}`,
			sub: `${dmy(from)} to ${dmy(to)}`,
			head: COLS,
			rows: days.map(cells),
		}], name);
		toast(`Downloaded ${name}`);
	};
	const correct = () => { set({ reg: { ...getState().reg, emp: e.name, q: "" } }); navigate("attendance", "overview"); };

	return (
		<div className="kit k-enter">
			<PageHead title={mine ? "My Attendance" : "Employee Attendance"}
				sub={mine ? "Your attendance records" : "Look up anyone’s attendance records"}>
				<button type="button" className="k-btn k-btn-line" onClick={() => void exportAs("Excel")} disabled={!days.length}>
					<KitIcon name="upload" size={18} stroke={2} />Export
				</button>
				{!mine ? <DownloadReport /> : null}
			</PageHead>
			<div className="k-card" style={{ marginBottom: 20 }}>
				<div className="k-filters" style={{ gridTemplateColumns: mine ? "180px 180px" : "minmax(220px,1fr) 180px 180px", margin: 0 }}>
					{!mine ? (
						<select className="k-sel" aria-label="Employee" value={emp}
							onChange={(ev) => { set({ attEmp: ev.target.value }); setPage(1); }}>
							{people.map((p) => <option key={p.name} value={p.name}>{p.employee_name} · {p.department || p.company}</option>)}
						</select>
					) : null}
					<input className="k-inp" type="date" aria-label="From" value={from} onChange={(ev) => { setFrom(ev.target.value); setPage(1); }} />
					<input className="k-inp" type="date" aria-label="To" value={to} onChange={(ev) => { setTo(ev.target.value); setPage(1); }} />
				</div>
				{!ok ? <p className="k-err" style={{ marginTop: 10 }}>Pick a From date on or before the To date.</p> : null}
			</div>
			{!e ? (
				<div className="k-card"><EmptyState icon="users" title="Nobody to show" sub="There is nobody active in the company picked." /></div>
			) : (
				<div className="k-split">
					<div className="k-card k-profile-card">
						<div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}><KitAvatar name={e.employee_name} size={96} /></div>
						<h2 style={{ margin: 0, fontSize: 18 }}>{e.employee_name}</h2>
						<div className="k-muted">{e.designation || "—"}</div>
						<div className="k-pc-list">
							{[["Days recorded", worked.length], ["Late arrivals", late], ["Average clock in", avgIn == null ? "—" : `${String(Math.floor(avgIn / 60)).padStart(2, "0")}:${String(avgIn % 60).padStart(2, "0")}`], ["Logged", hm(Math.round(logged)) || "0:00"]].map(([k, v]) => (
								<div className="k-r" key={k} style={{ justifyContent: "space-between" }}><span className="k-muted">{k}</span><b>{v}</b></div>
							))}
						</div>
						<button type="button" className="k-btn k-btn-line" style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
							onClick={() => openEmployee(e.name)}>View profile</button>
					</div>
					<div className="k-card">
						<div className="k-card-h">
							<h3>Records</h3>
							<SegTabs label="Show" value={tab} onChange={(v) => { setTab(v); setPage(1); }}
								tabs={[["All", "All"], ["Present", "On time"], ["Late", "Late"]]} />
						</div>
						{err ? <p className="k-err" role="alert">{err}</p> : null}
						{!ready ? <div className="k-sk" style={{ height: 260 }} /> : shown.length ? (
							<>
								<div className="k-tbl-wrap">
									<table className="k-rt">
										<thead><tr>{[...COLS, ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
										<tbody>
											{shown.slice((at - 1) * PER, at * PER).map((d) => (
												<tr key={d.r.date}>
													<td className="k-title-cell">{dmy(d.r.date)}</td>
													<td data-label="Clock in" className="k-num">{d.r.in || "—"}</td>
													<td data-label="Clock out" className="k-num">{d.r.out || "—"}</td>
													<td data-label="Shift">{d.r.shift || "—"}</td>
													<td data-label="Worked" className="k-num">{d.r.work || "—"}</td>
													<td data-label="Overtime" className="k-num">{d.r.ot || "—"}</td>
													<td data-label="Status"><Pill status={PILL_OF[d.st]}>{d.st}</Pill></td>
													<td data-label="">
														{!mine ? (
															<DotsMenu label={`More for ${dmy(d.r.date)}`} items={[
																{ label: "Correct this day", icon: "edit", onClick: correct },
															]} />
														) : null}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
								<Pager total={shown.length} page={at} per={PER} onPage={setPage} />
							</>
						) : (
							<EmptyState icon="cal" title="No records for this filter" sub="Switch to All, or pick another range." />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
