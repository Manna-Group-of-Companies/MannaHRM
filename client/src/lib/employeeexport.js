/* ---------------------------------------------------------------------------
   Export Employees Data's file — every person's whole record, one sheet per
   section, as an .xlsx or a .pdf.

   The sections are Employee Profile's own panes (data/profile.js) under the
   names HR asked for on 24 Sep 2026: Identity, PF / ESIC, Salary Master,
   Personal, Family, Qualification — with a Basic sheet in front, because a
   sheet of passport numbers with no department beside it cannot be sorted by
   anyone who did not already know the codes.

   **The Employee list the dashboard holds is not enough for this**, and that is
   why this file reads for itself. `EMP_FIELDS` is the dozen columns the cards
   draw; the passport and the bank account are not in it. A list read with
   `fields: ["*"]` returns every flat field and no child table
   (useEmployeeDoc.js says why), so Qualification — `education`, a child table —
   needs a read of its own. See `readEducation`.

   The Excel side is laid out by hand rather than through `lib/export.js`'s
   `sheetsXlsx`, because the point of this one is that it is read by a person:
   each section has its own colour, carried from the tab to the header to the
   band on All Details, so a column can be told apart by where it came from
   without reading its header. The PDF goes through `sheetsPdf` with the same
   colours, minus All Details — sixty columns do not fit a page at any size
   anybody can read.
   --------------------------------------------------------------------------- */

import { getDoc, listAll } from "@/api/client";
import { sheetNames, sheetsPdf } from "@/lib/export";
import { save } from "@/lib/csv";
import { tidyDept } from "@/lib/format";

/** `YYYY-MM-DD` → `DD-MM-YYYY`, and blank for blank: an em dash in a
    spreadsheet cell is a value somebody's filter has to learn to skip. */
const date = (v) => {
	const s = String(v || "").slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : s;
};

/** The first of several fields that holds anything — PAN lives in either of
    two, depending on which import wrote it. */
const first = (...fields) => (e) => {
	for (const f of fields) if (e[f] != null && e[f] !== "") return e[f];
	return "";
};

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : Number(v));
const yes = (v) => (v == null || v === "" ? "" : Number(v) ? "Yes" : "No");

/* Column kinds, for the writers: `money` gets a thousands format, `date` is
   centred, `long` wraps. Everything else is text — and deliberately so for
   Aadhaar, UAN and account numbers, which Excel would otherwise turn into
   1.23457E+11 and lose the last digits of. */
const col = (label, get, kind = "") => ({ label, get: typeof get === "function" ? get : (e) => e[get] ?? "", kind });

/* Every spelling of a statutory field this group's systems have written. The
   dashboard and install.py say `custom_aadhaar_number`; the bridge's Create
   Employee says `custom_aadhaar_no`; a Factor HR backfill or a hand-made Custom
   Field could say anything else. A column that read only one of them came out
   blank on 24 Sep 2026 for a site that holds the number under another. */
const AADHAAR = first("custom_aadhaar_number", "custom_aadhaar_no", "custom_aadhar_number", "custom_aadhar_no",
	"aadhaar_number", "aadhaar_no", "custom_aadhaar", "custom_aadhar");
const PAN = first("custom_pan_no", "pan_number", "custom_pan_number", "custom_pan");
const UAN = first("custom_uan", "custom_uan_no", "custom_uan_number", "uan_number", "uan_no", "uan");
const ESIC = first("custom_esic_number", "custom_esic_no", "custom_esi_no", "custom_esi_number",
	"esic_number", "esic_no", "esi_number", "esi_no");
const PF = first("provident_fund_account", "custom_pf_no", "custom_pf_number", "custom_pf_account",
	"pf_number", "pf_no");

/** Code and name lead every sheet, so each one can be read on its own. */
const WHO = [
	col("Employee Code", (e) => e.employee_number || e.name),
	col("Employee Name", "employee_name"),
];

/**
 * The sections, in the order they appear in the workbook.
 *
 * `color` is the header, `tint` the zebra stripe under it. Chosen as seven hues
 * far enough apart to tell at a glance, each dark enough to carry white bold
 * text at AA — the one thing a header colour must not get wrong.
 */
export const EMP_SECTIONS = [
	{
		key: "basic", title: "Basic Details", color: "1F3864", tint: "DDE5F4",
		cols: [
			col("Company", "company"),
			col("Department", (e) => (e.department ? tidyDept(e.department) : "")),
			col("Designation", "designation"),
			col("Grade", "grade"),
			col("Branch", "branch"),
			col("Employment Type", "employment_type"),
			col("Status", "status"),
			col("Date Of Joining", (e) => date(e.date_of_joining), "date"),
			col("Confirmation Date", (e) => date(first("custom_confirmation_date", "final_confirmation_date")(e)), "date"),
			col("Date Of Leaving", (e) => date(e.relieving_date), "date"),
			col("Reporting Manager", "reports_to"),
			col("Machine Code", "attendance_device_id"),
			col("Old Code", "custom_factor_hr_id"),
			col("Default Shift", "default_shift"),
			col("Mobile Number", "cell_number"),
			col("Company Email", "company_email"),
		],
	},
	{
		key: "identity", title: "Identity Detail", color: "0B6E6E", tint: "D4EFEE",
		cols: [
			col("Aadhaar Number", AADHAAR),
			col("PAN Number", PAN),
			col("Passport Number", "passport_number"),
			col("Passport Valid Upto", (e) => date(e.valid_upto), "date"),
			col("Passport Issued On", (e) => date(e.date_of_issue), "date"),
			col("Passport Place Of Issue", "place_of_issue"),
			col("Driving Licence", "custom_driving_licence"),
			col("Other ID Proof", "custom_other_id_proof"),
			col("Nationality", "custom_nationality"),
		],
		extra: /aadh|adhar|pan_|_pan$|passport|licen[cs]e|voter|id_proof/i,
	},
	{
		key: "pf", title: "PF / ESIC Detail", color: "5B2C83", tint: "E9DEF3",
		cols: [
			col("UAN", UAN),
			col("PF Number", PF),
			col("ESIC Number", ESIC),
			col("PAN Number", PAN),
			col("Insurance Card Number", "custom_insurance_card_no"),
			col("Insurance Expiry Date", (e) => date(e.custom_insurance_expiry_date), "date"),
			col("Other Insurance", "custom_other_insurance"),
			col("Insurance Provider", "custom_insurance_provider"),
			col("Insurance Policy Number", "custom_insurance_policy_no"),
		],
		extra: /uan|esic?_|_esic?$|esi_|provident|pf_|_pf$|insurance/i,
	},
	{
		key: "salary", title: "Salary Master Detail", color: "2E6B30", tint: "DDEFDD",
		cols: [
			col("CTC", (e) => num(e.ctc), "money"),
			col("Salary Structure", (e) => e.__ssa?.salary_structure || ""),
			col("Structure From", (e) => date(e.__ssa?.from_date), "date"),
			col("Base", (e) => num(e.__ssa?.base), "money"),
			/* A draft decides nobody's pay, and a file that printed its amount
			   beside a submitted one's with nothing to tell them apart would be
			   read as both being in force. */
			col("Structure State", (e) => (!e.__ssa ? "" : e.__ssa.docstatus === 1 ? "Submitted" : "Draft")),
			col("Salary Mode", "salary_mode"),
			col("Bank Name", "bank_name"),
			col("Bank Account", "bank_ac_no"),
			col("IFSC", first("custom_ifsc_code", "ifsc_code", "custom_ifsc")),
			col("IBAN", "iban"),
			col("Currency", "salary_currency"),
			col("Payroll Cost Center", "payroll_cost_center"),
		],
	},
	{
		key: "personal", title: "Personal Detail", color: "B4520F", tint: "FBE4D3",
		cols: [
			col("Salutation", "salutation"),
			col("Gender", "gender"),
			col("Date Of Birth", (e) => date(e.date_of_birth), "date"),
			col("Blood Group", "blood_group"),
			col("Marital Status", "marital_status"),
			col("Religion", "custom_religion"),
			col("Nationality", "custom_nationality"),
			col("Mobile Number", "cell_number"),
			col("Personal Email", "personal_email"),
			col("Current Address", "current_address", "long"),
			col("Current Accommodation", "current_accommodation_type"),
			col("Permanent Address", "permanent_address", "long"),
			col("Permanent Accommodation", "permanent_accommodation_type"),
			col("Health Details", "health_details", "long"),
			col("Remote Punch Allowed", (e) => yes(e.custom_allow_remote_punch)),
		],
	},
	{
		key: "family", title: "Family Detail", color: "A01D4B", tint: "F8DCE6",
		cols: [
			col("Father's Name", "custom_father_name"),
			col("Mother's Name", "custom_mother_name"),
			col("Spouse's Name", "custom_spouse_name"),
			col("Family Background", "family_background", "long"),
			col("Emergency Contact", "person_to_be_contacted"),
			col("Relation", "relation"),
			col("Emergency Phone", "emergency_phone_number"),
			col("Family Members", "custom_family_members"),
			col("Family Member Details", "custom_family_details", "long"),
		],
	},
	{
		/* One row per qualification, not per person: somebody with a degree and
		   a diploma is two rows, and a person with neither is one row of code and
		   name — left in, so the sheet also answers "who has nothing on file". */
		key: "qualification", title: "Qualification Detail", color: "7A5A00", tint: "FFF0C2",
		perRow: "education",
		cols: [
			col("Qualification", "qualification"),
			col("Level", "level"),
			col("Institute / University", "school_univ"),
			col("Year Of Passing", "year_of_passing"),
			col("Class / Percentage", "class_per"),
			col("Major / Optional Subjects", "maj_opt_subj", "long"),
		],
		/* From the onboarding form, when the education table is empty: one
		   line of free text, which is still better than a blank row. */
		fallback: (d) => (d.custom_highest_qualification ? { qualification: d.custom_highest_qualification, level: "Highest (onboarding form)" } : null),
	},
];

export const EMP_SECTION_KEYS = EMP_SECTIONS.map((s) => s.key);

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

const EDU = ["school_univ", "qualification", "level", "year_of_passing", "class_per", "maj_opt_subj"];

/** Every flat field on the chosen people, in one list read per company. */
async function readFlat(people) {
	const want = new Set(people.map((e) => e.name));
	const companies = [...new Set(people.map((e) => e.company).filter(Boolean))];
	/* One company is one filtered read; several is the whole list, which is
	   still one paged read rather than one per company. */
	const filters = companies.length === 1 ? [["company", "=", companies[0]]] : undefined;
	const rows = await listAll("Employee", ["*"], filters, 500);
	const byName = new Map(rows.filter((r) => want.has(r.name)).map((r) => [r.name, r]));
	/* Somebody the dashboard holds and the `*` read did not return is drawn
	   from what the dashboard has, not dropped: a person missing from an export
	   is a gap nobody looks for. */
	return people.map((e) => ({ ...e, ...(byName.get(e.name) || {}) }));
}

/**
 * Everybody's `education` rows, keyed by employee.
 *
 * One joined list read first — Frappe accepts a child table's column as
 * `` `tabEmployee Education`.field `` and returns a row per child. If the site
 * refuses that, one document read per person, six at a time. That fallback is
 * a request per head, so it is only taken when the cheap way failed, and it
 * reports its progress because at a few hundred people it is not instant.
 */
async function readEducation(people, say) {
	const want = new Set(people.map((e) => e.name));
	const out = new Map();
	try {
		const fields = ["name", ...EDU.map((f) => `\`tabEmployee Education\`.${f} as edu_${f}`)];
		const rows = await listAll("Employee", fields, undefined, 500);
		for (const r of rows) {
			if (!want.has(r.name) || EDU.every((f) => r["edu_" + f] == null || r["edu_" + f] === "")) continue;
			const row = Object.fromEntries(EDU.map((f) => [f, r["edu_" + f] ?? ""]));
			(out.get(r.name) || out.set(r.name, []).get(r.name)).push(row);
		}
		return out;
	} catch {
		/* fall through to one read per person */
	}
	const names = [...want];
	let done = 0;
	for (let i = 0; i < names.length; i += 6) {
		await Promise.all(names.slice(i, i + 6).map(async (n) => {
			const doc = await getDoc("Employee", n);
			if (doc && Array.isArray(doc.education) && doc.education.length) out.set(n, doc.education);
		}));
		done = Math.min(names.length, i + 6);
		say(`Reading qualifications… ${done} of ${names.length}`);
	}
	return out;
}

/** The latest Salary Structure Assignment per person, submitted before draft
    when two share a date. Cancelled ones are not asked for. */
async function readAssignments(people) {
	const want = new Set(people.map((e) => e.name));
	const rows = await listAll("Salary Structure Assignment",
		["employee", "salary_structure", "from_date", "base", "docstatus"], [["docstatus", "<", 2]], 500);
	const out = new Map();
	for (const r of rows) {
		if (!want.has(r.employee)) continue;
		const cur = out.get(r.employee);
		const later = !cur || r.from_date > cur.from_date
			|| (r.from_date === cur.from_date && r.docstatus > cur.docstatus);
		if (later) out.set(r.employee, r);
	}
	return out;
}

/* Employee Onboarding's field → the Employee field it fills. The Google Form
   writes onto the Onboarding record (lib/onboardimport.js), and Aadhaar and
   both addresses reach the Employee only if somebody copies them across —
   which on 24 Sep 2026 nobody had. So the file reads them from where they are. */
const FROM_ONBOARDING = {
	custom_aadhaar_number: "custom_aadhaar_number",
	custom_current_address: "current_address",
	custom_permanent_address: "permanent_address",
	custom_marital_status: "marital_status",
	custom_date_of_birth: "date_of_birth",
	custom_personal_email: "personal_email",
	custom_cell_number: "cell_number",
	custom_other_id_proof: "custom_other_id_proof",
	custom_family_members: "custom_family_members",
	custom_family_details: "custom_family_details",
	custom_other_insurance: "custom_other_insurance",
	custom_insurance_provider: "custom_insurance_provider",
	custom_insurance_policy_no: "custom_insurance_policy_no",
	custom_highest_qualification: "custom_highest_qualification",
};

const blank = (v) => v == null || String(v).trim() === "";
const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Fill each person's blanks from their Employee Onboarding record — never
 * over a value the Employee already holds, because the Employee is the record
 * HR maintains and the form is what the person typed on day one.
 *
 * Matched on the Onboarding's `employee` link first, then on personal email,
 * then on name within the same company: the form's rows are created before the
 * Employee exists, and most of them never get the link filled in.
 */
async function mergeOnboarding(docs) {
	const rows = await listAll("Employee Onboarding", ["*"], undefined, 500);
	const byEmp = new Map();
	const byMail = new Map();
	const byName = new Map();
	for (const r of rows) {
		if (r.employee) byEmp.set(r.employee, r);
		if (r.custom_personal_email) byMail.set(key(r.custom_personal_email), r);
		if (r.employee_name) byName.set(key(r.employee_name) + "|" + key(r.company), r);
	}
	let filled = 0;
	for (const d of docs) {
		const o = byEmp.get(d.name)
			|| (d.personal_email && byMail.get(key(d.personal_email)))
			|| byName.get(key(d.employee_name) + "|" + key(d.company));
		if (!o) continue;
		let any = false;
		for (const [from, to] of Object.entries(FROM_ONBOARDING)) {
			const target = to === "custom_aadhaar_number" && !blank(AADHAAR(d)) ? null : to;
			if (target && blank(d[target]) && !blank(o[from])) {
				d[target] = o[from];
				any = true;
			}
		}
		if (any) filled++;
	}
	return filled;
}

/**
 * Everything the chosen sections need, for the chosen people.
 *
 * Returns `{ docs, notes }`: `notes` is what could not be read, one sentence
 * each, written into the file under the sheet it affects — a Salary sheet with
 * no structure column filled is otherwise indistinguishable from a site where
 * nobody has one.
 */
export async function readForExport(people, keys, say = () => {}) {
	const notes = {};
	say("Reading employee records…");
	let docs;
	try {
		docs = await readFlat(people);
	} catch (e) {
		docs = people.map((p) => ({ ...p }));
		notes.all = "The site refused the full Employee read, so only the columns the dashboard already holds are filled. "
			+ String(e.message || e).slice(0, 140);
	}

	say("Reading onboarding forms…");
	try {
		const n = await mergeOnboarding(docs);
		if (n) notes.onboarding = `${n} employee(s) had blanks filled from their Employee Onboarding form.`;
	} catch {
		/* No Onboarding doctype, or no permission on it: the Employee's own
		   fields are still the answer, just a thinner one. */
	}

	if (keys.includes("salary")) {
		say("Reading salary structures…");
		try {
			const ssa = await readAssignments(people);
			for (const d of docs) d.__ssa = ssa.get(d.name) || null;
		} catch (e) {
			notes.salary = "Salary Structure Assignment could not be read, so the structure columns are blank. "
				+ String(e.message || e).slice(0, 140);
		}
	}

	if (keys.includes("qualification")) {
		say("Reading qualifications…");
		const edu = await readEducation(people, say);
		for (const d of docs) d.__edu = edu.get(d.name) || [];
	}
	return { docs, notes };
}

/* ---------------------------------------------------------------------------
   Sheets — the one shape both writers draw
   --------------------------------------------------------------------------- */

/** Every fieldname a section's own columns read, including each spelling
    `first()` tries — so auto-detection does not add a second copy of one. */
const MAPPED = new Set([
	"custom_aadhaar_number", "custom_aadhaar_no", "custom_aadhar_number", "custom_aadhar_no", "aadhaar_number",
	"aadhaar_no", "custom_aadhaar", "custom_aadhar", "custom_pan_no", "pan_number", "custom_pan_number", "custom_pan",
	"custom_uan", "custom_uan_no", "custom_uan_number", "uan_number", "uan_no", "uan", "custom_esic_number",
	"custom_esic_no", "custom_esi_no", "custom_esi_number", "esic_number", "esic_no", "esi_number", "esi_no",
	"provident_fund_account", "custom_pf_no", "custom_pf_number", "custom_pf_account", "pf_number", "pf_no",
	"passport_number", "valid_upto", "date_of_issue", "place_of_issue", "custom_driving_licence",
	"custom_other_id_proof", "custom_insurance_card_no", "custom_insurance_expiry_date", "custom_other_insurance",
	"custom_insurance_provider", "custom_insurance_policy_no",
]);

/**
 * Fields on the record a section's pattern matches and no column reads —
 * added as columns of their own, labelled from the fieldname.
 *
 * Only fields somebody has a value in: a site's every empty custom field
 * would otherwise become a column. This is what makes "the site has a PF
 * number and the file does not" impossible rather than merely fixed once.
 */
function extraCols(sec, docs) {
	if (!sec.extra) return [];
	const found = new Set();
	for (const d of docs) {
		for (const [k, v] of Object.entries(d)) {
			if (k.startsWith("__") || MAPPED.has(k) || !sec.extra.test(k) || blank(v) || typeof v === "object") continue;
			found.add(k);
		}
	}
	return [...found].sort().map((k) => col(label(k), k));
}

const label = (k) => k.replace(/^custom_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
	.replace(/\b(Pf|Uan|Esic?|Pan|Id|No)\b/g, (w) => (w === "No" ? "No." : w.toUpperCase()));

/** A section's rows. A per-row section spreads each person across their
    child rows, with code and name repeated so every row sorts on its own. */
function sectionRows(sec, cols, docs) {
	if (!sec.perRow) return docs.map((d) => [...WHO, ...cols].map((c) => c.get(d)));
	return docs.flatMap((d) => {
		const fb = sec.fallback && sec.fallback(d);
		const kids = d.__edu && d.__edu.length ? d.__edu : [fb];
		return kids.map((k) => [...WHO.map((c) => c.get(d)), ...cols.map((c) => (k ? c.get(k) : ""))]);
	});
}

/** Every chosen section as `{ key, title, sub, head, kinds, rows, color, tint, note }`. */
export function exportSheets(docs, keys, { sub = "", notes = {} } = {}) {
	return EMP_SECTIONS.filter((s) => keys.includes(s.key)).map((s) => {
		const cols = [...s.cols, ...extraCols(s, docs)];
		return {
			key: s.key,
			title: s.title,
			sub,
			head: [...WHO, ...cols].map((c) => c.label),
			kinds: [...WHO, ...cols].map((c) => c.kind),
			rows: sectionRows(s, cols, docs),
			color: s.color,
			tint: s.tint,
			note: [notes.all, notes.onboarding, notes[s.key]].filter(Boolean).join(" "),
		};
	});
}

/* ---------------------------------------------------------------------------
   Writers
   --------------------------------------------------------------------------- */

const argb = (hex) => "FF" + hex;
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const side = (hex = "C9CED6") => ({ style: "thin", color: { argb: argb(hex) } });
const box = (hex) => ({ top: side(hex), left: side(hex), bottom: side(hex), right: side(hex) });

function widthOf(head, rows, i, kind) {
	let w = String(head).length;
	for (const r of rows) w = Math.max(w, String(r[i] ?? "").length);
	return Math.min(Math.max(w + 3, 10), kind === "long" ? 50 : 34);
}

/** The body of a sheet: zebra rows in the section's tint, a thin border, and
    each kind of column formatted as itself. `tintOf(i)` lets All Details
    stripe each column in the tint of the section it came from. */
function body(ws, rows, kinds, tintOf) {
	rows.forEach((cells, ri) => {
		const r = ws.addRow(cells);
		r.eachCell({ includeEmpty: true }, (c, ci) => {
			const kind = kinds[ci - 1];
			c.border = box();
			c.font = { size: 10, color: { argb: "FF1F2937" }, ...(ci <= 2 ? { bold: ci === 1 } : {}) };
			c.alignment = {
				vertical: "top",
				horizontal: kind === "date" ? "center" : kind === "money" ? "right" : "left",
				wrapText: kind === "long",
			};
			if (kind === "money" && typeof c.value === "number") c.numFmt = "#,##0.00";
			if (ri % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(tintOf(ci - 1)) } };
		});
	});
}

/** The banner every sheet opens with: the group, the title, what was asked. */
function banner(ws, width, color, title, sub) {
	const line = (text, font, fill, height) => {
		const r = ws.addRow([text]);
		ws.mergeCells(r.number, 1, r.number, Math.max(width, 1));
		const c = r.getCell(1);
		c.font = font;
		c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
		if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
		r.height = height;
	};
	line("MANNA GROUP", { bold: true, size: 16, color: { argb: "FFFFFFFF" } }, color, 28);
	line(title, { bold: true, size: 13, color: { argb: argb(color) } }, null, 22);
	line(sub || " ", { size: 10, italic: true, color: { argb: "FF5B6472" } }, null, 16);
	line(`Generated ${stamp()} from Manna HR`, { size: 8, color: { argb: "FF8A93A0" } }, null, 14);
}

function header(row, fill, fontHex = "FFFFFF") {
	row.height = 30;
	row.eachCell((c) => {
		c.font = { bold: true, size: 10, color: { argb: argb(fontHex) } };
		c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
		c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
		c.border = box("FFFFFF");
	});
}

function footNote(ws, width, note) {
	if (!note) return;
	ws.addRow([]);
	const r = ws.addRow([note]);
	ws.mergeCells(r.number, 1, r.number, Math.max(width, 1));
	r.getCell(1).font = { italic: true, size: 9, color: { argb: "FF9A3412" } };
	r.getCell(1).alignment = { wrapText: true, vertical: "top" };
	r.height = Math.min(90, 14 * Math.ceil(note.length / 120));
}

/**
 * The workbook: All Details first — every chosen section side by side, one
 * row per person, a coloured band over each section's columns — then one
 * sheet per section in its own colour.
 */
export async function employeesXlsx(sheets, name) {
	const ExcelJS = (await import("exceljs")).default;
	const wb = new ExcelJS.Workbook();
	wb.creator = "Manna HR";
	wb.created = new Date();
	const sub = sheets[0]?.sub || "";

	/* All Details leaves out per-row sections: a person with three degrees
	   would be three rows here and repeat their passport on each. */
	const flat = sheets.filter((s) => s.key !== "qualification");
	if (flat.length > 1) {
		const cols = [{ label: "Employee Code", kind: "", sec: flat[0] }, { label: "Employee Name", kind: "", sec: flat[0] }];
		for (const s of flat) s.head.slice(2).forEach((label, i) => cols.push({ label, kind: s.kinds[i + 2], sec: s, i: i + 2 }));
		const rows = flat[0].rows.map((_, ri) => [
			flat[0].rows[ri][0], flat[0].rows[ri][1],
			...flat.flatMap((s) => s.rows[ri].slice(2)),
		]);

		const ws = wb.addWorksheet("All Details", {
			properties: { tabColor: { argb: "FF111827" } },
			pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
		});
		banner(ws, Math.min(cols.length, 16), "111827", "Employees — All Details", sub);
		ws.addRow([]);

		/* The band: each section's name across its own columns. */
		const band = ws.addRow(cols.map(() => ""));
		band.height = 22;
		let c0 = 3;
		band.getCell(1).value = "Employee";
		ws.mergeCells(band.number, 1, band.number, 2);
		for (const s of flat) {
			const n = s.head.length - 2;
			band.getCell(c0).value = s.title;
			if (n > 1) ws.mergeCells(band.number, c0, band.number, c0 + n - 1);
			c0 += n;
		}
		band.eachCell({ includeEmpty: true }, (c, ci) => {
			const s = cols[ci - 1].sec;
			const color = ci <= 2 ? "111827" : s.color;
			c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
			c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
			c.alignment = { vertical: "middle", horizontal: "center" };
			c.border = box("FFFFFF");
		});

		const head = ws.addRow(cols.map((c) => c.label));
		head.height = 30;
		head.eachCell((c, ci) => {
			const s = cols[ci - 1].sec;
			c.font = { bold: true, size: 10, color: { argb: argb(ci <= 2 ? "111827" : s.color) } };
			c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(ci <= 2 ? "E5E7EB" : s.tint) } };
			c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
			c.border = box("FFFFFF");
		});
		ws.views = [{ state: "frozen", xSplit: 2, ySplit: head.number }];
		if (rows.length) ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: cols.length } };
		body(ws, rows, cols.map((c) => c.kind), (i) => (i < 2 ? "F1F3F6" : cols[i].sec.tint));
		cols.forEach((c, i) => { ws.getColumn(i + 1).width = widthOf(c.label, rows, i, c.kind); });
		footNote(ws, Math.min(cols.length, 16), [...new Set(flat.map((s) => s.note).filter(Boolean))].join(" "));
	}

	/* Excel refuses a `/` in a tab name; `sheetNames` would blank it to three
	   spaces. The banner inside the sheet keeps the title as written. */
	const names = sheetNames(sheets.map((s) => s.title.replace(/\s*\/\s*/g, " - ")));
	sheets.forEach((s, si) => {
		const width = s.head.length;
		const ws = wb.addWorksheet(names[si], {
			properties: { tabColor: { argb: argb(s.color) } },
			pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
		});
		banner(ws, width, s.color, s.title, sub);
		ws.addRow([]);
		const head = ws.addRow(s.head);
		header(head, s.color);
		ws.views = [{ state: "frozen", xSplit: 2, ySplit: head.number }];
		if (s.rows.length) ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: width } };
		body(ws, s.rows, s.kinds, () => s.tint);
		if (!s.rows.length) ws.addRow(["No rows."]).getCell(1).font = { italic: true, size: 10 };
		s.head.forEach((h, i) => { ws.getColumn(i + 1).width = widthOf(h, s.rows, i, s.kinds[i]); });
		footNote(ws, width, s.note);
	});

	const buf = await wb.xlsx.writeBuffer();
	save(name, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/** The PDF: one section per page run, each in its own colour. */
export function employeesPdf(sheets, name) {
	return sheetsPdf(sheets.map((s) => ({ ...s, color: rgb(s.color), tint: rgb(s.tint) })), name);
}
