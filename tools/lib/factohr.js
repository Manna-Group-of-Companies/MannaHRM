/**
 * Reading a Factor HR export sheet: finding its real header, and naming columns.
 *
 * Their reports stack a banner, sometimes a group-header row, then the labels.
 * The banner's height differs per report, so every tool here locates the header
 * by looking for a column it expects rather than by counting rows.
 */

/** A row as trimmed strings, with blanks as "". */
export const columnsOf = (row) =>
	row.map((c) => (c === null || c === undefined ? "" : String(c).trim()));

/**
 * The row holding real column labels, identified by a column we expect.
 *
 * @returns {number|null} null when the label never appears, which is a finding
 *   rather than a crash — the export is not the report the tool expected.
 */
export function findHeader(rows, mustContain, limit = 15) {
	const want = mustContain.toLowerCase();
	for (let i = 0; i < Math.min(rows.length, limit); i++) {
		for (const cell of rows[i]) {
			if (cell && String(cell).trim().toLowerCase() === want) return i;
		}
	}
	return null;
}

/** Index of the first header matching any of `names`, else null. */
export function col(headers, ...names) {
	const lowered = headers.map((h) => h.toLowerCase());
	for (const name of names) {
		const n = name.toLowerCase();
		const i = lowered.indexOf(n);
		if (i !== -1) return i;
	}
	// Fall back to a prefix match — Factor HR truncates some labels.
	for (const name of names) {
		const n = name.toLowerCase();
		const i = lowered.findIndex((h) => h.startsWith(n));
		if (i !== -1) return i;
	}
	return null;
}

/** One cell as a trimmed string, tolerant of a column that is not there. */
export function get(row, index) {
	if (index === null || index === undefined || index >= row.length) return "";
	const v = row[index];
	if (v === null || v === undefined) return "";
	// Dates come back as Date objects; the exports use them as plain days.
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
}

/** Count occurrences, most common first — the shape every summary here needs. */
export function counter(values) {
	const m = new Map();
	for (const v of values) m.set(v, (m.get(v) || 0) + 1);
	return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const padEnd = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

/** A counted breakdown, biggest first, with an optional share of the total. */
export function show(title, counts, total = null, limit = 25) {
	console.log(`\n  ${title}`);
	for (const [key, n] of counts.slice(0, limit)) {
		const share = total ? `  (${((100 * n) / total).toFixed(0)}%)` : "";
		console.log(`    ${padEnd(String(key || "(blank)").slice(0, 42), 42)} ${padStart(n, 5)}${share}`);
	}
	if (counts.length > limit) console.log(`    ... and ${counts.length - limit} more`);
}
