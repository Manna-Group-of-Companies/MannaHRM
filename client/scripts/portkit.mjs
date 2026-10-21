/* ---------------------------------------------------------------------------
   The HRDashboard reference's stylesheet, ported to this app.

       node scripts/portkit.mjs      # writes src/styles/kit.css

   docs/design/hrdashboard-reference.html is the app this client is rebuilt to
   look like (asked for 21 October 2026), and the ask was its CSS "copied
   exactly". This script is that copy, done the same way every time so the
   result can be regenerated rather than hand-edited and drifting:

   1. **Every class gets a `k-` prefix.** The reference calls things `.card`,
      `.btn`, `.pill`, `.stat`, `.legend`, `.tile` — and so do forty of this
      app's pages that have not been rebuilt yet. Prefixed, a rebuilt page
      draws in the reference's rules and an old one keeps its own, with no
      rule from either reaching the other. Keyframes are prefixed the same
      way, and every `animation` that names one follows.
   2. **Its colours become this app's roles.** Its `--surface` is `card`, its
      `--muted` is `ink-2`, and so on (`VARS` below), so its pages follow the
      palette and the light / dark switch like everything else, and
      `npm run contrast` checks what they draw. Three of its colours do two
      jobs and are split by what the rule does with them — see `colourFor`.
   3. **Element rules are scoped to a rebuilt page.** Its `table`, `th`, `td`
      rules would restyle every old table in the app, so they apply only
      inside `.kit`, the root every rebuilt page draws in.
   4. **What this app already has is left out:** the palette blocks (that is
      themes.css), the page's base rules (index.css's base layer) and the
      menu, header and bottom bar (index.css's shell block, written for this
      app's markup).

   The output says it is generated. A change to how the reference looks here
   is a change to this script or to the reference, never to kit.css.
   --------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const REF = path.resolve(HERE, "../../docs/design/hrdashboard-reference.html");
const OUT = path.resolve(HERE, "../src/styles/kit.css");

/* The reference's variables, as this app's roles. */
const VARS = {
	"--bg": "rgb(var(--page))",
	"--surface": "rgb(var(--card))",
	"--surface-2": "rgb(var(--wash))",
	"--line": "rgb(var(--line))",
	"--line-2": "rgb(var(--line-2))",
	"--text": "rgb(var(--ink))",
	"--muted": "rgb(var(--ink-2))",
	"--green-soft": "rgb(var(--brand-soft))",
	"--green-ink": "rgb(var(--accent))",
	"--green-glow": "rgb(var(--brand) / .34)",
	"--red": "rgb(var(--bad-fill))",
	"--red-ink": "rgb(var(--bad))",
	"--red-soft": "rgb(var(--bad-wash))",
	/* Its yellow is a mark on white (a star) and fails 3:1 there; the chart's
	   third hue is the same yellow stepped until it passes. */
	"--yellow": "rgb(var(--chart-3))",
	"--yellow-soft": "rgb(var(--part-wash))",
	"--yellow-ink": "rgb(var(--part))",
	"--blue-soft": "rgb(var(--info-wash))",
	"--blue-ink": "rgb(var(--info-ink))",
	"--ink": "rgb(var(--brand-dark))",
	"--ink-text": "rgb(var(--on-brand))",
	"--shadow": "var(--sh-raise)",
	"--shadow-lg": "var(--sh-pop)",
	"--overlay": "var(--overlay)",
	"--ease": "var(--ease-out)",
};

/** The three that do two jobs, decided by the rule they are in.

    `--green` is a fill with white text on it (a green button, a checked tick,
    an unread count) and white needs the darker green to clear 4.5:1; anywhere
    else it is a mark — a bar, a ring, an edge — and is the brand's green.
    `--faint` is the reference's lightest grey, which it uses for small text as
    well as for icons; as text it fails AA, so it is `ink-3` unless the rule is
    about an icon. `--line-2` is a divider, except on the edge of a field or a
    tick box, which somebody has to find and so needs 3:1 (`line-ctl`). */
function colourFor(name, selector, body) {
	if (name === "--green") {
		return /color:\s*#fff\b/i.test(body) ? "rgb(var(--live-dark))" : "rgb(var(--brand))";
	}
	if (name === "--faint") {
		return /(\bsvg\b|chev|e-ic|stars|-ic\b)/.test(selector) ? "rgb(var(--faint))" : "rgb(var(--ink-3))";
	}
	if (name === "--line-2" && /\.k-(inp|sel|chk|pick|otp)\b/.test(selector) && /border/.test(body)) {
		return "rgb(var(--line-ctl))";
	}
	return VARS[name];
}

/* Literal colours in its rules, as roles where they are one. White stays
   white: it is only ever text or a tick on a fill, and the checker holds
   every such fill to 4.5:1 against it. */
const LITERALS = [
	[/rgba\(16,\s*24,\s*40,\s*([.\d]+)\)/g, "rgb(var(--char) / $1)"],
	[/rgba\(20,\s*26,\s*43,\s*([.\d]+)\)/g, "rgb(var(--char) / $1)"],
	[/rgba\(26,\s*174,\s*95,\s*([.\d]+)\)/g, "rgb(var(--brand) / $1)"],
	[/#1E232D\b/gi, "rgb(var(--wash))"],
	[/#ECEEF3\b/gi, "rgb(var(--ink))"],
	[/#0B2918\b/gi, "rgb(var(--brand-soft))"],
	[/#53D68E\b/gi, "rgb(var(--brand-lift))"],
];

/* Its base rules and its chrome, which this app already has. */
const SKIP_SELECTOR = /^(:root|html|body|\*|button,input|button\b|:focus-visible|svg\b|#)/;
const CHROME = new Set([
	"app", "side", "brand", "brand-mark", "icon-btn", "collapse-btn", "dash-btn", "nav", "nav-g", "lbl",
	"chev", "sub-wrap", "sub", "sub-in", "side-foot", "badge-n", "theme-sw", "knob", "slim", "main", "top",
	"menu-btn", "search", "kbd", "search-res", "sr-g", "sr-ic", "links", "top-r", "dot", "me", "pop",
	"pop-item", "page", "scrim", "bnav", "bdot",
]);

/* ------------------------------------------------------------- parsing */

/** Statements between s[i] and s[end]: comments, at-blocks and rules. */
function parse(s, i, end) {
	const out = [];
	while (i < end) {
		const ws = /\s*/y;
		ws.lastIndex = i;
		ws.exec(s);
		i = ws.lastIndex;
		if (i >= end) break;
		if (s.startsWith("/*", i)) {
			const j = s.indexOf("*/", i) + 2;
			out.push({ kind: "comment", text: s.slice(i, j) });
			i = j;
			continue;
		}
		let j = i;
		let depth = 0;
		while (j < end) {
			if (s.startsWith("/*", j)) { j = s.indexOf("*/", j) + 2; continue; }
			const c = s[j];
			if (c === "(" || c === "[") depth++;
			else if (c === ")" || c === "]") depth--;
			else if (depth === 0 && (c === "{" || c === ";")) break;
			j++;
		}
		if (j >= end) break;
		if (s[j] === ";") { out.push({ kind: "raw", text: s.slice(i, j + 1) }); i = j + 1; continue; }
		const prelude = s.slice(i, j).trim();
		let k = j;
		let d = 0;
		for (;;) {
			if (s.startsWith("/*", k)) { k = s.indexOf("*/", k) + 2; continue; }
			if (s[k] === "{") d++;
			else if (s[k] === "}" && --d === 0) break;
			k++;
		}
		if (/^@(media|supports)/.test(prelude)) out.push({ kind: "block", prelude, children: parse(s, j + 1, k) });
		else if (/^@keyframes/.test(prelude)) out.push({ kind: "keyframes", prelude, body: s.slice(j + 1, k) });
		else out.push({ kind: "rule", prelude, body: s.slice(j + 1, k) });
		i = k + 1;
	}
	return out;
}

/* ------------------------------------------------------- transforming */

const keyframes = new Set();

const splitSelectors = (sel) => {
	const out = [];
	let depth = 0;
	let cur = "";
	for (const ch of sel) {
		if (ch === "(" || ch === "[") depth++;
		if (ch === ")" || ch === "]") depth--;
		if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
	}
	out.push(cur.trim());
	return out.filter(Boolean);
};

/** One selector, prefixed and scoped — or null to leave it out. */
function selector(sel) {
	if (SKIP_SELECTOR.test(sel)) return null;
	const classes = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
	if (classes.some((c) => CHROME.has(c))) return null;
	let out = sel.replace(/\.([a-zA-Z][\w-]*)/g, ".k-$1");
	/* Its dark-only rules: dark here is the root without the light attribute. */
	out = out.replace(/:root\[data-theme="dark"\]\s*/g, ':root:not([data-mode="light"]) ');
	/* A selector that starts with an element (`table`, `th`, `tr.click`) is
	   scoped to a rebuilt page. */
	if (/^[a-z]/.test(out)) out = ".kit " + out;
	return out;
}

function declarations(body, sel) {
	let out = body.replace(/var\((--[a-z0-9-]+)\)/g, (m, name) => colourFor(name, sel, body) || m);
	for (const [re, to] of LITERALS) out = out.replace(re, to);
	/* Animations that name one of its keyframes name the prefixed one. */
	out = out.replace(/(animation(?:-name)?\s*:\s*)([^;]+)/g, (m, head, value) =>
		head + value.replace(/\b([a-zA-Z][\w-]*)\b/g, (w) => (keyframes.has(w) ? "k-" + w : w)));
	return out.trim();
}

function emit(nodes, indent = "") {
	const lines = [];
	for (const n of nodes) {
		if (n.kind === "comment") lines.push(indent + n.text.replace(/\/\*\s*/, "/* ").replace(/\s*\*\//, " */"));
		else if (n.kind === "keyframes") {
			const name = n.prelude.replace(/^@keyframes\s+/, "");
			/* A keyframe names colours too — the landing glow is the brand's. */
			lines.push(`${indent}@keyframes k-${name}{${declarations(n.body, "@keyframes " + name)}}`);
		} else if (n.kind === "block") {
			const inner = emit(n.children, indent + "  ");
			if (inner.trim()) lines.push(`${indent}${n.prelude}{\n${inner}\n${indent}}`);
		} else if (n.kind === "rule") {
			const sels = splitSelectors(n.prelude).map(selector).filter(Boolean);
			if (!sels.length) continue;
			lines.push(`${indent}${sels.join(",")}{${declarations(n.body, sels.join(","))}}`);
		}
	}
	return lines.join("\n");
}

/* ----------------------------------------------------------------- run */

const html = fs.readFileSync(REF, "utf8");
const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const tree = parse(css, 0, css.length);
const collect = (nodes) => nodes.forEach((n) => {
	if (n.kind === "keyframes") keyframes.add(n.prelude.replace(/^@keyframes\s+/, ""));
	if (n.kind === "block") collect(n.children);
});
collect(tree);
/* The palette blocks: `:root{…}` and its dark copies are themes.css's job. */
const body = tree.filter((n) => !(n.kind === "block" && /prefers-color-scheme/.test(n.prelude)));

const header = `/* ---------------------------------------------------------------------------
   GENERATED by client/scripts/portkit.mjs from
   docs/design/hrdashboard-reference.html — do not edit by hand.

   The HRDashboard reference's stylesheet with every class prefixed \`k-\`,
   its colours as this app's roles, and its element rules scoped to \`.kit\`.
   See the script for why each of those, and change it there.
   --------------------------------------------------------------------------- */
`;
/* What index.css's own element rules set that the reference never does, put
   back inside `.kit`. Its `table` has a 760px floor for the wide reports, and
   on a phone that floor outlives the reference's table-as-cards and pushes
   every value off the right edge. Tailwind's preflight also takes the bold
   off every heading, which the reference left at the browser's default and
   drew its titles with. */
const RESET = `.kit table{min-width:0}\n.kit h1,.kit h2,.kit h3,.kit h4{font-weight:700}\n`;
const result = header + "\n" + RESET + emit(body) + "\n";
fs.writeFileSync(OUT, result);
const left = [...result.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1])
	.filter((v) => !/^--(page|card|wash|line|line-2|line-ctl|ink|ink-2|ink-3|faint|brand|brand-soft|brand-dark|brand-lift|on-brand|accent|live-dark|bad|bad-fill|bad-wash|part|part-wash|info-ink|info-wash|chart-3|char|sh-raise|sh-pop|overlay|ease-out|i|r)$/.test(v));
console.log(`${path.relative(process.cwd(), OUT)}: ${result.length} bytes, ${keyframes.size} keyframes prefixed`);
if (left.length) console.log("variables with no role:", [...new Set(left)].join(", "));
