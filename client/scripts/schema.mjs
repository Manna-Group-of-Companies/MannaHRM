#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   The app's doctype JSON, turned into what the client needs to draw a form.

   **One schema, two consumers.** the app's doctype JSON is what
   the server installs; this script reads those same files and writes
   `client/src/data/schema.js`, which is what the create-and-edit forms draw
   from. Before this existed, every screen that wrote a record carried its own
   idea of that record's fields — and a field added on the server reached the
   client whenever somebody remembered.

   That is not a cosmetic saving. The failure it removes is specific and quiet:
   **Frappe accepts a key its doctype has not got and drops it without a word.**
   A form offering a field the site does not have takes a value, saves, reports
   success, and shows nothing on reload — which reads to the person who typed it
   as the record refusing to keep their work.

   Run it after changing a doctype:

       node scripts/schema.mjs

   `npm test` runs `tests/schema.test.js`, which regenerates and compares — so a
   doctype edited without re-running this fails the suite rather than shipping a
   form that disagrees with the table behind it.

   **What is deliberately not carried over.** Permissions, workflow, naming and
   defaults all stay on the server. A client that knew the permission rules
   would be a client that decides them, and CLAUDE.md §1 is explicit that a rule
   enforced here is a suggestion to anyone holding `curl`. What this file
   carries is the shape of the form: which fields exist, what kind each is, what
   it is called, and whether the server will refuse a blank.
   --------------------------------------------------------------------------- */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCTYPES = resolve(HERE, "../../manna_hr/manna_hr/doctype");
const OUT = resolve(HERE, "../src/data/schema.js");

/** Fieldtypes that hold no value — they lay a form out and name no column. */
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading", "Fold"]);

/** Frappe's fieldtype, as a control this app draws. Anything unlisted becomes a
    plain text box, which is the honest default: a control that cannot express
    the value is worse than one that can express too much, because the site
    validates either way and only the first loses what somebody typed. */
const CONTROL = {
	"Data": "text", "Small Text": "long", "Text": "long", "Long Text": "long",
	"Text Editor": "long", "Code": "long", "Markdown Editor": "long",
	"Int": "int", "Float": "float", "Currency": "currency", "Percent": "float",
	"Check": "check", "Date": "date", "Datetime": "datetime", "Time": "time",
	"Select": "select", "Link": "link", "Table": "table", "Table MultiSelect": "table",
	"Attach": "attach", "Attach Image": "attach", "Read Only": "readonly",
	"Duration": "int", "Rating": "int", "Geolocation": "text", "Password": "password",
};

function read() {
	const out = [];
	for (const dir of readdirSync(DOCTYPES, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		const path = join(DOCTYPES, dir.name, `${dir.name}.json`);
		let raw;
		try { raw = readFileSync(path, "utf8"); } catch { continue; }
		out.push(JSON.parse(raw));
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

function fieldsOf(d) {
	/* `field_order` is the order the form is drawn in and `fields` is the set;
	   Frappe treats the first as authoritative and so does this. A field present
	   in one and not the other is a doctype somebody hand-edited, and it is
	   caught by manna_hr/tests/test_doctypes.py rather than silently dropped. */
	const by = new Map((d.fields || []).map((f) => [f.fieldname, f]));
	const order = (d.field_order || []).filter((n) => by.has(n));
	const rest = (d.fields || []).map((f) => f.fieldname).filter((n) => !order.includes(n));
	return [...order, ...rest].map((n) => by.get(n));
}

function spec(d) {
	const fields = [];
	for (const f of fieldsOf(d)) {
		if (LAYOUT.has(f.fieldtype)) continue;
		const kind = f.read_only ? "readonly" : (CONTROL[f.fieldtype] || "text");
		const one = { name: f.fieldname, label: f.label || f.fieldname, kind };
		if (f.options && (f.fieldtype === "Link" || f.fieldtype === "Table"
			|| f.fieldtype === "Table MultiSelect")) one.link = f.options;
		if (f.options && f.fieldtype === "Select") {
			one.choices = String(f.options).split("\n").map((s) => s.trim());
		}
		if (f.reqd) one.reqd = 1;
		if (f.default != null && f.default !== "") one.def = String(f.default);
		if (f.fetch_from) one.from = f.fetch_from;
		if (f.description) one.hint = f.description;
		if (f.in_list_view) one.list = 1;
		fields.push(one);
	}
	return {
		name: d.name,
		module: d.module,
		istable: d.istable ? 1 : 0,
		issingle: d.issingle ? 1 : 0,
		submittable: d.is_submittable ? 1 : 0,
		/* How the site names a new record. A `field:` autoname means the value of
		   that field *is* the id, so changing it later renames the record — which
		   the form has to say, because renaming a master breaks every Link to it. */
		autoname: d.autoname || "",
		title: d.title_field || "",
		fields,
	};
}

const specs = read().map(spec);

const header = `/* ---------------------------------------------------------------------------
   **Generated. Do not edit.**  \`node scripts/schema.mjs\`

   The shape of every doctype this app installs, read off
   the app's own doctype JSON — the same files the server installs, so
   the form somebody types into and the table it lands in cannot disagree.

   That disagreement is the reason this file exists rather than a convenience.
   **Frappe accepts a key its doctype has not got and drops it silently**: a form
   offering a field the site does not have takes a value, saves, reports success,
   and shows nothing on reload. To whoever typed it, the record refused their
   work for no stated reason.

   Permissions, workflow and naming stay on the server and are not here. A client
   that knew the permission rules would be a client that decides them, and
   CLAUDE.md §1 says a rule enforced here is a suggestion to anyone holding
   \`curl\`. What this carries is the shape of the form: which fields exist, what
   kind each is, what it is called, and whether a blank will be refused.

   \`tests/schema.test.js\` regenerates and compares, so a doctype edited without
   re-running this fails the suite rather than shipping a form that lies.
   --------------------------------------------------------------------------- */

/** Every doctype this app installs, by name. */
export const SCHEMA = `;

writeFileSync(OUT, header + JSON.stringify(
	Object.fromEntries(specs.map((s) => [s.name, s])), null, "\t",
).replace(/"([a-z_]+)":/g, "$1:") + `;

/** The doctypes a person edits directly — not child tables, not Singles. */
export const RECORD_DOCTYPES = Object.values(SCHEMA)
	.filter((d) => !d.istable && !d.issingle)
	.map((d) => d.name);

/** One doctype's fields, or an empty list. Never throws: a screen asking for a
    doctype this app does not install draws nothing rather than breaking, which
    is what a stale link should do. */
export const fieldsOf = (doctype) => (SCHEMA[doctype] || {}).fields || [];

/** The columns worth showing in a list, as the doctype itself marks them. */
export const listFields = (doctype) => fieldsOf(doctype).filter((f) => f.list);
`, "utf8");

console.log(`schema.js — ${specs.length} doctypes, ${specs.reduce((n, s) => n + s.fields.length, 0)} fields`);
