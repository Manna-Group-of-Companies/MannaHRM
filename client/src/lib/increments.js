/* ---------------------------------------------------------------------------
   Payroll → Increments: January's salary increments, from HR's Excel sheet.

   **An increment is a new Salary Structure Assignment**, which is hrms's own
   way of saying "from this date, this person's base pay is this": the same
   structure as now, the new base, `from_date` the day it takes effect. hrms
   pays every month from the assignment in force that month, so the old one is
   not touched — it stays the record of what was paid before, and a run for
   December still pays December's base. No other document is changed.

   **Nothing here decides an amount.** The new base is what HR's sheet says,
   given as the new base itself, an increase in rupees or a percentage. This
   only reads the sheet, matches each row to a person and the salary they are
   on, and says what each row will do before anything is written.

   **A sheet can be uploaded twice.** A row whose person already has an
   assignment from that date with that base is "already done" and skipped, so
   a second upload after a refusal writes only what the first did not.

   Pure: no React, no network.
   --------------------------------------------------------------------------- */

/** The template's columns, in order. The four HR fills are the last four. */
export const TEMPLATE_COLUMNS = [
	"Emp Code", "Name", "Department", "Salary Structure", "Current Base",
	"New Base", "Increment Amount", "Increment %", "Effective From",
];

/** Which header is which, said loosely: HR's own sheet from last year will
    not be spelled like the template, and a column that is not recognised is
    reported on the preview rather than silently ignored. */
const HEADERS = {
	code: /^(emp(loyee)?\.?\s*(code|no\.?|number|id)|code|staff\s*(code|no\.?))$/i,
	name: /^(emp(loyee)?\s*)?name$/i,
	newBase: /^(new|revised)\s*(base|basic|salary|gross|pay)(\s*pay)?|^base\s*after/i,
	amount: /^(increment|increase|hike)(\s*(amount|amt|rs\.?|₹))?$/i,
	pct: /%|percent/i,
	effective: /^(effective(\s*(from|date))?|w\.?\s*e\.?\s*f\.?|from(\s*date)?)$/i,
};

const norm = (h) => String(h ?? "").replace(/\s+/g, " ").trim();

/** Map a sheet's headers to what they hold. `{code, name, newBase, amount, pct, effective}`, each a header or "". */
export function findColumns(headers) {
	const out = { code: "", name: "", newBase: "", amount: "", pct: "", effective: "" };
	for (const raw of headers) {
		const h = norm(raw);
		if (!h) continue;
		/* % first: "Increment %" is the percentage, not the amount. */
		if (!out.pct && HEADERS.pct.test(h)) out.pct = raw;
		else if (!out.code && HEADERS.code.test(h)) out.code = raw;
		else if (!out.newBase && HEADERS.newBase.test(h)) out.newBase = raw;
		else if (!out.amount && HEADERS.amount.test(h)) out.amount = raw;
		else if (!out.effective && HEADERS.effective.test(h)) out.effective = raw;
		else if (!out.name && HEADERS.name.test(h)) out.name = raw;
	}
	return out;
}

/** Why the sheet cannot be read at all, or "". */
export function sheetProblem(cols) {
	if (!cols.code) return "The sheet has no Emp Code column, so no row can be matched to a person. Use the downloaded sheet, or name a column Emp Code.";
	if (!cols.newBase && !cols.amount && !cols.pct) {
		return "The sheet has no New Base, Increment Amount or Increment % column, so it says no increment.";
	}
	return "";
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The 1st of January the increments are for: this year's until the end of
    March (a sheet uploaded late is still for this January), next year's after. */
export function defaultEffective(today) {
	const y = Number(today.slice(0, 4));
	return Number(today.slice(5, 7)) <= 3 ? `${y}-01-01` : `${y + 1}-01-01`;
}

/** A date cell as `YYYY-MM-DD`, or null. Excel gives a Date; a typed cell is
    read day first (01-01-2027, 1/1/2027), the way HR here writes dates. */
export function cellDate(v) {
	if (v == null || v === "") return null;
	if (v instanceof Date) {
		/* ExcelJS reads a date cell as midnight UTC, which is the right day
		   only when read in UTC. */
		return isNaN(v) ? null : `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
	}
	const s = String(v).trim();
	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
	if (m) return okDate(+m[1], +m[2], +m[3]);
	m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
	if (m) return okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
	const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
	m = /^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2}|\d{4})$/.exec(s);
	if (m && MON.includes(m[2].toLowerCase())) {
		return okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON.indexOf(m[2].toLowerCase()) + 1, +m[1]);
	}
	return null;
}

function okDate(y, mo, d) {
	const t = new Date(y, mo - 1, d);
	return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d ? iso(t) : null;
}

/** A money or percentage cell as a number, or null when blank. "₹ 12,500",
    "12,500.00" and "8%" all read; anything else is NaN, said as a problem. */
export function cellNumber(v) {
	if (v == null || String(v).trim() === "") return null;
	if (typeof v === "number") return v;
	const n = Number(String(v).replace(/[₹,%\s]|rs\.?/gi, ""));
	return Number.isFinite(n) ? n : NaN;
}

const round2 = (n) => Math.round(n * 100) / 100;

/** The assignment in force for `employee` on `day`: the latest submitted one
    starting on or before it, as hrms picks it for a salary slip. */
export function inForce(assignments, employee, day) {
	let best = null;
	for (const a of assignments || []) {
		if (a.employee !== employee || Number(a.docstatus ?? 1) !== 1) continue;
		const f = String(a.from_date).slice(0, 10);
		if (f > day) continue;
		if (!best || f > String(best.from_date).slice(0, 10)) best = a;
	}
	return best;
}

/**
 * What each row of the sheet will do.
 *
 * @param {object[]} rows  the sheet, header-keyed
 * @param {object} cols  findColumns' answer
 * @param {{employees: object[], assignments: object[], effective: string}} ctx
 *   `effective` is the page's date, used where a row gives none
 * @returns {object[]} one line per row: `{row, code, employee, name, from, current, base, newBase,
 *   increase, pct, status: "ready"|"done"|"skip"|"problem", why}`
 */
export function planIncrements(rows, cols, { employees, assignments, effective }) {
	const byCode = new Map();
	for (const e of employees || []) {
		for (const k of [e.employee_number, e.name]) if (k) byCode.set(String(k).trim().toUpperCase(), e);
	}
	const seen = new Set();
	return rows.map((r, i) => {
		const line = { row: i + 2, code: norm(r[cols.code]), name: norm(r[cols.name]), status: "problem", why: "" };
		const say = (status, why) => Object.assign(line, { status, why });
		const newBase = cols.newBase ? cellNumber(r[cols.newBase]) : null;
		const amount = cols.amount ? cellNumber(r[cols.amount]) : null;
		const pct = cols.pct ? cellNumber(r[cols.pct]) : null;

		if (!line.code) return say("problem", "No Emp Code.");
		const emp = byCode.get(line.code.toUpperCase());
		if (!emp) return say("problem", `No employee has the code ${line.code}.`);
		Object.assign(line, { employee: emp.name, name: emp.employee_name || line.name });
		if (seen.has(emp.name)) return say("problem", `${line.code} is in the sheet twice; only the first row is used.`);
		seen.add(emp.name);

		if (newBase == null && amount == null && pct == null) return say("skip", "No increment given.");
		if ([newBase, amount, pct].some((n) => Number.isNaN(n))) return say("problem", "An amount in this row is not a number.");

		const from = cols.effective && String(r[cols.effective] ?? "").trim() !== "" ? cellDate(r[cols.effective]) : effective;
		if (!from) return say("problem", `Effective From "${r[cols.effective]}" is not a date.`);
		line.from = from;

		const current = inForce(assignments, emp.name, from);
		if (!current) return say("problem", `Has no salary structure on ${from}. Give one on Salary Setup first.`);
		line.current = current;
		line.base = Number(current.base) || 0;

		/* The new base itself wins when given; an amount next; a percentage last.
		   Two that disagree are a typo somewhere, and which one is meant is HR's
		   to say. */
		let next;
		if (newBase != null) next = newBase;
		else if (amount != null) next = line.base + amount;
		else next = line.base * (1 + pct / 100);
		next = round2(next);
		if (newBase != null && amount != null && Math.abs(line.base + amount - newBase) > 1) {
			return say("problem", `New Base ${newBase} and Increment Amount ${amount} disagree: the current base is ${line.base}.`);
		}
		if (newBase == null && amount != null && pct != null && Math.abs(line.base * pct / 100 - amount) > 1) {
			return say("problem", `Increment Amount ${amount} and Increment % ${pct} disagree on a base of ${line.base}.`);
		}
		if (pct != null && pct > 100) return say("problem", `An increment of ${pct}% is more than double. Check the sheet.`);
		Object.assign(line, { newBase: next, increase: round2(next - line.base), pct: line.base ? round2((next / line.base - 1) * 100) : null });

		if (!(next > 0)) return say("problem", "The new base comes to nothing.");

		const sameDay = (assignments || []).find((a) => a.employee === emp.name && Number(a.docstatus ?? 1) === 1
			&& String(a.from_date).slice(0, 10) === from);
		if (sameDay) {
			if (Math.abs(Number(sameDay.base) - next) < 0.01) return say("done", `Already done (${sameDay.name}).`);
			return say("problem", `Already has a salary from ${from} (${sameDay.name}, base ${sameDay.base}). Cancel it in Frappe to change it.`);
		}
		/* A pay cut is shown as one and applied only when HR ticks for it on
		   the page (5 October 2026): a typo that lowers somebody's wage is the
		   expensive mistake, so a decrease is never applied by default. */
		if (next < line.base) return say("decrease", `Lower than the current base, by ${round2(line.base - next)}. Applied only if you tick the decreases.`);
		if (next === line.base) return say("skip", "Same as the current base.");
		return say("ready", "");
	});
}

/** The Salary Structure Assignment that makes one increment: the current
    assignment's structure and settings, the new base, from the new date. */
export function incrementDoc(line) {
	const c = line.current;
	const doc = {
		employee: line.employee,
		salary_structure: c.salary_structure,
		company: c.company,
		from_date: line.from,
		base: line.newBase,
	};
	/* Carried over so the new assignment pays the way the old one did; each
	   only when the old one had it. */
	for (const k of ["variable", "income_tax_slab", "payroll_payable_account", "currency"]) {
		if (c[k] != null && c[k] !== "") doc[k] = c[k];
	}
	return doc;
}

/** The template: one row per person with a salary now, their current base
    filled in and the increment columns left for HR. */
export function templateRows(employees, assignments, day) {
	const out = [];
	for (const e of employees || []) {
		const a = inForce(assignments, e.name, day);
		if (!a) continue;
		out.push([e.employee_number || e.name, e.employee_name || "", e.department || "", a.salary_structure, Number(a.base) || 0, "", "", "", ""]);
	}
	return out.sort((x, y) => String(x[0]).localeCompare(String(y[0]), undefined, { numeric: true }));
}

/** Counts for the preview's tiles. */
export function tally(lines) {
	const t = { ready: 0, decrease: 0, done: 0, skip: 0, problem: 0, increase: 0, cut: 0 };
	for (const l of lines) {
		t[l.status] = (t[l.status] || 0) + 1;
		if (l.status === "ready") t.increase += l.increase;
		if (l.status === "decrease") t.cut += l.increase;
	}
	t.increase = round2(t.increase);
	t.cut = round2(t.cut);
	return t;
}

/** Up, down or the same, from one base to another. */
export const direction = (before, after) => (after > before ? "up" : after < before ? "down" : "same");

/**
 * Every salary change that starts on `day`, as the site holds it — the check
 * HR can read at any time, not only straight after Apply. For each submitted
 * assignment from that date: the base before it (the assignment in force the
 * day before), the base after, and which way it went.
 *
 * @returns {{employee, name, code, made, before, after, change, pct, way}[]}
 */
export function changesOn(assignments, day, employees) {
	const prev = new Date(day + "T00:00:00");
	prev.setDate(prev.getDate() - 1);
	const before = iso(prev);
	const who = new Map((employees || []).map((e) => [e.name, e]));
	return (assignments || [])
		.filter((a) => Number(a.docstatus ?? 1) === 1 && String(a.from_date).slice(0, 10) === day)
		.map((a) => {
			const old = inForce(assignments, a.employee, before);
			const b = old ? Number(old.base) || 0 : null;
			const n = Number(a.base) || 0;
			const e = who.get(a.employee) || {};
			return {
				employee: a.employee, name: a.employee_name || e.employee_name || a.employee, code: e.employee_number || "",
				made: a.name, before: b, after: n,
				change: b == null ? null : round2(n - b),
				pct: b ? round2((n / b - 1) * 100) : null,
				way: b == null ? "first" : direction(b, n),
			};
		})
		.sort((x, y) => String(x.code || x.name).localeCompare(String(y.code || y.name), undefined, { numeric: true }));
}

/** What the site says about one applied row, after Apply: `{way, base, made}`
    from the assignment it now holds for that person and date, or `{way: "missing"}`. */
export function verifyLine(line, assignments) {
	const got = (assignments || []).find((a) => a.employee === line.employee && Number(a.docstatus ?? 1) === 1
		&& String(a.from_date).slice(0, 10) === line.from);
	if (!got) return { way: "missing" };
	const base = Number(got.base) || 0;
	if (Math.abs(base - line.newBase) >= 0.01) return { way: "differs", base, made: got.name };
	return { way: direction(line.base, base), base, made: got.name };
}
