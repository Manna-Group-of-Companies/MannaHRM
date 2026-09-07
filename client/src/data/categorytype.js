import { SITE_CATEGORY_TYPES } from "@/data/masters";
import { tidyDept } from "@/lib/format";

/* ---------------------------------------------------------------------------
   **Create Category Type** — the dialog behind the + Add on Employees →
   Categories, photographed 4 September 2026 and drawn in
   features/employees/CreateCategoryType.jsx.

   That button had been drawn dead since the screen was built, with a reason
   that is still true as far as it went: there is no `Category Type` doctype on
   this site, so there is nothing here to add a row to. What the form itself
   settles — and what a closed button could never have shown — is *what a
   Category Type actually is*, and it turns out ERPNext has a very close answer
   to it under another name.

   ## A Category Type is a Custom Field on Employee

   Read their form field by field and that is what it describes: a code, a label,
   a help message, whether it is mandatory, whether it is visible, whether it
   appears as a filter, and a list of the values it can take. Frappe's
   `Custom Field` carries every one of those:

     Code                                fieldname
     Description                         label
     Prompt Message                      description
     Is Visible                          hidden, inverted
     Is Mandatory                        reqd
     Don't Display this in Category      in_standard_filter, inverted
       Filter
     Custom Field rows                   options, one value per line, on a
                                         Select field

   The last two are the ones worth pausing on. Frappe's *in standard filter* is
   precisely "does this field appear in the filter bar", so their negative box
   and its positive box are the same switch read from opposite ends — and a
   Select field's `options` is a newline-separated list of the values the field
   may take, which is what their Custom Field table is collecting.

   ## Six controls have no answer, and they are the finding

   Parent Category Type, the two Display Priorities, Report Category Display,
   Prompt On Change and Add Category Code In Reports. Factor HR's Category Type
   is a *managed* dimension — it knows where it sorts on a report, whether to
   warn when somebody changes it, whether its code prints. A Frappe custom field
   is a field: it has a position on a form and nothing else. That is a real
   difference in what the two products think a grouping is, and it is why this
   dialog is worth having drawn even though half of it cannot be honoured.
   --------------------------------------------------------------------------- */

/** Parent Category Type offers what this screen already lists — theirs is a
    hierarchy over its own master, and the nearest thing to a master of category
    types on this site is the masters that group an employee. */
export const CT_PARENTS = SITE_CATEGORY_TYPES.map((t) => t.name);

/** Their Is Visible box holds the word `true`.

    **Drawn as a select rather than as their text input, deliberately.** It is a
    boolean with two values and their control is a box somebody can type
    anything into; this repo has deviated from a screenshot before where the
    control was the problem rather than the copy — see StatusDrop on Employee
    Master, which is a listbox because a `<select>` cannot colour an option. A
    text box whose only two correct contents are `true` and `false` is the same
    class of thing, and `hidden` on the site is a checkbox either way. */
export const CT_VISIBLE = ["true", "false"];

/** Every control on their form, in their order and their words.

    `where` is the block it sits in: `grid` is the three-column head, `check` is
    the row of tick boxes under it.

    `state` is the whole point of the table — `live` maps to a field on Frappe's
    `Custom Field`, named in `field`; `build` is their control with nothing on
    this side to be. `invert` marks the two whose sense is reversed on the way
    over, which is the sort of detail that is wrong silently if it is not
    written down next to the mapping.

    `why` sits on the label as a tooltip rather than printed under every box —
    the same choice the Create Employee wizard made after printing its hints
    turned a form into a page of grey reading. */
export const CT_FORM = [
	{ key: "code", label: "Code", kind: "text", where: "grid", state: "live", field: "fieldname",
		req: true,
		why: "Becomes the fieldname on Employee, prefixed `custom_` and lower-cased with underscores — "
			+ "Frappe reserves the unprefixed namespace for its own fields, and a custom field that "
			+ "collides with a standard one is the kind of mistake nobody finds until an upgrade." },

	{ key: "desc", label: "Description", kind: "text", where: "grid", state: "live", field: "label",
		why: "The label on the form. Their word for it is Description; Frappe's is `label`, and it is "
			+ "the same string — what a person reads beside the box." },

	{ key: "parent", label: "Parent Category Type", kind: "select", where: "grid", state: "build",
		why: "Factor HR nests category types under one another. Frappe has no hierarchy for custom "
			+ "fields — a field belongs to a doctype and sits after another field, and that is the whole "
			+ "of its structure. Nesting would have to be rebuilt as a doctype of its own." },

	{ key: "rprio", label: "Report Display Priority", kind: "number", where: "grid", state: "build",
		why: "Where this category sorts on a report. Frappe reports order by whatever the report asks "
			+ "for; a field carries no standing priority of its own, so there is nothing to write this to." },

	{ key: "sprio", label: "Screen Display Priority", kind: "number", where: "grid", state: "build",
		why: "Where it sits on the form. Frappe answers this with `insert_after` — a field name, not a "
			+ "number — so the two do not convert: a priority of 3 does not say which field it goes "
			+ "after. Carried into the description so whoever places it can read the intent." },

	{ key: "prompt", label: "Prompt Message", kind: "text", where: "grid", state: "live",
		field: "description",
		why: "`Custom Field.description` — the grey line Frappe prints under the box. Their word for it "
			+ "is a prompt and it goes to the same place." },

	{ key: "visible", label: "Is Visible", kind: "select", where: "grid", state: "live",
		field: "hidden", invert: true,
		why: "`Custom Field.hidden`, inverted — theirs asks whether it is shown and Frappe's asks "
			+ "whether it is hidden. The inversion happens on the way over rather than being left to "
			+ "whoever reads the two forms side by side." },

	{ key: "rcd", label: "Report Category Display", kind: "rcd", where: "grid", state: "build",
		why: "Which of their six reports this category prints on — see CT_RCD, screenshotted open on "
			+ "5 September 2026. It has no answer on this side and the reason is the same one the two "
			+ "Display Priorities have: an ERPNext report prints the columns the report asks for, so "
			+ "nothing about a field decides which reports it appears on. Carried into the description "
			+ "so whoever builds those reports can read what was wanted." },

	{ key: "mandatory", label: "Is Mandatory", kind: "check", where: "check", state: "live",
		field: "reqd",
		why: "`Custom Field.reqd`. The site refuses to save an Employee without it, which is what "
			+ "mandatory has to mean if it means anything." },

	{ key: "promptchange", label: "Prompt On Change", kind: "check", where: "check", state: "build",
		why: "Warn somebody when this category changes on a person. Frappe has no per-field confirmation "
			+ "— that is a client script on the doctype, which is code rather than a checkbox, and it is "
			+ "not something a dashboard should be writing." },

	{ key: "addcode", label: "Add Category Code In Reports", kind: "check", where: "check",
		state: "build",
		why: "Print the code beside the value on reports. A property of Factor HR's report engine rather "
			+ "than of the field; ERPNext reports print what the report asks for." },

	{ key: "nofilter", label: "Don't Display this in Category Filter", kind: "check", where: "wide",
		state: "live", field: "in_standard_filter", invert: true,
		why: "`Custom Field.in_standard_filter`, inverted — whether the field appears in the filter bar. "
			+ "Their box asks not to show it and Frappe's asks to show it; the same switch from opposite "
			+ "ends." },
];

/** Their Custom Field table — a column of boxes with a bin beside each and an
    Add New under them.

    Read as **the values this category may take**, which is what makes it map:
    a Frappe `Select` field's `options` is exactly this, one value per line. A
    category type with no values is a free-text field, which is what `Data`
    means, so an empty table is a real answer rather than an unfinished one and
    the fieldtype follows from it.

    The reading is not certain — their column is headed "Custom Field" rather
    than "Value", and nobody has opened the screen that would settle it. It is
    said on the dialog rather than assumed silently. */
export const CT_CUSTOM_WHY = "Read as the values this category may take: on the site that becomes a Select "
	+ "field whose options are these lines, and an empty table becomes a free-text field instead. Their "
	+ "column is headed Custom Field rather than Value and the screen that would settle which they mean "
	+ "has not been opened — so the reading is stated here rather than assumed.";

/** What the + Add says. */
export const CT_ADD_WHY = "Their Create Category Type. There is no Category Type doctype on this site to add "
	+ "a row to — but their form describes a Custom Field on Employee almost field for field, so this asks "
	+ "their questions and creates one, on the site, as you. It appears on this list.";

/** An untouched dialog, and the only definition of one. A function rather than
    an object for the reason `NEW_EMP_BLANK` is one: two callers sharing a
    mutable literal is how a form reopened comes back holding the last one's
    code. */
export const CT_BLANK = () => ({
	open: false,
	f: {
		code: "", desc: "", parent: "", rprio: "", sprio: "", prompt: "",
		visible: "true", mandatory: false, promptchange: false,
		addcode: false, nofilter: false,
	},
	/* The six report tick boxes, by label — see CT_RCD, screenshotted open on
	   5 September 2026. A list rather than six booleans so the order on the
	   dialog and the order in the description are the same order without
	   anybody keeping two lists in step. It was a dead string here until that
	   click was taken. */
	rcd: [],
	rcdopen: false,
	/* One empty row, because theirs opens with one. An empty row is not a value
	   and is dropped on the way out; it is there so the table reads as a table
	   rather than as a lone Add New. */
	custom: [""],
	msg: "",
	/* Whether `msg` is a refusal. The two are drawn differently and read
	   differently — `.gap` with an alert role, or a plain `.note` — and a screen
	   that infers which from the wording gets it wrong the first time somebody
	   creates a category called "Failed". */
	bad: false,
});

/** The prefix every category type created from this screen carries.

    Two jobs in one string, and both of them matter.

    `custom_` is Frappe's: it owns the unprefixed namespace on its own doctypes
    and reserves this one for fields added to them, so a field called `grade`
    added by hand is a field that collides with a standard one on the next
    upgrade — silently, and in a column somebody is reporting on.

    `cat_` is ours, and it is what makes the list on Categories mean anything.
    Employee already carries custom fields that are not category types at all
    — the passport block, the PAN number, the seven added on 25 August — and a
    screen that listed every custom field as a category would file somebody's
    passport number under Category Type. There is no spare column on
    `Custom Field` to tag one with, so the tag is in the name, where it is
    visible on the site as well as here. */
export const CT_PREFIX = "custom_cat_";

/** `Code` as Frappe will store it: lower case, underscores, `custom_cat_` in
    front. Shown on the dialog as it is typed, because a name rewritten behind
    somebody's back is a name they cannot search for afterwards. */
export function fieldnameFor(code) {
	const slug = String(code || "").trim().toLowerCase()
		.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return slug ? CT_PREFIX + slug : "";
}

/** The six the Report Category Display list offers, screenshotted open on
    5 September 2026 — the click that had never been taken when this file was
    first written.

    Worth having even though none of them maps: **it says what Factor HR thinks a
    category is for.** Payslip, Register, ESI, PF, PT and Submit Attendance are
    the six places a grouping shows up over there, and four of the six are
    statutory returns. A category on that system is a reporting dimension with a
    list of reports attached; a field on this one is a column on a form. That is
    the same finding the two Display Priorities make, with the list filled in.

    In their order, and their words — including the missing space in
    "ESI Report", which is theirs. */
export const CT_RCD = [
	"Display In Payslip",
	"Display In Register",
	"Display In ESI Report",
	"Display In PF Report",
	"Display In PT Report",
	"Display In Submit Attendance",
];

/** What the View dialog is, said once.

    **Their form, read-only, filled with what this side actually knows** — which
    for most of it is nothing, and the dashes are the point. Six of their twelve
    controls have no answer here at all (see the note at the top of this file),
    and the other six have one only for a category type that maps onto a field.

    A dialog of dashes would be useless, so what this side *does* know goes
    underneath: which doctype the values live in, how many there are, and how
    many people carry one. That is the half of the record that is real. */
export const CT_VIEW_WHY = "Factor HR's own properties for this category type. They live on their "
	+ "Category Type master, which this site has no equivalent of — so every one of them reads as a "
	+ "dash rather than as a value somebody could act on. What is known here is under them.";

/** And the Edit dialog, which is the same form with the boxes live.

    **Save goes to one of two places and picking the wrong one is the trap.** A
    category type that already maps onto a field on `Employee` is edited through
    **Customize Form**, which writes Property Setters against the field that is
    already there. One that maps onto nothing would be a new `Custom Field` —
    which is what + Add does. Sending an edit down the Add path adds a second
    `department` beside the first, and both of them look like real fields. */
export const CT_EDIT_WHY = "Their Edit Category Type. The properties that have somewhere to land here are "
	+ "properties of the Employee field this category reads onto, and Frappe writes those through "
	+ "Customize Form — so Save opens that, on the site, with the field named.";

/** The values behind one category type, as this side holds them.

    Here rather than in the page because three screens want the same answer now:
    the drill-down list, the Edit dialog's value table, and the count under
    both. `code` is Factor HR's leftmost column, blank on every row of theirs;
    Company is the one master with anything to put in it, because ERPNext keeps
    an `abbr` and it is the string glued onto every department name.

    `status` is null where this side has no such field — drawn as a dash with
    the reason on it, never as Active, because "we did not read a status" and
    "the status is Active" are different claims. */
export function catValues(s, t) {
	/* One this screen created. Its values are the field's own `options`, which is
	   the whole of the mapping — a Select field on Frappe *is* a list of values
	   with a label on it. No master to read, so no read to fail. */
	if (t.cf) return ctOptions(t.cf).map((v) => ({ name: v, code: "", desc: v, status: null }));
	if (t.dt === "Company") {
		return s.companies.map((c) => ({ name: c.name, code: c.abbr || "", desc: c.name, status: null }));
	}
	if (t.dt === "Department") {
		return s.departments.map((d) => ({
			name: d.name,
			code: "",
			desc: tidyDept(d.name),
			status: "disabled" in d ? (d.disabled ? "Disabled" : "Active") : null,
		}));
	}
	if (t.dt === "Designation") {
		return s.designations.map((d) => ({ name: d.name, code: "", desc: d.name, status: null }));
	}
	return [];
}

/** One category type's dialog, opened.

    `mode` is "view" or "edit" and is the only difference between the two — same
    component, same layout, same field table. Two components would be two
    layouts that drift, and a form whose read-only copy has fallen a field
    behind is a form nobody can check anything against.

    The form is seeded from what is known: their Code and their name, and the
    values this side holds in the Custom Field table. Everything else opens
    blank, because it is blank — see CT_VIEW_WHY. */
export const CT_DLG_BLANK = () => ({
	open: false,
	mode: "view",
	/** Which category type, by key — `ctTypes` is what it is found on, and the
	    key is unique across both halves of that list. `name` is what the dialog
	    prints; the two differ for a type of our own, whose key is the document
	    name of the field behind it. */
	key: "",
	name: "",
	f: {
		code: "", desc: "", parent: "", rprio: "", sprio: "", prompt: "",
		visible: "true", mandatory: false, promptchange: false,
		addcode: false, nofilter: false,
	},
	/** The six report tick boxes, by label. A list rather than six booleans so
	    the order on the dialog and the order in the description are the same
	    order without anybody keeping two lists in step. */
	rcd: [],
	/** Whether that list is open. A store key rather than component state
	    because the document handler in App.jsx is what closes it — every other
	    menu on this dashboard closes on a click elsewhere, and one that did not
	    would be the one people leave open. */
	rcdopen: false,
	custom: [],
	msg: "",
});

/** The dialog's opening state for one category type.

    A type of Factor HR's opens with two answers — their code and their name —
    because that is all this side knows about it. One of ours opens with five
    more, read off the field itself: prompt, mandatory, visible and filter are
    properties of a `Custom Field`, and a form that showed dashes for values
    sitting one API call away would be lying by omission. */
export function ctSeed(s, t, mode) {
	const blank = CT_DLG_BLANK();
	const cf = t.cf;
	return {
		...blank,
		open: true,
		mode,
		key: t.key || t.name,
		name: t.name,
		f: cf
			? {
				...blank.f,
				code: t.code || "",
				desc: t.name,
				prompt: cf.description || "",
				mandatory: Boolean(cf.reqd),
				/* Both inverted on the way back, the same two that were inverted on
				   the way out — see `invert` in CT_FORM. Reading one of these the
				   wrong way round shows a visible category as hidden, which nobody
				   would doubt until they went looking for it on a form. */
				visible: cf.hidden ? "false" : "true",
				nofilter: !cf.in_standard_filter,
			}
			: { ...blank.f, code: t.code || "", desc: t.name },
		/* Their Custom Field table, read as the values this category may take —
		   see CT_CUSTOM_WHY. For a type with a master behind it those are the
		   values the site actually holds, so the table opens filled rather than
		   asking somebody to retype a list that is one click away on the same
		   screen. */
		custom: catValues(s, t).map((r) => r.desc),
	};
}

/* ---------------------------------------------------------------------------
   Category types this site actually holds — the ones + Add creates.

   Everything above this line is Factor HR's master read against ours. This is
   the other direction: a `Custom Field` on Employee carrying `CT_PREFIX`, read
   back as a row of their Category Type table, so that a category somebody
   creates on this screen appears on this screen.

   **The field is the record.** There is no shadow list here and no local copy —
   the site is asked what category types exist and answers with its own schema.
   Which is why one created on the desk shows up here too, and why one deleted
   there stops showing up here without anything being kept in step.
   --------------------------------------------------------------------------- */

/** What one is read with. `creation` orders the list; the rest are the six
    controls that map, plus the fieldtype that says whether it has a value list
    at all. */
export const CT_CF_FIELDS = [
	"name", "fieldname", "label", "fieldtype", "options",
	"reqd", "hidden", "in_standard_filter", "description", "creation",
];

/** And what is asked for: Employee's own fields, of the two types this screen
    creates, carrying the prefix this screen puts on them.

    Both halves of that filter earn their place. Without the fieldtype clause a
    Section Break is a custom field too, with no values and nothing a category
    type means; without the prefix clause the passport block and the PAN number
    would be listed as categories, which is how somebody's passport number ends
    up filed under Category Type. */
export const CT_CF_FILTER = [
	["dt", "=", "Employee"],
	["fieldtype", "in", ["Data", "Select"]],
	["fieldname", "like", CT_PREFIX + "%"],
];

/** The values a category type may take: a Select field's `options`, one to a
    line. Empty for a `Data` field, which is a free-text category and a real
    answer rather than a missing one — see CT_CUSTOM_WHY. */
export function ctOptions(cf) {
	return String((cf && cf.options) || "")
		.split("\n")
		.map((v) => v.trim())
		.filter(Boolean);
}

/** The document + Add sends: one `Custom Field` on Employee.

    Built here rather than in the dialog so that what the dialog *shows* it will
    send and what it actually sends are one expression. They were two, and a
    preview that can drift from the payload it previews is worse than no preview
    at all.

    A category with values becomes a `Select` and one without becomes `Data`,
    which is what an empty table honestly means rather than an unfinished form.
    Both inversions happen here, in the one place, and are named in CT_FORM. */
export function ctDoc(f, values, description) {
	return {
		dt: "Employee",
		fieldname: fieldnameFor(f.code),
		label: f.desc.trim() || f.code.trim(),
		fieldtype: values.length ? "Select" : "Data",
		...(values.length ? { options: values.join("\n") } : {}),
		reqd: f.mandatory ? 1 : 0,
		hidden: f.visible === "false" ? 1 : 0,
		in_standard_filter: f.nofilter ? 0 : 1,
		...(description ? { description } : {}),
	};
}

/** One `Custom Field` read back as a row of the Category Type table.

    `key` rather than `name` is what the screen navigates on: a label is
    whatever somebody typed and could collide with one of theirs, and the
    document name of the field cannot. `field` is the fieldname, which is what
    the rest of this file means by it. */
export function ctFromField(cf) {
	return {
		key: cf.name,
		name: cf.label || cf.fieldname,
		code: cf.fieldname,
		field: cf.fieldname,
		ico: "🏷",
		cf,
		maps: `<code>Employee.${cf.fieldname}</code> — a <b>Custom Field</b>, created from this screen`,
	};
}

/** Every category type on this site: the masters it ships with, then the ones
    this screen created.

    The masters first because they are the ones with a doctype behind them.
    Ours after, oldest first — the order they were created in, and the only
    order that does not move a row under somebody who renames one. */
export function ctTypes(s) {
	const theirs = SITE_CATEGORY_TYPES.map((t) => ({ ...t, key: t.name }));
	const ours = (s.empFields || [])
		.slice()
		.sort((a, b) => String(a.creation || "").localeCompare(String(b.creation || "")))
		.map(ctFromField);
	return theirs.concat(ours);
}

/** Why the drill and the row actions on a category of ours open the field
    rather than a row: the values are lines in one document, so there is no
    per-value document for them to open. */
export const CT_CF_VALUE_WHY = "The values of a category created here are lines in the field's own "
	+ "options, not documents — so there is nothing per row to open. Add, edit or remove one on the "
	+ "Custom Field itself, which is what these open.";

/** And why nothing is counted off the people for one of ours.

    The employee read asks for a fixed list of fields (EMP_FIELDS) so that one
    field a site has not got cannot refuse the whole read. A field created
    minutes ago is not on that list, so the loaded records do not carry it — and
    "nobody is filed under this" and "we did not ask" are opposite findings. */
export const CT_CF_COUNT_WHY = "Nothing is counted off the people for a category created here. The "
	+ "employee read asks for a fixed list of fields, so a field added afterwards is not on the "
	+ "records this page loaded — which is different from nobody carrying it, and the difference is "
	+ "worth more than a zero.";
