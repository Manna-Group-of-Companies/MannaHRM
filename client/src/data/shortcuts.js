/* ---------------------------------------------------------------------------
   The keyboard shortcuts beyond "/" and Ctrl+K (21 October 2026, asked for by
   HR): the HRDashboard reference's own keys, for the pages this app has. No
   `g m` — there are no messages here (D12) — and `n` only where a page makes a
   new one. Help center → Keyboard shortcuts lists them from SHORTCUTS in
   features/help/NotesHelp.jsx; tests/shortcuts.test.jsx holds the two together.

   Bound by layout/Shortcuts.jsx. A key goes nowhere a login is not shown —
   the same `shown` the side menu draws from — so a shortcut is never a way
   round the menu.
   --------------------------------------------------------------------------- */

/** `g` then a letter: the module it opens, on the first page this login sees. */
export const GO_KEYS = {
	d: "dashboard", e: "employees", t: "leave", a: "attendance", p: "payroll", r: "recruitment",
	o: "documents", n: "news", x: "reports", c: "checklist", s: "settings", h: "help",
};

/** `n` on a module: the page there that makes a new one. */
export const NEW_KEYS = { employees: "new", news: "new", recruitment: "new" };

/** How long `g` waits for its letter — the reference's. */
export const G_WAIT = 1200;

/** Whether a key press is somebody typing, or is meant for a window that is
    open, rather than for the page under it. */
export function typing(target) {
	return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog'], .modal, .goto"));
}

/**
 * Where a key goes, as `[section, subtab]`, or null for a key that is not a
 * shortcut here.
 *
 * @param {string} key        the key pressed
 * @param {object} at
 * @param {boolean} at.gPending  `g` was pressed less than G_WAIT ago
 * @param {string} at.section    the module open now
 * @param {(s: string) => boolean} at.can        whether this login is shown a module
 * @param {(s: string) => string} at.first       that module's first page for this login
 * @param {(s: string) => boolean} at.mayCreate  whether this login may make one there
 */
export function keyTarget(key, { gPending, section, can, first, mayCreate }) {
	if (gPending) {
		const to = GO_KEYS[String(key).toLowerCase()];
		return to && can(to) ? [to, first(to)] : null;
	}
	if (key === "?") return can("help") ? ["help", "shortcuts"] : null;
	if (key === "n" && NEW_KEYS[section] && can(section) && mayCreate(section)) return [section, NEW_KEYS[section]];
	return null;
}
