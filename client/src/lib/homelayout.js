/* ---------------------------------------------------------------------------
   Which of the front page's two layouts somebody chose, remembered.

   The HRDashboard reference keeps this per person (its `prefs.homeV`), and so
   does this: a choice about how a screen is arranged, like whether the menu is
   collapsed (lib/rail.js), which is the one kind of thing this app keeps in the
   browser. The value lives in the store; this is only the half that outlives
   the tab.
   --------------------------------------------------------------------------- */

const KEY = "manna.home";
const KNOWN = [1, 2];
export const DEFAULT_LAYOUT = 1;

/** What is stored, or Layout 1. Never throws: a browser with site data
    blocked opens on Layout 1 rather than not opening. */
export function storedLayout() {
	try {
		const v = Number(localStorage.getItem(KEY));
		return KNOWN.includes(v) ? v : DEFAULT_LAYOUT;
	} catch {
		return DEFAULT_LAYOUT;
	}
}

/** Remember a choice and hand it back: `set({ homeLayout: saveLayout(2) })`. */
export function saveLayout(v) {
	const use = KNOWN.includes(Number(v)) ? Number(v) : DEFAULT_LAYOUT;
	try {
		localStorage.setItem(KEY, String(use));
	} catch {
		/* Honoured for this visit even when it cannot be kept. */
	}
	return use;
}
