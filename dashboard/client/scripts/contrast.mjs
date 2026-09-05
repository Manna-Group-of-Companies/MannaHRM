/* ---------------------------------------------------------------------------
   Every palette, against every pairing these screens actually put together.

   Run with `npm run contrast` in `client/`. Exits non-zero on a failure, so it
   can sit in CI beside the build.

   **It reads `src/styles/themes.css` rather than a copy of the values.** A
   checker with its own table of colours is a checker that passes after somebody
   edits the palette and forgets to edit the checker, which is the one failure
   mode that makes an accessibility check worse than none.

   What it does not check, and cannot: whether a colour is used where the pair
   says it is. It knows `ink-3` on `page` must clear 4.5:1 because that is what
   the tokens are named for. If somebody puts `text-ink-3` on a `brand-dark`
   fill, this will not notice. The pairs below are the contract; the class names
   are where it could still be broken.
   --------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEMES_CSS = path.resolve(HERE, "../src/styles/themes.css");

/* ----------------------------------------------------------------- parsing */

/** `[data-theme="ember"] { --brand: 194 65 12; ... }` → {ember: {brand: [...]}}.
    `:root` is read as the default palette and merged into whatever selector it
    shares a block with, which is how harbour is declared. */
function parseThemes(css) {
	const themes = {};
	/* Comments out first. A `{` inside one would split a block in half, and the
	   half without the selector reads as a palette with no name. */
	const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
	/* No leading `}` in this pattern on purpose: consuming the closing brace as
	   one block's delimiter leaves the next block without one, and every second
	   palette goes silently unchecked. */
	const block = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ((m = block.exec(clean)) !== null) {
		const selectors = m[1];
		const body = m[2];
		if (!body.includes("--")) continue;

		const names = [];
		for (const sel of selectors.split(",")) {
			const s = sel.trim();
			if (s === ":root") names.push("harbour");
			const attr = /\[data-theme="([^"]+)"\]/.exec(s);
			if (attr) names.push(attr[1]);
		}
		if (!names.length) continue;

		const tokens = {};
		const decl = /--([a-z0-9-]+)\s*:\s*([0-9]{1,3})\s+([0-9]{1,3})\s+([0-9]{1,3})\s*;/g;
		let d;
		while ((d = decl.exec(body)) !== null) {
			tokens[d[1]] = [Number(d[2]), Number(d[3]), Number(d[4])];
		}
		for (const n of new Set(names)) {
			themes[n] = { ...(themes[n] || {}), ...tokens };
		}
	}
	return themes;
}

/* ------------------------------------------------------------------- maths */

const channel = (c) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function ratio(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}
const WHITE = [255, 255, 255];

/* ------------------------------------------------------------------- pairs */

/** The surfaces a panel, a row or a label can sit on. `need` is the fill behind
    a box a form is waiting on — it holds typed text, so it is a surface here
    rather than decoration, and every colour that can land on one has to be
    readable on it. */
const SURFACES = ["card", "page", "wash", "rule", "need"];

/** Text that must be readable on any of them. AA body text: 4.5:1. */
const TEXT = ["ink", "ink-2", "ink-3", "accent", "brand-dark", "brand-deep",
	"live", "bad", "skip", "part", "bad-deep"];

/** A status colour on its own wash — a chip, a coverage tag, a refusal notice. */
const ON_WASH = [
	["live", "live-wash"], ["bad", "bad-wash"], ["skip", "skip-wash"],
	["part", "part-wash"], ["accent", "accent-wash"],
	["brand-deep", "brand-soft"], ["accent", "brand-soft"],
	["bad-deep", "bad-wash"], ["bad-deep", "bad-faint"],
];

/** Every fill this app puts white text on. */
const WHITE_ON = ["brand-dark", "brand-deep", "live", "live-dark", "char", "nav", "nav-2", "bad",
	"accent", "rest"];

/** Non-text, WCAG 1.4.11: 3:1. Only things that carry meaning — the edge of a
    control somebody has to find, the rail's current-page marker, the status
    beacons on the top bar. Dividers (`line`, `line-2`) and the empty half of a
    coverage bar (`track`) are deliberately not here: they are decoration, and
    holding them to 3:1 would mean a screen of forty boxes with heavy edges. */
const NON_TEXT = [
	["line-ctl", "card"], ["line-ctl", "page"], ["line-ctl", "wash"], ["line-ctl", "rule"],
	["brand-lift", "nav"], ["brand-lift", "nav-2"], ["brand", "card"],
	["beacon", "nav"], ["beacon-live", "nav"], ["beacon-bad", "nav"],
];

/** Text on the dark chrome. */
const ON_CHROME = [["nav-ink", "nav"], ["nav-ink", "nav-2"], ["nav-ink", "nav-3"]];

/* --------------------------------------------------------------------- run */

const css = fs.readFileSync(THEMES_CSS, "utf8");
const themes = parseThemes(css);
const names = Object.keys(themes);

if (!names.length) {
	console.error("No palettes found in", THEMES_CSS);
	process.exit(1);
}

let failed = 0;
const pad = (s, n) => String(s).padEnd(n);

for (const name of names) {
	const T = themes[name];
	const bad = [];
	const check = (aName, bName, min, why) => {
		const a = aName === "white" ? WHITE : T[aName];
		const b = bName === "white" ? WHITE : T[bName];
		if (!a || !b) {
			bad.push(`${aName} / ${bName} — token missing from this palette`);
			return;
		}
		const r = ratio(a, b);
		if (r < min) bad.push(`${pad(aName + " on " + bName, 30)} ${r.toFixed(2)} — needs ${min} (${why})`);
	};

	for (const t of TEXT) for (const s of SURFACES) check(t, s, 4.5, "body text");
	for (const [t, w] of ON_WASH) check(t, w, 4.5, "status text on its wash");
	for (const f of WHITE_ON) check("white", f, 4.5, "white on a filled control");
	for (const [a, b] of NON_TEXT) check(a, b, 3, "non-text, 1.4.11");
	for (const [a, b] of ON_CHROME) check(a, b, 4.5, "text on chrome");

	const tokens = Object.keys(T).length;
	if (bad.length) {
		failed += bad.length;
		console.log(`\n✗ ${name}  (${tokens} tokens)  ${bad.length} failing`);
		for (const line of bad) console.log("    " + line);
	} else {
		console.log(`✓ ${pad(name, 10)} ${tokens} tokens — every pairing clears AA`);
	}
}

/* A palette missing a token the others have is the commonest way one of these
   breaks: the app falls back to whatever `:root` held, which is another
   palette's colour, and the result is usually legible enough not to be noticed. */
const shapes = new Map();
for (const n of names) shapes.set(n, new Set(Object.keys(themes[n])));
const reference = shapes.get(names[0]);
for (const [n, keys] of shapes) {
	const missing = [...reference].filter((k) => !keys.has(k));
	const extra = [...keys].filter((k) => !reference.has(k));
	if (missing.length || extra.length) {
		failed++;
		console.log(`\n✗ ${n} does not carry the same tokens as ${names[0]}`);
		if (missing.length) console.log("    missing:", missing.join(", "));
		if (extra.length) console.log("    extra:  ", extra.join(", "));
	}
}

console.log(failed ? `\n${failed} failure(s).` : `\nAll ${names.length} palettes pass.`);
process.exit(failed ? 1 : 0);
