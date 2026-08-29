/* ---------------------------------------------------------------------------
   Where a document lives on the ERPNext site.

   Every Add / Edit / Delete / Import on this dashboard is a write, and this
   dashboard reads — the token is in the proxy and the rules are on the site
   (CLAUDE.md §1). So rather than sitting dead, each of those controls opens the
   same job over there, in the one place it can actually be done and where the
   validation that guards it runs.

   These are the desk routes, and nothing here calls the site: a link needs no
   proxy, no allowlist and no token. Which is the point — the controls that
   write can all work without opening a single write path.
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

/** The Data Import wizard. It is one doctype, whatever is being imported, and
    the doctype to load into is the first thing it asks for — which is why the
    caller does not pass one. */
export const deskImport = (site) => deskNew(site, "Data Import");
