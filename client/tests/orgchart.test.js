import { describe, expect, it } from "vitest";

import {
	CARD_H, CARD_W, GRID, addCard, blankChart, canReportTo, chartNote, cleanChart, extent, hasChart, links, moveCard,
	onChart, parseChartNote, removeCard, setParent, snap, startFrom,
} from "@/lib/orgchart";

/* The chart HR draws — lib/orgchart.js. */

const overlap = (a, b) => a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H;

const ROWS = [
	{ label: "Manager", items: [{ kind: "person", emp: "E1" }] },
	{ label: "In-charge", items: [{ kind: "person", emp: "E2" }, { kind: "seat", role: "Stores" }, { kind: "person", emp: "E3" }] },
	{ label: "Empty", items: [] },
];

describe("starting from the chart as it is drawn", () => {
	it("puts every card on the page once, with no two cards on top of each other", () => {
		const chart = startFrom(ROWS);
		const cards = chart.cards.filter((c) => c.kind !== "label");
		expect(cards.map((c) => c.emp || c.role)).toEqual(["E1", "E2", "Stores", "E3"]);
		for (const a of cards) for (const b of cards) if (a !== b) expect(overlap(a, b)).toBe(false);
	});

	it("draws each row's title, and none for a row nobody is on", () => {
		expect(startFrom(ROWS).cards.filter((c) => c.kind === "label").map((c) => c.text)).toEqual(["Manager", "In-charge"]);
	});

	it("starts each card reporting to the first card of the row above", () => {
		const chart = startFrom(ROWS);
		const boss = chart.cards.find((c) => c.emp === "E1");
		expect(boss.parent).toBeNull();
		for (const c of chart.cards.filter((x) => x.emp === "E2" || x.role === "Stores")) expect(c.parent).toBe(boss.id);
	});

	it("centres a short row under a long one", () => {
		const chart = startFrom(ROWS);
		const boss = chart.cards.find((c) => c.emp === "E1");
		const mid = chart.cards.find((c) => c.role === "Stores");
		expect(Math.abs(boss.x - mid.x)).toBeLessThanOrEqual(GRID);
	});
});

describe("editing", () => {
	it("snaps every position to the grid and never past the top or left edge", () => {
		expect(snap(13)).toBe(16);
		expect(snap(-40)).toBe(0);
		const chart = moveCard(startFrom(ROWS), startFrom(ROWS).cards[0].id, 0, 0);
		const moved = moveCard(chart, chart.cards[1].id, 101, -7);
		expect(moved.cards[1]).toMatchObject({ x: 104, y: 0 });
	});

	it("adds a new card below everything, where it covers nobody", () => {
		const chart = startFrom(ROWS);
		const added = addCard(chart, { kind: "seat", role: "Logistics" });
		const card = added.cards.at(-1);
		expect(card.y).toBeGreaterThanOrEqual(extent(chart).h);
		for (const c of chart.cards) expect(overlap(card, c)).toBe(false);
	});

	it("removing a card takes the line from anybody who reported to it", () => {
		const chart = startFrom(ROWS);
		const boss = chart.cards.find((c) => c.emp === "E1");
		const after = removeCard(chart, boss.id);
		expect(after.cards.some((c) => c.id === boss.id)).toBe(false);
		expect(after.cards.every((c) => c.parent !== boss.id)).toBe(true);
	});

	it("refuses a reporting line that would make a loop, or go to a title or to itself", () => {
		const chart = startFrom(ROWS);
		const boss = chart.cards.find((c) => c.emp === "E1");
		const e2 = chart.cards.find((c) => c.emp === "E2");
		const title = chart.cards.find((c) => c.kind === "label");
		expect(canReportTo(chart, boss.id, e2.id)).toBe(false);
		expect(canReportTo(chart, e2.id, e2.id)).toBe(false);
		expect(canReportTo(chart, e2.id, title.id)).toBe(false);
		expect(setParent(chart, boss.id, e2.id)).toBe(chart);
		expect(setParent(chart, e2.id, "").cards.find((c) => c.id === e2.id).parent).toBeNull();
	});

	it("draws a line from the bottom of the boss's card to the top of the card reporting", () => {
		const chart = startFrom(ROWS);
		const boss = chart.cards.find((c) => c.emp === "E1");
		const e2 = chart.cards.find((c) => c.emp === "E2");
		const line = links(chart).find((l) => l.id === e2.id);
		expect(line.d.startsWith(`M ${boss.x + CARD_W / 2} ${boss.y + CARD_H}`)).toBe(true);
		expect(line.d.endsWith(`H ${e2.x + CARD_W / 2} V ${e2.y}`)).toBe(true);
	});

	it("knows who is already on the chart, so nobody is added twice", () => {
		expect([...onChart(startFrom(ROWS))]).toEqual(["E1", "E2", "E3"]);
	});
});

describe("on the site", () => {
	it("goes into a comment and comes back the same, names in Malayalam included", () => {
		const chart = addCard(startFrom(ROWS), { kind: "label", text: "മാനേജ്മെന്റ്" });
		const html = chartNote(chart).split("\n").join("<br>");
		expect(parseChartNote(`<p>${html}</p>`)).toEqual(cleanChart(chart));
	});

	it("ignores a comment that is not a chart", () => {
		expect(parseChartNote("Called the candidate")).toBeNull();
		expect(parseChartNote("Org chart<br>not base64 !!")).toBeNull();
	});

	it("drops anything malformed rather than drawing it, and a line to a card that is gone", () => {
		const raw = JSON.stringify({ cards: [
			{ id: "a", kind: "person", emp: "E1", x: "12", y: 5 },
			{ id: "b", kind: "seat", role: "Stores", x: 0, y: 300, parent: "gone" },
			{ id: "c", kind: "person" },
			{ id: "a", kind: "label", text: "dupe" },
			"junk",
		] });
		expect(cleanChart(raw).cards).toEqual([
			{ id: "a", kind: "person", emp: "E1", x: 16, y: 8, parent: null },
			{ id: "b", kind: "seat", role: "Stores", x: 0, y: 304, parent: null },
		]);
		expect(cleanChart("{not json").cards).toEqual([]);
	});

	it("an empty chart is no chart, so the automatic one is drawn", () => {
		expect(hasChart(blankChart())).toBe(false);
		expect(hasChart(startFrom(ROWS))).toBe(true);
	});
});
