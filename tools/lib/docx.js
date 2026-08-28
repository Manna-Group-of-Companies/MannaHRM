/**
 * Just enough of the .docx format to read a letter template out of one.
 *
 * A .docx is a ZIP holding `word/document.xml`. What is needed here is narrow —
 * paragraphs, which runs inside them are bold, where the tab stops are, and the
 * tables — so this walks that XML directly rather than converting the document
 * wholesale.
 *
 * The alternative was `mammoth`, which produces good HTML but throws away the
 * tab stops, and the tab stops are the point: these letters line up
 * `Employee Name<TAB>:<TAB>{EmployeeName}`, and that is a two-column layout
 * written before anybody had a table. Losing it turns every letter into a wall
 * of prose.
 */

import fs from "node:fs";
import JSZip from "jszip";

/**
 * The top-level `<name>` elements inside `xml`, as strings, honouring nesting.
 *
 * A table contains paragraphs, so a naive non-greedy regex would end the first
 * `<w:tbl>` at the first `</w:p>` inside it. Depth is tracked instead.
 */
export function elements(xml, name) {
	const open = new RegExp(`<${name}(?:\\s[^>]*)?>`, "g");
	const selfClosing = new RegExp(`<${name}(?:\\s[^>]*)?/>`, "g");
	const close = `</${name}>`;
	const out = [];

	let i = 0;
	while (i < xml.length) {
		open.lastIndex = i;
		const m = open.exec(xml);
		if (!m) break;

		// `<w:p/>` is an empty paragraph and has no closing tag to look for.
		selfClosing.lastIndex = m.index;
		const sc = selfClosing.exec(xml);
		if (sc && sc.index === m.index) { i = m.index + sc[0].length; continue; }

		let depth = 1;
		let j = m.index + m[0].length;
		while (depth > 0 && j < xml.length) {
			open.lastIndex = j;
			const next = open.exec(xml);
			const closeAt = xml.indexOf(close, j);
			if (closeAt === -1) break;
			if (next && next.index < closeAt) {
				selfClosing.lastIndex = next.index;
				const s2 = selfClosing.exec(xml);
				if (!(s2 && s2.index === next.index)) depth++;
				j = next.index + next[0].length;
			} else {
				depth--;
				j = closeAt + close.length;
			}
		}
		out.push(xml.slice(m.index, j));
		i = j;
	}
	return out;
}

const unescapeXml = (s) =>
	s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
		.replace(/&amp;/g, "&");

/** The runs of one paragraph: `{text, bold}`, with tabs as "\t" in the text. */
export function runsOf(paragraphXml) {
	return elements(paragraphXml, "w:r").map((r) => {
		const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r);
		/* `<w:b w:val="0"/>` is bold explicitly turned off, which Word writes
		   when a run inherits bold from its style and overrides it. */
		const bold = props ? /<w:b(?:\s+[^>]*)?\/>|<w:b>/.test(props[1])
			&& !/<w:b\s+w:val="(?:0|false)"\s*\/>/.test(props[1]) : false;

		// Text and tabs, in the order they appear inside the run.
		let text = "";
		const parts = r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g);
		for (const p of parts) {
			if (p[0].startsWith("<w:tab")) text += "\t";
			else if (p[0].startsWith("<w:br")) text += "\n";
			else text += unescapeXml(p[1]);
		}
		return { text, bold };
	});
}

/** A paragraph's style name, lowercased — "heading1", "normal", "". */
export const styleOf = (paragraphXml) => {
	const m = /<w:pStyle\s+w:val="([^"]*)"/.exec(paragraphXml);
	return m ? m[1].toLowerCase() : "";
};

/** All of a paragraph's text, tabs included. */
export const textOf = (paragraphXml) => runsOf(paragraphXml).map((r) => r.text).join("");

/**
 * The document body, split into paragraphs and tables in the order they appear.
 *
 * @returns {Promise<{kind: "p"|"tbl", xml: string}[]>}
 */
export async function readDocx(path) {
	const zip = await JSZip.loadAsync(fs.readFileSync(path));
	const entry = zip.file("word/document.xml");
	if (!entry) throw new Error("no word/document.xml — is this really a .docx?");
	const xml = await entry.async("string");

	const bodyMatch = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
	const body = bodyMatch ? bodyMatch[1] : xml;

	/* Paragraphs and tables have to come back interleaved, because a letter's
	   table sits between two paragraphs and moving it to the end changes what
	   the letter says. Both are located, then merged on position. */
	const found = [];
	for (const p of elements(body, "w:p")) found.push({ kind: "p", xml: p, at: body.indexOf(p) });
	for (const t of elements(body, "w:tbl")) found.push({ kind: "tbl", xml: t, at: body.indexOf(t) });

	// A paragraph inside a table is part of that table, not a sibling of it.
	const tables = found.filter((f) => f.kind === "tbl");
	const top = found.filter((f) =>
		f.kind === "tbl" || !tables.some((t) => f.at > t.at && f.at < t.at + t.xml.length));

	return top.sort((a, b) => a.at - b.at).map(({ kind, xml: x }) => ({ kind, xml: x }));
}

/** One table as rows of cell text. */
export const tableRows = (tblXml) =>
	elements(tblXml, "w:tr").map((tr) =>
		elements(tr, "w:tc").map((tc) => textOf(tc).replace(/\t/g, " ").trim()));
