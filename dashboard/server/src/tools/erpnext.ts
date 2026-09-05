import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Schema } from "mongoose";
import { allDoctypes, type Doctype } from "../doctypes/registry.js";

/* ---------------------------------------------------------------------------
   Every doctype this site carries, written out as Frappe would define it.

   **This does not create anything on ERPNext, and it cannot.** This process
   talks to MongoDB; the Frappe site is somewhere else entirely and the only
   thing this repo ever sends it is a person following a link. Creating a
   doctype there is a schema change on a production site — it needs Developer
   mode or a custom app, and it is done by whoever owns that site.

   So this writes the *definitions*: one `.json` per doctype, in the shape
   Frappe's own exporter writes and its importer reads, plus a Custom Field
   fixture for the fields this dashboard adds to ERPNext's `Employee`. What to
   do with them is in the README the run writes beside them.

   ## Which of these to install, and which not to

   Most of the twenty-three are **ERPNext's or HRMS's own** — `Employee`,
   `Attendance`, `Leave Application`, `Asset` and the rest ship with the apps
   and installing a second definition over one of them is how a site ends up
   with a doctype that no longer matches the code that reads it. Those are
   written anyway, into `standard/`, because the comparison is the point: this
   file is also the answer to "what does this dashboard think an Employee is",
   and holding it against the real doctype is how a field that drifted gets
   found.

   The ones with nothing behind them on a stock site go in `custom/`, and those
   are the ones to install. There are five. See `SHIPPED` below for the list and
   for how it was decided.

   ## What is inferred and what is not

   A Mongoose schema does not carry a label, a permission, a section break or a
   `depends_on`. What it carries is a name, a type, an enum, a default and
   whether it is indexed, and that is all this reads — so the JSON it writes is
   a faithful *field list* and a plausible *form*, not a designed one. The
   `fieldtype` mapping is spelled out in `frappeType` below and is the one part
   worth arguing with before anybody installs the output.
   --------------------------------------------------------------------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "..", "..", "erpnext");

/** Frappe's own five, plus `name`. They are on every doctype by construction
    and must never appear in a definition's `fields` — a doctype that declares
    its own `creation` is one Frappe refuses to install. */
const BASE = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "_id", "__v"]);

/** Which doctypes a stock ERPNext + HRMS already ships.

    Decided by where the name comes from rather than by whether this schema
    matches theirs: `Employee` here has fields ERPNext's has not, and it is
    still ERPNext's doctype — the extras are Custom Fields, which is what the
    fixture at the end of this file is for.

    The five absent from this set are the ones this dashboard defines outright.
    Two of them are Factor HR concepts with no ERPNext equivalent under any name
    (`Letter Type`, `Employee Letter`); two are the correction queue under both
    of the names it has been seen under, which is a real open question rather
    than a duplicate — see `pendingRegularizations` in the client's api/load.js;
    and `Employee Onboarding` is the odd one, because HRMS *does* ship a doctype
    of that name and this one is not it. That is called out in its README line
    rather than hidden by putting it in `standard/`. */
const SHIPPED = new Set([
	"Employee", "Company", "Department", "Designation", "Holiday List", "Leave Type",
	"Shift Type", "Asset Category", "Employee Checkin", "Attendance", "Shift Assignment",
	"Leave Application", "Salary Component", "Salary Structure", "Salary Structure Assignment",
	"Asset", "Asset Movement", "File",
]);

/** Why a doctype is in `custom/`, one line each, for the README. */
const WHY: Record<string, string> = {
	"Letter Type": "Factor HR's letter formats. ERPNext has no letter master at all — its Letter Head is "
		+ "stationery, not a document type.",
	"Employee Letter": "One issued letter, with the merged text kept as it went out. Nothing in ERPNext "
		+ "records that a letter was given to somebody.",
	"Attendance Regularization": "The correction queue, under this repo's own name for it.",
	"Employee Attendance Regularization": "The same queue under Factor HR's name. **Install one of the "
		+ "two, not both** — which one is still open, and the client tries this name second.",
	"Employee Onboarding": "HRMS ships a doctype with this name and it is not this one: theirs is a "
		+ "checklist wrapper round a Job Applicant, and this carries the candidate's own details — code, "
		+ "date of birth, mobile, personal email. Installing this over theirs would break their onboarding. "
		+ "Rename it (`Onboarding Candidate`) or add these as Custom Fields to theirs.",
};

/** The fields this dashboard adds to ERPNext's `Employee`.

    Custom Fields rather than a doctype: `Employee` is ERPNext's and stays
    ERPNext's. Seven were backfilled on 25 Aug 2026 and carry Factor HR's values
    beside ERPNext's own empty ones; `custom_allow_remote_punch` is this build's
    geofenced-punch switch. `image` is *not* here — it is ERPNext's own field
    and this schema was simply missing it until 4 Sep 2026. */
const EMPLOYEE_CUSTOM: [string, string, string, string][] = [
	["custom_pan_no", "PAN No", "Data", "employee_number"],
	["custom_nationality", "Nationality", "Data", "date_of_birth"],
	["custom_confirmation_date", "Confirmation Date", "Date", "final_confirmation_date"],
	["custom_father_name", "Father's Name", "Data", "custom_nationality"],
	["custom_mother_name", "Mother's Name", "Data", "custom_father_name"],
	["custom_spouse_name", "Spouse's Name", "Data", "custom_mother_name"],
	["custom_religion", "Religion", "Data", "custom_spouse_name"],
	["custom_allow_remote_punch", "Punch From Anywhere", "Check", "attendance_device_id"],
];

interface Field {
	fieldname: string;
	label: string;
	fieldtype: string;
	options?: string;
	reqd?: number;
	default?: string;
	in_list_view?: number;
	search_index?: number;
}

/** `date_of_joining` → `Date Of Joining`. Frappe's own labels capitalise every
    word, including the short ones, which is why this does not skip `of`. */
const label = (f: string) =>
	f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** A Mongoose path as a Frappe fieldtype.

    **The one inference in this file worth arguing with.** Mongoose has four
    types where Frappe has forty, so every rule below is a reading:

      an enum of [0, 1]        Check     — the shape every boolean in this
                                          schema is stored as
      any other enum           Select    — options newline-separated, which is
                                          how Frappe stores a Select's list
      a String matching the
        YYYY-MM-DD guard       Date      — `DATE` in the schemas is exactly this
      a String named `*_time`  Time      — `HH:MM:SS`, and a shift that started
                                          at an instant would move by timezone
      a String named `*_date`
        or `time`              Datetime  — a punch is an instant, unlike a
                                          calendar date
      Date                     Datetime
      Number                   Float when the name reads like money, else Int
      an array                 Table     — with the child doctype named after
                                          the parent and the field
      anything else            Data

    A `Link` is never inferred, and that is deliberate: this schema stores every
    link as a plain string, so *which* doctype a field points at is knowledge
    that lives in `registry.ts`'s delete guards and in the client, not in the
    types. Guessing would produce a definition that installs and then refuses
    every save. The README says which fields want turning into Links by hand. */
function frappeType(name: string, p: any): { fieldtype: string; options?: string } {
	const kind = p.instance as string;
	const opts = p.options || {};

	if (kind === "Array") return { fieldtype: "Table" };
	if (kind === "Date") return { fieldtype: "Datetime" };

	if (Array.isArray(opts.enum)) {
		const vals = opts.enum as unknown[];
		const zeroOne = vals.length === 2 && vals.includes(0) && vals.includes(1);
		if (kind === "Number" && zeroOne) return { fieldtype: "Check" };
		return { fieldtype: "Select", options: vals.map(String).join("\n") };
	}

	if (kind === "Number") {
		const money = /(amount|salary|ctc|rate|cost|value|gross|net|total|base|variable)/.test(name);
		return { fieldtype: money ? "Float" : "Int" };
	}

	if (kind === "String") {
		/* `match` on a string path is the YYYY-MM-DD guard the schemas call
		   `DATE`, and it is the only regex any of them carries. */
		if (opts.match) return { fieldtype: "Date" };
		if (/_time$/.test(name)) return { fieldtype: "Time" };
		if (/(^|_)time$/.test(name) || /_datetime$/.test(name)) return { fieldtype: "Datetime" };
		if (/_date$|^date_/.test(name)) return { fieldtype: "Date" };
		if (/(description|remarks|reason|note|body|address|comment)/.test(name)) {
			return { fieldtype: "Small Text" };
		}
		return { fieldtype: "Data" };
	}
	return { fieldtype: "Data" };
}

/** One doctype's field list, in schema order — which is the order the person
    who wrote the schema grouped them in, and a better form layout than
    alphabetical would be. */
function fieldsOf(dt: Doctype): Field[] {
	const schema = dt.model.schema as Schema;
	const out: Field[] = [];

	for (const [name, p] of Object.entries((schema as any).paths as Record<string, any>)) {
		if (BASE.has(name)) continue;
		const { fieldtype, options } = frappeType(name, p);
		const opts = p.options || {};

		const f: Field = { fieldname: name, label: label(name), fieldtype };
		if (options) f.options = options;
		/* A child table needs a doctype to point at, and there is not one — these
		   are sub-documents with no name of their own. Named after the parent so
		   the JSON is installable after somebody creates the child, and the README
		   says which ones those are. */
		if (fieldtype === "Table") f.options = `${dt.label} ${label(name)}`;
		if (opts.required) f.reqd = 1;
		if (opts.default !== undefined && typeof opts.default !== "function") {
			f.default = String(opts.default);
		}
		if (opts.index) f.search_index = 1;
		out.push(f);
	}
	return out;
}

/** The document Frappe's importer reads. Only the keys that mean something for
    a definition written by hand — a real export carries thirty more, every one
    of them a UI detail or a modification stamp this has no business inventing. */
function doctypeJson(dt: Doctype) {
	const fields = fieldsOf(dt);
	return {
		doctype: "DocType",
		name: dt.label,
		module: "Manna HR",
		custom: SHIPPED.has(dt.label) ? 0 : 1,
		is_submittable: dt.submittable ? 1 : 0,
		autoname: dt.naming.kind === "series"
			? `${dt.naming.prefix}.${"#".repeat(dt.naming.width ?? 5)}`
			: dt.naming.from ? `field:${dt.naming.from}` : "Prompt",
		/* Every doctype here is a record somebody reads, not a child row. A child
		   table would carry `istable: 1` and no permissions; the sub-documents in
		   these schemas have no doctype of their own at all — see the README. */
		istable: 0,
		editable_grid: 0,
		engine: "InnoDB",
		field_order: fields.map((f) => f.fieldname),
		fields,
		/* One role, read and write, and nothing else. A permission block copied
		   out of a schema would be a guess at who may see somebody's salary, and
		   that is a decision for whoever owns the site. */
		permissions: [
			{ role: "System Manager", read: 1, write: 1, create: 1, delete: 1, report: 1, export: 1 },
		],
	};
}

/** The Custom Field fixture for ERPNext's own `Employee`. Frappe installs this
    with `bench --site <site> import-doc`, or it can be pasted into a Custom
    Field form one row at a time. */
function customFieldsJson() {
	return EMPLOYEE_CUSTOM.map(([fieldname, lbl, fieldtype, after]) => ({
		doctype: "Custom Field",
		name: `Employee-${fieldname}`,
		dt: "Employee",
		fieldname,
		label: lbl,
		fieldtype,
		insert_after: after,
		module: "Manna HR",
	}));
}

/* ---------------------------------------------------------------------- run */

function main(): void {
	fs.rmSync(OUT, { recursive: true, force: true });
	fs.mkdirSync(path.join(OUT, "custom"), { recursive: true });
	fs.mkdirSync(path.join(OUT, "standard"), { recursive: true });

	const rows: string[] = [];
	let tables = 0;

	for (const dt of allDoctypes()) {
		const json = doctypeJson(dt);
		const dir = SHIPPED.has(dt.label) ? "standard" : "custom";
		const file = dt.label.toLowerCase().replace(/\s+/g, "_") + ".json";
		fs.writeFileSync(path.join(OUT, dir, file), JSON.stringify(json, null, 2) + "\n", "utf8");

		const child = json.fields.filter((f) => f.fieldtype === "Table");
		tables += child.length;
		rows.push(`| ${dt.label} | ${dir} | ${json.fields.length} | ${json.autoname} | `
			+ `${child.length ? child.map((c) => c.fieldname).join(", ") : "—"} |`);
	}

	fs.writeFileSync(
		path.join(OUT, "employee_custom_fields.json"),
		JSON.stringify(customFieldsJson(), null, 2) + "\n", "utf8",
	);

	const readme = `# ERPNext doctype definitions

Generated by \`npm run erpnext\` from the Mongoose schemas in \`server/src/doctypes/\`.
**Writing these out creates nothing on any ERPNext site.** This dashboard talks
to MongoDB; installing a doctype is a schema change on the Frappe site.
\`npm run erpnext:push\` is what does it, over the site's API, and it does
nothing without \`--apply\` — see **How** below.

## What to install

\`custom/\` — ${allDoctypes().filter((d) => !SHIPPED.has(d.label)).length} doctypes a stock ERPNext + HRMS does not ship. These are the ones to install.

${allDoctypes().filter((d) => !SHIPPED.has(d.label))
	.map((d) => `- **${d.label}** — ${WHY[d.label] || ""}`).join("\n")}

\`standard/\` — ${allDoctypes().filter((d) => SHIPPED.has(d.label)).length} doctypes ERPNext or HRMS already ships. **Do not install these over
theirs.** They are written out because this file is also the answer to "what
does this dashboard think an Employee is", and holding it against the real
doctype is how a field that has drifted gets found.

\`employee_custom_fields.json\` — the ${EMPLOYEE_CUSTOM.length} Custom Fields this dashboard adds to
ERPNext's own \`Employee\`. Install these rather than the \`standard/employee.json\`.

## How

Over the site's own API, from this checkout — \`erpnext-push.ts\`, the one thing
in this repo that writes to the Frappe site:

\`\`\`bash
# set ERPNEXT_API_KEY and ERPNEXT_API_SECRET in server/.env first, from a
# System Manager under User → API Access → Generate Keys

npm run erpnext:push            # asks the site what it has; writes nothing
npm run erpnext:push -- --apply # creates the ones it has not got
\`\`\`

It never overwrites: every name is checked against the site and an existing
doctype is skipped. \`standard/\` is not offered at all without
\`--include-standard\`. Everything it creates is created as a **Custom DocType**,
which is what an API caller may create on a site that is not in developer mode —
a frappe.cloud site is not.

Or on the bench, with the app installed and developer mode on:

\`\`\`bash
bench --site <site> import-doc /path/to/erpnext/custom/letter_type.json
bench --site <site> import-doc /path/to/erpnext/employee_custom_fields.json
bench --site <site> migrate
\`\`\`

Or paste each into **Developer → DocType → New** on the desk.

## Read this before installing

- **No field is a \`Link\`.** Every link in the Mongo schema is a plain string,
  so which doctype a field points at is not in the types — it is in
  \`registry.ts\`'s delete guards and in the client. Fields that want turning
  into Links by hand: \`employee\`, \`company\`, \`department\`, \`designation\`,
  \`holiday_list\`, \`shift_type\`, \`leave_type\`, \`asset\`, \`asset_category\`,
  \`reports_to\`, \`custodian\`, \`from_employee\`, \`to_employee\`.
- **${tables} child-table fields point at doctypes that do not exist.** The
  sub-documents in these schemas have no name of their own; the JSON names them
  \`<Parent> <Field>\` so it installs once somebody creates the child doctype.
- **Permissions are one role.** System Manager, full. A permission block guessed
  from a schema would be a guess about who may read somebody's salary.
- Labels, section breaks and \`depends_on\` are not in a Mongoose schema and are
  not invented here. The field *list* is faithful; the *form* is not designed.

## Everything, at a glance

| Doctype | Where | Fields | Naming | Child tables |
|---|---|---|---|---|
${rows.join("\n")}
`;
	fs.writeFileSync(path.join(OUT, "README.md"), readme, "utf8");

	const custom = allDoctypes().filter((d) => !SHIPPED.has(d.label)).length;
	console.log(`[erpnext] ${allDoctypes().length} doctypes written to ${OUT}`);
	console.log(`[erpnext]   custom/   ${custom} to install`);
	console.log(`[erpnext]   standard/ ${allDoctypes().length - custom} for comparison, not for installing`);
	console.log(`[erpnext]   ${EMPLOYEE_CUSTOM.length} Custom Fields for ERPNext's own Employee`);
	console.log(`[erpnext]   ${tables} child-table fields need a child doctype first — see the README`);
}

main();
