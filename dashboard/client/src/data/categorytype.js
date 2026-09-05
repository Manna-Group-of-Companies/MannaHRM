import { FH_CATEGORY_TYPES } from "@/data/masters";

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

/** Parent Category Type offers the eight this screen already lists — theirs is
    a hierarchy over its own master, and the only master of category types
    anywhere in this repo is the one FH_CATEGORY_TYPES records. */
export const CT_PARENTS = FH_CATEGORY_TYPES.map((t) => t.name);

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

	{ key: "rcd", label: "Report Category Display", kind: "select", where: "grid", state: "build",
		dead: true,
		why: "Never screenshotted open, so what it offers is unknown — and a list invented here would "
			+ "be a guess wired to a field definition. Drawn closed, where theirs is, and left inert." },

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

/** What the + Add used to say, kept because half of it is still true and the
    dialog now says the other half properly. */
export const CT_ADD_WHY = "Their Create Category Type. There is no Category Type doctype on this site to add "
	+ "a row to — but their form describes a Custom Field on Employee almost field for field, so this asks "
	+ "their questions and opens Frappe's own form with the answers in it.";

/** An untouched dialog, and the only definition of one. A function rather than
    an object for the reason `NEW_EMP_BLANK` is one: two callers sharing a
    mutable literal is how a form reopened comes back holding the last one's
    code. */
export const CT_BLANK = () => ({
	open: false,
	f: {
		code: "", desc: "", parent: "", rprio: "", sprio: "", prompt: "",
		visible: "true", rcd: "", mandatory: false, promptchange: false,
		addcode: false, nofilter: false,
	},
	/* One empty row, because theirs opens with one. An empty row is not a value
	   and is dropped on the way out; it is there so the table reads as a table
	   rather than as a lone Add New. */
	custom: [""],
	msg: "",
});

/** `Code` as Frappe will store it: lower case, underscores, `custom_` in front.

    The prefix is not decoration. Frappe owns the unprefixed namespace on its
    own doctypes and reserves `custom_` for fields added to them, so a field
    called `grade` added by hand is a field that collides with a standard one on
    the next upgrade — silently, and in a column somebody is reporting on. */
export function fieldnameFor(code) {
	const slug = String(code || "").trim().toLowerCase()
		.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return slug ? "custom_" + slug : "";
}
