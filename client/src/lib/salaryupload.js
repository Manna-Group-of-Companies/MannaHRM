import { amountOf, plain } from "@/lib/basepayimport";

/* ---------------------------------------------------------------------------
   Payroll → Salary Setup → Upload salaries (9 October 2026).

   HR's sheet gives each person an actual salary, how it is handed over (part to
   the bank, the rest in cash) and the PF and ESI percentages. From it:

   - **The PF and ESI rates choose the salary structure.** Everybody with the
     same two rates in a company shares one structure — Basic is the whole
     salary, PF and ESI are a percentage of it — so whether a person pays PF is
     read off the structure they are on, never off a second flag on their
     record that could say otherwise (install.py, the 20 September note).
   - **The salary is the base** on a new Salary Structure Assignment.
   - **The bank and cash split is stored on the Employee** (`salary_mode`,
     `custom_bank_percent`, `custom_bank_amount`). It is how the net is paid
     and nothing else: PF and ESI are worked out on the full salary whatever
     share goes by bank. There is deliberately no way to work them out on the
     bank part alone — that would under-report the wage to EPFO and ESIC.

   **EPF is one of two calculations, chosen once per company** (HR, 10 October
   2026): Basic + DA is the whole salary, or half of it, and EPF wages are that
   figure up to a ceiling of ₹25,000. It is asked once, on the 5-tab Excel's
   download (HR, 13 October 2026), not here; an upload follows the company's
   structures, else Calculation 1. A company's choice is written into the
   names of its structures, so a company with structures cannot be given the
   other one by mistake (`companyMethod`). ESI stops once the salary is over
   ₹21,000. The rates themselves are the sheet's; hrms cuts every line for days
   not worked, so the structure says "of the salary" and hrms makes it "of the
   pay due".

   Pure. A row is reported and left out rather than guessed at, and matching is
   by employee code only — two people can share a name.
   --------------------------------------------------------------------------- */

/** The two ways a company may work EPF out. `share` is Basic + DA as a part
    of the salary — what EPF wages are, before the ceiling. */
export const EPF_METHODS = [
	{ key: "full", share: 1, label: "Calculation 1 — Basic + DA is 100% of the salary", example: "Salary ₹19,500 → EPF wages ₹19,500 → employee 12% ₹2,340" },
	{ key: "half", share: 0.5, label: "Calculation 2 — Basic + DA is 50% of the salary", example: "Salary ₹19,500 → EPF wages ₹9,750 → employee 12% ₹1,170" },
];
export const methodOf = (key) => EPF_METHODS.find((m) => m.key === key) || null;

/** EPF wages above this are worked out on this (HR's sheet, 10 October 2026). */
export const PF_CEILING = 25000;
/** A salary above this pays no ESI (HR's sheet, 10 October 2026). */
export const ESI_CEILING = 21000;

const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const near = (a, b) => Math.abs(a - b) <= 1;
const num = (v) => Number(v) || 0;

/** "12", 12, "12%" → 12; a blank cell → 0 (not a member); anything else → NaN.
    An Excel cell formatted as a percentage arrives as "12%" (see `cellValue`),
    never as 0.12, so a bare number is always the percentage itself. */
export function rateOf(v) {
	const t = String(plain(v)).trim();
	if (t === "") return 0;
	const m = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(t.replace(/,/g, ""));
	return m ? Number(m[1]) : NaN;
}

/** An ExcelJS cell as the sheet shows it: a number formatted as a percentage
    is "12%", because its stored value 0.12 would read as 0.12 per cent. */
export function cellValue(cell) {
	const v = plain(cell && cell.value);
	if (typeof v === "number" && /%/.test(String((cell && cell.numFmt) || ""))) {
		return `${Number((v * 100).toFixed(6))}%`;
	}
	return v;
}

/** 12 → "12", 0.75 → "0.75". */
const said = (n) => String(Number(Number(n).toFixed(4)));

/* What a heading means. Order matters: a "Bank %" heading is a share, not an
   amount, and "PF No" or "ESI Number" is somebody's account, not a rate. */
const HEADS = [
	["id", (c) => /emp(loyee)?\.?\s*(code|id|no\b|number)|^(emp\.?\s*)?code$|^id$/.test(c)],
	["bankPct", (c) => /bank/.test(c) && /%|percent|share/.test(c)],
	["bank", (c) => /bank/.test(c) && !/name|account|a\/c|ifsc|branch|%|percent|share/.test(c)],
	["cashPct", (c) => /cash/.test(c) && /%|percent|share/.test(c)],
	["cash", (c) => /cash/.test(c) && !/%|percent|share/.test(c)],
	["pf", (c) => /\bpf\b|provident|\bepf\b/.test(c) && !/\bno\b|no\.|number|account|a\/c|uan|wage/.test(c)],
	["esi", (c) => /\besic?\b|state insurance/.test(c) && !/\bno\b|no\.|number|\bip\b|wage/.test(c)],
	["name", (c) => /name/.test(c)],
	["salary", (c) => /actual|salary|gross|monthly|base|wages?\b|pay/.test(c) && !/net|bank|cash|\bpf\b|\besic?\b/.test(c)],
];

/** Where the columns are: the first of the top rows with a code and a salary. */
export function findUploadColumns(table) {
	for (let r = 0; r < Math.min(table.length, 15); r++) {
		const cells = (table[r] || []).map((c) => norm(plain(c)));
		const at = {};
		cells.forEach((c, i) => {
			if (!c) return;
			const hit = HEADS.find(([key, test]) => at[key] === undefined && test(c));
			if (hit) at[hit[0]] = i;
		});
		if (at.id !== undefined && at.salary !== undefined) {
			const heads = {};
			for (const k of Object.keys(at)) heads[k] = String(plain(table[r][at[k]])).trim();
			return { row: r, at, heads };
		}
	}
	return null;
}

/** How one person's salary is handed over, from whichever of Bank %, Bank ₹,
    Cash % and Cash ₹ the row fills. `null` when none is filled — the record is
    then left as it is, since a blank cell never clears a value.
    @returns {{mode: "Bank"|"Cash", percent: number, amount: number}|{error: string}|null} */
export function splitOf({ salary, bankPct, bank, cashPct, cash }) {
	const blank = (v) => String(plain(v)).trim() === "";
	const filled = { bankPct: !blank(bankPct), bank: !blank(bank), cashPct: !blank(cashPct), cash: !blank(cash) };
	if (!Object.values(filled).some(Boolean)) return null;

	let share = null;   // the bank's part, as a percentage
	let amount = null;  // or as rupees
	if (filled.bankPct) share = rateOf(bankPct);
	else if (filled.cashPct) share = 100 - rateOf(cashPct);
	if (share !== null) {
		if (!(share >= 0 && share <= 100)) return { error: "the bank or cash percentage is not between 0 and 100" };
		if (filled.cash) {
			const c = amountOf(cash);
			if (!near(c, salary * (1 - share / 100))) return { error: `${said(share)}% by bank leaves ₹${said(salary * (1 - share / 100))} in cash, but the sheet says ₹${plain(cash)}` };
		}
	} else {
		const b = filled.bank ? amountOf(bank) : NaN;
		const c = filled.cash ? amountOf(cash) : NaN;
		if (filled.bank && !(b >= 0)) return { error: `the bank amount "${plain(bank)}" is not a number` };
		if (filled.cash && !(c >= 0)) return { error: `the cash amount "${plain(cash)}" is not a number` };
		if (filled.bank && filled.cash && !near(b + c, salary)) return { error: `bank ₹${said(b)} and cash ₹${said(c)} add up to ₹${said(b + c)}, not the salary ₹${said(salary)}` };
		amount = filled.bank ? b : salary - c;
		if (amount < 0 || amount > salary + 1) return { error: `the bank and cash amounts do not fit inside the salary ₹${said(salary)}` };
	}

	if (share === 100 || (amount !== null && near(amount, salary))) return { mode: "Bank", percent: 100, amount: 0 };
	if (share === 0 || amount === 0) return { mode: "Cash", percent: 0, amount: 0 };
	return share !== null
		? { mode: "Bank", percent: Number(share.toFixed(2)), amount: 0 }
		: { mode: "Bank", percent: 0, amount: Math.round(amount * 100) / 100 };
}

/** The two rates and the EPF calculation back out of a structure this upload
    made, or null for one somebody made by hand — whose are not knowable. */
export function ratesOf(structure) {
	const m = /^Salary (Basic 50 )?(?:PF ([\d.]+)|no PF) (?:ESI ([\d.]+)|no ESI) - /.exec(String(structure || ""));
	return m ? { pf: Number(m[2] || 0), esi: Number(m[3] || 0), method: m[1] ? "half" : "full" } : null;
}

/** The EPF calculation a company already uses, off the structures this upload
    made for it, or "" when it has none yet and HR is still to choose. Two
    different ones on one company is a site somebody changed by hand, and the
    page refuses to add to it until that is settled. */
export function companyMethod(structures, company) {
	const seen = new Set();
	for (const s of structures || []) {
		if (company && !String(s.name).endsWith(` - ${company}`)) continue;
		const r = ratesOf(s.name);
		if (r) seen.add(r.method);
	}
	if (seen.size > 1) return "mixed";
	return [...seen][0] || "";
}

/** The split in words, for the preview. */
export function splitSaid(split, salary) {
	if (!split) return "unchanged";
	if (split.mode === "Cash") return "all cash";
	if (split.percent === 100) return "all bank";
	if (split.percent) return `${said(split.percent)}% bank, rest cash`;
	return `₹${num(split.amount).toLocaleString("en-IN")} bank, ₹${num(salary - split.amount).toLocaleString("en-IN")} cash`;
}

/** The structure a pair of rates belongs to, by name — one a company. Kept
    to letters, digits and dots, since a document name travels in a URL.
    Calculation 2 says "Basic 50" in the name; Calculation 1 says nothing extra. */
export function structureName(pf, esi, company, method = "full") {
	const part = (label, r) => (r > 0 ? `${label} ${said(r)}` : `no ${label}`);
	return `Salary ${method === "half" ? "Basic 50 " : ""}${part("PF", pf)} ${part("ESI", esi)} - ${company}`;
}

/* The three components the structures are made of. An existing one is found by
   name; a missing one is made, and cut for days not worked, like a salary. */
const ROLES = {
	basic: { type: "Earning", find: /^basic( salary| pay)?$/i, make: { name: "Basic", abbr: "B" } },
	/* The other half of the salary under Calculation 2, so the slip's Basic is
	   what EPF is worked out on. */
	allowance: { type: "Earning", find: /^(special|other) allowance$/i, make: { name: "Special Allowance", abbr: "SA" } },
	pf: { type: "Deduction", find: /^(provident fund|employee provident fund|pf|epf)$/i, make: { name: "Provident Fund", abbr: "PF" } },
	esi: { type: "Deduction", find: /^(esi|esic|employee state insurance|employees? state insurance)$/i, make: { name: "Employee State Insurance", abbr: "ESI" } },
};

/** Which component plays each part, and which have to be made first. */
export function componentsFor(comps) {
	const live = (comps || []).filter((c) => !Number(c.disabled));
	const abbrs = new Set(live.map((c) => c.salary_component_abbr).filter(Boolean));
	const out = {};
	for (const [role, r] of Object.entries(ROLES)) {
		const found = live.find((c) => c.type === r.type && r.find.test(String(c.name).trim()));
		if (found) {
			out[role] = { name: found.name, abbr: found.salary_component_abbr, type: r.type, exists: true, prorated: found.depends_on_payment_days === undefined ? null : Boolean(Number(found.depends_on_payment_days)) };
			continue;
		}
		let abbr = r.make.abbr;
		for (let i = 2; abbrs.has(abbr); i++) abbr = `${r.make.abbr}${i}`;
		abbrs.add(abbr);
		out[role] = { name: r.make.name, abbr, type: r.type, exists: false, prorated: true };
	}
	return out;
}

/** A Salary Component to make, in hrms's own fields. Cut for days not worked:
    the pay due is the salary less a day's pay for each day of loss of pay. */
export const uploadComponentDoc = (c) => ({
	salary_component: c.name,
	salary_component_abbr: c.abbr,
	type: c.type,
	is_tax_applicable: c.type === "Earning" ? 1 : 0,
	depends_on_payment_days: 1,
});

/** The Salary Structure for one pair of rates under one EPF calculation, in
    hrms's formula language (`base` is the salary on the assignment; a Python
    `a if c else b` is how a formula says "up to"). */
export function uploadStructureDoc(pf, esi, company, roles, method = "full") {
	const share = (methodOf(method) || EPF_METHODS[0]).share;
	const rate = (r) => Number((r / 100).toFixed(6));
	const line = (component, formula) => ({ salary_component: component, amount_based_on_formula: 1, formula });
	const wages = share === 1 ? "base" : `base * ${share}`;
	return {
		name: structureName(pf, esi, company, method),
		company,
		is_active: "Yes",
		payroll_frequency: "Monthly",
		earnings: share === 1
			? [line(roles.basic.name, "base * 1")]
			: [line(roles.basic.name, `base * ${share}`), line(roles.allowance.name, `base * ${Number((1 - share).toFixed(6))}`)],
		deductions: [
			...(pf > 0 ? [line(roles.pf.name, `(${wages} if ${wages} < ${PF_CEILING} else ${PF_CEILING}) * ${rate(pf)}`)] : []),
			...(esi > 0 ? [line(roles.esi.name, `(base * ${rate(esi)} if base <= ${ESI_CEILING} else 0)`)] : []),
		],
	};
}

/** What has to change on the Employee for this split, as a patch of only what
    differs. Without the two custom fields on the site, only an all-bank or
    all-cash person can be recorded — `salary_mode` alone says that much. */
export function employeePatch(emp, split, bankFields) {
	if (!split) return { patch: {}, unsaved: false };
	const want = { salary_mode: split.mode };
	let unsaved = false;
	if (bankFields) {
		want.custom_bank_percent = split.percent;
		want.custom_bank_amount = split.amount;
	} else if (split.mode === "Bank" && split.percent !== 100) {
		return { patch: {}, unsaved: true };
	}
	const patch = {};
	for (const [k, v] of Object.entries(want)) {
		const have = k === "salary_mode" ? String(emp[k] || "") : num(emp[k]);
		if (have !== v) patch[k] = v;
	}
	return { patch, unsaved };
}

/** Read the sheet against the site. Nothing is written here.
    @param table rows of cells, the first sheet of the upload
    @param ctx {company, people, assignments, structures, comps, bankFields}
      people — every Employee, with salary_mode and the two bank fields
      assignments — submitted Salary Structure Assignments */
export function planUpload(table, ctx) {
	const { company, people = [], assignments = [], structures = [], comps = [], bankFields = false } = ctx;
	if (!company) return { ok: false, error: "Pick a company in the top bar. A salary structure belongs to one company." };
	const fixed = companyMethod(structures, company);
	if (fixed === "mixed") return { ok: false, error: `${company} has salary structures made under both EPF calculations. Settle that in Frappe before uploading more.` };
	/* Not asked on the upload — the 5-tab Excel asks when it is downloaded. A
	   company with no structures yet gets Calculation 1. */
	const method = ctx.method || fixed || "full";
	if (!methodOf(method)) return { ok: false, error: `"${method}" is not an EPF calculation.` };
	if (fixed && fixed !== method) return { ok: false, error: `${company} already works EPF out by ${methodOf(fixed).label.split(" — ")[0]}. A company keeps one calculation throughout.` };
	const cols = findUploadColumns(table);
	if (!cols) return { ok: false, error: "The sheet needs a heading for the employee code and one for the actual salary." };
	if (cols.at.pf === undefined || cols.at.esi === undefined) {
		return { ok: false, error: "The sheet needs a PF % column and an ESI % column — 0 or empty for somebody who is not a member." };
	}

	const byCode = new Map();
	for (const p of people) {
		for (const k of new Set([norm(p.name), norm(p.employee_number)].filter(Boolean))) {
			byCode.set(k, [...(byCode.get(k) || []), p]);
		}
	}
	const current = (emp) => assignments
		.filter((a) => a.employee === emp && Number(a.docstatus ?? 1) === 1)
		.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))[0] || null;

	const cell = (row, key) => (cols.at[key] === undefined ? "" : row[cols.at[key]]);
	const cand = [];
	const problems = [];
	let blank = 0;
	for (let r = cols.row + 1; r < table.length; r++) {
		const row = table[r] || [];
		const code = String(plain(cell(row, "id"))).trim();
		const nameCell = String(plain(cell(row, "name"))).trim();
		const rawSalary = plain(cell(row, "salary"));
		const others = ["bankPct", "bank", "cashPct", "cash", "pf", "esi"].some((k) => String(plain(cell(row, k))).trim() !== "");
		if (!code && !nameCell && rawSalary === "" && !others) continue;
		const who = [code, nameCell].filter(Boolean).join(" ") || "(blank)";
		const bad = (text) => problems.push({ row: r + 1, text: `Row ${r + 1}, ${who}: ${text}.` });
		/* The downloaded list has everybody on it; a row left without a salary
		   is somebody HR has not got to, not a mistake. */
		if (String(rawSalary).trim() === "" && !others) { blank += 1; continue; }

		if (!code) { bad("no employee code"); continue; }
		const hits = byCode.get(norm(code)) || [];
		const here = hits.filter((p) => p.company === company);
		if (!hits.length) { bad("nobody on this site has that code"); continue; }
		if (!here.length) { bad(`is on ${hits[0].company || "another company"}'s payroll — pick that company in the top bar`); continue; }
		if (here.length > 1) { bad("that code belongs to more than one person"); continue; }
		const p = here[0];
		if (p.status && p.status !== "Active") { bad(`is ${p.status}, so is not paid`); continue; }

		const salary = amountOf(rawSalary);
		if (!(salary > 0)) { bad(`the actual salary "${String(rawSalary)}" is not a number above zero`); continue; }
		const pf = rateOf(cell(row, "pf"));
		const esi = rateOf(cell(row, "esi"));
		if (!(pf >= 0 && pf <= 100)) { bad(`the PF % "${plain(cell(row, "pf"))}" is not a percentage between 0 and 100`); continue; }
		if (!(esi >= 0 && esi <= 100)) { bad(`the ESI % "${plain(cell(row, "esi"))}" is not a percentage between 0 and 100`); continue; }
		const split = splitOf({ salary, bankPct: cell(row, "bankPct"), bank: cell(row, "bank"), cashPct: cell(row, "cashPct"), cash: cell(row, "cash") });
		if (split && split.error) { bad(split.error); continue; }

		cand.push({ row: r + 1, who, p, salary, pf, esi, split });
	}

	/* One row a person. Two rows for somebody are a sheet that has not been
	   decided, so neither is used. */
	const times = new Map();
	for (const c of cand) times.set(c.p.name, (times.get(c.p.name) || 0) + 1);

	const lines = [];
	for (const c of cand) {
		if (times.get(c.p.name) > 1) {
			problems.push({ row: c.row, text: `Row ${c.row}, ${c.who}: appears ${times.get(c.p.name)} times in the sheet, so none of them is used until it appears once.` });
			continue;
		}
		const structure = structureName(c.pf, c.esi, company, method);
		const now = current(c.p.name);
		const { patch, unsaved } = employeePatch(c.p, c.split, bankFields);
		const notes = [];
		if (now && (!near(num(now.base), c.salary) || (ratesOf(now.salary_structure) && now.salary_structure !== structure))) {
			notes.push(`Already paid ₹${num(now.base).toLocaleString("en-IN")} on ${now.salary_structure}. That is not changed here — use Increments.`);
		}
		if (unsaved) notes.push("The bank and cash split is not saved: the site does not have the Bank share fields yet.");
		if (c.salary < 1000 || c.salary > 500000) notes.push(`Check the salary: ₹${c.salary.toLocaleString("en-IN")}.`);
		if (c.pf > 0 && c.pf !== 12) notes.push(`PF is ${said(c.pf)}%, not the usual 12%.`);
		if (c.esi > 0 && c.esi !== 0.75) notes.push(`ESI is ${said(c.esi)}%, not the usual 0.75%.`);
		if (c.esi > 0 && c.salary > ESI_CEILING) notes.push(`The salary is over ₹${ESI_CEILING.toLocaleString("en-IN")}, so no ESI is taken.`);
		if (c.pf > 0 && c.salary * methodOf(method).share > PF_CEILING) notes.push(`EPF is worked out on ₹${PF_CEILING.toLocaleString("en-IN")}, the ceiling.`);
		lines.push({
			row: c.row, employee: c.p.name, code: c.p.employee_number || c.p.name, name: c.p.employee_name || c.p.name,
			salary: c.salary, pf: c.pf, esi: c.esi, split: c.split, structure,
			assign: !now, current: now ? { structure: now.salary_structure, base: num(now.base) } : null,
			patch, notes,
		});
	}
	problems.sort((a, b) => a.row - b.row);
	lines.sort((a, b) => a.row - b.row);

	const roles = componentsFor(comps);
	const have = new Set((structures || []).map((s) => s.name));
	const newStructures = [];
	for (const l of lines.filter((x) => x.assign)) {
		const found = newStructures.find((s) => s.name === l.structure);
		if (found) found.people += 1;
		else newStructures.push({ name: l.structure, pf: l.pf, esi: l.esi, exists: have.has(l.structure), people: 1 });
	}
	const needs = new Set(newStructures.filter((s) => !s.exists).flatMap((s) => [
		"basic", ...(method === "half" ? ["allowance"] : []), ...(s.pf > 0 ? ["pf"] : []), ...(s.esi > 0 ? ["esi"] : []),
	]));
	const components = [...needs].map((role) => ({ role, ...roles[role] }));

	return { ok: true, columns: cols.heads, lines, problems, blank, structures: newStructures, components, roles, method };
}

/** What a line will do, for the preview's last column. */
export function lineAction(l) {
	const bits = [];
	if (l.assign) bits.push("new salary");
	if (Object.keys(l.patch).length) bits.push("bank and cash");
	return bits.length ? bits.join(" + ") : "no change";
}

/** Everybody the save will touch. */
export const toSave = (plan) => (plan && plan.ok ? plan.lines.filter((l) => l.assign || Object.keys(l.patch).length) : []);

/** Each saved line read back off the site: what does not say what the sheet said.
    @param after {assignments, employees} as read after the save */
export function verifyUpload(lines, after) {
	const wrong = [];
	for (const l of lines) {
		if (l.assign) {
			const got = (after.assignments || []).find((a) => a.employee === l.employee && a.salary_structure === l.structure && Number(a.docstatus ?? 1) === 1);
			if (!got) wrong.push({ employee: l.employee, name: l.name, text: `has no ${l.structure} on the site` });
			else if (!near(num(got.base), l.salary)) wrong.push({ employee: l.employee, name: l.name, text: `has ₹${num(got.base)} on the site, not ₹${l.salary}` });
		}
		const e = (after.employees || []).find((x) => x.name === l.employee) || {};
		for (const [k, v] of Object.entries(l.patch)) {
			const have = k === "salary_mode" ? String(e[k] || "") : num(e[k]);
			if (have !== v) wrong.push({ employee: l.employee, name: l.name, text: `${k === "salary_mode" ? "Salary Mode" : k === "custom_bank_percent" ? "Bank share" : "Bank amount"} is ${have || "empty"} on the site, not ${v}` });
		}
	}
	return wrong;
}

/** The sheet's headings, in the order the downloaded list has them. */
export const UPLOAD_HEADS = ["Emp Code", "Name", "Department", "Actual Salary", "Bank ₹", "Cash ₹", "PF %", "ESI %"];

/** One person's row of the list to fill in: what the site already holds, so a
    sheet sent back unchanged changes nothing. A percentage share is left blank
    rather than turned into rupees, so it stays a percentage. */
export function uploadRow(p, assignments) {
	const now = assignments
		.filter((a) => a.employee === p.name && Number(a.docstatus ?? 1) === 1)
		.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))[0];
	const base = now ? num(now.base) : null;
	let bank = null; let cash = null;
	if (base) {
		const pct = num(p.custom_bank_percent); const amt = num(p.custom_bank_amount);
		if (p.salary_mode === "Cash") { bank = 0; cash = base; } else if (pct === 100) { bank = base; cash = 0; } else if (!pct && amt > 0) { bank = amt; cash = Math.max(0, base - amt); }
	}
	const rates = now ? ratesOf(now.salary_structure) : null;
	return [p.employee_number || p.name, p.employee_name || "", p.department || "", base, bank, cash, rates ? rates.pf : null, rates ? rates.esi : null];
}
