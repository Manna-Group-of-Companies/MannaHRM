import { useState } from "react";

import { useApp } from "@/store";
import { fmt, isoAgo, todayIso } from "@/lib/format";
import { isHidden } from "@/data/sections";
import { Note, Scroll } from "@/components/ui";
import ExportButtons from "@/components/ExportButtons";
import Link from "@/routes/Link";
import { REPORTS, askText, reportInput, specSheet } from "@/data/reports";
import { FACTOHR_MENU } from "@/data/factohr";
import { slugOf } from "@/data/blueprints";

/* ---------------------------------------------------------------------------
   Every report, on one page, and every one of them as an Excel or a PDF.

   Asked for on 24 September 2026: one place to download reports from, rather
   than a tab in each of three modules. The spec reports are built right
   here, off `data/reports.js` — the same `build` and the same `cols` their own
   pages use, so a report downloaded from here and one downloaded from its tab
   are the same file. "All" is one workbook with a sheet per report, or one PDF
   with a page run per report.

   **The rest are linked, not built.** In Out, Daily Detail, Monthly, OT,
   Weekly, Absent and Leave Balance each read their own date range from the
   site when they are opened; building them here would be a second copy of that
   read, and two copies of a read are two chances for one report to show two
   numbers. They carry their own Excel and PDF buttons.

   **"All" means Factor HR's whole Reports menu** (asked for 25 Sep 2026), not
   the ones this app happens to have. So the second and third tables are
   derived from `data/factohr.js` rather than kept by hand: every report of
   theirs lands in exactly one of the three, a report built later moves itself
   from the third table to the second, and the third says out loud how many are
   not built yet, instead of a short list passing for a complete one. A report
   whose module or page is hidden is left off all three, for the reason below.
   --------------------------------------------------------------------------- */

/* The reports built off `s.checkins`, which holds today's punches and nothing
   older (api/load.js). A date other than today reads as nobody punching, so
   the table says so rather than letting the file say it quietly. */
const TODAYS_PUNCHES = new Set(["attendance/present", "attendance/msp", "attendance/iocount", "attendance/headcount"]);

/* Absent's tab is the range report in features/attendance/RangeReports, which
   reads the day it is asked about; the spec behind this address read today's
   punches whatever date was picked, and is not offered here for that reason. */
const REPLACED = new Set(["attendance/absent"]);

const SECTION_LABEL = {
	dashboard: "Dashboard", onboard: "On Board", employees: "Employees", attendance: "Attendance",
	leave: "Leave", payroll: "Payroll", loans: "Loans",
};
const ASKS = { day: "One day", month: "One month", window: "Date range", "": "Everyone, now" };

/** Factor HR's Reports menu, in their order: [section, kind, group, title, description, here]. */
const THEIRS = FACTOHR_MENU.filter((r) => r[1] === "Reports");

/** Reports of ours with no item on their menu: [section, subtab, title]. */
const OURS = [
	["attendance", "weekly", "Weekly Report"],
	["attendance", "app", "App Punches"],
];

/** What each page that reads its own range downloads as. A page not listed
    here says "On the page" rather than a format nobody checked. */
const DOWNLOADS = {
	"attendance/inout": "Excel · PDF · Word",
	"attendance/daily": "Excel · PDF · Word",
	"attendance/monthly": "Excel",
	"attendance/summary": "Excel",
	"attendance/absent": "CSV · Excel · PDF",
	"attendance/ot": "CSV · Excel · PDF",
	"attendance/weekly": "CSV · Excel · PDF",
	"attendance/app": "CSV · Excel",
	"attendance/statutory": "Excel",
	"attendance/overview": "A queue, not a file",
	"dashboard/approvals": "A queue, not a file",
	"employees/ctc": "CSV",
	"leave/balances": "Excel · PDF · Word",
};

/** The three tables, worked out once per render from what is visible.
    `specs` are the reports built on this page; everything else of theirs is
    either a page elsewhere or a blueprint. */
export function reportTables(specs) {
	const onThisPage = new Set(specs.map((r) => r.section + "/" + r.id));
	const seen = new Set();
	const elsewhere = [];
	const unbuilt = [];
	for (const [section, , , title, description, here] of THEIRS) {
		if (isHidden(section)) continue;
		if (!here) {
			unbuilt.push({ section, subtab: slugOf(title), title, description });
			continue;
		}
		const key = here.join("/");
		if (isHidden(here[0], here[1]) || onThisPage.has(key) || seen.has(key)) continue;
		seen.add(key);
		elsewhere.push({ section: here[0], subtab: here[1], module: section, title });
	}
	for (const [section, subtab, title] of OURS) {
		const key = section + "/" + subtab;
		if (isHidden(section, subtab) || seen.has(key)) continue;
		seen.add(key);
		elsewhere.push({ section, subtab, module: section, title });
	}
	return { elsewhere, unbuilt };
}

export default function ReportsHub() {
	const s = useApp();
	const [ask, setAsk] = useState({
		day: todayIso(),
		month: todayIso().slice(5, 7),
		from: isoAgo(30),
		to: todayIso(),
	});
	const on = (k) => (e) => setAsk({ ...ask, [k]: e.target.value });

	/* A report whose own tab is hidden is left off here too — hiding a page and
	   then offering its download one module over is not hiding it. */
	const specs = REPORTS.filter((r) => !isHidden(r.section, r.id) && !REPLACED.has(r.section + "/" + r.id));
	const { elsewhere, unbuilt } = reportTables(specs);
	const built = specs.map((spec) => ({ spec, rows: spec.build(reportInput(s, spec.section), ask) }));
	const sheet = (b) => specSheet(b.spec, b.rows, askText(b.spec, ask, s.company));
	const open = built.length + elsewhere.length;

	return (
		<>
			<div className="legend">
				<b className="font-display">📑 Reports</b>
				<span>{open + unbuilt.length} reports</span>
				<span>{open} open here</span>
				<span>{unbuilt.length} not built yet</span>
				{s.company ? <span>{s.company}</span> : <span>All companies</span>}
			</div>

			<div className="embar">
				<label className="inline">
					<span>Date</span>
					<input type="date" value={ask.day} onChange={on("day")} />
				</label>
				<label className="inline">
					<span>From</span>
					<input type="date" value={ask.from} onChange={on("from")} />
				</label>
				<label className="inline">
					<span>To</span>
					<input type="date" value={ask.to} onChange={on("to")} />
				</label>
				<span className="grow" />
				<ExportButtons name="manna-hr-reports" label="Download all — " disabled={!built.length}
					sheets={() => built.map(sheet)} />
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Report</th>
							<th>Module</th>
							<th>Asks for</th>
							<th className="num">Rows</th>
							<th>Download</th>
						</tr>
					</thead>
					<tbody>
						{built.map((b) => (
							<tr key={b.spec.section + "/" + b.spec.id}>
								<td>
									<Link section={b.spec.section} subtab={b.spec.id}>{b.spec.ico} {b.spec.title}</Link>
								</td>
								<td className="muted">{SECTION_LABEL[b.spec.section] || b.spec.section}</td>
								<td className="muted">
									{ASKS[b.spec.ask] || b.spec.ask}
									{TODAYS_PUNCHES.has(b.spec.section + "/" + b.spec.id)
										? <span className="text-fine"> · today's punches only</span> : null}
								</td>
								<td className="num">{fmt(b.rows.length)}</td>
								<td>
									<span className="inline-flex flex-wrap gap-[.4rem]">
										<ExportButtons name={b.spec.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
											sheets={() => [sheet(b)]} />
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<h4 className="ddasection">Reports with their own date range · {elsewhere.length}</h4>
			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Report</th>
							<th>Module</th>
							<th>Downloads as</th>
						</tr>
					</thead>
					<tbody>
						{elsewhere.map((r) => (
							<tr key={r.section + "/" + r.subtab}>
								<td><Link section={r.section} subtab={r.subtab}>{r.title} →</Link></td>
								<td className="muted">{SECTION_LABEL[r.module] || r.module}</td>
								<td className="muted">{DOWNLOADS[r.section + "/" + r.subtab] || "On the page"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<h4 className="ddasection">In Factor HR, not built here yet · {unbuilt.length}</h4>
			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Report</th>
							<th>Module</th>
							<th>What it is, in Factor HR's words</th>
						</tr>
					</thead>
					<tbody>
						{unbuilt.map((r) => (
							<tr key={r.section + "/" + r.subtab}>
								<td><Link section={r.section} subtab={r.subtab}>{r.title}</Link></td>
								<td className="muted">{SECTION_LABEL[r.section] || r.section}</td>
								<td className="muted">{r.description}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			<Note>
				The first table is built from what this dashboard has already read, for the company picked in the
				top bar. <b>Date</b> is used by the one-day reports and <b>From / To</b> by the range ones, capped at
				62 days. Present, MSP, In / Out Count and Head Count read the punches loaded with the dashboard, which
				are today's — for another day use In Out Activities or Daily Detail below. Download all is one Excel
				workbook with a sheet per report, or one PDF with each report starting on a new page. The second
				table's reports read their own range from the site when opened — open one and use the export
				buttons on it. The third is the rest of Factor HR's Reports menu: each one opens a page saying what
				it would take to build. Payroll and Loans reports are left off while those modules are hidden.
			</Note>
		</>
	);
}
