import { TOKENS } from "@/data/onboard";

/* 118 distinct tokens across 17 templates, and the same field appears as
   EmployeeName, employeename and EMPLOYEENAME — so the key is lowercased and
   stripped of spaces, dots and underscores, and case is re-applied on output. */
const norm = (t) => t.toLowerCase().replace(/[\s._\-/]/g, "");

const esc = (s) =>
	String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Merge one letter template against one record.
 *
 * @returns {{html: string, missing: string[]}} `html` is the rendered letter —
 *   every value that came off the record is escaped here; the template around
 *   it is the site's own stored HTML.
 */
export function mergeLetter(html, emp, ctx) {
	const missing = new Set();
	const out = html.replace(/\{([A-Za-z0-9 _.\-/]{2,40})\}/g, (_m, raw) => {
		const key = norm(raw);
		if (ctx && ctx[key] != null && ctx[key] !== "") return esc(ctx[key]);
		const fn = TOKENS[key];
		const v = fn ? fn(emp) : undefined;
		if (v == null || v === "") {
			missing.add(raw.trim());
			/* Shown, never blanked. A letter with a visible gap is obviously
			   unfinished; one with a blank space looks finished and is not. */
			return '<span class="tok">[[' + esc(raw.trim()) + "]]</span>";
		}
		let text = String(v);
		// A token screamed in capitals is a heading; the value follows it.
		if (raw === raw.toUpperCase() && /[A-Z]{3,}/.test(raw)) text = text.toUpperCase();
		return esc(text);
	});
	return { html: out, missing: [...missing] };
}
