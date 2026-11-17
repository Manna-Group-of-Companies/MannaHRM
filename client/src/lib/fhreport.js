/* ---------------------------------------------------------------------------
   Attendance reports laid out as Factor HR lays its Excel files out
   (asked for 17 November 2026: "all attendance reports should be similar to
   the Factor HR attendance report in Excel sheets").

   Read off Factor HR's own Employee Shift Report, downloaded the same day:
   four bold lines — the company, the report's title, its filter, and
   "Date From: 01-Nov-2026 - Date Till: 30-Nov-2026" — two empty rows, then
   one bold, centred heading row starting with S/No, frozen under it. Calibri
   11, no fills and no borders; a column per day headed by the date itself,
   shown as `ddd dd-mmm-yy`.

   A sheet built here carries `factohr: true`, and lib/export.js writes it in
   that shape instead of its own. Pure: no store, no site.
   --------------------------------------------------------------------------- */

import { assignmentOn } from "./roster.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `2026-11-01` → `01-Nov-2026`, as Factor HR writes a date in its headings. */
export const fhDate = (iso) => {
	const [y, m, d] = String(iso || "").slice(0, 10).split("-");
	return y && m && d ? `${d}-${MON[Number(m) - 1]}-${y}` : "";
};

/** Every `YYYY-MM-DD` from `from` to `to`, both included. */
export function daysBetween(from, to) {
	const out = [];
	const d = new Date(from + "T00:00:00");
	const end = new Date(to + "T00:00:00");
	while (d <= end && out.length < 400) {
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
		d.setDate(d.getDate() + 1);
	}
	return out;
}

/** A day as the Date Excel shows under `ddd dd-mmm-yy` — local midnight, so
    no time zone moves it to the day before. */
export const dayDate = (iso) => new Date(iso + "T00:00:00");

/** The four lines over every Factor HR report. Their second line ends with a
    space; kept, so a sheet compared cell for cell does not differ by it. */
export function fhLines({ company, title, filters = [], from, to }) {
	return [
		String(company || "Manna Group").toUpperCase(),
		`${title} `,
		...filters,
		...(from && to ? [`Date From: ${fhDate(from)} - Date Till: ${fhDate(to)}`] : []),
	];
}

/** The holiday list a person is measured against: their own, else their company's. */
const listOf = (e, companies) => {
	const co = (companies || []).find((c) => c.name === e.company);
	return e.holiday_list || (co && co.default_holiday_list) || "";
};

/**
 * Employee Shift Report, as Factor HR's: a row per person, their shift, and a
 * column per day saying which shift they are rostered on — a dated Shift
 * Assignment where one covers the day, else their working time — or `W/Off`.
 *
 * Gratuity Applicable, LWF Applicable, Effective Date and Attendance Policy
 * Name are Factor HR's own fields with nothing behind them here, so they are
 * drawn empty rather than guessed.
 *
 * @param {{emps: object[], companies: object[], holidays: Object<string, object[]>,
 *          assignments: object[], from: string, to: string, company: string}} a
 */
export function shiftReportSheet({ emps, companies, holidays, assignments, from, to, company }) {
	const days = daysBetween(from, to);
	const byEmp = new Map();
	for (const x of assignments || []) {
		if (!byEmp.has(x.employee)) byEmp.set(x.employee, []);
		byEmp.get(x.employee).push(x);
	}
	const people = (emps || []).filter((e) => e.status === "Active")
		.slice().sort((a, b) => String(a.employee_number || a.name).localeCompare(String(b.employee_number || b.name)));
	const rows = people.map((e, i) => {
		const hol = new Map((holidays[listOf(e, companies)] || []).map((h) => [String(h.holiday_date).slice(0, 10), h]));
		const offDays = new Set();
		const cells = days.map((iso) => {
			const h = hol.get(iso);
			if (h && Number(h.weekly_off)) {
				offDays.add(WEEKDAY[dayDate(iso).getDay()]);
				return "W/Off";
			}
			if (h) return "Holiday";
			const a = assignmentOn(iso, byEmp.get(e.name));
			return (a && a.shift_type) || e.default_shift || "";
		});
		return [
			i + 1,
			e.employee_number || e.name,
			e.employee_name || "",
			e.date_of_joining ? dayDate(String(e.date_of_joining).slice(0, 10)) : "",
			[...offDays].join(", "),
			String(e.company || "").toUpperCase(),
			"", "",
			e.default_shift || "",
			"",
			e.default_shift || "",
			"", "",
			...cells,
		];
	});
	const lines = fhLines({ company, title: "Employee Shift Report", filters: ["Employee Status: Active"], from, to });
	return {
		factohr: true,
		title: "Employee Shift Report",
		lines,
		/* The PDF has a title and one line under it. */
		sub: lines.slice(2).join(" · "),
		head: ["S/No", "Employee Code", "Employee Name", "Date Of Joining", "WeekOff", "Company Name",
			"Gratuity Applicable", "LWF Applicable", "Shift Pattern", "Effective Date", "Work Schedule Name",
			"Attendance Policy Name", "Remarks", ...days.map(dayDate)],
		rows,
		/* Factor HR's own formats: the joining date, and the day headings. */
		formats: { 3: "dd-mmm-yyyy" },
		headFormat: "ddd dd-mmm-yy",
	};
}
