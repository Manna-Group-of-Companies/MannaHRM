/**
 * App Punches' three reports, off the same rows the punch list draws: a day
 * per person, a line per person, and the month as a grid.
 *
 * **It describes; it never judges.** These are the phone's punches only — a
 * person who also has a machine at the gate has half a day here and a whole one
 * on Monthly Basic, and that is correct for this page. Nothing here is a status
 * anybody is paid from: "one punch" means one *app* punch, and the fence count
 * repeats `custom_geofence_result`, the server's verdict, rather than drawing a
 * radius of its own (see lib/punchplace.js).
 *
 * Pure functions over plain rows: no store, no network.
 */

const ms = (t) => new Date(String(t).replace(" ", "T")).getTime();
const dateOf = (t) => String(t || "").slice(0, 10);

/* How long an evening's IN may wait for its OUT across midnight. Longer than
   any shift here and shorter than a day, so yesterday's forgotten OUT is not
   carried into this morning's arrival. */
const NIGHT_MAX_MS = 16 * 3600 * 1000;

/** `8:33` — hours and minutes, for a sum that can run past 24. */
export function hm(msec) {
	if (msec == null || !isFinite(msec) || msec < 0) return "";
	const m = Math.round(msec / 60000);
	return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const dirOf = (r) => {
	const t = String(r.log_type || "").toUpperCase();
	return t === "IN" || t === "OUT" ? t : "";
};

/**
 * One row per person per working day.
 *
 * A night shift crossing midnight belongs to the day it started (CLAUDE.md §5),
 * so an OUT that comes straight after an IN on the day before, within
 * NIGHT_MAX_MS, is counted on that day rather than opening a new one.
 *
 * @param {object[]} rows - Employee Checkin rows, any order
 * @returns {object[]} `{ employee, employee_name, date, punches, firstIn, lastOut, workMs,
 *   complete, missing, outside, inside, noLocation, farthest }`, by date then employee
 */
export function apDaily(rows) {
	const byEmp = new Map();
	for (const r of rows || []) {
		if (!r || !r.employee || !r.time) continue;
		if (!byEmp.has(r.employee)) byEmp.set(r.employee, []);
		byEmp.get(r.employee).push(r);
	}

	const out = [];
	for (const [employee, list] of byEmp) {
		list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
		const days = new Map();
		let prev = null;
		let prevDay = "";
		for (const r of list) {
			let day = dateOf(r.time);
			if (prev && dirOf(r) === "OUT" && dirOf(prev) === "IN" && prevDay < day
				&& ms(r.time) - ms(prev.time) <= NIGHT_MAX_MS) day = prevDay;
			if (!days.has(day)) days.set(day, []);
			days.get(day).push(r);
			prev = r;
			prevDay = day;
		}
		for (const [date, punches] of days) out.push(dayRow(employee, date, punches));
	}
	return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.employee_name).localeCompare(String(b.employee_name)));
}

function dayRow(employee, date, punches) {
	const typed = punches.some((p) => dirOf(p));
	/* Without a log type the first punch is taken as the arrival and the last as
	   the leaving, which is what hrms's own pairing does with an untyped log. */
	const ins = typed ? punches.filter((p) => dirOf(p) === "IN") : punches.slice(0, 1);
	const outs = typed ? punches.filter((p) => dirOf(p) === "OUT") : punches.length > 1 ? punches.slice(-1) : [];
	const firstIn = ins.length ? ins[0].time : "";
	const lastOut = outs.length ? outs[outs.length - 1].time : "";
	const workMs = firstIn && lastOut && ms(lastOut) > ms(firstIn) ? ms(lastOut) - ms(firstIn) : null;
	const fence = (v) => punches.filter((p) => p.custom_geofence_result === v);
	const outside = fence("outside");
	const far = outside.map((p) => Number(p.custom_distance_metres)).filter((n) => isFinite(n) && n > 0);
	return {
		employee,
		employee_name: punches.find((p) => p.employee_name)?.employee_name || "",
		date,
		punches,
		firstIn,
		lastOut,
		workMs,
		complete: workMs != null,
		missing: !firstIn && !lastOut ? "" : !firstIn ? "In" : !lastOut ? "Out" : "",
		outside: outside.length,
		inside: fence("inside").length,
		noLocation: fence("no_location").length,
		farthest: far.length ? Math.max(...far) : null,
	};
}

/** The server's fence verdicts for a day, worded for a cell. Empty when it gave none. */
export function fenceText(d) {
	if (d.outside) return `Outside ×${d.outside}${d.farthest ? ` (${Math.round(d.farthest)} m)` : ""}`;
	if (d.noLocation) return `No location ×${d.noLocation}`;
	if (d.inside) return "Inside";
	return "";
}

/**
 * One row per person over the range, off `apDaily`'s own rows.
 *
 * @returns {object[]} `{ employee, employee_name, days, punches, complete, missingIn,
 *   missingOut, outside, noLocation, workMs, avgMs, first, last }`, by name
 */
export function apTotals(daily) {
	const by = new Map();
	for (const d of daily || []) {
		let t = by.get(d.employee);
		if (!t) {
			t = { employee: d.employee, employee_name: d.employee_name, days: 0, punches: 0, complete: 0,
				missingIn: 0, missingOut: 0, outside: 0, noLocation: 0, workMs: 0, first: d.date, last: d.date };
			by.set(d.employee, t);
		}
		t.days++;
		t.punches += d.punches.length;
		if (d.complete) { t.complete++; t.workMs += d.workMs; }
		if (d.missing === "In") t.missingIn++;
		if (d.missing === "Out") t.missingOut++;
		t.outside += d.outside;
		t.noLocation += d.noLocation;
		if (d.date < t.first) t.first = d.date;
		if (d.date > t.last) t.last = d.date;
		if (!t.employee_name && d.employee_name) t.employee_name = d.employee_name;
	}
	return [...by.values()]
		.map((t) => ({ ...t, avgMs: t.complete ? t.workMs / t.complete : null }))
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
}

/** Every date from `from` to `till`, inclusive, as `YYYY-MM-DD`. */
export function apDates(from, till) {
	const out = [];
	if (!from || !till || from > till) return out;
	const d = new Date(from + "T00:00:00");
	const end = new Date(till + "T00:00:00");
	while (d <= end) {
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
		d.setDate(d.getDate() + 1);
	}
	return out;
}

/**
 * The month as a grid: a row per person who punched from the app, a cell per
 * date. A cell is `apDaily`'s row for that day, or null for a day with no app
 * punch — which is not "absent": they may have used the machine.
 *
 * @returns {{ dates: string[], people: { employee, employee_name, cells: (object|null)[] }[] }}
 */
export function apGrid(daily, from, till) {
	const dates = apDates(from, till);
	const index = new Map(dates.map((d, i) => [d, i]));
	const by = new Map();
	for (const d of daily || []) {
		if (!index.has(d.date)) continue;
		let p = by.get(d.employee);
		if (!p) {
			p = { employee: d.employee, employee_name: d.employee_name, cells: dates.map(() => null) };
			by.set(d.employee, p);
		}
		p.cells[index.get(d.date)] = d;
	}
	return {
		dates,
		people: [...by.values()].sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))),
	};
}

/** What a grid cell says: `P` a whole day, `MP` a punch missing, blank no app punch. */
export const cellLetter = (d) => (!d ? "" : d.complete ? "P" : "MP");
