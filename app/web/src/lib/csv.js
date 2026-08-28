/** Everything this app hands back to a person as a file. */

export function download(name, text) {
	const a = document.createElement("a");
	/* The BOM is for Excel, which otherwise reads a UTF-8 CSV as Latin-1 and
	   turns every name with an accent in it into mojibake. */
	a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const cell = (v) => {
	const s = String(v == null ? "" : v);
	return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Header row plus body, CRLF-terminated because that is what Excel expects. */
export const toCsv = (cols, rows) =>
	[cols.map(cell).join(",")].concat(rows.map((r) => r.map(cell).join(","))).join("\r\n");

/** Every key any row carries, in the order first seen. Used by the raw exports,
    which write out exactly what the site returned, field for field, with
    nothing computed added — an export carrying this page's own arithmetic would
    be a second opinion masquerading as a record. */
export function unionKeys(rows) {
	const cols = [];
	rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
	return cols;
}
