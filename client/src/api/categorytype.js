import { apiCreate, listAll } from "@/api/client";
import { set } from "@/store";
import { CT_CF_FIELDS, CT_CF_FILTER, ctDoc } from "@/data/categorytype";

/* ---------------------------------------------------------------------------
   Employees → Categories: the category types this site holds, and creating one.

   A category type here is a `Custom Field` on Employee — the mapping and the
   argument for it are at the top of data/categorytype.js. So this file is two
   calls: read the fields, and create one.

   ## Creating one is a schema change, and it is done as the person

   Adding a field changes the shape of every Employee record on the site, which
   is a bigger act than any other write this dashboard makes. It is still the
   site that decides: the request carries the person's own session, and Frappe
   refuses a `Custom Field` insert from anyone without System Manager. There is
   no check of that here, and there must not be — a rule enforced in a browser
   is a suggestion to anyone holding `curl` (CLAUDE.md §1), and one written here
   as well would be a second place for it to be half-stated.

   What this file does owe the person is the *refusal*, in their words rather
   than as a silent no-op. `apiCreate` throws and the dialog prints what the
   site said.

   ## The read may be refused on its own

   `Custom Field` is System Manager's doctype to read as well as to write, so an
   HR User signing in sees the eight rows of Factor HR's master and none of
   ours. That is a different finding from a site with no categories on it, so
   the state is carried alongside the rows instead of being inferred from an
   empty list — the screen says which of the two happened.
   --------------------------------------------------------------------------- */

/** Every category type this site holds, into the store.

    Never fatal and never throws: the Categories screen is readable without it,
    and a session that may not read `Custom Field` must not take the dashboard
    down on the way past. */
export async function loadCategoryTypes() {
	set({ empFieldsState: "loading" });
	try {
		const rows = await listAll("Custom Field", CT_CF_FIELDS, CT_CF_FILTER);
		set({ empFields: rows || [], empFieldsState: "ok" });
		return rows || [];
	} catch (e) {
		/* The rows are left as they were rather than blanked. A refreshed read
		   that fails should not empty a list somebody is looking at. */
		set({ empFieldsState: e && e.status === 403 ? "denied" : "bad" });
		return null;
	}
}

/** Create one, then read the list back.

    Read back rather than pushed locally, because the site names the document
    and may normalise the fieldname, and a row invented here that disagrees with
    the site by one character is a row that looks right until somebody clicks
    it. Throws what the site said. */
export async function createCategoryType(f, values, description) {
	const made = await apiCreate("Custom Field", ctDoc(f, values, description));
	await loadCategoryTypes();
	return made;
}
