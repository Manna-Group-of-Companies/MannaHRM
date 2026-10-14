import { amountOf, plain } from "@/lib/basepayimport";
import { cellDate } from "@/lib/increments";

/* ---------------------------------------------------------------------------
   Payroll → Actual Salary → Upload (14 October 2026).

   HR's sheet gives each person an actual salary and the date it starts; each
   row becomes an `Employee Actual Salary`. Nothing in payroll reads those —
   the slip, PF and ESI come from the Salary Structure Assignment — so a wrong
   figure here moves no pay, but it is what Diff Cash shows as Net Payable, so
   every row is still previewed, confirmed and read back.

   A row matches a person by employee code only: two people can share a name.
   One row a person a From Date — the site refuses a second, and a sheet that
   names somebody twice for one date has not been decided, so neither is used.
   A row whose date already has an actual salary updates it; the same figure
   again is left alone, so the same sheet uploaded twice writes nothing.

   Pure. Nothing is written here.
   --------------------------------------------------------------------------- */

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/* What a heading means. Order matters: "From Date" is the date, not a name. */
const HEADS = [
	["id", (c) => /emp(loyee)?\.?\s*(code|id|no\b|number)|^(emp\.?\s*)?code$|^id$/.test(c)],
	["from", (c) => /from|effective|w\.?e\.?f|start|date/.test(c)],
	["name", (c) => /name/.test(c)],
	["salary", (c) => /actual|salary|gross|monthly|ctc|pay|amount/.test(c)],
];

/** Where the columns are: the first of the top rows with a code and a salary. */
export function findActualColumns(table) {
	for (let r = 0; r < Math.min(table.length, 15); r++) {
		const at = {};
		(table[r] || []).forEach((cell, i) => {
			const c = norm(plain(cell));
			if (!c) return;
			const hit = HEADS.find(([key, test]) => at[key] === undefined && test(c));
			if (hit) at[hit[0]] = i;
		});
		if (at.id !== undefined && at.salary !== undefined) return { row: r, at };
	}
	return null;
}

/** Read the sheet against the site.
    @param ctx {people, existing, company, defaultFrom}
      people — Employee rows: name, employee_number, employee_name, company
      existing — Employee Actual Salary rows: name, employee, from_date, actual_salary
      defaultFrom — the date a row with no From Date of its own starts */
export function planActual(table, ctx) {
	const { people = [], existing = [], company = "", defaultFrom = "" } = ctx;
	const cols = findActualColumns(table);
	if (!cols) return { ok: false, error: "The sheet needs a heading for the employee code and one for the actual salary." };

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
		const rawSalary = plain(cell(row, "salary"));
		if (!code && String(rawSalary).trim() === "") continue;
		const who = [code, String(plain(cell(row, "name"))).trim()].filter(Boolean).join(" ") || "(blank)";
		const bad = (text) => problems.push({ row: r + 1, text: `Row ${r + 1}, ${who}: ${text}.` });
		/* The downloaded list has everybody on it; a row left without a salary
		   is somebody HR has not got to, not a mistake. */
		if (String(rawSalary).trim() === "") { blank += 1; continue; }

		if (!code) { bad("no employee code"); continue; }
		const hits = byCode.get(norm(code)) || [];
		const here = company ? hits.filter((p) => p.company === company) : hits;
		if (!hits.length) { bad("nobody on this site has that code"); continue; }
		if (!here.length) { bad(`is on ${hits[0].company || "another company"}'s payroll — pick that company in the top bar`); continue; }
		if (here.length > 1) { bad("that code belongs to more than one person"); continue; }

		const salary = amountOf(rawSalary);
		if (!(salary > 0)) { bad(`the actual salary "${String(rawSalary)}" is not a number above zero`); continue; }
		const rawFrom = plain(cell(row, "from"));
		const from = String(rawFrom).trim() === "" ? defaultFrom : cellDate(rawFrom);
		if (!from) { bad(String(rawFrom).trim() === "" ? "no From Date, and none chosen above" : `"${String(rawFrom)}" is not a date`); continue; }

		cand.push({ row: r + 1, who, p: here[0], salary, from });
	}

	const times = new Map();
	for (const c of cand) times.set(`${c.p.name}|${c.from}`, (times.get(`${c.p.name}|${c.from}`) || 0) + 1);

	const lines = [];
	for (const c of cand) {
		const n = times.get(`${c.p.name}|${c.from}`);
		if (n > 1) {
			problems.push({ row: c.row, text: `Row ${c.row}, ${c.who}: appears ${n} times for ${c.from}, so none of them is used until it appears once.` });
			continue;
		}
		const had = existing.find((e) => e.employee === c.p.name && String(e.from_date) === c.from);
		lines.push({
			row: c.row, employee: c.p.name, code: c.p.employee_number || c.p.name, name: c.p.employee_name || c.p.name,
			salary: c.salary, from: c.from,
			action: !had ? "new" : near(had.actual_salary, c.salary) ? "same" : "update",
			existing: had ? { name: had.name, salary: Number(had.actual_salary) } : null,
		});
	}
	problems.sort((a, b) => a.row - b.row);
	lines.sort((a, b) => a.row - b.row);
	return { ok: true, lines, problems, blank };
}

/** Everybody the save will touch. */
export const actualToSave = (plan) => (plan && plan.ok ? plan.lines.filter((l) => l.action !== "same") : []);

/** Each saved line read back off the site: what does not say what the sheet said. */
export function verifyActual(lines, after) {
	const wrong = [];
	for (const l of lines) {
		const got = (after || []).find((e) => e.employee === l.employee && String(e.from_date) === l.from);
		if (!got) wrong.push({ name: l.name, text: `has no actual salary from ${l.from} on the site` });
		else if (!near(got.actual_salary, l.salary)) wrong.push({ name: l.name, text: `has ₹${Number(got.actual_salary)} on the site, not ₹${l.salary}` });
	}
	return wrong;
}

/** The sheet's headings, in the order the downloaded list has them. */
export const ACTUAL_HEADS = ["Emp Code", "Name", "Department", "Actual Salary", "From Date"];

/** One person's row of the list to fill in, with their latest actual salary,
    so a sheet sent back unchanged changes nothing. */
export function actualRow(p, existing) {
	const latest = (existing || []).filter((e) => e.employee === p.name)
		.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))[0];
	return [p.employee_number || p.name, p.employee_name || "", p.department || "",
		latest ? Number(latest.actual_salary) : null, latest ? latest.from_date : null];
}
