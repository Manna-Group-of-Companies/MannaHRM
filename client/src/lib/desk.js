/* ---------------------------------------------------------------------------
   Where a document lives on the ERPNext site.

   Most Add / Edit / Delete / Import on this dashboard is a write it does not
   make. The rules that guard those writes are on the site (CLAUDE.md §1), and a
   form here would be a second, thinner copy of a form that already exists. So
   rather than sitting dead, each of those controls opens the same job over
   there, where the validation that guards it runs.

   These are the desk routes, and nothing here calls the site: a link needs no
   session and no permission at all. Which is the point — the controls that
   write can all work without a single write path being built.
   --------------------------------------------------------------------------- */

/** Frappe's desk route for a doctype: "Holiday List" → "holiday-list". */
export const deskSlug = (dt) => String(dt).trim().toLowerCase().replace(/\s+/g, "-");

/** One document, or the list when `name` is not given. */
export function deskUrl(site, dt, name) {
	const base = site + "/app/" + deskSlug(dt);
	return name == null ? base : base + "/" + encodeURIComponent(name);
}

/** An empty document of that type, ready to fill in. `new` is a route Frappe's
    router handles itself — it makes the draft and names it. */
export const deskNew = (site, dt) => deskUrl(site, dt, "new");

/** An empty document with some of it already filled in.

    Frappe's `new` route reads its query string as defaults for the document it
    is about to make, which is what lets a form on this side hand its values to
    the form on that side instead of asking somebody to type them twice.

    Empty values are dropped rather than sent through. `?remarks=` is not the
    same request as leaving `remarks` out: it sets the field to an empty string
    and overrides whatever default the doctype carries for it. */
export function deskNewWith(site, dt, values) {
	const p = new URLSearchParams();
	Object.entries(values || {}).forEach(([k, v]) => {
		if (v != null && String(v) !== "") p.set(k, String(v));
	});
	const q = p.toString();
	return q ? deskNew(site, dt) + "?" + q : deskNew(site, dt);
}

/** The Data Import wizard. It is one doctype, whatever is being imported, and
    the doctype to load into is the first thing it asks for — which is why the
    caller does not pass one. */
export const deskImport = (site) => deskNew(site, "Data Import");

/** Frappe's **Customize Form**, for one doctype.

    The route a *standard* field's properties are changed on. Its label, whether
    it is mandatory, whether it is hidden, whether it appears in the filter bar
    — every one of those is a `Property Setter` on the site, and Customize Form
    is the screen that writes them.

    This is the destination for editing a category type that already maps onto a
    field, and it is a different route from `deskNew(site, "Custom Field")`,
    which is where a category type with *no* field on this side goes. Getting
    those two the wrong way round adds a second `department` field to Employee
    beside the one that is already there — which imports, reports and reads as a
    real field right up until somebody notices half the company is filed under
    one of them. */
export const deskCustomize = (site, dt) =>
	site + "/app/customize-form?doc_type=" + encodeURIComponent(dt);
