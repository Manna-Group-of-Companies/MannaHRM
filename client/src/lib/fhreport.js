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
import { coordOf, coordText, mapLink, placeText } from "./punchplace.js";

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

/* A stamp as a local Date, so Excel shows it without moving it a time zone. */
const stampDate = (t) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(t || ""));
	return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : "";
};
const hms = (sec) => [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, "0")).join(":");

/**
 * In / Out Activities Report, as Factor HR's (their file of 17 November 2026):
 * the company in bold, the title, an empty row, the date range, then the
 * heading at row 6 and one bordered row per punch — by person, then time.
 *
 * Selfie Image is drawn empty: Factor HR puts the phone's photo there, and
 * this sheet carries text only. Generation Time / Upload Time is when the
 * punch reached the site, where the read carried it.
 *
 * @param {{punches: object[], byName: Object<string, object>, places: object[],
 *          from: string, to: string, company: string}} a
 */
export function inOutSheet({ punches, byName, places, from, to, company }) {
	const who = (r) => byName[r.employee] || {};
	const list = (punches || []).slice().sort((a, b) =>
		String(who(a).employee_number || a.employee).localeCompare(String(who(b).employee_number || b.employee))
		|| String(a.time).localeCompare(String(b.time)));
	const rows = list.map((r, i) => {
		const e = who(r);
		const prev = list[i - 1];
		const sameDay = prev && prev.employee === r.employee && String(prev.time).slice(0, 10) === String(r.time).slice(0, 10);
		const gap = sameDay ? Math.round((stampDate(r.time) - stampDate(prev.time)) / 1000) : 0;
		const c = coordOf(r);
		return [
			i + 1,
			e.employee_number || r.employee,
			e.employee_name || r.employee_name || "",
			r.device_id || "",
			placeText(r, places) || coordText(r),
			r.creation ? stampDate(r.creation) : "",
			stampDate(r.time),
			stampDate(r.time),
			gap > 0 ? hms(gap) : "",
			"",
			r.log_type || "",
			c ? `Lat: ${c.lat}\nLong: ${c.lng}` : "",
			c ? { text: "View Map", hyperlink: mapLink(c.lat, c.lng) } : "",
		];
	});
	const lines = [
		{ text: String(company || "Manna Group").toUpperCase(), bold: true },
		{ text: "In / Out Activities Report" },
		{ text: "" },
		{ text: `Date From: ${fhDate(from)} - Date Till: ${fhDate(to)}` },
	];
	return {
		factohr: true,
		title: "In Out Activities Report",
		lines,
		lineCol: 3,
		gap: 1,
		borders: true,
		sub: lines[3].text,
		head: ["S#", "Emp Code", "Emp Name", "Terminal", "Location", "Generation Time / Upload Time", "Punch Date",
			"Punch Time", "Duration From Previous Punch", "Selfie Image", "Remarks", "Punch Info", "Location Link"],
		rows,
		formats: { 5: "dd-mm-yyyy hh:mm:ss", 6: "ddd dd-mmm-yy", 7: "hh:mm:ss AM/PM" },
	};
}
