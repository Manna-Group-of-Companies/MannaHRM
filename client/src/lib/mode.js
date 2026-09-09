/* ---------------------------------------------------------------------------
   Light or dark, remembered.

   Same bargain as `lib/rail.js`: one small module that owns a preference, and
   nothing else in the app touches `localStorage` or the attribute directly.

   **Three states, not two.** `system` is the default and is a real answer, not
   the absence of one: somebody who has never touched the control gets whatever
   their machine asks for, and follows it when their machine changes at sunset.
   `light` and `dark` are a person overriding that, on this browser, for good.

   The attribute goes on `<html>` — `themes.css` styles `[data-mode="light"]`
   after `:root`, and source order is the whole cascade there, so writing it
   anywhere lower would leave the palette declared underneath still winning.
   That happened before, on the palette picker this app shipped for a week with;
   the note at the top of `themes.css` records it.
   --------------------------------------------------------------------------- */

const KEY = "manna.mode";
const KNOWN = ["system", "light", "dark"];
export const DEFAULT_MODE = "system";

/** What the operating system is asking for. Dark only when it says so: a
    browser with no `matchMedia` at all, or one that refuses the query, gets
    light — which is the safer miss, because a light app in a dark room is
    uncomfortable and a dark app in a lit room is unreadable. */
export function systemMode() {
	try {
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	} catch {
		return "light";
	}
}

/** The stored choice, or `system`. */
export function storedMode() {
	try {
		const v = localStorage.getItem(KEY);
		return KNOWN.includes(v) ? v : DEFAULT_MODE;
	} catch {
		return DEFAULT_MODE;
	}
}

/** Which palette a choice resolves to right now. */
export const paletteFor = (mode) => (mode === "system" ? systemMode() : mode);

/** Put the palette on `<html>`.

    Dark is the absence of the attribute rather than `data-mode="dark"`, because
    `:root` in `themes.css` *is* dark — a second selector saying the same thing
    is a second place for it to drift. */
export function applyMode(mode) {
	const palette = paletteFor(mode);
	try {
		const root = document.documentElement;
		if (palette === "light") root.setAttribute("data-mode", "light");
		else root.removeAttribute("data-mode");
	} catch { /* no document: a test importing this for its arithmetic */ }
	return palette;
}

/** Remember a choice, apply it, and hand it back — so a caller can write

        set({ mode: saveMode("light") })

    and have the store, the browser and the page agree by construction rather
    than by three statements somebody has to keep next to each other. */
export function saveMode(mode) {
	const use = KNOWN.includes(mode) ? mode : DEFAULT_MODE;
	try {
		localStorage.setItem(KEY, use);
	} catch {
		/* A preference that cannot be saved is still worth honouring for this
		   visit — a browser with site data blocked gets the palette it asked
		   for, just not next time. */
	}
	applyMode(use);
	return use;
}

/** The next mode in the cycle, for a single button rather than three.

    `system → light → dark → system`. One control, because three radio buttons
    for a thing most people will press once is three times the toolbar for the
    same answer — and the cycle starts at `system`, so the first press moves to
    light, which is what somebody pressing it in a lit room wants. */
export const nextMode = (mode) =>
	({ system: "light", light: "dark", dark: "system" })[mode] || "light";

/** What the button should say it is. */
export const modeLabel = (mode) =>
	({ system: "Match my device", light: "Light", dark: "Dark" })[mode] || "Light";

export const modeIcon = (mode) => ({ system: "🖥", light: "☀", dark: "🌙" })[mode] || "☀";

/** Follow the operating system while the choice is `system`, and stop the
    moment somebody picks for themselves.

    Returns the unsubscribe. Without this, a person on `system` who opened the
    app at four and is still on it at seven has a light app in a dark room —
    which is the exact complaint the palette exists to answer. */
export function watchSystem(getMode, onChange) {
	try {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const fire = () => { if (getMode() === "system") onChange(applyMode("system")); };
		mq.addEventListener("change", fire);
		return () => mq.removeEventListener("change", fire);
	} catch {
		return () => {};
	}
}
