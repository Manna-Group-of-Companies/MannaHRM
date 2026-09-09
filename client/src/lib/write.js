import { SCHEMA } from "../data/schema.js";

/* ---------------------------------------------------------------------------
   What this app may create, change and delete — and what it must not.

   Pure: a doctype name and a document in, an answer out. No React, no network,
   argued about in `tests/write.test.js`. `api/crud.js` is the one file that
   touches the site; `features/records/` is how it is asked.

   **None of this is enforcement, and the distinction matters more here than
   anywhere else in this app.** These rules run in a browser, and a rule enforced
   in a client is a suggestion to anyone holding `curl` (CLAUDE.md §1). The site
   decides. What this buys is that the app does not *offer* a destructive control
   that the site would refuse — or, worse, would accept.

   Three kinds of answer, and they are different things:

   - **`no`** — the site would very likely refuse, or accept and corrupt
     something. The control is not drawn, and the reason is.
   - **`warn`** — legal, and worth stopping for. The control is drawn behind a
     confirmation that says what will happen.
   - **`yes`** — ordinary. Draw it.
   --------------------------------------------------------------------------- */

/**
 * Doctypes this app will never write, whatever the person's permissions.
 *
 * **`Attendance` is the one this list exists for.** It is generated from
 * `Employee Checkin` by the shift job, and a hand-written row is invisible to
 * the thing that would have created it — the two disagree the moment anything
 * is reprocessed, and what disagrees is somebody's pay. A correction writes the
 * missing *punch*; the job writes the day. CLAUDE.md §5.
 *
 * The others are the same shape of mistake: a record that is derived, or a
 * ledger that is written by a process and read by everything else.
 */
export const NEVER_WRITE = {
	"Attendance": "Generated from Employee Checkin by the shift job. A hand-written row is invisible "
		+ "to the thing that would have created it, and the two disagree the moment anything is "
		+ "reprocessed. Corrections write the missing punch instead — Attendance → Regularization.",
	"Leave Ledger Entry": "The ledger a leave balance is read from. It is written by Leave "
		+ "Application and Leave Allocation; an entry typed by hand makes a balance that no "
		+ "application accounts for.",
	"Salary Slip": "Produced by a payroll run. A hand-made slip is a payment with no run behind it.",
	"Stock Ledger Entry": "ERPNext's own ledger, written by the transactions above it.",
	"Version": "Frappe's audit trail of every change. It is the record of what happened.",
};

/**
 * Doctypes this app will not *delete*, even where it creates and edits them.
 *
 * **A deletion here is not an undo.** These are the records somebody is paid
 * from, or that another record points at; ERPNext will refuse most of them and
 * the ones it allows are the dangerous ones. Frappe's own answer to "this was a
 * mistake" on a submitted document is cancel-and-amend, which keeps the wrong
 * one visible — and that is the right answer for all of these.
 */
export const NEVER_DELETE = {
	"Employee Checkin": "A punch is evidence. The machine's copy may already be gone, and this may be "
		+ "the last record that somebody was at work — which is a day's pay. Mark it, argue about it, "
		+ "do not remove it.",
	"Employee": "Somebody who has left is `Left`, not deleted. Every punch, letter, document and "
		+ "loan points at this record, and the site will refuse — but on a fresh employee with no "
		+ "links it would not, and a deleted person takes their history with them.",
	"Employee Loan Application": "The loan itself, on this site's design. Deleting one erases what "
		+ "has already been recovered from somebody's salary.",
	"Employee Loan Repayment": "A recovery that has happened. Deleting it makes the balance owed go "
		+ "up, silently, for a payment somebody actually made.",
	"Employee Letter": "A letter that was issued exists whether or not this row does. If it was "
		+ "issued in error, the answer is a second letter.",
};

/** Fields no form offers, on any doctype. Frappe sets these and a value typed
    over one is either ignored or wrong — `name` above all, because on most of
    these doctypes the id is composed by the naming series and on the rest it is
    a field the form already draws. */
export const NEVER_EDIT = new Set([
	"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx",
	"parent", "parentfield", "parenttype", "doctype", "_user_tags", "_comments",
	"_assign", "_liked_by", "amended_from", "naming_series",
]);

/** Whether this app installs the doctype at all. Anything else is stock, and
    this app reads stock doctypes and writes very few of them. */
export const isOurs = (doctype) => Boolean(SCHEMA[doctype]);

/**
 * May a record of this doctype be created from here?
 *
 * @returns {{ok: boolean, why: string}}
 */
export function canCreate(doctype) {
	if (NEVER_WRITE[doctype]) return { ok: false, why: NEVER_WRITE[doctype] };
	const d = SCHEMA[doctype];
	if (d && d.issingle) {
		return { ok: false, why: "A Single — there is one of it and it always exists. Edit it instead." };
	}
	if (d && d.istable) {
		return { ok: false, why: "A child table. Rows of it are created on the record that holds them." };
	}
	return { ok: true, why: "" };
}

/** May this record be changed from here? `doc` is what the site returned. */
export function canEdit(doctype, doc) {
	if (NEVER_WRITE[doctype]) return { ok: false, why: NEVER_WRITE[doctype] };
	if (SCHEMA[doctype] && SCHEMA[doctype].istable) {
		return { ok: false, why: "A child table row. Edit it on the record that holds it." };
	}
	/* Frappe's own rule, and it is absolute: a submitted document is frozen and a
	   cancelled one is history. Offering a box on either would take a value the
	   site refuses, which reads as the form being broken rather than the document
	   being final. */
	if (doc && doc.docstatus === 1) {
		return { ok: false, why: "Submitted. A submitted document is frozen — cancel it and amend, "
			+ "which keeps the original visible instead of quietly replacing it." };
	}
	if (doc && doc.docstatus === 2) {
		return { ok: false, why: "Cancelled. Amend it to make a corrected copy; the cancelled one stays." };
	}
	return { ok: true, why: "" };
}

/**
 * May this record be deleted from here, and how loudly should it ask?
 *
 * @returns {{ok: boolean, warn: string, why: string}} — `ok` false means the
 * control is not drawn and `why` says so; `ok` true with a `warn` means it is
 * drawn behind a confirmation carrying that sentence.
 */
export function canDelete(doctype, doc) {
	if (NEVER_WRITE[doctype]) return { ok: false, warn: "", why: NEVER_WRITE[doctype] };
	if (NEVER_DELETE[doctype]) return { ok: false, warn: "", why: NEVER_DELETE[doctype] };
	if (SCHEMA[doctype] && SCHEMA[doctype].issingle) {
		return { ok: false, warn: "", why: "A Single. There is one of it and it cannot be removed." };
	}
	if (doc && doc.docstatus === 1) {
		return { ok: false, warn: "",
			why: "Submitted. Cancel it first — cancelling leaves the document visible and marked, "
				+ "which is what somebody reading the history later needs." };
	}
	/* A master is the dangerous kind of delete, because nothing about the record
	   itself says how many other records name it. The site refuses a linked one,
	   so this is a warning rather than a refusal — but it is worth saying before
	   the click rather than showing a Frappe LinkExistsError afterwards. */
	if (isMaster(doctype)) {
		return { ok: true, why: "",
			warn: "This is a master. Other records name it by this id, and the site will refuse to "
				+ "remove it while any of them do. If it is unused, it will go — and anything typed "
				+ "against it later will have to use a different name." };
	}
	return { ok: true, warn: "", why: "" };
}

/** A doctype whose id *is* one of its fields — a list other records point at.

    `autoname: "field:x"` is what makes it one, and it is also why renaming
    matters: change that field and the record's id changes, which breaks every
    Link that named the old one. */
export function isMaster(doctype) {
	const d = SCHEMA[doctype];
	return Boolean(d && String(d.autoname || "").startsWith("field:"));
}

/** The field whose value names a master record, or "". */
export function namingField(doctype) {
	const d = SCHEMA[doctype];
	const a = String((d && d.autoname) || "");
	return a.startsWith("field:") ? a.slice(6) : "";
}

/** The fields a form should offer for this doctype, in the doctype's own order.

    Read-only fields are kept and drawn as text rather than dropped: a value the
    site derives is worth seeing next to the ones being typed, and a form that
    hides it invites somebody to type it into the wrong box. */
export function formFields(doctype) {
	const d = SCHEMA[doctype];
	if (!d) return [];
	return d.fields.filter((f) => !NEVER_EDIT.has(f.name) && f.kind !== "table");
}

/** What changing this field costs, where it costs something. Drawn beside the
    box, because the cost is invisible at the moment somebody is typing. */
export function fieldWarning(doctype, field) {
	if (field === namingField(doctype)) {
		return "This value is the record's id. Changing it renames the record, and every other record "
			+ "that names the old id stops resolving.";
	}
	if (field === "device_id" || field === "attendance_device_id") {
		return "Punches arrive keyed to this. Change it and the machine's next punch belongs to "
			+ "nobody — and a device id without the trusted prefix is treated as a phone and geofenced.";
	}
	if (field === "company") {
		return "Company scopes who can see this record. Moving it moves who it is visible to.";
	}
	return "";
}

/**
 * What to send for a new record: the defaults the doctype declares, and
 * nothing else.
 *
 * Not every field with a blank value — a document posted with explicit empties
 * for fields the person never saw is a document that overwrites whatever the
 * server would have derived.
 */
export function blankDoc(doctype) {
	const out = {};
	for (const f of formFields(doctype)) {
		if (f.def != null) out[f.name] = f.kind === "check" ? Number(f.def) : f.def;
	}
	return out;
}

/** Fields left empty that the site will refuse. Checked here so the refusal is
    a sentence next to the box rather than a 417 with a Frappe traceback in it —
    the site still checks, and the site is what decides. */
export function missingRequired(doctype, doc) {
	return formFields(doctype)
		.filter((f) => f.reqd && f.kind !== "readonly")
		.filter((f) => {
			const v = doc[f.name];
			return v == null || v === "" || (f.kind === "check" && false);
		})
		.map((f) => f.label);
}

/** Only what changed, and never a field the form does not offer.

    The same rule Employee Profile's editor follows, for the same two reasons: a
    whole-document write re-sends columns this reader may not write, so an edit
    to a phone number is refused over a salary field nobody touched; and it
    re-sends values that were current when the page loaded, so the second of two
    people saving quietly undoes the first everywhere they did not type. */
export function patchOf(doc, draft) {
	const same = (a, b) => String(a == null ? "" : a) === String(b == null ? "" : b);
	const patch = {};
	for (const [k, v] of Object.entries(draft || {})) {
		if (NEVER_EDIT.has(k)) continue;
		if (same(doc[k], v)) continue;
		patch[k] = v === "" ? null : v;
	}
	return patch;
}
