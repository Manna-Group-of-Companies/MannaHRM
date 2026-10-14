/* ---------------------------------------------------------------------------
   Base pay from a sheet — what HR uploads on Salary Setup instead of typing a
   hundred and seventy-six figures. Pure: lib/basepayfile.js reads the file into
   rows; this says which row is which person, and what is wrong with any row.

   **It stores nothing and works nothing out.** A figure is the figure in the
   sheet, read as a number, or the row is reported and left out. The matches go
   to the screen to be looked at, and only then into the same ticks and base-pay
   boxes a person would have filled by hand; saving is still Salary Setup's own
   button and hrms checks each document.

   A row is skipped rather than guessed at: a code that is nobody's, a code that
   is two people's, an amount that is not a number or is not above zero, a
   person who appears twice with different pay, and a person who already has a
   structure (their pay is not changed from here).
   --------------------------------------------------------------------------- */

const n = (v) => Number(v);
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** A cell's text or number, however ExcelJS handed it over — a formula carries its result, a link its text. */
export function plain(v) {
	if (v === null || v === undefined) return "";
	if (typeof v === "object") {
		if (v instanceof Date) return v.toISOString().slice(0, 10);
		if ("result" in v) return plain(v.result);
		if ("text" in v) return String(v.text);
		if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
		return "";
	}
	return v;
}

/** "₹ 25,000.50" → 25000.5; anything that is not just a number → NaN. */
export function amountOf(v) {
	if (typeof v === "number") return v;
	const t = String(v ?? "").replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
	return t !== "" && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const ID_HEAD = /(emp(loyee)?\.?\s*(code|id|no\.?|number)|^(code|id)$|employee$|^emp\b|\bcode\b)/i;
const NAME_HEAD = /name/i;
const PAY_HEAD = /(monthly|base|basic|gross|salary|wages?|pay|amount)/i;

/** Where the columns are: the first of the top rows with a code-or-name column and a pay column. */
export function findColumns(table) {
	for (let r = 0; r < Math.min(table.length, 15); r++) {
		const cells = (table[r] || []).map((c) => String(plain(c)).trim());
		const find = (re, skip = -1) => cells.findIndex((c, i) => i !== skip && c && re.test(c));
		const name = find(NAME_HEAD);
		const id = find(ID_HEAD, name);
		/* "Monthly" or "Base" over a bare "Pay", and never the name column. */
		let pay = cells.findIndex((c, i) => i !== name && i !== id && /(monthly|base)/i.test(c));
		if (pay < 0) pay = cells.findIndex((c, i) => i !== name && i !== id && c && PAY_HEAD.test(c));
		if (pay >= 0 && (id >= 0 || name >= 0)) return { row: r, id, name, pay, heads: { id: cells[id], name: cells[name], pay: cells[pay] } };
	}
	return null;
}

/**
 * @param {any[][]} table   the sheet's rows
 * @param {object[]} waiting people still without a structure (name, employee_name, employee_number)
 * @param {object[]} [everyone] everybody, to tell "already set up" from "not on this site"
 * @returns {{ok:boolean, error?:string, columns?:object, matched:object[], problems:object[], absent:number}}
 */
export function matchBasePay(table, waiting = [], everyone = []) {
	const cols = findColumns(table || []);
	if (!cols) {
		return { ok: false, matched: [], problems: [], absent: 0, error: "Could not find the columns. The first rows need a heading for the employee (code, ID or name) and one for the monthly pay." };
	}

	const index = (rows) => {
		const byId = new Map(); const byNo = new Map(); const byName = new Map();
		for (const p of rows) {
			byId.set(norm(p.name), p);
			if (p.employee_number) byNo.set(norm(p.employee_number), p);
			const k = norm(p.employee_name);
			byName.set(k, byName.has(k) ? null : p);   // null: two people with one name
		}
		return { byId, byNo, byName };
	};
	const W = index(waiting);
	const A = index(everyone);

	const pick = (ix, code, name) => {
		if (code) {
			const hit = ix.byId.get(norm(code)) || ix.byNo.get(norm(code));
			if (hit) return { p: hit, via: "code" };
		}
		if (name) {
			const k = norm(name);
			if (ix.byName.has(k)) return { p: ix.byName.get(k), via: "name", dup: ix.byName.get(k) === null };
		}
		return null;
	};

	const cand = []; const problems = [];
	for (let r = cols.row + 1; r < table.length; r++) {
		const row = table[r] || [];
		const code = cols.id >= 0 ? String(plain(row[cols.id])).trim() : "";
		const name = cols.name >= 0 ? String(plain(row[cols.name])).trim() : "";
		const raw = plain(row[cols.pay]);
		if (!code && !name && raw === "") continue;
		const at = `Row ${r + 1}`;
		const who = [code, name].filter(Boolean).join(" ") || "(blank)";

		const amount = amountOf(raw);
		if (!(amount > 0)) { problems.push({ row: r + 1, text: `${at}, ${who}: the pay "${String(raw)}" is not a number above zero.` }); continue; }

		const hit = pick(W, code, name);
		if (!hit || hit.dup) {
			const known = pick(A, code, name);
			const text = hit && hit.dup ? `${at}, ${who}: two people have that name — use the employee code.`
				: known && known.p && !known.dup ? `${at}, ${who}: already has a salary structure, so their pay is not changed here.`
				: `${at}, ${who}: nobody on this site matches.`;
			problems.push({ row: r + 1, text });
			continue;
		}
		cand.push({ employee: hit.p.name, name: hit.p.employee_name, base: amount, via: hit.via, row: r + 1, who, at });
	}

	/* One row a person. Two rows for somebody — the same pay or not — are a sheet
	   that has not been decided, so neither is used. */
	const times = new Map();
	for (const c of cand) times.set(c.employee, (times.get(c.employee) || 0) + 1);
	const matched = [];
	for (const c of cand) {
		if (times.get(c.employee) > 1) {
			problems.push({ row: c.row, text: `${c.at}, ${c.who}: appears ${times.get(c.employee)} times in the sheet, so none of them is used until it appears once.` });
		} else {
			matched.push({ employee: c.employee, name: c.name, base: c.base, via: c.via, row: c.row, warn: c.base < 1000 || c.base > 500000 });
		}
	}
	problems.sort((a, b) => a.row - b.row);
	const absent = waiting.filter((p) => !matched.some((m) => m.employee === p.name)).length;
	return { ok: true, columns: cols.heads, matched, problems, absent };
}
