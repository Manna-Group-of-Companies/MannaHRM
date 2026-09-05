/* ---------------------------------------------------------------------------
   Which palette the app is wearing.

   The palettes themselves are `styles/themes.css` — three blocks of custom
   properties, keyed by a `data-theme` attribute on `<html>`. All this file does
   is decide which one is on, remember it, and put the attribute there.

   Deliberately outside the store. It is one string, it is per-browser rather
   than per-session, and a re-render must never be able to change it: repainting
   the whole interface because a filter changed is the one behaviour a theme
   switch must not have. Reading it also has to work before React mounts — see
   `applyStoredTheme`, which runs from `main.jsx` — because a page that paints
   in blue and then flips to graphite on hydrate is worse than one that took a
   moment longer to appear.
   --------------------------------------------------------------------------- */

/** The palettes, in the order a picker should offer them. `id` is the
    `data-theme` value; `note` is what the choice actually changes, because
    "Graphite" on its own tells nobody anything. */
export const THEMES = [
	{
		id: "harbour",
		name: "Harbour",
		note: "Blue and white. The default, and the one the screen copies were built against.",
	},
	{
		id: "graphite",
		name: "Graphite",
		note: "Neutral slate chrome with teal as the only accent — status colours read louder "
			+ "because they are the only other hues on the screen.",
	},
	{
		id: "ember",
		name: "Ember",
		note: "The warm charcoal and burnt orange the app started in, brought back at full "
			+ "contrast. The logo's orange stays the logo's; the interface uses a deeper ramp.",
	},
	{
		id: "iris",
		name: "Iris",
		note: "Indigo-violet on a plum-tinted stone. The one saturated hue no status token "
			+ "uses, so a control can never be mistaken for a state.",
	},
];

const KEY = "manna.theme";
export const DEFAULT_THEME = "harbour";

const known = (id) => THEMES.some((t) => t.id === id);

/** What is stored, or the default. Never throws: a browser with site data
    blocked reports the default rather than taking the page down over a
    preference. */
export function storedTheme() {
	try {
		const v = localStorage.getItem(KEY);
		return known(v) ? v : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

/** Put a palette on. Returns the id actually applied, which is the default if
    it was handed something it does not have — an unknown name would otherwise
    leave `data-theme` set to nothing the stylesheet answers, and the app would
    paint in whatever `:root` happens to hold. */
export function applyTheme(id) {
	const use = known(id) ? id : DEFAULT_THEME;
	document.documentElement.dataset.theme = use;
	try {
		localStorage.setItem(KEY, use);
	} catch {
		/* A preference that cannot be saved is still a preference worth honouring
		   for this visit. */
	}
	return use;
}

/** Called once, before React mounts. */
export function applyStoredTheme() {
	const use = storedTheme();
	document.documentElement.dataset.theme = use;
	return use;
}
