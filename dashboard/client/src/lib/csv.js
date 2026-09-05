/** Everything this app hands back to a person as a file. */

export function save(name, text, mime) {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([text], { type: mime }));
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* The BOM is for Excel, which otherwise reads a UTF-8 CSV as Latin-1 and turns
   every name with an accent in it into mojibake. Only the CSV needs it: the
   HTML documents declare their charset in their own head. */
export const download = (name, text) => save(name, "﻿" + text, "text/csv;charset=utf-8");

/** A file that is already on the server, saved rather than opened.

    `save` above builds the bytes here and hands them over as a Blob; this one
    has nothing to build — the bytes are at a URL on this origin, and asking the
    browser to fetch them into memory only to hand them straight back would
    double the traffic and cap the size at whatever a tab can hold.

    Same-origin is what makes it work at all: `download` on an anchor is ignored
    cross-origin, and the file routes are proxied onto :5173 in development for
    exactly this reason (see `server.proxy` in client/vite.config.js).

    `?download=1` is the server's own switch — the same URL without it renders
    the scan in a tab instead, which is what the Document register's paperclip
    wants and this does not. */
export function saveFrom(url, name) {
	const a = document.createElement("a");
	a.href = url + (url.includes("?") ? "&" : "?") + "download=1";
	/* A hint, not a guarantee: the server sends its own Content-Disposition and
	   that wins. Set anyway, so the file has a sensible name if it ever stops. */
	if (name) a.download = name;
	a.rel = "noopener";
	document.body.appendChild(a);
	a.click();
	a.remove();
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

/* ---------------------------------------------------------------------------
   Reading one back in.

   The other direction of everything above, and it exists for exactly one
   caller: On Board's Generate Bulk Letter, which takes a sheet of employees and
   issues a letter to each row. Small on purpose — quoted fields, doubled quotes
   inside them, and CRLF. It is not a spreadsheet parser and must not grow into
   one: the moment a caller needs merged cells or a second sheet, the answer is
   a library, not more lines here.

   **It reads CSV and not .xls or .xlsx**, which their dialog takes. Those are
   ZIP containers of XML (and, for the old one, a compound binary document);
   reading either means a parser this app does not carry and would not carry for
   one screen. The dialog says so where somebody drops the wrong file, rather
   than failing on it.
   --------------------------------------------------------------------------- */

/** A CSV as an array of objects, keyed by the header row.

    @returns {{rows: object[], cols: string[]}} */
export function parseCsv(text) {
	/* The BOM `download` above writes, back off again. A file this app exported,
	   edited in Excel and re-imported would otherwise have a first column called
	   `\ufeffemployee_number`, which matches nothing. */
	const body = String(text || "").replace(/^\ufeff/, "");

	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (quoted) {
			if (c !== '"') { field += c; continue; }
			/* A doubled quote inside a quoted field is one quote. */
			if (body[i + 1] === '"') { field += '"'; i++; continue; }
			quoted = false;
			continue;
		}
		if (c === '"') { quoted = true; continue; }
		if (c === ",") { row.push(field); field = ""; continue; }
		if (c === "\r") continue;
		if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
		field += c;
	}
	/* The last line, when the file does not end in a newline. */
	if (field !== "" || row.length) { row.push(field); rows.push(row); }

	const head = (rows.shift() || []).map((h) => h.trim());
	return {
		cols: head,
		rows: rows
			/* A trailing blank line is not a row of empty values. */
			.filter((r) => r.some((v) => String(v).trim() !== ""))
			.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()]))),
	};
}
