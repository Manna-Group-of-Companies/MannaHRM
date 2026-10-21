/* ---------------------------------------------------------------------------
   The eleven attendance reports, as downloads (21 October 2026).

   Asked for: the HRDashboard reference has no report pages under Attendance,
   so ours become files — Excel or PDF — from one Download report dialog. Each
   is built exactly as its own page built it: the same read, the same rows, the
   same columns and fills. The pages are still there at their addresses; they
   are off the menu.

   The muster (Monthly Basic) and App Punches stay pages: the first is a grid
   somebody reads across, the second a map and photographs.

   **Five of them read today's punches and nothing older** (Present, MSP,
   In / Out Count, Head Count — api/load.js holds only today's) and one reads
   nobody's punches at all (Employee Shift Report). Their dates are fixed to
   today rather than offered and quietly ignored.
   --------------------------------------------------------------------------- */

import { getState } from "@/store";
import { loadDda, loadShiftWindows } from "@/api/attendance";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { askText, reportFor, reportInput, specSheet } from "@/data/reports";
import { dmy, fmt, monthStart, todayIso } from "@/lib/format";
import { absentSheet, otSheet, rangeRowsFrom, weekDays, weeklySheet } from "@/features/attendance/RangeReports";
import { ddaDownload } from "@/features/attendance/DailyDetail";
import { ioDownloadFor } from "@/features/attendance/InOut";
import { msDownload } from "@/features/attendance/MonthlySummary";

/** `[key, title, what it asks for]`. `today` is a day fixed to today, `none`
    asks nothing, `week` is any day in the week wanted. */
export const ATT_REPORTS = [
	["inout", "In Out Activities Report", "range"],
	["daily", "Daily Detail Attendance Report", "range"],
	["summary", "Monthly Summary Attendance", "range"],
	["present", "Present Report", "today"],
	["absent", "Absent Report", "day"],
	["msp", "MSP Report", "today"],
	["iocount", "In / Out Count Report", "today"],
	["shiftrep", "Employee Shift Report", "none"],
	["headcount", "Head Count And Attendance", "today"],
	["ot", "OT Report", "range"],
	["weekly", "Weekly Report", "week"],
];

/** The dates a report starts on when the dialog opens it. */
export const askFor = () => ({ day: todayIso(), from: monthStart(), to: todayIso() });

const file = (title, kind) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${todayIso()}.${kind === "PDF" ? "pdf" : "xlsx"}`;
const write = (sheets, name, kind) => (kind === "PDF" ? sheetsPdf : sheetsXlsx)(sheets, name);

/** Read what the range needs, then build the rows the range reports draw. */
async function rangeRows(from, to) {
	void loadShiftWindows();
	await loadDda(from, to, "");
	const r = rangeRowsFrom(getState(), from, to);
	if (r.err) throw new Error(r.err);
	return r;
}

/**
 * Build one report and hand it to the browser.
 *
 * @param {string} key   one of ATT_REPORTS
 * @param {"Excel"|"PDF"} kind
 * @param {{day: string, from: string, to: string}} ask
 * @returns {Promise<string>} what to tell the person
 */
export async function runReport(key, kind, ask) {
	const s = getState();
	const row = ATT_REPORTS.find((r) => r[0] === key);
	if (!row) throw new Error("No such report.");
	const [, title, asks] = row;
	if (asks === "range" && (!ask.from || !ask.to || ask.to < ask.from)) throw new Error("Pick a From date on or before the To date.");

	if (key === "daily") return ddaDownload(ask.from, ask.to, kind);
	if (key === "inout") return ioDownloadFor(ask.from, ask.to, kind);
	if (key === "summary") return msDownload(ask.from, ask.to, kind);

	let sheet;
	if (key === "absent") {
		const { rows } = await rangeRows(ask.day, ask.day);
		sheet = absentSheet(rows, ask.day);
	} else if (key === "ot") {
		const { rows } = await rangeRows(ask.from, ask.to);
		sheet = otSheet(rows, ask.from, ask.to);
	} else if (key === "weekly") {
		const days = weekDays(ask.day);
		const { rows, people } = await rangeRows(days[0], days[6]);
		sheet = weeklySheet(rows, people, days);
	} else {
		const spec = reportFor("attendance", key);
		const today = todayIso();
		const a = { day: today, from: today, to: today };
		sheet = specSheet(spec, spec.build(reportInput(s, "attendance"), a), askText(spec, a, s.company));
	}
	if (!sheet.rows.length) return `Nothing to put in the ${title} for ${asks === "range" ? `${dmy(ask.from)} to ${dmy(ask.to)}` : dmy(ask.day)}.`;
	const name = file(title, kind);
	await write([sheet], name, kind);
	return `Downloaded ${name} · ${fmt(sheet.rows.length)} row${sheet.rows.length === 1 ? "" : "s"}.`;
}
