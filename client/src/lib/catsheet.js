import { FH_CATEGORY_TYPES } from "@/data/masters";
import { catValues, ctTypes } from "@/data/categorytype";
import { download, toCsv } from "@/lib/csv";
import { todayIso } from "@/lib/format";

/* ---------------------------------------------------------------------------
   The two directions of Categories' ↑ menu, as pure functions.

   Both items on that menu used to end somewhere else: Download template wrote a
   file on the drill and was dead on the list, and Data import from file was a
   link to ERPNext's own Data Import wizard. The link is still there and still
   the right answer for a large or a delicate load — it previews, it reports its
   own errors, and it can update existing rows. What it is not is *this* screen:
   somebody looking at eight category types and wanting twelve designations in
   has to pick a doctype over there, match the columns over there, and come back
   to find out whether it worked.

   So the picker reads the sheet here, says what each row would do **before**
   anything is written, and writes only the rows that are new. Everything it
   decides is in this file, with no React and no network in it, because "would
   this row be created" is the question the whole dialog turns on and it should
   be answerable in a test.

   **Nothing here updates.** A row that matches something the site already holds
   is skipped and says so. Renaming a master renames it for everybody carrying
   it — every employee filed under that department moves with it — and that is
   not a thing a CSV somebody edited in Excel should be able to do by accident.
   Frappe's own *Update Existing Records* import is the deliberate way to do it,
   which is why the link to it stays on the menu.
   --------------------------------------------------------------------------- */

/** The columns the whole-screen template writes, and the ones the reader looks
    for. `Category Type` is what makes one file able to carry three masters —
    the drill's own template has no such column, because there it is the screen
    that says which type the rows are. */
export const CAT_SHEET_COLS = ["Category Type", "ID", "Code", "Description", "Status", "Company"];

/** The header names accepted for each column, lower-cased.

    More than one per column on purpose: a file exported from Frappe itself
    carries `department_name` where ours says `Description`, and refusing that
    file would mean refusing the one export somebody is most likely to already
    have. `name` is Frappe's word for what our template calls `ID`. */
const ALIAS = {
	type: ["category type", "category_type", "type"],
	id: ["id", "name"],
	code: ["code", "abbr"],
	desc: ["description", "desc", "value", "department_name", "designation_name", "company_name"],
	status: ["status"],
	company: ["company"],
};

/** The category types a sheet can add a value to: the three with a doctype
    behind them. Offered as the dialog's list when a file does not say which
    master its rows are for.

    Off `FH_CATEGORY_TYPES` rather than `ctTypes`, and the difference is the
    point — a category type created on this screen is a Custom Field, and its
    values are lines in that field's own options rather than documents. There is
    no record to create for one, which is why `CAT_MAKE` has no entry for it and
    why a row naming one is skipped with the reason on it. */
export const catMasters = () => FH_CATEGORY_TYPES.filter((t) => t.dt);

/** The company a name or an abbreviation refers to, or "" for neither.

    Both are accepted because both are what a person has to hand: the template
    writes the full name, and a department's own id carries the abbreviation
    glued onto the end of it. */
export function companyNamed(s, v) {
	const want = String(v || "").trim().toLowerCase();
	if (!want) return "";
	const hit = (s.companies || []).find((c) =>
		String(c.name).toLowerCase() === want || String(c.abbr || "").toLowerCase() === want);
	return hit ? hit.name : "";
}

/** What one row becomes on the site, per doctype.

    Only the two that are a name and a flag. `is_group` is said outright because
    Department is a tree and a group department is a folder rather than a place
    anybody works — left to the default it is 0 either way, and said here it
    stays 0 if that default ever changes.

    Status is only honoured where the doctype carries the field: writing
    `disabled` onto a Designation would be a 417 from the site, and a column
    that fails the whole row is worse than a column ignored. */
export const CAT_MAKE = {
	Department: (r, s) => ({
		department_name: r.desc,
		...(companyNamed(s, r.company) ? { company: companyNamed(s, r.company) } : {}),
		is_group: 0,
		...(/^disabled$/i.test(r.status || "") ? { disabled: 1 } : {}),
	}),
	Designation: (r) => ({ designation_name: r.desc }),
};

/** Why the third master is read but never written.

    A Company on ERPNext is not a row in a list. Creating one writes a chart of
    accounts, a set of warehouses, naming series and default accounts with it,
    and there is no undo that leaves the ledger as it was. Five companies exist
    and a sixth is a decision somebody takes deliberately, on the site. */
export const CAT_NO_MAKE = {
	Company: "A Company is not a row in a list here: creating one writes a whole chart of accounts, "
		+ "warehouses and naming series with it, and none of that comes back off cleanly. The company "
		+ "list is read here and added to on the site, deliberately, by somebody who means to.",
};

/** The company a department id names, read off the abbreviation ERPNext glues
    onto it — "Production - MR" is Manna Rubber's. Blank when the suffix matches
    no company here, which is the honest answer: a department named after a
    company this site does not have is a row that would import into nothing. */
function deptCompany(s, name) {
	const m = / - ([A-Za-z0-9]{2,5})$/.exec(String(name || ""));
	return m ? companyNamed(s, m[1]) : "";
}

/** Every value the site holds, across every master, as template rows.

    Filled rather than bare, for the reason the drill's template gives: a
    template of headings alone makes somebody retype a list they already have,
    and a retyped name that differs by one character is a new master rather than
    an edit to an old one. Sorted by type and then by value so a file downloaded
    twice a week apart diffs to what actually changed. */
export function templateRows(s, only) {
	/* Every type that has values, not only the three that can be written back:
	   this file is an export as well as a template, and a category created here
	   with six options in it is exactly the list somebody wants out. What comes
	   of a row on the way back in is the reader's business, and it says so per
	   row rather than by quietly leaving them out of the file. */
	const types = only ? [only] : ctTypes(s).filter((t) => t.dt || t.cf);
	const out = [];
	for (const t of types) {
		for (const r of catValues(s, t)) {
			out.push([
				t.name,
				r.name,
				r.code || "",
				r.desc,
				r.status || "",
				t.dt === "Department" ? deptCompany(s, r.name) : t.dt === "Company" ? r.desc : "",
			]);
		}
	}
	return out.sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3]));
}

/** The template as a file, for the two headers that offer one and the dialog
    that offers it a third time.

    Here rather than in either screen so all three write the same file: a
    template whose columns drift from what the reader below accepts is the one
    bug this whole arrangement has to not have. It is the only function in this
    file that touches anything — everything above it is arithmetic.

    @returns {number} how many rows went into it, which is what the screen says */
export function writeCatTemplate(s, only) {
	const rows = templateRows(s, only);
	const who = only ? only.name.toLowerCase().replace(/\s+/g, "-") + "-" : "";
	download(`categories-${who}${todayIso()}.csv`, toCsv(CAT_SHEET_COLS, rows));
	return rows.length;
}

/** One row of a sheet, read through the aliases above. Returns the plain shape
    the rest of this file works in, with everything trimmed. */
function readRow(row) {
	const got = {};
	for (const [k, v] of Object.entries(row || {})) {
		const key = String(k).trim().toLowerCase();
		for (const [field, names] of Object.entries(ALIAS)) {
			if (names.includes(key) && got[field] == null && String(v).trim() !== "") {
				got[field] = String(v).trim();
			}
		}
	}
	return { type: "", id: "", code: "", desc: "", status: "", company: "", ...got };
}

/** What the site already holds for one type, as a set of lower-cased strings —
    both the id and the tidied value, because a sheet may carry either.

    "Production - MR" and "Production" are the same department under two names,
    and a file that says the second while the site says the first must not
    create a second one. */
function heldBy(s, t) {
	const held = new Set();
	for (const r of catValues(s, t)) {
		held.add(String(r.name).trim().toLowerCase());
		held.add(String(r.desc).trim().toLowerCase());
	}
	return held;
}

/** Read a sheet against the site: what every row would do, and nothing done.

    `only` is the category type when the dialog was opened from a drill, where
    the screen already says which master these rows are. Without one, every row
    has to name its own type — which is what the whole-screen template's first
    column is for.

    Four verdicts and every row gets exactly one:

      make   a value this site does not hold, in a master that can be written
             from here. The only kind that is sent anywhere.
      have   already on the site, under this name or its id. Skipped.
      skip   a real type that cannot be written from here — Company, and the
             two pay rules. Skipped with the reason on it.
      bad    the row itself is wrong: no value in it, or a type this screen
             does not know.

    @returns {{rows: object[], make: object[], counts: object, needType: boolean}} */
export function planImport(s, rows, only) {
	/* Theirs and ours — `ctTypes`. Found on the key first and on the label after,
	   because a category type created on this screen carries a label somebody
	   chose and could perfectly well have chosen "Department". Where a label is
	   two types' label, the row is refused rather than guessed at: guessing wrong
	   there would create a real Department out of a row meant for a field.

	   The drill has neither problem — it hands its own type in as `only`, and
	   that is one object rather than a name to look up. */
	const byKey = new Map();
	const byName = new Map();
	for (const ct of ctTypes(s)) {
		byKey.set(String(ct.key).trim().toLowerCase(), ct);
		const label = ct.name.trim().toLowerCase();
		byName.set(label, (byName.get(label) || []).concat(ct));
	}
	const find = (named) => {
		const want = String(named || "").trim().toLowerCase();
		if (!want) return { t: null };
		if (byKey.has(want)) return { t: byKey.get(want) };
		const hits = byName.get(want) || [];
		if (hits.length === 1) return { t: hits[0] };
		return { t: null, many: hits.length > 1 };
	};

	const held = new Map();
	const out = [];

	(rows || []).forEach((raw, i) => {
		const r = readRow(raw);
		r.n = i + 1;
		/* The screen's own type wins over the column when the dialog was opened
		   from a drill: that screen is one master, and a file naming another is a
		   file dropped on the wrong screen rather than an instruction. */
		const named = only ? only.name : r.type;
		const { t, many } = only ? { t: only } : find(named);
		r.type = t ? t.name : named;
		r.dt = t?.dt || "";

		if (!t) {
			r.verdict = "bad";
			r.why = many
				? `More than one category type here is called “${named}” — one of theirs and one `
					+ "created on this screen. Open the one you mean with View Category and import from "
					+ "its own ↑, which says which it is without the file having to."
				: named
					? `“${named}” is not one of the category types on this screen.`
					: "No category type on the row and none chosen above, so there is nothing to say which "
						+ "master it belongs to.";
		} else if (!r.desc) {
			r.verdict = "bad";
			r.why = "No Description, which is the value itself — a master with no name is nothing.";
		} else if (t.cf) {
			r.verdict = "skip";
			r.why = "A category created on this screen is a Custom Field, and its values are lines in "
				+ "that field's own options rather than documents — so there is no record to create for "
				+ "this row. Add the value on the field itself, which View Category opens.";
		} else if (!t.dt) {
			r.verdict = "skip";
			r.why = "This one is a pay rule filed as a category over there and has no master here to "
				+ "load a row into — see View Category for what it would have to be rebuilt as.";
		} else if (CAT_NO_MAKE[t.dt]) {
			r.verdict = "skip";
			r.why = CAT_NO_MAKE[t.dt];
		} else if (!CAT_MAKE[t.dt]) {
			r.verdict = "skip";
			r.why = `Nothing here writes a ${t.dt}. Use the site's own Data Import for it.`;
		} else {
			if (!held.has(t.dt)) held.set(t.dt, heldBy(s, t));
			const have = held.get(t.dt);
			if (r.id && have.has(r.id.trim().toLowerCase())) {
				r.verdict = "have";
				r.why = "The ID column names a record the site already holds. Nothing here updates an "
					+ "existing master — see the note beside Data Import.";
			} else if (have.has(r.desc.trim().toLowerCase())) {
				r.verdict = "have";
				r.why = `The site already holds a ${t.dt} by that name.`;
			} else {
				r.verdict = "make";
				r.why = `A new ${t.dt}, created on the site as you.`;
				/* Added to the held set as it is planned, so a sheet listing the same
				   new value twice creates it once. The second is a duplicate of a row
				   in the same file, which the site would refuse anyway — but it would
				   refuse it halfway through the batch, which is a worse place to find
				   out. */
				have.add(r.desc.trim().toLowerCase());
			}
		}
		out.push(r);
	});

	const counts = { make: 0, have: 0, skip: 0, bad: 0 };
	out.forEach((r) => { counts[r.verdict] += 1; });

	return {
		rows: out,
		make: out.filter((r) => r.verdict === "make"),
		counts,
		/* Said separately from the row-by-row verdicts because it is one fact
		   about the file rather than a fault in every line of it. */
		needType: !only && (rows || []).length > 0 && out.every((r) => !r.dt),
	};
}
