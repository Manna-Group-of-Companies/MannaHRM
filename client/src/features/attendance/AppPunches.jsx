/* ---------------------------------------------------------------------------
   App Punches — one page for the stream In Out Activities Report already
   tells apart with its Stream filter (see lib/punchplace.js `streamOf`), for
   whoever wants the phone app's own punches without setting that filter
   every time. Ours, asked for 21 September 2026 — same reasoning as OT Report
   and Weekly Report in RangeReports.jsx: a page Factor HR's menu has no item
   for, built because somebody here needs it.

   Reads Employee Checkin over a date range and keeps only what streamOf calls
   "Mobile" — a coordinate, or a device id carrying the phone app's own prefix.
   Attendance is generated from these by the shift job elsewhere; this is the
   punch record; see CLAUDE.md §1 and In Out Activities Report is the wider
   report this is a slice of.

   Four views of the one read (25 September 2026): every punch, a day per
   person, a line per person, and the month as a grid — the arithmetic is
   lib/apppunches.js. Excel carries all four as sheets of one workbook; CSV
   carries the view on screen.
   --------------------------------------------------------------------------- */

import { useState } from "react";

import { getState, set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { loadWorkLocations } from "@/api/load";
import { DAY, clock, dmy, fmt, todayIso } from "@/lib/format";
import { coordText, placeText, streamOf } from "@/lib/punchplace";
import { apDaily, apGrid, apTotals, cellLetter, fenceText, hm } from "@/lib/apppunches";
import { LocCell } from "@/components/PunchMap";
import { PHOTO_FIELD, PhotoCell, photoOf } from "@/components/PunchPhoto";
import { Empty, Note, Scroll, panelProps, tabProps } from "@/components/ui";
import { download, toCsv } from "@/lib/csv";
import { appPunchesXlsx } from "@/lib/xlsx";

const AP_MAXDAYS = 31;

/* Tried widest first, the same reasoning as In Out Activities Report's
   IO_TIERS: a field the site has not got refuses the whole read rather than
   dropping the column. */
const AP_BASE = ["name", "employee", "employee_name", "time", "log_type", "device_id"];
const AP_GEO = AP_BASE.concat(["latitude", "longitude"]);
const AP_CHECKED = AP_GEO.concat(["custom_distance_metres", "custom_geofence_result"]);
/* The photo tier first: a site without `custom_photo` (the field went on 25
   September 2026) falls through to the one below and draws every punch as
   having no photo, which is true of it. */
const AP_TIERS = [AP_CHECKED.concat([PHOTO_FIELD]), AP_CHECKED, AP_GEO, AP_BASE];

const AP_COLS = [
	["Date", (r) => String(r.time || "").slice(0, 10), "mono"],
	["Time", (r) => clock(r.time), "mono"],
	["Emp code", (r, e) => e.employee_number || r.employee, "mono"],
	["Name", (r, e) => e.employee_name || r.employee_name || ""],
	["In / Out", (r) => r.log_type || ""],
	["Photo", (r) => photoOf(r)],
	["Location", (r) => coordText(r), "mono"],
	["Where", (r, e, s) => placeText(r, s.workLocs), "muted"],
	["Company", (r, e) => e.company || "", "muted"],
];

async function apGenerate() {
	void loadWorkLocations();
	const f = getState().ap;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	set({ ap: { ...f, from, till } });

	if (from > till) return set({ apMsg: "The date range ends before it starts." });

	const days = Math.round((new Date(till).getTime() - new Date(from).getTime()) / 86400000) + 1;
	if (days > AP_MAXDAYS) {
		return set({
			apMsg: `That is ${fmt(days)} days. This reads every punch in the range, so it is capped at `
				+ `${AP_MAXDAYS} days.`,
		});
	}

	set({ apState: "loading", apMsg: "" });
	const range = [["time", ">=", from + " 00:00:00"], ["time", "<=", till + " 23:59:59"]];

	let rows = null;
	for (const fields of AP_TIERS) {
		rows = await listAll("Employee Checkin", fields, range).catch(() => null);
		if (rows !== null) break;
	}
	if (rows === null) {
		return set({
			apState: "error",
			apMsg: "The site refused this read on every field list tried.",
			apRows: null,
		});
	}
	set({ apRows: rows.filter((r) => streamOf(r) === "Mobile"), apState: "done", apRan: `${from} to ${till}` });
}

function apStamp(s) {
	const [from, till] = apRange(s);
	return `app-punches-${from}-to-${till}`;
}

/* The range the rows were read for, not the one somebody is typing into the
   pickers: a grid drawn over the new dates with the old punches in it would
   show a month of dots for a month nobody has read yet. */
function apRange(s) {
	const [from, till] = String(s.apRan || "").split(" to ");
	return [from || s.ap.from || todayIso(), till || from || s.ap.till || todayIso()];
}

const AP_VIEWS = [
	["punches", "Punches"],
	["daily", "Daily Summary"],
	["people", "Per Person"],
	["grid", "Monthly Grid"],
];

const empOf = (s, id) => s.byName[id] || {};
const hmOr = (v) => hm(v) || "—";

/* The column sets the CSV writes and the screen draws, for the three tabular
   views; the grid draws its own. One list each, so the file and the page
   cannot end up two different reports. */
const AP_DAILY_COLS = [
	["Date", (d) => d.date, "mono"],
	["Day", (d) => DAY[new Date(d.date + "T00:00:00").getDay()].slice(0, 3), "muted"],
	["Emp code", (d, e) => e.employee_number || d.employee, "mono"],
	["Name", (d, e) => e.employee_name || d.employee_name],
	["First in", (d) => (d.firstIn ? clock(d.firstIn) : ""), "mono"],
	["Last out", (d) => (d.lastOut ? clock(d.lastOut) : ""), "mono"],
	["Hours", (d) => hm(d.workMs), "mono"],
	["Punches", (d) => String(d.punches.length), "mono"],
	["Status", (d) => (d.complete ? "Full day" : `Missing ${d.missing}`)],
	["Geofence", (d) => fenceText(d)],
];

const AP_PEOPLE_COLS = [
	["Emp code", (t, e) => e.employee_number || t.employee, "mono"],
	["Name", (t, e) => e.employee_name || t.employee_name],
	["Department", (t, e) => e.department || "", "muted"],
	["Days", (t) => String(t.days), "mono"],
	["Punches", (t) => String(t.punches), "mono"],
	["Full days", (t) => String(t.complete), "mono"],
	["Missing in", (t) => String(t.missingIn), "mono"],
	["Missing out", (t) => String(t.missingOut), "mono"],
	["Outside fence", (t) => String(t.outside), "mono"],
	["No location", (t) => String(t.noLocation), "mono"],
	["Total hrs", (t) => hm(t.workMs), "mono"],
	["Avg hrs/day", (t) => hm(t.avgMs), "mono"],
	["First", (t) => t.first, "mono"],
	["Last", (t) => t.last, "mono"],
];

/* What each view is, derived from the one list of punches — cheap enough to
   do on every render for a month's worth of one stream. */
function apViews(s, rows) {
	const daily = apDaily(rows);
	const [from, till] = apRange(s);
	return { daily, totals: apTotals(daily), grid: apGrid(daily, from, till) };
}

function apCsv(s, rows) {
	const view = s.ap.view || "punches";
	const v = apViews(s, rows);
	const tab = (cols, list) => toCsv(cols.map((c) => c[0]), list.map((r) => {
		const e = empOf(s, r.employee);
		return cols.map((c) => c[1](r, e, s));
	}));
	if (view === "daily") return tab(AP_DAILY_COLS, v.daily);
	if (view === "people") return tab(AP_PEOPLE_COLS, v.totals);
	if (view === "grid") {
		return toCsv(["Emp code", "Name", ...v.grid.dates], v.grid.people.map((p) => {
			const e = empOf(s, p.employee);
			return [e.employee_number || p.employee, e.employee_name || p.employee_name,
				...p.cells.map((d) => (d ? `${d.firstIn ? clock(d.firstIn) : "?"}-${d.lastOut ? clock(d.lastOut) : "?"}` : ""))];
		}));
	}
	return tab(AP_COLS, rows);
}

function apExport(s, rows) {
	if (!rows.length) return set({ apMsg: "Nothing to export — generate the report first." });
	const view = s.ap.view || "punches";
	const name = `${apStamp(s)}${view === "punches" ? "" : "-" + view}.csv`;
	download(name, apCsv(s, rows));
	set({ apMsg: `Exported the ${AP_VIEWS.find((x) => x[0] === view)[1]} view to ${name}.` });
}

async function apExcel(s, rows) {
	if (!rows.length) return set({ apMsg: "Nothing to export — generate the report first." });
	const name = apStamp(s) + ".xlsx";
	set({ apMsg: "Building the spreadsheet…" });
	try {
		const v = apViews(s, rows);
		await appPunchesXlsx(
			{ from: apRange(s)[0], till: apRange(s)[1], company: s.company || "", ...v, punches: rows },
			{ name, empOf: (id) => empOf(s, id), whereOf: (r) => placeText(r, s.workLocs), hm, fenceText },
		);
	} catch (e) {
		return set({ apMsg: `Could not build the spreadsheet: ${e && e.message ? e.message : e}. Export CSV still works.` });
	}
	set({ apMsg: `Exported ${name} — four sheets: Summary, Daily, Monthly Grid and every punch.` });
}

function Table({ s, cols, list, keyOf, cls }) {
	return (
		<Scroll style={{ marginTop: ".6rem" }}>
			<table className="apt" style={{ minWidth: 1040 }}>
				<thead><tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr></thead>
				<tbody>
					{list.map((r) => {
						const e = empOf(s, r.employee);
						return (
							<tr key={keyOf(r)}>
								{cols.map((c) => (
									<td key={c[0]} className={[c[2], cls && cls(c[0], r)].filter(Boolean).join(" ") || undefined}>
										{c[1](r, e, s) || "—"}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
		</Scroll>
	);
}

/* A count is worth a colour only when it is not zero: a column of red zeros
   reads as a column of problems. */
const warnCls = (col, r) => {
	if (col === "Status") return r.complete ? "good" : "warn";
	if (col === "Geofence") return r.outside || r.noLocation ? "bad" : r.inside ? "good" : "";
	const n = { "Missing in": r.missingIn, "Missing out": r.missingOut, "Outside fence": r.outside, "No location": r.noLocation }[col];
	return n ? "bad" : "";
};

function Grid({ s, grid }) {
	const { dates, people } = grid;
	return (
		<Scroll style={{ marginTop: ".6rem" }}>
			<table className="muster">
				<thead>
					<tr>
						<th>Emp code</th>
						<th>Name</th>
						{dates.map((d) => (
							<th className="d" key={d}>
								{Number(d.slice(8))}
								<small>{DAY[new Date(d + "T00:00:00").getDay()].slice(0, 2)}</small>
							</th>
						))}
						<th>Full days</th>
						<th>Total hrs</th>
					</tr>
				</thead>
				<tbody>
					{people.map((p) => {
						const e = empOf(s, p.employee);
						const full = p.cells.filter((d) => d && d.complete);
						return (
							<tr key={p.employee}>
								<td className="mono">{e.employee_number || p.employee}</td>
								<td>{e.employee_name || p.employee_name}</td>
								{p.cells.map((d, i) => {
									const sunday = new Date(dates[i] + "T00:00:00").getDay() === 0;
									if (!d) return <td className={"d " + (sunday ? "wo" : "non")} key={dates[i]}>·</td>;
									const off = d.outside || d.noLocation;
									return (
										<td key={dates[i]} title={fenceText(d) || undefined}
											className={"d " + (cellLetter(d) === "P" ? "full" : "half") + (off ? " off" : "")}>
											{`${d.firstIn ? clock(d.firstIn) : "?"}\n${d.lastOut ? clock(d.lastOut) : "?"}`}
										</td>
									);
								})}
								<td className="pay">{fmt(full.length)}</td>
								<td className="mono">{hmOr(full.reduce((a, d) => a + d.workMs, 0))}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</Scroll>
	);
}

export default function AppPunches() {
	const s = useApp();
	const [from, setFrom] = useState(s.ap.from || todayIso());
	const [till, setTill] = useState(s.ap.till || todayIso());
	const view = s.ap.view || "punches";
	const rows = (s.apRows || [])
		.filter((r) => !s.company || s.byName[r.employee]?.company === s.company)
		.slice()
		.sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));
	const v = apViews(s, rows);
	const count = {
		punches: `${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"}`,
		daily: `${fmt(v.daily.length)} day${v.daily.length === 1 ? "" : "s"}`,
		people: `${fmt(v.totals.length)} ${v.totals.length === 1 ? "person" : "people"}`,
		grid: `${fmt(v.grid.people.length)} × ${fmt(v.grid.dates.length)} days`,
	}[view];

	return (
		<>
			<div className="embar">
				<label className="inline"><span>From</span>
					<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); set({ ap: { ...s.ap, from: e.target.value } }); }} />
				</label>
				<label className="inline"><span>To</span>
					<input type="date" value={till} onChange={(e) => { setTill(e.target.value); set({ ap: { ...s.ap, till: e.target.value } }); }} />
				</label>
				<button type="button" className="embtn pri" onClick={() => void apGenerate()}>Generate</button>
				<span className="grow" />
				<button type="button" className="embtn" disabled={!rows.length} onClick={() => void apExcel(s, rows)}>
					<i className="fico" aria-hidden="true">📊</i> Excel
				</button>
				<button type="button" className="embtn" disabled={!rows.length} onClick={() => apExport(s, rows)}>
					Export CSV
				</button>
			</div>

			{s.apMsg && <Note>{s.apMsg}</Note>}

			<div className="ddatabs mt-[.6rem]" role="tablist" aria-label="App Punches view">
				{AP_VIEWS.map(([k, label]) => (
					<button key={k} type="button" {...tabProps("aptab-" + k, "appane", view === k)}
						onClick={() => set({ ap: { ...getState().ap, view: k }, apMsg: "" })}>
						{label}
					</button>
				))}
			</div>

			<div {...panelProps("appane", "aptab-" + view)}>
				{s.apState === "loading" ? (
					<Empty title="Reading the site">Every punch between {dmy(from)} and {dmy(till)}.</Empty>
				) : s.apState !== "done" ? (
					<Empty title="Not generated yet">Pick a range and press Generate.</Empty>
				) : !rows.length ? (
					<Empty title="No app punches in that range">
						Nothing in Employee Checkin over {s.apRan} carries a coordinate or the phone app's device prefix.
						It stays empty until the phone app is live for the people who use it — see docs/APP_USERS.md.
					</Empty>
				) : (
					<>
						<div className="legend mt-[.6rem]">
							<span className="cov live">{count}</span>
							{view === "grid" && (
								<span className="muted">
									Each day is first in over last out. Green is a full day, amber a punch missing, red text a
									punch outside the fence. A dot is a day with no app punch — not an absence.
								</span>
							)}
							{view === "daily" && (
								<span className="muted">A night shift's out after midnight is counted on the day it started.</span>
							)}
						</div>
						{view === "daily" ? (
							<Table s={s} cols={AP_DAILY_COLS} list={v.daily} keyOf={(d) => d.employee + "|" + d.date} cls={warnCls} />
						) : view === "people" ? (
							<Table s={s} cols={AP_PEOPLE_COLS} list={v.totals} keyOf={(t) => t.employee} cls={warnCls} />
						) : view === "grid" ? (
							<Grid s={s} grid={v.grid} />
						) : (
							<Scroll style={{ marginTop: ".6rem" }}>
								<table style={{ minWidth: 1040 }}>
									<thead><tr>{AP_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr></thead>
									<tbody>
										{rows.map((r) => {
											const e = s.byName[r.employee] || {};
											return (
												<tr key={r.name}>
													{AP_COLS.map((c) => (
														<td key={c[0]} className={c[2] || undefined}>
															{c[0] === "Location" ? <LocCell r={r} e={e} />
																: c[0] === "Photo" ? <PhotoCell r={r} e={e} />
																: (c[1](r, e, s) || "—")}
														</td>
													))}
												</tr>
											);
										})}
									</tbody>
								</table>
							</Scroll>
						)}
					</>
				)}
			</div>
		</>
	);
}
