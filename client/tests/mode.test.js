import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_MODE, applyMode, modeIcon, modeLabel, nextMode, paletteFor, saveMode, storedMode,
	systemMode, watchSystem,
} from "@/lib/mode";

/* ---------------------------------------------------------------------------
   Light, dark, or whatever the machine says.

   The app was dark and only dark until 8 September 2026. That was the right
   call for a screen somebody glances at and the wrong one for the screen HR has
   open from nine to six in a room with a window behind them — Factor HR is
   light, and a dark app beside a light one is the difference between reading
   and squinting.

   **Three states, and `system` is a real answer rather than the absence of
   one.** That is what most of these tests are about: somebody who has never
   touched the control gets what their machine asks for and keeps following it,
   so an app opened at nine in a bright office is dark by seven without anybody
   going and asking for it.
   --------------------------------------------------------------------------- */

let dark = false;
const listeners = [];

beforeEach(() => {
	dark = false;
	listeners.length = 0;
	localStorage.clear();
	document.documentElement.removeAttribute("data-mode");
	vi.stubGlobal("matchMedia", (q) => ({
		matches: q.includes("dark") && dark,
		addEventListener: (_, fn) => listeners.push(fn),
		removeEventListener: (_, fn) => {
			const i = listeners.indexOf(fn);
			if (i >= 0) listeners.splice(i, 1);
		},
	}));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("what somebody gets before they have chosen", () => {
	it("starts on the machine's own setting", () => {
		expect(storedMode()).toBe(DEFAULT_MODE);
		expect(DEFAULT_MODE).toBe("system");
	});

	it("reads a light machine as light and a dark one as dark", () => {
		expect(systemMode()).toBe("light");
		dark = true;
		expect(systemMode()).toBe("dark");
	});

	it("falls back to light where the browser will not say", () => {
		// The safer miss: a light app in a dark room is uncomfortable, and a dark
		// app in a lit room is unreadable.
		vi.stubGlobal("matchMedia", () => { throw new Error("no matchMedia"); });
		expect(systemMode()).toBe("light");
	});
});

describe("what reaches the page", () => {
	it("writes the attribute for light", () => {
		expect(applyMode("light")).toBe("light");
		expect(document.documentElement.getAttribute("data-mode")).toBe("light");
	});

	it("writes no attribute for dark, because :root is already dark", () => {
		// A second selector saying the same thing is a second place for it to
		// drift. See the note at the top of themes.css.
		applyMode("light");
		expect(applyMode("dark")).toBe("dark");
		expect(document.documentElement.hasAttribute("data-mode")).toBe(false);
	});

	it("resolves `system` to whatever the machine is asking for", () => {
		expect(paletteFor("system")).toBe("light");
		dark = true;
		expect(paletteFor("system")).toBe("dark");
	});
});

describe("choosing one", () => {
	it("remembers the choice and applies it in the same call", () => {
		// So a caller can write `set({ mode: saveMode("light") })` and have the
		// store, the browser and the page agree by construction.
		expect(saveMode("light")).toBe("light");
		expect(storedMode()).toBe("light");
		expect(document.documentElement.getAttribute("data-mode")).toBe("light");
	});

	it("ignores a value that is not one of the three", () => {
		saveMode("neon");
		expect(storedMode()).toBe("system");
	});

	it("honours the choice for this visit even when it cannot be saved", () => {
		// A browser with site data blocked gets the palette it asked for, just
		// not next time.
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = () => { throw new Error("blocked"); };
		expect(saveMode("light")).toBe("light");
		expect(document.documentElement.getAttribute("data-mode")).toBe("light");
		Storage.prototype.setItem = setItem;
	});

	it("cycles system → light → dark → system on one button", () => {
		// Three radio buttons for a thing most people press once is three times
		// the toolbar for the same answer. The cycle starts at system, so the
		// first press goes to light — what somebody in a lit room wants.
		expect(nextMode("system")).toBe("light");
		expect(nextMode("light")).toBe("dark");
		expect(nextMode("dark")).toBe("system");
	});

	it("says what it is, in words rather than only an icon", () => {
		expect(modeLabel("system")).toBe("Match my device");
		expect(modeLabel("light")).toBe("Light");
		expect(modeIcon("dark")).toBeTruthy();
	});
});

describe("following the machine", () => {
	it("changes with the machine while the choice is `system`", () => {
		const seen = [];
		watchSystem(() => "system", (p) => seen.push(p));
		dark = true;
		listeners.forEach((fn) => fn());
		expect(seen).toEqual(["dark"]);
	});

	it("stops following the moment somebody has picked for themselves", () => {
		const seen = [];
		watchSystem(() => "light", (p) => seen.push(p));
		dark = true;
		listeners.forEach((fn) => fn());
		expect(seen).toEqual([]);
	});

	it("unsubscribes cleanly", () => {
		const off = watchSystem(() => "system", () => {});
		expect(listeners).toHaveLength(1);
		off();
		expect(listeners).toHaveLength(0);
	});
});
