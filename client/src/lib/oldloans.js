import { amountOf, plain } from "@/lib/basepayimport";
import { cellDate } from "@/lib/increments";
import { KINDS, addMonths, split } from "@/lib/advances";

/* ---------------------------------------------------------------------------
   Payroll → Advances & Loans → Upload old loans (16 October 2026).

   Loans and advances people took before this system: for each, the total
   taken and the advance already received back. What is left — total less
   received — is recovered from salary in monthly instalments, each one an
   Additional Salary, exactly as a loan given on this page is (lib/advances.js).
   The four company logins may upload these; they still change nobody's
   salary (data/menus.js).

   A row matches a person by employee code only. A person who already has
   instalments of that kind from the first month on is not given more: the
   same sheet uploaded twice would otherwise take the loan twice out of
   somebody's pay. Cancel the old ones in Frappe first.

   Pure. Nothing is written here.
   --------------------------------------------------------------------------- */

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/* What a heading means. Order matters: "Advance Received" is the amount back,
   not the kind; "No. of Months" is the instalments, not the first month. */
const HEADS = [
	["id", (c) => /emp(loyee)?\.?\s*(code|id|no\b|number)|^(emp\.?\s*)?code$|^id$/.test(c)],
	["kind", (c) => /^(type|kind)$|advance or loan|loan or advance|loan\/advance|advance\/loan/.test(c)],
	["received", (c) => /receiv|repaid|paid back|recovered|returned/.test(c)],
	["total", (c) => /total|taken|principal|loan amount|amount/.test(c)],
	["instalments", (c) => /instal|install|emi|no\.? of months|months/.test(c)],
	["from", (c) => /first|from|start|month|date/.test(c)],
	["name", (c) => /name/.test(c)],
];

/** The headings of the sheet to fill in, in its order. */
export const OLD_LOAN_HEADS = ["Emp Code", "Name", "Advance or Loan", "Total Loan Taken", "Advance Received", "Instalments", "First Month"];

/** Where the columns are: the first of the top rows with a code and a total. */
export function findLoanColumns(table) {
	for (let r = 0; r < Math.min(table.length, 15); r++) {
		const at = {};
		(table[r] || []).forEach((cell, i) => {
			const c = norm(plain(cell));
			if (!c) return;
			const hit = HEADS.find(([key, test]) => at[key] === undefined && test(c));
			if (hit) at[hit[0]] = i;
		});
		if (at.id !== undefined && at.total !== undefined) return { row: r, at };
	}
	return null;
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A first month as `YYYY-MM`, from a date, "2026-11", "11/2026" or "Nov 2026". */
export function monthOf(v) {
	const raw = plain(v);
	const t = String(raw ?? "").trim();
	if (!t) return "";
	let m = /^(\d{4})-(\d{1,2})$/.exec(t);
	if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
	m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
	if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
	m = /^([a-z]{3})[a-z]*[\s,.-]*(\d{4})$/i.exec(t);
	if (m && MON.includes(m[1].toLowerCase())) return `${m[2]}-${String(MON.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}`;
	const d = cellDate(raw);
	return d ? d.slice(0, 7) : "";
}

/** "Loan" or "Advance" from the sheet; a blank cell is a loan. */
export function kindOf(v) {
	const t = norm(plain(v));
	if (!t) return "loan";
	if (/^adv/.test(t)) return "advance";
	if (/^loan|^emi/.test(t)) return "loan";
	return "";
}

/**
 * Read the sheet against the site.
 *
 * @param ctx {people, existing, company, defaultFrom}
 *   people — Employee rows: name, employee_number, employee_name, company
 *   existing — Additional Salary rows from api/advances.js loadInstalments
 *   defaultFrom — `YYYY-MM`, the first month of a row that gives none
 * @returns {{ok: true, lines: object[], problems: object[], blank: number, settled: object[]}
 *         | {ok: false, error: string}}
 */
export function planOldLoans(table, ctx) {
	const { people = [], existing = [], company = "", defaultFrom = "" } = ctx;
	const cols = findLoanColumns(table);
	if (!cols) return { ok: false, error: "The sheet needs a heading for the employee code and one for the total loan taken." };

	const byCode = new Map();
	for (const p of people) {
		for (const k of new Set([norm(p.name), norm(p.employee_number)].filter(Boolean))) {
			byCode.set(k, [...(byCode.get(k) || []), p]);
		}
	}
	const cell = (row, key) => (cols.at[key] === undefined ? "" : row[cols.at[key]]);
	const lines = [];
	const problems = [];
	const settled = [];
	const seen = new Map();
	let blank = 0;

	for (let r = cols.row + 1; r < table.length; r++) {
		const row = table[r] || [];
		const code = String(plain(cell(row, "id"))).trim();
		const rawTotal = String(plain(cell(row, "total"))).trim();
		if (!code && !rawTotal) continue;
		const who = [code, String(plain(cell(row, "name"))).trim()].filter(Boolean).join(" ") || "(blank)";
		const bad = (text) => problems.push({ row: r + 1, text: `Row ${r + 1}, ${who}: ${text}.` });
		/* The downloaded list has everybody on it; most have no old loan. */
		if (!rawTotal) { blank += 1; continue; }

		if (!code) { bad("no employee code"); continue; }
		const hits = byCode.get(norm(code)) || [];
		const here = company ? hits.filter((p) => p.company === company) : hits;
		if (!hits.length) { bad("nobody on this site has that code"); continue; }
		if (!here.length) { bad(`is on ${hits[0].company || "another company"}'s payroll — pick that company in the top bar`); continue; }
		if (here.length > 1) { bad("that code belongs to more than one person"); continue; }
		const p = here[0];

		const kind = kindOf(cell(row, "kind"));
		if (!kind) { bad(`"${String(plain(cell(row, "kind")))}" is not Advance or Loan`); continue; }
		const total = amountOf(rawTotal);
		if (!(total > 0)) { bad(`the total "${rawTotal}" is not a number above zero`); continue; }
		const rawReceived = String(plain(cell(row, "received"))).trim();
		const received = rawReceived ? amountOf(rawReceived) : 0;
		if (!(received >= 0)) { bad(`the advance received "${rawReceived}" is not a number`); continue; }
		if (received > total) { bad(`₹${received} received is more than the ₹${total} taken`); continue; }
		const owed = Math.round((total - received) * 100) / 100;
		if (owed === 0) { settled.push({ row: r + 1, who }); continue; }

		const rawN = String(plain(cell(row, "instalments"))).trim();
		const n = rawN ? Number(rawN) : 1;
		if (!Number.isInteger(n) || n < 1 || n > 60) { bad(`instalments "${rawN}" must be a whole number from 1 to 60`); continue; }
		if (Math.round(owed * 100) < n) { bad("what is left is too small to split that many ways"); continue; }
		const rawFrom = cell(row, "from");
		const from = String(plain(rawFrom) ?? "").trim() ? monthOf(rawFrom) : defaultFrom;
		if (!/^\d{4}-\d{2}$/.test(from || "")) {
			bad(String(plain(rawFrom) ?? "").trim() ? `"${String(plain(rawFrom))}" is not a month` : "no first month, and none chosen above");
			continue;
		}

		const component = KINDS.find((k) => k.key === kind).component;
		const key = `${p.name}|${kind}`;
		if (seen.has(key)) { bad(`${p.employee_name || code} has a second ${kind} row — put them in one`); continue; }
		seen.set(key, true);
		const clash = existing.find((x) => x.employee === p.name && x.salary_component === component
			&& Number(x.docstatus) < 2 && String(x.payroll_date || "").slice(0, 7) >= from);
		if (clash) {
			bad(`already has ${kind} instalments from ${String(clash.payroll_date).slice(0, 7)} — cancel them in Frappe first, or this would take it twice`);
			continue;
		}

		const parts = split(owed, n, from);
		lines.push({
			row: r + 1, employee: p.name, code: p.employee_number || p.name, name: p.employee_name || p.name,
			kind, component, total, received, owed, instalments: n, from, to: addMonths(from, n - 1),
			each: parts[0][1], last: parts[parts.length - 1][1],
		});
	}
	problems.sort((a, b) => a.row - b.row);
	return { ok: true, lines, problems, blank, settled };
}

/** One line as the form givePlan takes. */
export const asPlan = (l) => ({ employee: l.employee, kind: l.kind, principal: l.owed, instalments: l.instalments, from: l.from });
