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
 * a flat two-level menu that is already a table in `registry.jsx`.
 *
 * Deep links need one thing from whatever serves this bundle: any unmatched
 * path has to answer with `index.html`. Vite's dev server does it by default;
 * in production it is the `website_route_rules` entry in `manna_hr/hooks.py`.
 *
 * The URL grammar itself is `paths.js`, which knows nothing about the browser
 * and is tested in `tests/paths.test.js`.
 *
 * ## Where the app is mounted
 *
 * On the site this bundle is served under a prefix — `/hr` — because the origin
 * it shares with the API is the desk's, and `/employees` at the root of a
 * Frappe site is a route Frappe may want for itself. The prefix is the boundary
 * between the browser's idea of the address and this app's, so it is added and
 * removed here and nowhere else: `paths.js` never sees it, every page is still
 * written `/employees/salary-master`, and the 93 tests over that grammar do not
 * know this exists.
 *
 * `VITE_ROUTE_BASE` names it. Empty in development, where Vite serves this at
 * the root — which is why it has to be read rather than hard-coded, and why it
 * is normalised here rather than trusted: a value of `/hr/`, `hr` or `/hr`
 * should all mean the same thing, and the one that gets typed is whichever the
 * person writing the `.env` reached for.
 */

import { MODULES } from "@/routes/registry";
import { set, getState } from "@/store";
import { OVERVIEW, DEFAULT_SECTION, pathFor as buildPath, parsePath } from "@/routes/paths";

export { OVERVIEW, DEFAULT_SECTION };

/* What pages exist, in the shape paths.js wants. Built once on first use — the
   table is static, and rebuilding it per click would be work for no answer.

   **On first use rather than at import, and that is not a micro-optimisation.**
   `registry.jsx` imports every page component, and two of those import this
   file back for `navigate` — `openEmployee.js` and the rail. So there is an
   import cycle, and at the moment this module is first evaluated `MODULES` is
   either the finished table or `undefined`, depending purely on which of the
   two the entry point reached first. It worked because `App.jsx` happens to
   import `routes/router` before `layout/AppShell`; reordering those two lines,
   or importing `registry` from anywhere new, turned it into a white screen and
   a `Cannot convert undefined or null to object` at load.

   Reading it lazily removes the ordering from the question: by the time
   anything asks for a path, both modules have finished. Found by
   tests/pages.test.jsx, which imports `registry` first and so hit the branch
   the browser never did. */
let known = null;

function knownPages() {
	if (!known) {
		known = Object.fromEntries(
			Object.entries(MODULES).map(([key, m]) => [key, Object.keys(m.pages)]),
		);
	}
	return known;
}

/** Where this app is mounted on the origin it shares with the site, with no
    trailing slash — `/hr`, or `""` when it is served at the root. */
export const MOUNT = String(import.meta.env.VITE_ROUTE_BASE || "")
	.trim()
	/* Both spellings of every value mean one thing: a leading slash is put on
	   whether or not it was typed, and a trailing one is taken off. `/` alone
	   falls out as `""`, which is the root and is what development wants. */
	.replace(/^\/*/, "/")
	.replace(/\/+$/, "");

/** The path for a page, as the browser should see it. */
export const pathFor = (section, subtab) => MOUNT + buildPath(section, subtab, knownPages());

/** The page a path names, with the mount taken off first.

    A path that is not under the mount at all still resolves rather than
    erroring — `parsePath` falls back to the front page for anything it does not
    recognise, and this site has no addresses worth telling somebody they got
    wrong. */
export const routeFromPath = (pathname) => parsePath(unmount(pathname), knownPages());

/** `/hr/employees` → `/employees`. `/hr` → `/`, because the mount on its own is
    the front page and not a section called nothing. */
function unmount(pathname) {
	const p = String(pathname || "/");
	if (!MOUNT) return p;
	if (p === MOUNT) return "/";
	return p.startsWith(MOUNT + "/") ? p.slice(MOUNT.length) : p;
}

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
