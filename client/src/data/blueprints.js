import { FACTOHR_MENU } from "./factohr.js";

/* ---------------------------------------------------------------------------
   An address for every one of Factor HR's menu items that has no page here
   doing the work — 106 of their 160.

   **The slug is derived, not written down.** A hand-kept list of 106 addresses
   beside a hand-kept list of 106 menu items is two lists that drift, and the
   drift shows up as a link that 404s on a page whose whole job is to prove
   nothing was left out. So the address comes from their own title, and if their
   title changes the address changes with it — which is the right failure,
   because the item has changed.

   Uniqueness is asserted in `tests/blueprints.test.js` rather than assumed:
   `Form 16` and `Form 16B` are one slug apart, and two items sharing one would
   silently hide the second.
   --------------------------------------------------------------------------- */

/** Their title as an address. Lower case, runs of anything else become one
    dash: "In/Out Count Report" → `in-out-count-report`. */
export const slugOf = (title) =>
	String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every item of theirs with nothing behind it: `{ section, slug, title }`. */
export const BLUEPRINTS = FACTOHR_MENU
	.filter((r) => !r[5])
	.map(([section, , , title]) => ({ section, slug: slugOf(title), title }));

/** The blueprints for one module. */
export const blueprintsFor = (section) => BLUEPRINTS.filter((b) => b.section === section);

/** Where one of their items lives here — the page that does the work, or the
    blueprint that says why there is not one. Every menu item has one, which is
    the property the All pages and this whole file exist for. */
export function addressFor(row) {
	const [section, , , title, , to] = row;
	return to || [section, slugOf(title)];
}
