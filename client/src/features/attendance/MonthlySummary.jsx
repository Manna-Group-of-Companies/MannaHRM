import { getState, patch, useApp } from "@/store";
import EmpPick from "@/components/EmpPick";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { monthlySummaryRows } from "@/lib/monthlysummary";
import { useEffect } from "react";
import { scoped } from "@/lib/scope";
import { fmt, nowStamp, tidyDept, todayIso, ymd } from "@/lib/format";
import { monthlySummaryXlsx } from "@/lib/xlsx";
import { Empty, Scroll } from "@/components/ui";

/* Monthly Summary Attendance — Factor HR's own report, one row per person per
   month: a headcount (P/HD/WO/HO/AB), how often they were late or left early
   (LC/EG), leave by type (CL/LWP), overtime, and worked hours against the
   shift's own hours. The arithmetic is lib/monthlysummary.js, built on the
   same dailyRows every other attendance report here reads — see its own
   header for what Standard Working Hours means and does not mean. */

function defaultRange() {
	const now = new Date();
	return [
		ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
		ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
	];
}

const msRange = (f) => {
	const [a, b] = defaultRange();
	return [f.from || a, f.till || b];
};

function msPeople(s) {
	const f = s.msum;
	return scoped(s)
		.filter((e) => f.emp || !f.status || e.status === f.status)
		.filter((e) => !f.emp || e.name === f.emp)
		.slice()
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
}

async function msGenerate(force = true) {
	const [from, till] = msRange(getState().msum);
	patch("msum", { busy: true, err: "", from, till });
	void loadShiftWindows();
	await loadDda(from, till, "", force);
	const d = getState().ddaData;
	if (d.key === `${from}|${till}|`) patch("msum", { when: nowStamp(), err: d.err || "" });
	patch("msum", { busy: false });
}

function msRows(s) {
	const [from, till] = msRange(s.msum);
	const d = s.ddaData;
	if (d.key !== `${from}|${till}|` || d.state !== "ok") return [];
	const people = msPeople(s);
	return monthlySummaryRows({
		people, from, to: till, attendance: d.attendance, punches: d.punches, leave: d.leave, overtime: d.overtime,
		holidaysOf: (e) => {
			const co = s.companies.find((c) => c.name === e.company);
			return s.holidays[e.holiday_list || (co && co.default_holiday_list) || ""] || [];
		},
		windows: s.shiftWindows, today: todayIso(),
	});
}

async function msExport(s) {
	const [from, till] = msRange(s.msum);
	const rows = msRows(s);
	if (!rows.length) return patch("msum", { msg: "Nobody matches these criteria, so there is nothing to export." });
	patch("msum", { msg: "Building the spreadsheet…" });
	try {
		await monthlySummaryXlsx(rows, {
			from, till, company: s.company || "",
			name: `monthly-summary-attendance-${from}-to-${till}.xlsx`,
		});
		patch("msum", { msg: "Exported, formatted the way Factor HR's own sheet is." });
	} catch (e) {
		patch("msum", { msg: `Could not build the spreadsheet: ${e && e.message ? e.message : e}` });
	}
}

export default function MonthlySummary() {
	const s = useApp();
	const f = s.msum;
	const [from, till] = msRange(f);
	const rows = msRows(s);
	const reading = f.busy || s.ddaData.key !== `${from}|${till}|` || s.ddaData.state !== "ok";
	const everyone = scoped(s).slice().sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));

	useEffect(() => { void msGenerate(false); }, [from, till]);

	return (
		<>
			<div className="legend">
				<b className="font-display">Monthly Summary Attendance Report</b>
				<span className={"cov " + (reading ? "part" : "live")}>{reading ? "Reading…" : `${fmt(rows.length)} people`}</span>
				<span>{from} to {till}{f.when ? <> — generated <b>{f.when}</b></> : " — not generated yet"}</span>
			</div>

			<div className="repform mt-[.7rem]">
				<div className="mbbar">
					<label className="mbf">
						<span>Particular Employee</span>
						<EmpPick people={everyone} value={f.emp} all="every employee"
							onChange={(v) => patch("msum", { emp: v })} />
					</label>
					<label className="mbf">
						<span>Employee Status</span>
						<select value={f.status} onChange={(e) => patch("msum", { status: e.target.value })}>
							{["Active", "Inactive", "Suspended", "Left"].map((v) => <option key={v}>{v}</option>)}
							<option value="">All</option>
						</select>
					</label>
					<label className="mbf">
						<span>Date Range:</span>
						<span className="ctl">
							<input type="date" value={from} onChange={(e) => patch("msum", { from: e.target.value })} />
							<span className="text-ink-2">to</span>
							<input type="date" aria-label="To date" value={till} onChange={(e) => patch("msum", { till: e.target.value })} />
						</span>
					</label>
					<label className="mbf">
						<span>&nbsp;</span>
						<span className="flex gap-[.3rem] items-center">
							<button className="btn tpl" onClick={() => void msExport(s)}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
							<button className="btn ghost" title="Reload from the site" aria-label="Reload from the site"
								onClick={() => void msGenerate()}>↻</button>
							<button className="btn imp" disabled={f.busy} onClick={() => void msGenerate()}>
								{f.busy ? "Reading…" : "Generate"}
							</button>
						</span>
					</label>
				</div>
				{f.msg && <div className="mt-[.8rem]"><span className="muted">{f.msg}</span></div>}
				{f.err && <div className="mt-[.8rem]"><span className="muted">The site refused the report: {f.err}</span></div>}
			</div>

			{rows.length ? (
				<Scroll style={{ marginTop: ".7rem" }}>
					<table className="muster">
						<thead>
							<tr>
								<th>Emp code</th><th>Name</th><th>Department</th>
								<th>Shift In</th><th>Shift Out</th><th>Days</th>
								<th>P</th><th>HD</th><th>WO</th><th>HO</th><th>AB</th>
								<th>LC</th><th>EG</th><th>OT</th><th>CL</th><th>LWP</th>
								<th>Actual Hrs</th><th>Standard Hrs</th><th>Deficit Hrs</th>
								<th>Actual/Day</th><th>Standard/Day</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.emp.name}>
									<td className="mono">{r.emp.employee_number || r.emp.name}</td>
									<td>{r.emp.employee_name || ""}</td>
									<td className="muted">{tidyDept(r.emp.department)}</td>
									<td className="mono muted">{r.shiftIn || "—"}</td>
									<td className="mono muted">{r.shiftOut || "—"}</td>
									<td>{r.daysInMonth}</td>
									<td>{r.P}</td><td>{r.HD}</td><td>{r.WO}</td><td>{r.HO}</td><td>{r.AB}</td>
									<td>{r.LC}</td><td>{r.EG}</td><td className="mono">{r.OT}</td>
									<td>{r.CL}</td><td>{r.LWP}</td>
									<td className="mono">{r.actualHours}</td>
									<td className="mono muted">{r.standardHours}</td>
									<td className="mono">{r.deficitHours}</td>
									<td className="mono muted">{r.actualPerDay}</td>
									<td className="mono muted">{r.standardPerDay}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			) : (
				<div className="mt-[.7rem]">
					<Empty title="Nobody matches">No employee is left after these criteria, or nothing has been generated yet.</Empty>
				</div>
			)}
		</>
	);
}
