/**
 * The companies that get a dashboard of their own, and the address each one has.
 *
 * ## Why this is a table and not the site's company list
 *
 * It would read better to draw these from `s.companies`, which is what the site
 * actually holds. It cannot be done: `routes/router.js` builds its `known` map
 * once, from the static `MODULES` table, and memoises it — so a page that does
 * not exist at import time has no address, and a URL it would have matched
 * falls back to the front page. Routes are static here, so the list behind them
 * has to be too.
 *
 * That is not purely a constraint to work around. `docs/COMPANIES.md` records
 * that Factor HR, ERPNext and the sales app spell the same company three ways
 * and none of them join on a string match, so a list derived from whatever the
 * site happens to return is a list that silently changes shape when somebody
 * edits a name in Desk. An explicit table is refused loudly instead — a company
 * not in it simply has no page, which is visible, rather than a page that
 * quietly points at the wrong rows.
 *
 * ## Why the slug is the abbreviation and not the name
 *
 * `/dashboard/mrppl`, not `/dashboard/manna-rubber-products-private-limited`.
 * The abbreviations are the group's own — they are what ERPNext has appended to
 * every account and warehouse name since these companies were created, and
 * `docs/COMPANIES.md` lists them — so they are the one identifier here that is
 * already stable and already agreed.
 *
 * The company *name* is not stable in the same way. `Manna Treads` absorbed
 * Hi-Tech Pretreads, the UAE company is spelled two ways across two systems,
 * and a name edited in Desk would break every link anybody had saved. A slug
 * built from the name would follow it; one built from the abbreviation does not.
 *
 * ## Hi-Tech Rubber Industries is here and is not on the site
 *
 * `docs/COMPANIES.md` still has it as one of two companies to create, with
 * `HRI` proposed and unconfirmed. Its page is listed anyway and says so when
 * opened — see `companyDashboard`. A page that names the gap is how the gap
 * gets closed; leaving it off the table is how it gets forgotten.
 */

/** `label` is what the tab says. Trimmed where the registered name is long
    enough to push the other tabs off a narrow strip — the full name is on the
    page's own heading, which is where somebody checking which company they are
    looking at will read it. */
export const COMPANY_PAGES = [
	{ slug: "hri", company: "Hi-Tech Rubber Industries", label: "Hi-Tech Rubber" },
	{ slug: "mrppl", company: "Manna Rubber Products Private Limited", label: "Manna Rubber Products" },
	{ slug: "mt", company: "Manna Treads", label: "Manna Treads" },
	{ slug: "mtr", company: "Manna Tyre Retreads", label: "Manna Tyre Retreads" },
];

/** The company a dashboard slug names, or `""` for a slug with no page. */
export const companyForSlug = (slug) =>
	(COMPANY_PAGES.find((c) => c.slug === slug) || {}).company || "";
