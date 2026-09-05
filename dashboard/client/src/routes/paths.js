/**
 * The URL grammar, on its own, over plain data.
 *
 * Separated from `router.js` so it can be tested without a browser and without
 * pulling in every page component behind `registry.jsx` — the same bargain
 * `lib/rules.js` makes. What is left in the router is the parts that touch
 * `window`: pushState, popstate, and the document title.
 *
 * `known` throughout is `{ section: [subtab, …] }` — what pages exist. The
 * grammar needs to know that much and nothing else about them.
 */

/** The page a module opens on, and the one segment a URL leaves out. */
export const OVERVIEW = "overview";

/** Where the site opens, and where an unrecognised URL lands. */
export const DEFAULT_SECTION = "dashboard";

/**
 * The path for a page. The inverse of `parsePath`.
 *
 * `overview` gets no segment of its own: `/employees`, not
 * `/employees/overview`. A module's first page is what you get for asking for
 * the module, which is how the rail already behaves.
 */
export function pathFor(section, subtab, known) {
	if (!known[section]) return "/";
	return subtab && subtab !== OVERVIEW ? `/${section}/${subtab}` : `/${section}`;
}

/**
 * The page a path names, falling back to the front page rather than a 404.
 *
 * A URL nobody here recognises is nearly always a stale link or a typo, and the
 * honest answer to both is the front page — this site has no addresses worth
 * telling somebody they got wrong.
 *
 * `canonical` says whether the path as given is already the one `pathFor` would
 * have written, so the caller can tidy the address bar without adding a history
 * entry that back would then have to walk through.
 */
export function parsePath(pathname, known) {
	const [section = "", subtab = ""] = String(pathname || "")
		.split("/")
		.filter(Boolean)
		.map(decodeSegment);

	if (!known[section]) {
		return { section: DEFAULT_SECTION, subtab: OVERVIEW, canonical: false };
	}

	const pages = known[section];
	const page = pages.includes(subtab) ? subtab : OVERVIEW;
	return { section, subtab: page, canonical: pathname === pathFor(section, page, known) };
}

/* A malformed escape — `/employees/%` — throws out of decodeURIComponent, and
   an address bar somebody typed into is exactly where that happens. The raw
   segment then fails the lookup above and lands on the front page, which is the
   right answer for a path that means nothing. */
function decodeSegment(s) {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}
