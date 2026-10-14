import { ED_STATUSES, NEW_EMP_ELSEWHERE, NEW_EMP_STEPS, PUNCH_METHODS } from "../data/employees.js";
import { cellDate } from "./increments.js";
import { clashes, dateProblems, punchGaps } from "./newemp.js";

/* ---------------------------------------------------------------------------
   Employees → Import from Excel: new people, and changes to people already on
   file, from one sheet (5 October 2026, asked for alongside Increments).

   **The columns are the Create Employee wizard's own fields**, headed by the
   wizard's own labels, read off NEW_EMP_STEPS — so the sheet and the form can
   never ask for different things, and a field added to the wizard is a column
   here without a second edit.

   **A row is matched on Emp Code.** A code already on file updates that
   person, with only the cells that are filled in and differ from what the
   site holds; **a blank cell never clears anything**, because a sheet with a
   column left empty is not a request to wipe that column for everybody. A code
   not on file creates a person, and then the wizard's required fields are
   required here too.

   **Chosen-from-a-list fields are checked against the list** the way the
   wizard's selects are: Company, Department, Designation, Shift, Holiday List,
   Work Location, Status, Punch Method and Reporting Manager must name
   something that exists, matched without regard to case. Branch, Grade,
   Employment Type, Title and Gender are passed to the site as typed, and the
   site's link check settles them — refusing a real value here is the
   expensive mistake (CLAUDE.md §4).

   Leave is not set from the sheet: Leave Type and Leaves A Month are written
   on another document after the person exists (NEW_EMP_ELSEWHERE). Give
   monthly leave on Apply Leave does it for everybody at once.

   Pure: no React, no network. Relative imports, so it runs in Node tests.
   --------------------------------------------------------------------------- */

/** Every importable field, in wizard order: `{field, label, type, required, opts}`. */
export const IMPORT_FIELDS = NEW_EMP_STEPS
	.flatMap((st) => st[2].flatMap((g) => g[1]))
	.filter((r) => r[0] && !NEW_EMP_ELSEWHERE[r[0]])
	.map(([field, label, type, required, opts]) => ({ field, label, type, required: Boolean(required), opts }));

/** The sheet's headers, in order. */
export const IMPORT_COLUMNS = IMPORT_FIELDS.map((f) => f.label);

const key = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** A few other ways HR's own sheets head the same columns. */
const ALIASES = {
	employee_number: ["employeecode", "empcode", "employeeno", "empno", "code", "staffcode"],
	attendance_device_id: ["devicecode", "machineid", "biometricid", "punchcode", "deviceid"],
	date_of_birth: ["dob", "birthdate"],
	date_of_joining: ["doj", "joiningdate", "dateofjoin"],
	cell_number: ["mobile", "phone", "mobileno", "phoneno", "contactnumber"],
	reports_to: ["reportsto", "manager", "reportingto"],
	custom_pan_no: ["pan", "panno"],
	custom_aadhaar_number: ["aadhaar", "aadhar", "aadharno", "aadhaarno"],
	custom_uan: ["uanno", "uannumber"],
	custom_esic_number: ["esic", "esicno"],
	provident_fund_account: ["pfno", "pfnumber", "pfaccount"],
	custom_father_name: ["fathername"],
};

/** Map a sheet's headers to fields: `{map: {header: field}, unknown: [header]}`.
    By the wizard's label, the fieldname itself, or an alias. */
export function mapHeaders(headers) {
	const lookup = new Map();
	for (const f of IMPORT_FIELDS) {
		lookup.set(key(f.label), f.field);
		lookup.set(key(f.field), f.field);
		for (const a of ALIASES[f.field] || []) lookup.set(a, f.field);
	}
	const map = {};
	const unknown = [];
	const taken = new Set();
	for (const h of headers) {
		const field = lookup.get(key(h));
		if (field && !taken.has(field)) {
			map[h] = field;
			taken.add(field);
		} else if (String(h ?? "").trim()) unknown.push(h);
	}
	return { map, unknown };
}

/** Why the sheet cannot be used at all, or "". */
export const sheetProblem = (map) => (Object.values(map).includes("employee_number") ? ""
	: "The sheet has no Emp Code column, so no row can be matched to a person. Use the downloaded sheet, or head a column Emp Code.");

const text = (v) => (v instanceof Date ? v : String(v ?? "").trim());

/** The strict lists, as `{opts: [[value, ...ways it may be written]]}`. */
export function listsFrom(s) {
	const co = (s.companies || []).map((c) => [c.name, c.abbr].filter(Boolean));
	return {
		company: co,
		/* "Production" or "Production - MRPPL": Department names carry the
		   company's abbreviation on this site, and HR's sheet will not. */
		department: (s.departments || []).filter((d) => !d.disabled).map((d) => [d.name, String(d.name).replace(/ - [A-Z0-9]{2,8}$/, "")]),
		designation: (s.designations || []).map((d) => [d.name]),
		shift: (s.shiftTypes || []).map((x) => [x.name]),
		holiday: (s.holidayLists || []).map((x) => [x.name]),
		worklocation: (s.workLocations || []).map((x) => [x.name, x.location_name].filter(Boolean)),
		status: ED_STATUSES.map((x) => [x]),
		punch: PUNCH_METHODS.map((x) => [x]),
	};
}

/** One strict value resolved: `{value}` or `{error}`. Department picks the
    one belonging to the row's company when two companies share a name. */
function resolve(opts, raw, company) {
	const k = key(raw);
	const hits = (opts || []).filter((ways) => ways.some((w) => key(w) === k));
	if (!hits.length) return { error: true };
	const own = company && hits.find((ways) => String(ways[0]).endsWith(` - ${company.abbr}`));
	return { value: (own || hits[0])[0] };
}

const YES = new Set(["1", "yes", "y", "true", "x", "✓"]);
const NO = new Set(["0", "no", "n", "false", ""]);

/**
 * What each row will do.
 *
 * @param {object[]} rows  the sheet, header-keyed
 * @param {object} map  mapHeaders' `map`
 * @param {object} s  the store: employees, companies, departments, designations, shiftTypes, holidayLists, workLocations
 * @param {{locked: Set<string>, lockedNew: Set<string>}} [access]  what Settings → Security keeps this login from setting
 * @returns {object[]} `{row, code, employee, name, status: "new"|"update"|"same"|"problem", patch, why, notes}`
 */
export function planImport(rows, map, s, access = {}) {
	const lists = listsFrom(s);
	const byCode = new Map((s.employees || []).filter((e) => e.employee_number)
		.map((e) => [String(e.employee_number).trim().toUpperCase(), e]));
	const byField = Object.fromEntries(Object.entries(map).map(([h, f]) => [f, h]));
	const seen = new Set();

	return rows.map((r, i) => {
		const line = { row: i + 2, code: text(r[byField.employee_number]), status: "problem", why: "", notes: [], patch: {} };
		const say = (status, why) => Object.assign(line, { status, why });
		if (!line.code) return say("problem", "No Emp Code.");
		const ck = String(line.code).toUpperCase();
		if (seen.has(ck)) return say("problem", `${line.code} is in the sheet twice; only the first row is used.`);
		seen.add(ck);

		const emp = byCode.get(ck);
		const locked = (emp ? access.locked : access.lockedNew) || new Set();
		Object.assign(line, { employee: emp?.name || "", name: emp?.employee_name || "" });

		/* Every filled cell, as the value ERPNext wants. */
		const vals = {};
		const bad = [];
		const companyName = text(r[byField.company]) || emp?.company || "";
		const company = (s.companies || []).find((c) => key(c.name) === key(companyName) || key(c.abbr) === key(companyName));
		for (const f of IMPORT_FIELDS) {
			const h = byField[f.field];
			if (!h) continue;
			const raw = r[h];
			if (raw == null || String(raw).trim() === "") continue;
			let v;
			if (f.type === "date") {
				v = cellDate(raw);
				if (!v) { bad.push(`${f.label} "${text(raw)}" is not a date`); continue; }
			} else if (f.type === "check") {
				const t = String(raw).trim().toLowerCase();
				if (YES.has(t)) v = 1;
				else if (NO.has(t)) v = 0;
				else { bad.push(`${f.label} should be Yes or No`); continue; }
			} else if (f.type === "number") {
				v = Number(String(raw).replace(/,/g, ""));
				if (!Number.isFinite(v)) { bad.push(`${f.label} "${text(raw)}" is not a number`); continue; }
			} else if (f.field === "reports_to") {
				const m = byCode.get(String(raw).trim().toUpperCase())
					|| (s.employees || []).find((e) => e.name === String(raw).trim());
				if (!m) { bad.push(`Reporting Manager ${text(raw)} is not an Emp Code on file`); continue; }
				v = m.name;
			} else if (lists[f.opts]) {
				const got = resolve(lists[f.opts], raw, company);
				if (got.error) { bad.push(`${f.label} "${text(raw)}" is not one on the site`); continue; }
				v = got.value;
			} else {
				v = String(raw).trim();
			}
			if (locked.has(f.field)) {
				line.notes.push(`${f.label} left out — this login may not set it (Settings → Security)`);
				continue;
			}
			vals[f.field] = v;
		}
		if (bad.length) return say("problem", bad.join("; ") + ".");

		if (emp) {
			/* Only what differs. A code in the sheet is the match, not a change. */
			const patch = {};
			for (const [k, v] of Object.entries(vals)) {
				if (k === "employee_number") continue;
				if (String(emp[k] ?? "") !== String(v)) patch[k] = v;
			}
			line.patch = patch;
			/* The page holds only the list's columns of each person, so a cell for
			   a column it did not read is sent and the site keeps it if unchanged. */
			const merged = { ...emp, ...patch };
			const wrong = [...dateProblems(merged), ...clashes({ attendance_device_id: patch.attendance_device_id }, (s.employees || []).filter((e) => e.name !== emp.name))];
			if (wrong.length) return say("problem", wrong.join(" "));
			if (!Object.keys(patch).length) return say("same", "Nothing in the sheet differs from the record.");
			return say("update", Object.keys(patch).map((k) => IMPORT_FIELDS.find((f) => f.field === k)?.label || k).join(", "));
		}

		const doc = { status: "Active", ...vals };
		line.name = [doc.first_name, doc.middle_name, doc.last_name].filter(Boolean).join(" ");
		const gaps = IMPORT_FIELDS.filter((f) => f.required && f.field !== "custom_punch_method" && !String(doc[f.field] ?? "").trim())
			.map((f) => f.label);
		if (gaps.length) return say("problem", `New person — missing ${gaps.join(", ")}.`);
		const wrong = [...dateProblems(doc), ...clashes(doc, s.employees), ...punchGaps(doc).map((g) => `${g.label} is empty.`)];
		if (wrong.length) return say("problem", wrong.join(" "));
		line.patch = doc;
		return say("new", "");
	});
}

/** Counts for the preview's tiles. */
export function tally(lines) {
	const t = { new: 0, update: 0, same: 0, problem: 0 };
	for (const l of lines) t[l.status] = (t[l.status] || 0) + 1;
	return t;
}

/** The fields the "everybody" download asks the site for. */
export const IMPORT_READ = ["name", ...IMPORT_FIELDS.map((f) => f.field)];

/** One person as a row of the sheet, in IMPORT_COLUMNS order. Reporting
    Manager is written as their Emp Code, which is what the import reads back. */
export function sheetRow(e, employees) {
	return IMPORT_FIELDS.map((f) => {
		const v = e[f.field];
		if (v == null) return "";
		if (f.field === "reports_to") return (employees.find((m) => m.name === v) || {}).employee_number || v;
		if (f.type === "check") return Number(v) ? "Yes" : "No";
		return v;
	});
}

/** The same value, as the site writes it back: a date as `YYYY-MM-DD`, a
    number or a tick as a number, everything else as trimmed text. */
const same = (sent, got) => {
	if (typeof sent === "number") return Number(got) === sent;
	if (/^\d{4}-\d{2}-\d{2}$/.test(String(sent))) return String(got ?? "").slice(0, 10) === sent;
	return String(got ?? "").trim() === String(sent).trim();
};

/**
 * Whether a row that was saved is on the site as the sheet said, read back
 * after Apply (asked for 5 October 2026: "verify whether they have been
 * successfully added"). `doc` is the person as the site now holds them, or
 * null when no record could be found.
 *
 * @returns {{way: "added"|"updated"|"missing"|"differs", employee?: string, differs?: {label, sent, got}[]}}
 */
export function verifyRow(line, doc) {
	if (!doc) return { way: "missing" };
	const differs = [];
	for (const [k, v] of Object.entries(line.patch || {})) {
		if (!same(v, doc[k])) {
			differs.push({ label: IMPORT_FIELDS.find((f) => f.field === k)?.label || k, sent: v, got: doc[k] ?? "" });
		}
	}
	if (differs.length) return { way: "differs", employee: doc.name, differs };
	return { way: line.status === "new" ? "added" : "updated", employee: doc.name };
}
