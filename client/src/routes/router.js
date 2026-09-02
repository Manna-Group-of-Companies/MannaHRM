/**
 * URLs, because this is a website.
 *
 * ## Why this exists
 *
 * Navigation used to live entirely in the store: clicking Attendance set
 * `section`, clicking a tab set `subtab`, and the address bar said `/` the
 * whole way through. That is an app's model, and it costs three things a
 * website is expected to have — the back button did nothing, a refresh dropped
 * you on the Dashboard, and there was no way to send somebody the screen you
 * were looking at. "Open Employees → Salary Master and look at row four" is a
 * sentence nobody should have to write out.
 *
 * So the store still holds the current page, and this keeps the address bar
 * saying the same thing. One direction at a time: a click calls `navigate`,
 * which pushes the URL *and* sets the store; the back button fires `popstate`,
 * which sets the store from the URL. Neither path listens to the other, so
 * there is no loop to break.
 *
 * ## No router dependency
 *
 * `history.pushState` and one `popstate` listener. A router library earns its
 * place on nested layouts, loaders and route-level code splitting, and this has
 * a flat two-level menu that is already a table in `registry.jsx`. The proxy in
 * `server/index.js` answers any unmatched path with `index.html`, which is the
 * one piece of server support deep links need, and it was already there.
 *
 * The URL grammar itself is `paths.js`, which knows nothing about the browser
 * and is tested in `tests/paths.test.js`.
 */

import { MODULES } from "@/routes/registry";
import { set, getState } from "@/store";
import { OVERVIEW, DEFAULT_SECTION, pathFor as buildPath, parsePath } from "@/routes/paths";

export { OVERVIEW, DEFAULT_SECTION };

/* What pages exist, in the shape paths.js wants. Built once — the table is
   static, and rebuilding it per click would be work for no answer. */
const KNOWN = Object.fromEntries(
	Object.entries(MODULES).map(([key, m]) => [key, Object.keys(m.pages)]),
);

/** The path for a page. */
export const pathFor = (section, subtab) => buildPath(section, subtab, KNOWN);

/** The page a path names. */
export const routeFromPath = (pathname) => parsePath(pathname, KNOWN);

/**
 * The browser tab's title for a page.
 *
 * Named after the page rather than the site, because a person with six tabs
 * open is choosing between them on the first two words.
 */
export function titleFor(section, subtab) {
	const mod = MODULES[section];
	if (!mod) return "Manna HR";
	const page = mod.tabs.find((t) => t[0] === subtab);
	return page ? `${page[1]} · ${mod.label} · Manna HR` : `${mod.label} · Manna HR`;
}

function apply({ section, subtab }) {
	set({ section, subtab });
	document.title = titleFor(section, subtab);
}

/**
 * Go to a page: the address bar and the store, in that order.
 *
 * Clicking the page you are already on is not a history entry — otherwise back
 * would walk through six copies of the same screen.
 */
export function navigate(section, subtab = OVERVIEW) {
	const s = getState();
	if (s.section === section && s.subtab === subtab) return;
	const path = pathFor(section, subtab);
	if (window.location.pathname !== path) window.history.pushState({}, "", path);
	apply({ section, subtab });
}

/**
 * `set()` for a patch that also moves to another page.
 *
 * A drop-in for the `set({ …, subtab: "all" })` calls scattered through the
 * report screens: they change some state *and* move, and doing that with a bare
 * `set` now leaves the address bar pointing at the page you just left.
 * Everything that is not `section` or `subtab` is applied first, so the page it
 * navigates to renders once, already holding it.
 */
export function go(patch) {
	const s = getState();
	const { section = s.section, subtab = OVERVIEW, ...rest } = patch;
	if (Object.keys(rest).length) set(rest);
	navigate(section, subtab);
}

/**
 * Read the URL into the store and keep the two in step. Returns the cleanup.
 *
 * Called once, from App. The first read is what makes a refresh land where it
 * was rather than on the Dashboard.
 */
export function startRouter() {
	const first = routeFromPath(window.location.pathname);
	/* Tidy `/employees/overview`, and anything unrecognised, to the path this
	   would have written — with `replace` so back still leaves the site rather
	   than bouncing between two spellings of one page. */
	if (!first.canonical) {
		window.history.replaceState({}, "", pathFor(first.section, first.subtab));
	}
	apply(first);

	const onPop = () => apply(routeFromPath(window.location.pathname));
	window.addEventListener("popstate", onPop);
	return () => window.removeEventListener("popstate", onPop);
}
