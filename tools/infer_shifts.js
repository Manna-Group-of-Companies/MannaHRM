/**
 * What the punch history says about each named shift.
 *
 *     node tools/infer_shifts.js
 *
 * Joins three years of real punches to the shift each person is named against
 * in the Factor HR master, and reports what those people actually do. The
 * output is evidence to confirm, **not** a shift definition.
 *
 * ## Why this is not the same as knowing the shift
 *
 * The gap between when a shift starts and when people punch **is the
 * late-coming rule**. MT-003's shift is known to start at 09:30 and his median
 * punch is 09:29 — but on the days he arrives at 09:36, Factor HR records
 * `Late Coming By 00:06`. Derive the start time from his punches and you would
 * get 09:30 by luck; derive it from somebody habitually late and you would
 * write their lateness into the definition and never flag it again.
 *
 * So every figure here is labelled as observed. What it is good for is
 * narrowing 20 blank rows into 20 questions with a number already in them, and
 * for the two things behaviour genuinely does reveal:
 *
 *   - **Whether a shift crosses midnight.** A day whose OUT precedes its IN is
 *     not an anomaly, it is a night shift, and no amount of policy tells you
 *     that.
 *   - **Whether a shift is one pattern or several.** A "24hr shift" with two
 *     clear clusters of start time is a rota, and configures completely
 *     differently from a single long window.
 */

import fs from "node:fs";
import { readFirstSheet } from "./lib/sheets.js";
import { listAll } from "./lib/erp.js";

const PUNCHES = "data/out/device-punches-MRP-GATE1.json";
const MASTER = "data/factohr/Employee Detail Report.xlsx";

/* A shift is attributed to the day it STARTED. Anything before this hour is
   treated as the tail of the night before rather than a very early start —
   03:08 is somebody going home, not somebody arriving. */
const NIGHT_CUTOFF_HOUR = 4;

/** Employee code -> the shift Factor HR names them against. */
async function shiftByCode() {
	const rows = await readFirstSheet(MASTER, { maxRows: 3000 });
	const hi = rows.findIndex((r) =>
		r.some((c) => c && String(c).trim().toLowerCase() === "emp code"));
	if (hi === -1) throw new Error(`No 'Emp Code' column in ${MASTER}`);

	const H = rows[hi].map((c) => (c === null || c === undefined ? "" : String(c).trim().toLowerCase()));
	const ic = H.indexOf("emp code");
	const ish = H.indexOf("working shift");

	const out = new Map();
	for (const r of rows.slice(hi + 1)) {
		if (ic < r.length && r[ic]) {
			out.set(String(r[ic]).trim(), ish >= 0 && ish < r.length && r[ish] ? String(r[ish]).trim() : "");
		}
	}
	return out;
}

const hhmm = (minutes) => {
	const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Median, not mean: one person who forgot to punch out until midnight should
    not drag a whole shift's apparent end time. */
function median(xs) {
	const s = [...xs].sort((a, b) => a - b);
	const mid = s.length >> 1;
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The value at a decile boundary, for the "middle 80%" spread. */
function decile(xs, n) {
	const s = [...xs].sort((a, b) => a - b);
	const i = Math.min(s.length - 1, Math.max(0, Math.round((n / 10) * s.length) - 1));
	return s[i];
}

const padEnd = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

/** "2026-08-19 06:42:00" -> a local Date. Never `new Date(string)`, which
    treats a bare datetime as UTC in some engines and local in others. */
function parseStamp(s) {
	const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
	if (!m) return null;
	return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

const dayKey = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
	if (!process.env.ERP_KEY) {
		process.stderr.write("Set ERP_URL, ERP_KEY, ERP_SECRET first.\n");
		process.exit(1);
	}
	if (!fs.existsSync(PUNCHES)) {
		process.stderr.write(`No punch file at ${PUNCHES}\n`);
		process.exit(1);
	}

	const punches = JSON.parse(fs.readFileSync(PUNCHES, "utf8"));
	const byCode = await shiftByCode();
	const emps = await listAll("Employee",
		["employee_name", "employee_number", "attendance_device_id", "company"]);

	const devToCode = new Map();
	for (const e of emps) {
		if (e.attendance_device_id && e.employee_number) {
			devToCode.set(String(e.attendance_device_id).trim(), e.employee_number);
		}
	}

	// device user -> shift name, via employee code
	const devShift = new Map();
	for (const [dev, code] of devToCode) {
		const s = byCode.get(code);
		if (s) devShift.set(dev, s);
	}

	/* Group each person's punches into working days. A punch before the night
	   cutoff belongs to the previous day's shift. */
	const byUserDay = new Map();
	for (const p of punches) {
		const u = p.u;
		if (!devShift.has(u)) continue;
		const t = parseStamp(p.t);
		if (!t) continue;
		const d = new Date(t);
		if (t.getHours() < NIGHT_CUTOFF_HOUR) d.setDate(d.getDate() - 1);
		const k = `${u}|${dayKey(d)}`;
		if (!byUserDay.has(k)) byUserDay.set(k, { u, rows: [] });
		byUserDay.get(k).rows.push([t, p.p]);
	}

	const stat = new Map();
	const of = (shift) => {
		if (!stat.has(shift)) {
			stat.set(shift, { ins: [], outs: [], spans: [], people: new Set(), crossers: 0, days: 0 });
		}
		return stat.get(shift);
	};

	for (const { u, rows } of byUserDay.values()) {
		rows.sort((a, b) => a[0] - b[0]);
		const shift = devShift.get(u);
		const ins = rows.filter(([, c]) => c === 0).map(([t]) => t);
		const outs = rows.filter(([, c]) => c === 1).map(([t]) => t);
		if (!ins.length || !outs.length) continue;

		const firstIn = new Date(Math.min(...ins));
		const lastOut = new Date(Math.max(...outs));
		if (lastOut <= firstIn) continue;

		const span = (lastOut - firstIn) / 3600000;
		if (span > 20) continue; // a missed punch-out paired with the next day's punch-in

		const s = of(shift);
		s.people.add(u);
		s.days++;
		s.ins.push(firstIn.getHours() * 60 + firstIn.getMinutes());
		s.outs.push(lastOut.getHours() * 60 + lastOut.getMinutes());
		s.spans.push(span);
		if (dayKey(lastOut) !== dayKey(firstIn)) s.crossers++;
	}

	console.log("OBSERVED PUNCH BEHAVIOUR, BY THE SHIFT PEOPLE ARE NAMED AGAINST");
	console.log(`source: ${punches.length} punches from BIO-MRP-GATE1, joined via attendance_device_id`);
	console.log("=".repeat(108));
	console.log(`${padEnd("Shift (Factor HR name)", 44)} ${padStart("ppl", 4)} ${padStart("days", 6)}`
		+ ` ${padStart("typical IN", 13)} ${padStart("typical OUT", 13)} ${padStart("hours", 7)} ${padStart("crosses", 8)}`);
	console.log("-".repeat(108));

	const shifts = [...stat.keys()].sort((a, b) => stat.get(b).days - stat.get(a).days);
	for (const shift of shifts) {
		const s = stat.get(shift);
		const cross = s.crossers
			? `${Math.round((100 * s.crossers) / Math.max(1, s.days))}%`
			: "-";
		console.log(`${padEnd(shift.slice(0, 44), 44)} ${padStart(s.people.size, 4)} ${padStart(s.days, 6)}`
			+ ` ${padStart(hhmm(median(s.ins)), 13)} ${padStart(hhmm(median(s.outs)), 13)}`
			+ ` ${padStart(median(s.spans).toFixed(1), 7)} ${padStart(cross, 8)}`);
		if (s.ins.length > 10) {
			console.log(`${padEnd("", 44)} middle 80% of starts: ${hhmm(decile(s.ins, 1))}-${hhmm(decile(s.ins, 9))}`);
		}
	}

	const named = new Set([...byCode.values()].filter(Boolean));
	const missing = [...named].filter((s) => !stat.has(s)).sort();
	console.log(`\nNO PUNCH DATA HERE FOR ${missing.length} SHIFT(S) — their people punch at other gates:`);
	for (const s of missing) console.log("   " + s);
}

main();
