import { DATE_FIELD } from "../data/employees.js";
import { PROFILE_CHECKS, PROFILE_LONG, PROFILE_PLUMBING } from "../data/profile.js";

/* ---------------------------------------------------------------------------
   What may be edited on Employee Profile, and what the site would be sent.

   Everything here is a pure function of the document the site returned and what
   somebody typed, so "is this field editable" and "what changed" can be argued
   about in `tests/profedit.test.js` with no site and no React.
   `features/employees/EmployeeProfile.jsx` is how it is asked;
   `api/employee.js` is the one line that touches the network.

   Relative imports, not the `@` alias — `npm test` runs these files in Node,
   where the alias does not exist. Same rule as `lib/newemp.js`.

   **None of this is enforcement.** It runs in a browser, and a rule enforced in
   a client is a suggestion to anyone holding `curl` (CLAUDE.md §1). The site
   decides whether the write is allowed and whether the value is legal — a Link
   that names nothing, a person this reader may not write. What these functions
   buy is that the form does not *offer* a box the site would certainly refuse,
   which is a different and smaller claim.
   --------------------------------------------------------------------------- */

/** Fields the site will not take a value for, whatever is typed.

    Not a permission — a permission is the site's answer and arrives as a
    refusal. These are fields where a box would take a value, save without
    complaint, and then show something else, which reads as the save having
    failed silently.

    `employee_name` is the one worth naming. ERPNext composes it from
    `first_name`, `middle_name` and `last_name` on every save, so a name typed
    over it survives until the next time anybody touches the record and then
    reverts. Editing the three parts is the honest way to rename somebody, and
    they are on the About pane. */
export const NEVER_EDITABLE = new Set([
	"name", "employee_name", "employee",
	// Derived on save from date_of_birth / date_of_joining.
	"lft", "rgt", "old_parent",
]);

/** Fields whose value is an id that is not what the screen shows.

    A datalist cannot help here: the box would submit the label. Each of these
    needs a real `<select>` whose options carry the id, which is why they are
    listed rather than detected. */
export const ID_NOT_LABEL = new Set(["reports_to"]);

/** Boxes that take a figure rather than a word. */
export const NUMERIC = new Set(["ctc", "notice_number_of_days", "holiday_list_id"]);

/** Link fields, and the store list each one may be picked from.

    A `<datalist>` rather than a `<select>` for all of these, deliberately: the
    list this dashboard holds is what one read returned, and a `<select>` built
    from it cannot express a department the read did not include. The site
    refuses a Link that names nothing, which is the right place for that to
    fail. So the list is a suggestion and the box still takes anything.

    `holiday_list` and `default_shift` are the two that matter most and neither
    is a free-text field on the site — get one wrong and a person is measured
    against the wrong calendar or the wrong shift, which is somebody's pay. */
export const LINK_LISTS = {
	company: "companies",
	department: "departments",
	designation: "designations",
	holiday_list: "holidayLists",
	default_shift: "shiftTypes",
};

/** Select fields, and their options. Only where the site's own list is short,
    fixed and known — a guessed option list is worse than a text box, because it
    hides the value somebody actually needs. */
export const CHOICES = {
	status: ["Active", "Inactive", "Suspended", "Left"],
	gender: ["", "Male", "Female", "Other"],
	marital_status: ["", "Single", "Married", "Divorced", "Widowed"],
	salutation: ["", "Mr", "Ms", "Mrs", "Dr"],
};

/**
 * How this field should be drawn in edit mode, or "" when it cannot be edited.
 *
 * `how` is `pick()`'s answer from the profile screen: `set`, `blank` or
 * `absent`. **Only the first two are editable, and the reason is the point of
 * that screen.** `absent` means the site's Employee has no such column — a box
 * for it would post a key the doctype does not have, which Frappe accepts
 * silently and drops. The field would look saved and be gone on reload.
 *
 * @param {string} key      the fieldname the value came from
 * @param {string} how      "set" | "blank" | "absent"
 * @returns {string} "" | text | long | date | check | number | choice | link | employee
 */
export function controlFor(key, how) {
	if (!key || how === "absent") return "";
	if (NEVER_EDITABLE.has(key) || PROFILE_PLUMBING.has(key)) return "";
	if (ID_NOT_LABEL.has(key)) return "employee";
	if (CHOICES[key]) return "choice";
	if (PROFILE_CHECKS.has(key)) return "check";
	if (DATE_FIELD.test(key)) return "date";
	if (NUMERIC.has(key)) return "number";
	if (LINK_LISTS[key]) return "link";
	if (PROFILE_LONG.has(key)) return "long";
	return "text";
}

/** Why a field has no box, in words somebody can act on. */
export function whyNotEditable(key, how) {
	if (how === "absent") {
		return "This site's Employee has no such field, so there is nothing to write to. "
			+ "Adding it is a Custom Field on the site.";
	}
	if (key === "employee_name") {
		return "Composed by the site from the first, middle and last name every time the record is "
			+ "saved. Edit those instead — a name typed here reverts the next time anybody saves.";
	}
	if (NEVER_EDITABLE.has(key)) return "The site sets this one; it is not typed.";
	if (PROFILE_PLUMBING.has(key)) return "Frappe's own bookkeeping.";
	return "";
}

/** What the box should start with, in the shape that control wants. */
export function boxValue(doc, key, kind) {
	const raw = doc[key];
	if (kind === "check") return raw ? 1 : 0;
	if (raw == null) return "";
	// Frappe returns a date as YYYY-MM-DD, which is what `type=date` wants, and
	// a datetime as "YYYY-MM-DD HH:MM:SS", which it does not — so the day is
	// taken off the front rather than the box being left empty.
	if (kind === "date") return String(raw).slice(0, 10);
	return String(raw);
}

/** Whether two values mean the same thing to the site.

    `null`, `undefined` and `""` are one answer — a box cleared to empty and a
    column that was never filled are the same document — and `0`/`1` has to
    survive being read back off a checkbox as a string. */
export function same(a, b) {
	const norm = (v) => (v == null || v === "" ? "" : typeof v === "number" ? String(v) : String(v));
	return norm(a) === norm(b);
}

/**
 * What actually changed, ready to PUT.
 *
 * Only the fields that differ, for two reasons. A whole-document write sends
 * back every column the read returned — including ones this reader may not
 * write, which turns an edit to a phone number into a refusal about a salary
 * field nobody touched. And it re-sends stale values: two people on the same
 * record, and the second save silently undoes the first everywhere it did not
 * type.
 */
export function patchFrom(doc, draft) {
	const patch = {};
	for (const [key, value] of Object.entries(draft || {})) {
		if (same(doc[key], value)) continue;
		patch[key] = value === "" ? null : value;
	}
	return patch;
}

/** How many fields the Save button would write. Drawn on the bar, so somebody
    can see that a change they made in another pane is still pending. */
export function changedCount(doc, draft) {
	return Object.keys(patchFrom(doc, draft)).length;
}

/** The draft with one box's answer in it, or with that box put back.

    A value typed and then typed back to what the record says is not a change,
    and leaving it in the draft would keep the Save button lit over a document
    nothing would happen to. */
export function withEdit(doc, draft, key, value) {
	const next = { ...(draft || {}) };
	if (same(doc[key], value)) delete next[key];
	else next[key] = value;
	return next;
}
