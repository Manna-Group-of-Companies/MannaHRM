/* ---------------------------------------------------------------------------
   How wide the rail is, remembered.

   The value itself lives in the store, because the shell, the header's
   hamburger and the collapse control all read or write it and one flat store is
   how everything else in this app is shared. This file is only the half that
   outlives the tab.

   **The last per-browser preference in the app.** There was a second one until
   5 September 2026 — which palette, and then light or dark — and it lived in
   `lib/theme.js` and had to be applied before React existed, because a page
   painted in one scheme and flipped to another is a flip people notice. This
   one applies at the first render instead: late enough that the store can own
   it, and early enough that nobody sees it move.
   --------------------------------------------------------------------------- */

const KEY = "manna.rail";

/** The two states. "wide" is the list with its labels; "slim" is the icons. */
const KNOWN = ["wide", "slim"];

export const DEFAULT_RAIL = "wide";

/** What is stored, or the default. Never throws: a browser with site data
    blocked opens on the wide rail rather than not opening. */
export function storedRail() {
	try {
		const v = localStorage.getItem(KEY);
		return KNOWN.includes(v) ? v : DEFAULT_RAIL;
	} catch {
		return DEFAULT_RAIL;
	}
}

/** Remember a choice and hand it straight back, so a caller can write

        set({ rail: saveRail("slim") })

    and have the store and the browser agree by construction rather than by two
    statements somebody has to keep next to each other. */
export function saveRail(rail) {
	const use = KNOWN.includes(rail) ? rail : DEFAULT_RAIL;
	try {
		localStorage.setItem(KEY, use);
	} catch {
		/* A preference that cannot be saved is still worth honouring for this
		   visit — a browser with site data blocked gets the rail it asked for,
		   just not next time. */
	}
	return use;
}
