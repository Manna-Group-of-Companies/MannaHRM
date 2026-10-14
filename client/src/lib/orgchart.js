/* ---------------------------------------------------------------------------
   A company's chart as HR lays it out (asked for 14 October 2026).

   The automatic chart (lib/hierarchy.js) puts people on rows by level. This is
   the one HR draws instead: cards placed where somebody dragged them, lines
   drawn from a card to the card it reports to, and labels where HR wants a
   heading. Pure — positions in, positions out — so the arithmetic is argued
   about in tests/orgchart.test.js and not in a browser.

   A chart is `{ v: 1, cards: [...] }`, each card one of:

     { id, kind: "person", emp, x, y, parent }   an Employee, by record name
     { id, kind: "seat",   role, x, y, parent }  a seat nobody is in yet
     { id, kind: "label",  text, x, y }           a heading

   **A person card names a record, not a picture of one.** Somebody who leaves
   is still on the card and the chart draws their seat as vacated; somebody
   promoted keeps their place. What the record says is what the card shows.
   --------------------------------------------------------------------------- */

export const CARD_W = 176;
export const CARD_H = 248;
export const LABEL_H = 34;
export const GRID = 8;
const GAP_X = 24;
const GAP_Y = 64;

export const blankChart = () => ({ v: 1, cards: [] });

/** Whether a chart has anything in it — an empty one is no chart, and the
    automatic one is drawn instead. */
export const hasChart = (chart) => Boolean(chart && chart.cards && chart.cards.length);

export const snap = (n) => Math.max(0, Math.round(Number(n) / GRID) * GRID);

export const heightOf = (c) => (c.kind === "label" ? LABEL_H : CARD_H);

let seq = 0;
/** A card id that is new on this chart. */
export function newId(chart, kind) {
	const ids = new Set((chart?.cards || []).map((c) => c.id));
	let id;
	do { id = `${kind[0]}${Date.now().toString(36)}${(seq++).toString(36)}`; } while (ids.has(id));
	return id;
}

/** How far the chart reaches, for the canvas under it. */
export function extent(chart) {
	let w = 0;
	let h = 0;
	for (const c of chart?.cards || []) {
		w = Math.max(w, c.x + CARD_W);
		h = Math.max(h, c.y + heightOf(c));
	}
	return { w, h };
}

/**
 * A chart from rows, centred — how a company's current chart becomes the one
 * HR starts editing, so nobody begins from an empty page.
 *
 * @param {{label: string, items: object[]}[]} rows  items are cards without
 *   positions: `{kind: "person", emp}` or `{kind: "seat", role}`.
 *
 * Each row's cards report to the first card of the row above — a starting
 * line for every card, which HR redraws to the real one.
 */
export function startFrom(rows) {
	const chart = blankChart();
	const used = rows.filter((r) => r.items.length);
	const widest = Math.max(1, ...used.map((r) => r.items.length));
	const full = widest * CARD_W + (widest - 1) * GAP_X;
	let y = 0;
	let above = null;
	for (const row of used) {
		if (row.label) {
			chart.cards.push({ id: newId(chart, "label"), kind: "label", text: row.label, x: snap((full - CARD_W) / 2), y });
			y += LABEL_H + GRID * 2;
		}
		const width = row.items.length * CARD_W + (row.items.length - 1) * GAP_X;
		let x = (full - width) / 2;
		let first = null;
		for (const item of row.items) {
			const card = { ...item, id: newId(chart, item.kind), x: snap(x), y: snap(y), parent: above };
			chart.cards.push(card);
			first = first || card.id;
			x += CARD_W + GAP_X;
		}
		above = first;
		y += CARD_H + GAP_Y;
	}
	return chart;
}

/** Where a new card goes: under everything, at the left — never on top of a
    card already there. */
export function freeSpot(chart) {
	const { h } = extent(chart);
	return { x: 0, y: hasChart(chart) ? snap(h + GAP_Y) : 0 };
}

export function addCard(chart, card) {
	const spot = freeSpot(chart);
	const c = { parent: null, ...card, id: newId(chart, card.kind), x: card.x ?? spot.x, y: card.y ?? spot.y };
	if (c.kind === "label") delete c.parent;
	return { ...chart, cards: [...chart.cards, c] };
}

export function moveCard(chart, id, x, y) {
	return { ...chart, cards: chart.cards.map((c) => (c.id === id ? { ...c, x: snap(x), y: snap(y) } : c)) };
}

/** Remove a card, and the line from anybody who reported to it. */
export function removeCard(chart, id) {
	return {
		...chart,
		cards: chart.cards.filter((c) => c.id !== id).map((c) => (c.parent === id ? { ...c, parent: null } : c)),
	};
}

/** Whether `id` may report to `parent`: not to itself, not to a label, and not
    to anybody who already reports to it — a loop draws a line nobody can read. */
export function canReportTo(chart, id, parent) {
	if (!parent) return true;
	if (parent === id) return false;
	const byId = new Map(chart.cards.map((c) => [c.id, c]));
	if (!byId.has(parent) || byId.get(parent).kind === "label") return false;
	for (let at = parent, n = 0; at && n <= chart.cards.length; at = byId.get(at)?.parent, n++) {
		if (at === id) return false;
	}
	return true;
}

export function setParent(chart, id, parent) {
	if (!canReportTo(chart, id, parent)) return chart;
	return { ...chart, cards: chart.cards.map((c) => (c.id === id ? { ...c, parent: parent || null } : c)) };
}

/** The lines: from the bottom of the card reported to, down, across, and down
    to the top of the card reporting — the elbow every org chart draws. */
export function links(chart) {
	const byId = new Map((chart?.cards || []).map((c) => [c.id, c]));
	const out = [];
	for (const c of chart?.cards || []) {
		const p = c.parent && byId.get(c.parent);
		if (!p) continue;
		const x1 = p.x + CARD_W / 2;
		const y1 = p.y + heightOf(p);
		const x2 = c.x + CARD_W / 2;
		const y2 = c.y;
		const mid = y2 > y1 ? Math.round((y1 + y2) / 2) : y1 + GRID * 2;
		out.push({ id: c.id, d: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` });
	}
	return out;
}

/** The Employee records on a chart, so the picker offers only who is not. */
export const onChart = (chart) => new Set((chart?.cards || []).filter((c) => c.kind === "person").map((c) => c.emp));

const num = (n) => (Number.isFinite(Number(n)) ? snap(n) : 0);

/** A chart read off the site, with anything malformed dropped rather than
    drawn — a typo in Desk must not take the chart down. */
export function cleanChart(raw) {
	let data = raw;
	if (typeof raw === "string") {
		try { data = JSON.parse(raw); } catch { return blankChart(); }
	}
	const cards = [];
	const seen = new Set();
	for (const c of Array.isArray(data?.cards) ? data.cards : []) {
		if (!c || typeof c.id !== "string" || seen.has(c.id)) continue;
		const base = { id: c.id, x: num(c.x), y: num(c.y) };
		if (c.kind === "person" && c.emp) cards.push({ ...base, kind: "person", emp: String(c.emp), parent: c.parent || null });
		else if (c.kind === "seat" && c.role) cards.push({ ...base, kind: "seat", role: String(c.role), parent: c.parent || null });
		else if (c.kind === "label" && c.text) cards.push({ ...base, kind: "label", text: String(c.text) });
		else continue;
		seen.add(c.id);
	}
	/* A line to a card that is no longer there is no line. */
	for (const c of cards) if (c.parent && !seen.has(c.parent)) c.parent = null;
	return { v: 1, cards };
}

/* ---------------------------------------------------------------------------
   Kept as a comment on the Company where the site has no field for it
   (api/orgchart.js). Frappe stores a comment as sanitised HTML, which would
   mangle JSON's quotes, so the chart goes in as base64 under a heading.
   --------------------------------------------------------------------------- */

export const NOTE_HEAD = "Org chart";

const toB64 = (text) => {
	const bytes = new TextEncoder().encode(text);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
};

const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));

export const chartNote = (chart) => `${NOTE_HEAD}\n${toB64(JSON.stringify(cleanChart(chart)))}`;

/** A comment back into a chart, or null when it is not a chart comment. */
export function parseChartNote(content) {
	const text = String(content || "").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, "");
	const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines[0] !== NOTE_HEAD || !lines[1]) return null;
	try {
		return cleanChart(fromB64(lines.slice(1).join("")));
	} catch {
		return null;
	}
}
