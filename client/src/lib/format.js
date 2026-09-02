/* Formatting, all of it pure and none of it importing React.

   These moved out of the page for the same reason `lib/rules.js` imports nothing
   but itself: a rule about how a date is written should be arguable without a
   browser. See CLAUDE.md §3. */

export const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

export const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTHS = ["January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"];

/** The time off a Frappe datetime, without parsing it — "2026-08-19 06:42:00" → "06:42". */
export const clock = (v) => (v ? String(v).slice(11, 16) : "—");

/* Dates are written as Factor HR writes them — 19-Aug-2026. Two systems being
   compared side by side should not differ in their date format as well as
   their contents. */
export function dmy(v) {
	const p = String(v == null ? "" : v).slice(0, 10).split("-");
	return p.length === 3 && MON[+p[1] - 1] ? `${p[2]}-${MON[+p[1] - 1]}-${p[0]}` : p[0] || "—";
}

export const dmyTime = (v) => (v ? `${dmy(v)} ${String(v).slice(11, 16)}` : "—");

export function dayOf(iso) {
	const d = new Date(iso + "T00:00:00");
	return isNaN(d.getTime()) ? "" : DAY[d.getDay()];
}

export function isoAgo(days) {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d.toISOString().slice(0, 10);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
export const monthEnd = () => {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

/** "24-Aug-2026 17:15" for a log line, from the browser clock. */
export const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/* Hours, worded as Factor HR words them — "11 hrs 18 minutes", not 11.3. */
export function hrsMin(ms) {
	if (ms == null || !isFinite(ms) || ms < 0) return null;
	const m = Math.round(ms / 60000);
	return `${Math.floor(m / 60)} hrs ${m % 60} minutes`;
}

export const spanOf = (a, b) =>
	a && b
		? hrsMin(
				new Date(String(b).replace(" ", "T")).getTime() -
					new Date(String(a).replace(" ", "T")).getTime(),
			)
		: null;

/** Department names arrive suffixed with the company abbreviation — "Production - HRI". */
export const tidyDept = (d) => (d || "—").replace(/ - [A-Z]{2,5}$/, "");

/* Two letters off the name, as Factor HR does it. A record with no name at all
   would otherwise render an empty circle, which reads as a broken image. */
export const initials = (n) =>
	String(n || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase() || "?";

/** Group a list of rows by a key, biggest first. */
export function tally(rows, key) {
	const m = new Map();
	rows.forEach((r) => {
		const k = r[key] || "—";
		m.set(k, (m.get(k) || 0) + 1);
	});
	return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** How many rows in `rows` have anything at all in field `f`. */
export const filled = (rows, f) =>
	rows.filter((r) => r[f] != null && String(r[f]).trim() !== "").length;

/* Local date rather than toISOString: this runs at UTC+5:30, where midnight
   local is half past six the previous evening in UTC, and every date on a
   calendar or a muster grid would land a day early. */
export const ymd = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Sunday-start week numbering, because that is what Factor HR's gutter shows.
   Jan 1 decides the offset: 2026 opens on a Thursday, so the week containing
   26 July is its 31st — where ISO says 30. Renumbering the weeks to ISO would
   look like a bug in ours. */
export function weekNo(d) {
	const jan1 = new Date(d.getFullYear(), 0, 1);
	const days = Math.round(
		(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - jan1.getTime()) / 86400000,
	);
	return Math.floor((days + jan1.getDay()) / 7) + 1;
}

/** Always six weeks, as Factor HR draws it. A grid that changes height with the
    month makes the arrows move under the pointer. */
export function monthCells(ym) {
	const [y, m] = ym.split("-").map(Number);
	const start = new Date(y, m - 1, 1);
	start.setDate(1 - start.getDay());
	const out = [];
	for (let i = 0; i < 42; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		out.push(d);
	}
	return out;
}

/** Someone's age on a given day, whole years. */
export function ageOn(dob, on) {
	if (!dob || !on) return null;
	const b = new Date(String(dob).slice(0, 10) + "T00:00:00");
	const d = new Date(String(on).slice(0, 10) + "T00:00:00");
	if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
	let y = d.getFullYear() - b.getFullYear();
	const m = d.getMonth() - b.getMonth();
	if (m < 0 || (m === 0 && d.getDate() < b.getDate())) y--;
	return y < 0 ? null : y;
}
