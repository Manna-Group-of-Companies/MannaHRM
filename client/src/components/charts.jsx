/* ---------------------------------------------------------------------------
   The four shapes this dashboard draws data in, as inline SVG.

   **No chart library.** Three of these are twenty lines of arithmetic and the
   fourth is a `<path>`; a package would be a dependency, a bundle, a theme
   adapter and a second set of colours to keep in step with `themes.css` — in
   exchange for nothing these four cannot do.

   ---------------------------------------------------------------------------
   The rules they all follow, and why

   **Colour is `--chart-1..3` and never the brand ramp.** Slices have to be told
   apart from each other; a brand has to be told apart from everything else.
   Tie the first to the second and "still in" and "on leave" come out as two
   shades of the same orange — and they stay two shades of the same anything the
   next time the brand moves. See the note on `--chart-1` in
   `styles/themes.css`, and the validator run recorded there.

   **Three hues, in a fixed order, never cycled.** A fourth category is the
   ring's unfilled remainder — which on this dashboard is what a fourth
   category actually is: the people who have not turned up yet.

   **Every value is also written down.** The legend carries the number beside
   the label, so nothing on these charts is available only by colour and
   nothing is available only on hover. That is what makes them readable in
   greyscale, in a screenshot, and to somebody who cannot see the difference
   between the green and the amber.

   **Text wears text tokens.** A number is `ink`, a label is `ink-3`; the swatch
   beside them carries the identity. A figure printed in its series colour is a
   figure that fails contrast the first time the palette moves.
   --------------------------------------------------------------------------- */

import { fmt } from "@/lib/format";

/** A circumference of exactly 100 makes every dash length a percentage, which
    is the whole trick — no arc maths, no path strings, and a segment that is
    "23" is 23% of the ring by construction. */
const R = 15.9155;

/** The gap between two slices, in the same units. It is drawn as a gap rather
    than as a stroke in the surface colour, so a ring on a card and a ring in a
    dialog do not need to know what they are sitting on. */
const GAP = 1.4;

/**
 * A ring, with the headline in the middle of it.
 *
 * `parts` is `[{ key, label, n, c }]` where `c` is 1, 2, 3 or "rest" — the
 * remainder, which is drawn in `track` and is the only slot allowed a fourth
 * category. `total` is what the ring adds up to and what is printed inside it;
 * pass it explicitly rather than summing, because the interesting case is a
 * ring that does *not* add up to its own headline and says so.
 */
export function Donut({ parts, total, caption, label }) {
	const sum = parts.reduce((a, p) => a + Math.max(0, p.n || 0), 0);
	/* An empty ring is a real state — nobody has punched yet this morning — and
	   it has to draw as an empty ring rather than as a division by zero. */
	const each = sum > 0 ? parts.map((p) => ({ ...p, pc: (Math.max(0, p.n || 0) / sum) * 100 })) : [];

	let at = 0;
	const arcs = each.map((p) => {
		const start = at;
		at += p.pc;
		/* A slice narrower than the gap would render as a gap with a hairline of
		   colour in it, which reads as a rendering fault rather than as one
		   person. Below that width it is drawn solid and the gap is skipped —
		   the legend is what carries the exact number anyway. */
		const cut = p.pc > GAP * 1.5 ? GAP : 0;
		return { ...p, start, len: Math.max(0, p.pc - cut) };
	});

	return (
		<div className="donut">
			<div className="dring">
				<svg viewBox="0 0 42 42" role="img" aria-label={label || caption}>
					{/* The track under everything, so an empty ring is still a ring. */}
					<circle className="dtrack" cx="21" cy="21" r={R} />
					{arcs.map((p) => (
						<circle
							key={p.key}
							className={"darc c" + p.c}
							cx="21"
							cy="21"
							r={R}
							strokeDasharray={`${p.len} ${100 - p.len}`}
							/* 25 puts the start of the first slice at twelve o'clock;
							   the dash offset runs clockwise from there. */
							strokeDashoffset={25 - p.start}
						>
							<title>{`${p.label}: ${fmt(p.n)}`}</title>
						</circle>
					))}
				</svg>
				<div className="dmid">
					<b>{fmt(total)}</b>
					<span>{caption}</span>
				</div>
			</div>
			<ul className="ckey">
				{parts.map((p) => (
					<li key={p.key}>
						<i className={"sw c" + p.c} aria-hidden="true" />
						<span className="k">{p.label}</span>
						<b className="v">{fmt(p.n)}</b>
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * A column per period — joiners a month, punches a day.
 *
 * Columns rather than a line, because these are counts of things that happened
 * in a bucket rather than a quantity that existed continuously. A line between
 * two months implies a value halfway through August, and there is not one.
 */
export function Columns({ rows, label }) {
	const max = Math.max(1, ...rows.map((r) => r.n || 0));
	return (
		<div className="cols-chart" role="img" aria-label={label}>
			<div className="bars">
				{rows.map((r) => (
					<div className="bar" key={r.key} title={`${r.label}: ${fmt(r.n)}`}>
						<span className="v">{r.n ? fmt(r.n) : ""}</span>
						{/* A minimum height on a non-zero column, so "one" is visibly
						    different from "none" — the difference this chart is most
						    often read for. A zero column really is nothing. */}
						<i style={{ height: r.n ? `max(3px, ${((r.n / max) * 100).toFixed(1)}%)` : "0" }} />
						<span className="k">{r.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * How much of something is filled in — one bar, a count, and the whole it is
 * out of.
 *
 * Its own component rather than a `Bars` of two rows, because the question is
 * "how far along" rather than "which is biggest", and the answer wants the
 * remainder drawn rather than left off the end.
 */
export function Meter({ n, of, label, hint, tone = "brand" }) {
	const pc = of > 0 ? Math.min(100, (n / of) * 100) : 0;
	return (
		<div className="meter">
			<div className="mlab">
				<span>{label}</span>
				<b className="tabular-nums">
					{fmt(n)}
					<span className="of"> / {fmt(of)}</span>
				</b>
			</div>
			<div className="mtrack" role="img" aria-label={`${label}: ${fmt(n)} of ${fmt(of)}`}>
				<i className={"mfill " + tone} style={{ width: pc.toFixed(1) + "%" }} />
			</div>
			{hint ? <span className="mhint">{hint}</span> : null}
		</div>
	);
}

/**
 * The dashboard's headline number: a label, a figure, and one line saying what
 * the figure is of.
 *
 * Deliberately not `Tile`. That one is the four-across grid inside a panel and
 * has no icon and no room for one; this is a card in its own right, at the top
 * of the page, and it is the first thing anybody reads. Keeping them separate
 * is what stops one of them growing an `if` for the other's job.
 */
export function Stat({ ico, k, n, s, tone, to }) {
	return (
		<div className={"stat" + (tone ? " " + tone : "")}>
			<span className="sico" aria-hidden="true">{ico}</span>
			<span className="sk">{k}</span>
			<b className="sn">{n}</b>
			{s ? <span className="ss">{s}</span> : null}
			{to || null}
		</div>
	);
}

export const Stats = ({ children }) => <div className="stats">{children}</div>;
