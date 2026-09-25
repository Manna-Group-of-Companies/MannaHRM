/* ---------------------------------------------------------------------------
   OT Report, Weekly Report and Absent Report — read off the range they are
   about, not off today's punches.

   Asked for on 16 September 2026 for the Manna Rubber Products login, whose
   Attendance menu is In Out, Monthly, OT, Daily, Absent and Weekly and nothing
   else (data/menus.js). All three stand on the same read and the same
   arithmetic as Daily Detail — api/attendance.js `loadDda` and
   lib/dailydetail.js — so a day reads the same on every one of them: hrms's
   Attendance where the day has been processed, its punches where it has not.

   The Absent Report this replaces read `s.checkins`, which holds today's
   punches only, so any other date named everybody absent.
   --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

import { useApp } from "@/store";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { active } from "@/lib/scope";
import { dailyRows, hm } from "@/lib/dailydetail";
import { DAY, dmy, fmt, isoAgo, monthStart, tidyDept, todayIso, ymd } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { Empty, Note, Scroll } from "@/components/ui";
import ExportButtons from "@/components/ExportButtons";

/** The rows for a range, once the read for exactly that range is in. */
function useRange(from, to) {
	const s = useApp();
	useEffect(() => {
		void loadShiftWindows();
		if (from && to && to >= from) void loadDda(from, to, "");
	}, [from, to]);
	const d = s.ddaData;
	const ready = d.key === `${from}|${to}|` && d.state === "ok";
	const people = active(s);
	const { rows } = ready
		? dailyRows({
			people, from, to, attendance: d.attendance, punches: d.punches, leave: d.leave, overtime: d.overtime,
			holidaysOf: (e) => {
				const co = s.companies.find((c) => c.name === e.company);
				return s.holidays[e.holiday_list || (co && co.default_holiday_list) || ""] || [];
			},
			windows: s.shiftWindows, today: todayIso(), limit: 20000,
		})
		: { rows: [] };
	return { ready, rows, people, err: d.key === `${from}|${to}|` ? d.err : "", company: s.company };
}

/** CSV, Excel and PDF of one table, off the one column list the table draws. */
function Csv({ name, cols, rows, title, sub }) {
	const cellsOf = (r) => cols.map((c) => { const v = c[1](r); return v == null ? "" : v; });
	return (
		<>
			<button type="button" className="embtn" disabled={!rows.length}
				onClick={() => download(`${name}-${todayIso()}.csv`, toCsv(cols.map((c) => c[0]), rows.map(cellsOf)))}>
				Export CSV
			</button>
			<ExportButtons name={name} disabled={!rows.length}
				sheets={() => [{ title, sub, head: cols.map((c) => c[0]), rows: rows.map(cellsOf) }]} />
		</>
	);
}

function Table({ cols, rows, keyOf }) {
	return (
		<Scroll>
			<table>
				<thead><tr>{cols.map((c) => <th key={c[0]} className={c[2] === "num" ? "num" : undefined}>{c[0]}</th>)}</tr></thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={keyOf ? keyOf(r) : i}>
							{cols.map((c) => {
								const v = c[1](r);
								return <td key={c[0]} className={c[2] || undefined}>{v === "" || v == null ? <span className="text-ink-3">—</span> : v}</td>;
							})}
						</tr>
					))}
				</tbody>
			</table>
		</Scroll>
	);
}

const WHO = [
	["Emp Code", (r) => r.emp.employee_number || r.emp.name, "mono"],
	["Name", (r) => r.emp.employee_name || ""],
	["Department", (r) => tidyDept(r.emp.department)],
];

function Legend({ ico, title, n, extra }) {
	return (
		<div className="legend">
			<b className="font-display">{ico} {title}</b>
			<span>{fmt(n)} {n === 1 ? "row" : "rows"}</span>
			{extra ? <span>{extra}</span> : null}
		</div>
	);
}

/* ------------------------------------------------------------ OT Report --- */

const OT_COLS = WHO.concat([
	["Date", (r) => dmy(r.date), "mono"],
	["Shift", (r) => (r.shift || "") + (r.shiftWindow ? ` (${r.shiftWindow})` : "")],
	["In", (r) => r.in, "mono"],
	["Out", (r) => r.out, "mono"],
	["Work", (r) => r.work, "mono"],
	["Overtime", (r) => r.ot, "mono"],
]);
const OT_SUM = WHO.concat([
	["Days with OT", (r) => r.days, "num"],
	["Total OT", (r) => hm(r.min), "mono"],
]);

export function OtReport() {
	const [from, setFrom] = useState(monthStart());
	const [to, setTo] = useState(todayIso());
	const { ready, rows, err } = useRange(from, to);
	const ot = rows.filter((r) => r.otMin > 0);
	const byEmp = new Map();
	for (const r of ot) {
		const g = byEmp.get(r.emp.name) || { emp: r.emp, days: 0, min: 0 };
		g.days++;
		g.min += r.otMin;
		byEmp.set(r.emp.name, g);
	}
	const sum = [...byEmp.values()].sort((a, b) => b.min - a.min);

	return (
		<>
			<Legend ico="⏱" title="OT Report" n={ot.length} extra={ready ? `${fmt(sum.length)} people · ${hm(sum.reduce((a, g) => a + g.min, 0)) || "0:00"} in all` : ""} />
			<div className="embar">
				<label className="inline"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
				<label className="inline"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
				<span className="grow" />
				<Csv name="ot-report" cols={OT_COLS} rows={ot} title="OT Report" sub={`${dmy(from)} to ${dmy(to)}`} />
			</div>
			{err ? <div className="deerr" role="alert"><b>{err}</b></div> : null}
			{!ready ? <div className="regload">Reading {dmy(from)} – {dmy(to)}…</div>
				: !ot.length ? <Empty title="No overtime entered in this range">HR adds OT by clicking a day on Attendance Regularization.</Empty>
					: (
						<>
							<h4 className="ddasection">By employee</h4>
							<Table cols={OT_SUM} rows={sum} keyOf={(g) => g.emp.name} />
							<h4 className="ddasection">By day</h4>
							<Table cols={OT_COLS} rows={ot} keyOf={(r) => r.emp.name + r.date} />
						</>
					)}
			<Note>
				Overtime here is only what HR has entered for a person and a day — click a day on Attendance
				Regularization, or open the person's month, and fill OT hrs. A late punch-out on its own is hours
				worked, not overtime.
			</Note>
		</>
	);
}

/* -------------------------------------------------------- Weekly Report --- */

const LETTER = { Present: "P", Absent: "A", "Half Day": "HD", "On Leave": "L", "Work From Home": "WFH",
	"Weekly Off": "WO", "In Only": "½", "Out Only": "½", "Leave Applied": "LA", "—": "" };

/** The Sunday that starts the week holding `iso` — Factor HR's weeks start on Sunday. */
function weekStart(iso) {
	const d = new Date(iso + "T00:00:00");
	d.setDate(d.getDate() - d.getDay());
	return ymd(d);
}

export function WeeklyReport() {
	/* The date typed is kept as typed; the week is worked out from it, so the
	   box never changes under somebody's fingers. */
	const [pick, setPick] = useState(todayIso());
	const start = weekStart(pick);
	const days = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(start + "T00:00:00");
		d.setDate(d.getDate() + i);
		return ymd(d);
	});
	const { ready, rows, people, err } = useRange(days[0], days[6]);
	const move = (n) => {
		const d = new Date(start + "T00:00:00");
		d.setDate(d.getDate() + n * 7);
		setPick(ymd(d));
	};

	const byEmp = new Map(people.map((e) => [e.name, { emp: e, days: {}, p: 0, a: 0, l: 0, min: 0, ot: 0 }]));
	for (const r of rows) {
		const g = byEmp.get(r.emp.name);
		if (!g) continue;
		g.days[r.date] = r;
		if (r.status === "Present" || r.status === "Work From Home") g.p++;
		if (r.status === "Half Day") g.p += 0.5;
		if (r.status === "Absent") g.a++;
		if (r.status === "On Leave") g.l++;
		g.min += r.ms / 60000;
		g.ot += r.otMin;
	}
	const list = [...byEmp.values()].sort((a, b) => (a.emp.employee_name || "").localeCompare(b.emp.employee_name || ""));

	const csvCols = [["Emp Code", (g) => g.emp.employee_number || g.emp.name], ["Name", (g) => g.emp.employee_name || ""]]
		.concat(days.map((iso) => [`${DAY[new Date(iso + "T00:00:00").getDay()].slice(0, 3)} ${dmy(iso)}`,
			(g) => { const r = g.days[iso]; return r ? `${r.status}${r.in ? ` ${r.in}-${r.out || ""}` : ""}` : ""; }]))
		.concat([["Present", (g) => g.p], ["Absent", (g) => g.a], ["Leave", (g) => g.l],
			["Hours", (g) => hm(Math.round(g.min))], ["OT", (g) => hm(g.ot)]]);

	return (
		<>
			<Legend ico="🗓" title="Weekly Report" n={list.length} extra={`${dmy(days[0])} – ${dmy(days[6])}`} />
			<div className="embar">
				<button type="button" className="embtn" onClick={() => move(-1)} aria-label="Previous week">‹</button>
				<label className="inline"><span>Week of</span>
					<input type="date" value={pick} onChange={(e) => setPick(e.target.value || todayIso())} />
				</label>
				<button type="button" className="embtn" onClick={() => move(1)} aria-label="Next week">›</button>
				<span className="grow" />
				<Csv name="weekly-report" cols={csvCols} rows={ready ? list : []} title="Weekly Report" sub={`${dmy(days[0])} to ${dmy(days[6])}`} />
			</div>
			{err ? <div className="deerr" role="alert"><b>{err}</b></div> : null}
			{!ready ? <div className="regload">Reading the week…</div> : (
				<Scroll>
					<table className="muster">
						<thead>
							<tr>
								<th>Employee</th>
								{days.map((iso) => (
									<th key={iso} className="d">{+iso.slice(8)}<small>{DAY[new Date(iso + "T00:00:00").getDay()].slice(0, 2)}</small></th>
								))}
								<th className="d">P</th><th className="d">A</th><th className="d">L</th><th className="d">Hours</th><th className="d">OT</th>
							</tr>
						</thead>
						<tbody>
							{list.map((g) => (
								<tr key={g.emp.name}>
									<td><b>{g.emp.employee_name}</b> <span className="mono text-ink-3">{g.emp.employee_number || g.emp.name}</span></td>
									{days.map((iso) => {
										const r = g.days[iso];
										const letter = r ? (LETTER[r.status] ?? (r.dayType ? "H" : r.status.slice(0, 1))) : "";
										return (
											<td key={iso} className={"d" + (r && r.dayType ? " wo" : "")}
												title={r ? `${r.status}${r.in ? ` · In ${r.in}` : ""}${r.out ? ` · Out ${r.out}` : ""}${r.work ? ` · ${r.work} hrs` : ""}` : ""}>
												{letter}
												{r && (r.in || r.out) ? <small className="block text-micro text-ink-3">{r.in || "—"}–{r.out || "—"}</small> : null}
											</td>
										);
									})}
									<td className="d">{g.p}</td><td className="d">{g.a}</td><td className="d">{g.l}</td>
									<td className="d">{hm(Math.round(g.min)) || "—"}</td><td className="d">{hm(g.ot) || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			)}
			<Note>
				Sunday to Saturday. P Present · HD Half Day · A Absent · L On Leave · WO Weekly Off · H Holiday · ½ one punch only.
				A day hrms has processed shows its Attendance; a day it has not shows the day's punches.
			</Note>
		</>
	);
}

/* -------------------------------------------------------- Absent Report --- */

const ABSENT_COLS = WHO.concat([
	["Designation", (r) => r.emp.designation || ""],
	["Company", (r) => r.emp.company || ""],
	["Shift", (r) => r.shift],
	["Status", (r) => r.status],
	["Machine Code", (r) => r.emp.attendance_device_id || "", "mono"],
]);

export function AbsentReport() {
	const [day, setDay] = useState(isoAgo(0));
	const { ready, rows, err } = useRange(day, day);
	/* A day nobody has decided yet is not an absence: today before the shift
	   job runs, somebody with no punch yet is "—", not Absent. Only what the
	   site or the rule calls Absent is listed. */
	const list = rows.filter((r) => r.status === "Absent");

	return (
		<>
			<Legend ico="⭕" title="Absent Report" n={list.length} extra={dmy(day)} />
			<div className="embar">
				<label className="inline"><span>Date</span><input type="date" value={day} onChange={(e) => setDay(e.target.value || todayIso())} /></label>
				<span className="grow" />
				<Csv name="absent-report" cols={ABSENT_COLS} rows={list} title="Absent Report" sub={dmy(day)} />
			</div>
			{err ? <div className="deerr" role="alert"><b>{err}</b></div> : null}
			{!ready ? <div className="regload">Reading {dmy(day)}…</div>
				: !list.length ? <Empty title="Nobody absent">Everybody active punched, is on leave, is off, or the day is not over yet.</Empty>
					: <Table cols={ABSENT_COLS} rows={list} keyOf={(r) => r.emp.name} />}
			<Note>
				Absent is hrms's Attendance where the day has been processed. Where it has not, a past working day with
				no punch, no approved leave and no holiday is counted absent — and a machine that has not delivered its
				log looks exactly like that, so check the device before anybody's pay is cut.
			</Note>
		</>
	);
}
