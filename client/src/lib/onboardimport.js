import { parseCsv } from "./csv.js";

/* ---------------------------------------------------------------------------
   The Onboarding Form's responses, uploaded as a file — the way in while the
   manna_hr app is not installed on the site (asked for 24 September 2026).

   Sync Now is the designed road: the site reads the Sheet itself, with a
   Google credential that must never reach a browser (manna_hr/onboard_sync.py).
   It cannot run until the app is installed. This one needs no credential at
   all — HR downloads the responses from Google Sheets and hands the file to
   the page — so nothing secret is in play, and every row still goes to the
   site as the signed-in person, under the site's own permissions and
   validation.

   **The rule is the server's, copied.** `FORM_FIELDS` is
   `ONBOARDING_FORM_FIELDS` in manna_hr/rules.py, and tests/onboardimport.test.js
   reads that file and fails if the two drift. What a row does is
   `sync_onboarding_from_sheet`'s: matched on Personal Email, a row with no
   email skipped rather than guessed at, a candidate that has moved past draft
   left alone, and a blank answer never blanking a field.
   --------------------------------------------------------------------------- */

/** The Form's question titles → `Employee Onboarding` fields. */
export const FORM_FIELDS = {
	"Full Name": "employee_name",
	"Personal Email": "custom_personal_email",
	"Mobile Number": "custom_cell_number",
	"Date of Birth": "custom_date_of_birth",
	"Date of Joining": "date_of_joining",
	"Company": "company",
	"Department": "department",
	"Designation": "designation",
	"Timestamp": "custom_form_timestamp",
	"Current Address": "custom_current_address",
	"Permanent Address": "custom_permanent_address",
	"Aadhaar Number": "custom_aadhaar_number",
	"Other Identity Proof / ID Number": "custom_other_id_proof",
	"Marital Status": "custom_marital_status",
	"Family Members": "custom_family_members",
	"Family Member Details": "custom_family_details",
	"Is the Employee Covered by Other Insurance?": "custom_other_insurance",
	"Insurance Provider": "custom_insurance_provider",
	"Insurance Policy Number": "custom_insurance_policy_no",
	"Highest Qualification": "custom_highest_qualification",
};

/** The fields added for the rest of the Form on 24 September 2026. A site
    that does not have them yet drops them without a word, so the page strips
    them before writing there and shows them from the Sheet instead. */
export const EXTRA_FIELDS = Object.values(FORM_FIELDS).slice(8);

export const MATCH_FIELD = "custom_personal_email";
export const MATCH_HEADER = "Personal Email";

const DATE_FIELDS = new Set(["custom_date_of_birth", "date_of_joining"]);

/** The store holds candidates without the `custom_` prefix (api/load.js). */
const storeKey = (field) => field.replace(/^custom_/, "");

const two = (n) => String(n).padStart(2, "0");

const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;

/** Whether a file's slashed dates are day first or month first, read off the
    file itself — never assumed. The Onboarding Sheet turned out to be a US
    one (9/13/2026) on its first real import, 24 September 2026, after this had
    assumed India's 13/9/2026 and sent the site a thirteenth month. A date with
    a part above 12 settles it; a file where every date is ambiguous is read
    day first, this group's own convention. */
export function dateOrder(rows) {
	for (const r of rows || []) {
		const doc = {};
		for (const [k, v] of Object.entries(r || {})) doc[String(k).trim().toLowerCase()] = v;
		for (const [head, field] of Object.entries(FORM_FIELDS)) {
			if (!DATE_FIELDS.has(field) && field !== "custom_form_timestamp") continue;
			const m = SLASHED.exec(String(doc[head.toLowerCase()] ?? "").trim());
			if (!m) continue;
			if (Number(m[1]) > 12) return "dmy";
			if (Number(m[2]) > 12) return "mdy";
		}
	}
	return "dmy";
}

/** A date answer → `YYYY-MM-DD`, or the answer untouched when it cannot be
    read as one, so the site's own refusal names what was typed.

    A bare number is a Sheets serial date — what the Google read asks for, so
    that the Sheet's locale cannot matter: days since 30 December 1899. */
/** The Form's Timestamp → `YYYY-MM-DD HH:MM:SS`, from a Sheets serial (time
    as its fraction) or a slashed date and time; anything else untouched. */
export function isoDateTime(v, order = "dmy") {
	const t = String(v ?? "").trim();
	if (/^\d{4,6}(\.\d+)?$/.test(t)) {
		const at = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(t) * 86400) * 1000);
		return at.toISOString().slice(0, 19).replace("T", " ");
	}
	const m = /^(\S+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
	if (m) {
		const d = isoDate(m[1], order);
		if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d} ${two(m[2])}:${m[3]}:${m[4] || "00"}`;
	}
	return t;
}

export function isoDate(v, order = "dmy") {
	if (v instanceof Date && !Number.isNaN(v.getTime())) {
		return `${v.getUTCFullYear()}-${two(v.getUTCMonth() + 1)}-${two(v.getUTCDate())}`;
	}
	const t = String(v ?? "").trim();
	if (/^\d{4,6}(\.\d+)?$/.test(t)) {
		return isoDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000));
	}
	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
	if (m) return `${m[1]}-${two(m[2])}-${two(m[3])}`;
	m = SLASHED.exec(t);
	if (m) {
		const [d, mo] = order === "mdy" ? [m[2], m[1]] : [m[1], m[2]];
		return `${m[3]}-${two(mo)}-${two(d)}`;
	}
	return t;
}

/** One response row → the fields it fills. Headers are matched trimmed and
    without regard to case, since Google keeps the question's own spelling and
    a retitled question differing only in case is the same question. Blank
    answers are left out, as on the server. */
export function mapRow(row, order = "dmy") {
	const byHead = {};
	for (const [k, v] of Object.entries(row || {})) byHead[String(k).trim().toLowerCase()] = v;
	const doc = {};
	for (const [head, field] of Object.entries(FORM_FIELDS)) {
		const raw = byHead[head.toLowerCase()];
		let value = raw instanceof Date ? raw : String(raw ?? "").trim();
		if (field === "custom_form_timestamp") value = isoDateTime(value, order);
		else if (DATE_FIELDS.has(field) || value instanceof Date) value = isoDate(value, order);
		if (value !== "") doc[field] = value;
	}
	if (doc[MATCH_FIELD]) doc[MATCH_FIELD] = doc[MATCH_FIELD].toLowerCase();
	return doc;
}

/**
 * What an upload would do, against the candidates already on the site. Pure.
 *
 * Somebody who submitted twice is one candidate, later answers filling in
 * over earlier ones — rows are read in the Sheet's own order, oldest first.
 *
 * @param {object[]} rows   the file's rows, header-keyed
 * @param {object[]} cands  `s.cands`, in the store's spelling
 * @returns {{creates: object[], updates: {name: string, email: string, patch: object}[],
 *            skipped: {email: string, why: string}[]}}
 */
export function planImport(rows, cands) {
	const merged = new Map();
	let noEmail = 0;
	const order = dateOrder(rows);
	for (const r of rows || []) {
		const doc = mapRow(r, order);
		const email = doc[MATCH_FIELD];
		if (!email) { noEmail++; continue; }
		merged.set(email, { ...(merged.get(email) || {}), ...doc });
	}

	const byEmail = new Map();
	for (const c of cands || []) {
		const e = String(c.personal_email || "").trim().toLowerCase();
		if (e) byEmail.set(e, c);
	}

	const creates = [];
	const updates = [];
	const skipped = [];
	if (noEmail) skipped.push({ email: "", why: `${noEmail} row(s) with no Personal Email` });

	for (const [email, doc] of merged) {
		const c = byEmail.get(email);
		if (!c) { creates.push({ boarding_status: "Pending", ...doc }); continue; }
		/* Submitted or cancelled: a later Form edit must not reopen a candidate
		   that has already moved on. */
		if (c.docstatus && c.docstatus !== 0) { skipped.push({ email, why: "already past draft" }); continue; }
		const patch = {};
		for (const [field, value] of Object.entries(doc)) {
			if (field === MATCH_FIELD) continue;
			if (String(c[storeKey(field)] ?? "") !== String(value)) patch[field] = value;
		}
		if (Object.keys(patch).length) updates.push({ name: c.name, email, patch });
	}
	return { creates, updates, skipped };
}

/** A cell as ExcelJS hands it back → a plain value. */
function cellValue(v) {
	if (v == null) return "";
	if (v instanceof Date) return v;
	if (typeof v === "object") {
		if ("result" in v) return cellValue(v.result);
		if ("text" in v) return String(v.text);
		if (Array.isArray(v.richText)) return v.richText.map((p) => p.text).join("");
		return "";
	}
	return v;
}

/** The uploaded file → header-keyed rows. `.csv` or `.xlsx` — what Google
    Sheets' File → Download offers. ExcelJS is loaded only when an .xlsx is
    actually given, as lib/xlsx.js does. */
export async function readResponses(file) {
	const name = String(file?.name || "").toLowerCase();
	if (name.endsWith(".csv")) return parseCsv(await file.text()).rows;
	if (!name.endsWith(".xlsx")) {
		throw new Error("Upload the responses as .xlsx or .csv — in Google Sheets, File → Download.");
	}
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(await file.arrayBuffer());
	const ws = wb.worksheets[0];
	if (!ws) return [];
	const head = [];
	ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { head[col] = String(cellValue(cell.value)).trim(); });
	const rows = [];
	ws.eachRow((row, i) => {
		if (i === 1) return;
		const out = {};
		let any = false;
		row.eachCell({ includeEmpty: true }, (cell, col) => {
			if (!head[col]) return;
			const v = cellValue(cell.value);
			out[head[col]] = v;
			if (String(v).trim() !== "") any = true;
		});
		if (any) rows.push(out);
	});
	return rows;
}

/** Which expected questions the file has no column for. Said on the preview,
    because a Form whose question was retitled maps nothing from that column,
    and "every row skipped for no email" does not say that is why. */
export function missingQuestions(rows) {
	const have = new Set();
	for (const r of rows || []) for (const k of Object.keys(r)) have.add(String(k).trim().toLowerCase());
	return Object.keys(FORM_FIELDS).filter((q) => !have.has(q.toLowerCase()));
}
