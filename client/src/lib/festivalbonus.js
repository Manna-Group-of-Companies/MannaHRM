import { amountOf, plain } from "@/lib/basepayimport";

/* ---------------------------------------------------------------------------
   Payroll → Festival Bonus (22 October 2026, asked for by HR).

   A festival bonus — Onam, Christmas, whatever HR is giving — is uploaded as
   HR's sheet, one bonus a person, and each row becomes an `Employee Festival
   Bonus`. **It is paid apart from the salary**: no salary slip reads it, and
   the page gives the bank its own sheet for it. So it is not an Additional
   Salary, which hrms would put on the month's slip.

   One upload is one festival on one date, both chosen on the page, so the
   sheet is only codes and amounts. A row matches a person by employee code
   only: two people can share a name. A person named twice in the sheet has
   not been decided, so neither row is used. A person who already has this
   festival's bonus on this date is updated, and the same amount again is left
   alone, so the same sheet uploaded twice writes nothing.

   Pure. Nothing is written here.
   --------------------------------------------------------------------------- */

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/* What a heading means. Order matters: "Bonus Amount" is the amount, and a
   "Name" column is never one. */
const HEADS = [
	["id", (c) => /emp(loyee)?\.?\s*(code|id|no\b|number)|^(emp\.?\s*)?code$|^id$/.test(c)],
	["name", (c) => /name/.test(c)],
	["amount", (c) => /bonus|amount|₹|rs\.?$|inr/.test(c)],
];

/** Where the columns are: the first of the top rows with a code and an amount. */
export function findBonusColumns(table) {
	for (let r = 0; r < Math.min(table.length, 15); r++) {
		const at = {};
		(table[r] || []).forEach((cell, i) => {
			const c = norm(plain(cell));
			if (!c) return;
			const hit = HEADS.find(([key, test]) => at[key] === undefined && test(c));
			if (hit) at[hit[0]] = i;
		});
		if (at.id !== undefined && at.amount !== undefined) return { row: r, at };
	}
	return null;
}

/** What is wrong with the festival and date chosen on the page, or "". */
export function checkBonusOccasion({ festival, date }) {
	if (!String(festival || "").trim()) return "Type the festival.";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "Pick the bonus date.";
	return "";
}

/** Read the sheet against the site.
    @param ctx {people, existing, company, festival, date}
      people — Employee rows: name, employee_number, employee_name, company
      existing — Employee Festival Bonus rows: name, employee, festival, bonus_date, amount */
export function planBonus(table, ctx) {
	const { people = [], existing = [], company = "", date = "" } = ctx;
	const festival = String(ctx.festival || "").trim();
	const occasion = checkBonusOccasion({ festival, date });
	if (occasion) return { ok: false, error: occasion };
	const cols = findBonusColumns(table);
	if (!cols) return { ok: false, error: "The sheet needs a heading for the employee code and one for the bonus amount." };

	const byCode = new Map();
	for (const p of people) {
		for (const k of new Set([norm(p.name), norm(p.employee_number)].filter(Boolean))) {
			byCode.set(k, [...(byCode.get(k) || []), p]);
		}
	}
	const cell = (row, key) => (cols.at[key] === undefined ? "" : row[cols.at[key]]);
	const cand = [];
	const problems = [];
	let blank = 0;

	for (let r = cols.row + 1; r < table.length; r++) {
		const row = table[r] || [];
		const code = String(plain(cell(row, "id"))).trim();
		const raw = plain(cell(row, "amount"));
		if (!code && String(raw).trim() === "") continue;
		const who = [code, String(plain(cell(row, "name"))).trim()].filter(Boolean).join(" ") || "(blank)";
		const bad = (text) => problems.push({ row: r + 1, text: `Row ${r + 1}, ${who}: ${text}.` });
		/* The downloaded list has everybody on it; a row left without an amount
		   is somebody not given this bonus, not a mistake. */
		if (String(raw).trim() === "") { blank += 1; continue; }

		if (!code) { bad("no employee code"); continue; }
		const hits = byCode.get(norm(code)) || [];
		const here = company ? hits.filter((p) => p.company === company) : hits;
		if (!hits.length) { bad("nobody on this site has that code"); continue; }
		if (!here.length) { bad(`is on ${hits[0].company || "another company"}'s payroll — pick that company in the top bar`); continue; }
		if (here.length > 1) { bad("that code belongs to more than one person"); continue; }

		const amount = amountOf(raw);
		if (!(amount > 0)) { bad(`the bonus "${String(raw)}" is not a number above zero`); continue; }
		cand.push({ row: r + 1, who, p: here[0], amount });
	}

	const times = new Map();
	for (const c of cand) times.set(c.p.name, (times.get(c.p.name) || 0) + 1);

	const lines = [];
	for (const c of cand) {
		const n = times.get(c.p.name);
		if (n > 1) {
			problems.push({ row: c.row, text: `Row ${c.row}, ${c.who}: appears ${n} times, so none of them is used until it appears once.` });
			continue;
		}
		const had = existing.find((e) => e.employee === c.p.name && norm(e.festival) === norm(festival) && String(e.bonus_date) === date);
		lines.push({
			row: c.row, employee: c.p.name, code: c.p.employee_number || c.p.name, name: c.p.employee_name || c.p.name,
			amount: c.amount, festival, date,
			action: !had ? "new" : near(had.amount, c.amount) ? "same" : "update",
			existing: had ? { name: had.name, amount: Number(had.amount) } : null,
		});
	}
	problems.sort((a, b) => a.row - b.row);
	lines.sort((a, b) => a.row - b.row);
	return { ok: true, lines, problems, blank };
}

/** Everybody the save will touch. */
export const bonusToSave = (plan) => (plan && plan.ok ? plan.lines.filter((l) => l.action !== "same") : []);

/** Each saved line read back off the site: what does not say what the sheet said. */
export function verifyBonus(lines, after) {
	const wrong = [];
	for (const l of lines) {
		const got = (after || []).find((e) => e.employee === l.employee && norm(e.festival) === norm(l.festival) && String(e.bonus_date) === l.date);
		if (!got) wrong.push({ name: l.name, text: `has no ${l.festival} bonus on ${l.date} on the site` });
		else if (!near(got.amount, l.amount)) wrong.push({ name: l.name, text: `has ₹${Number(got.amount)} on the site, not ₹${l.amount}` });
	}
	return wrong;
}

/** The festivals already given, newest first, each once: what the bank sheet
    can be made for. */
export function bonusOccasions(rows) {
	const seen = new Map();
	for (const r of rows || []) {
		const key = `${String(r.festival).trim()}|${r.bonus_date}`;
		if (!seen.has(key)) seen.set(key, { key, festival: String(r.festival).trim(), date: String(r.bonus_date) });
	}
	return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date) || a.festival.localeCompare(b.festival));
}

/** One festival's bonuses in the shape lib/banksheet.js reads a slip in, so the
    bank gets the same sheet as for salary. Every bonus on the site is decided,
    so each reads as submitted. */
export const bonusAsSlips = (rows, occasion) => (rows || [])
	.filter((r) => occasion && String(r.festival).trim() === occasion.festival && String(r.bonus_date) === occasion.date)
	.map((r) => ({ name: r.name, employee: r.employee, employee_name: r.employee_name, net_pay: r.amount, docstatus: 1 }));

/** The sheet's headings, in the order the downloaded list has them. */
export const BONUS_HEADS = ["Emp Code", "Name", "Department", "Bonus Amount"];

/** One person's row of the list to fill in, with what they already have for
    this festival, so a sheet sent back unchanged changes nothing. */
export function bonusRow(p, existing, { festival, date }) {
	const had = (existing || []).find((e) => e.employee === p.name && norm(e.festival) === norm(festival) && String(e.bonus_date) === date);
	return [p.employee_number || p.name, p.employee_name || "", p.department || "", had ? Number(had.amount) : null];
}
