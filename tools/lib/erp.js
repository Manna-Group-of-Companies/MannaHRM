/**
 * Talking to the ERPNext site from a one-off script.
 *
 * Unlike the dashboard, these run on somebody's machine with the key in their
 * environment, so the token is attached here directly and there is no proxy in
 * front. That is the whole reason `ERP_KEY` is read from the environment rather
 * than from a file: a key in a file gets committed eventually.
 */

const BASE = (process.env.ERP_URL || "https://mannarubber.m.frappe.cloud").replace(/\/+$/, "");

const headers = () => ({
	Authorization: `token ${process.env.ERP_KEY || ""}:${process.env.ERP_SECRET || ""}`,
	Accept: "application/json",
});

/** Stop early and clearly when the environment is not set, rather than sending
    an unauthenticated request and reporting a confusing 401. */
export function requireKey() {
	if (!process.env.ERP_KEY || !process.env.ERP_SECRET) {
		process.stderr.write(
			"ERP_KEY and ERP_SECRET are not set.\n\n"
			+ "  PowerShell:  $env:ERP_KEY='...'; $env:ERP_SECRET='...'\n"
			+ "  Git Bash:    export ERP_KEY=... ERP_SECRET=...\n",
		);
		process.exit(1);
	}
}

export const siteUrl = () => BASE;

async function request(path, init = {}) {
	const r = await fetch(BASE + path, {
		...init,
		headers: { ...headers(), ...(init.headers || {}) },
		signal: AbortSignal.timeout(90000),
	});
	const text = await r.text();
	if (!r.ok) {
		const hint = r.status === 429
			? " (the site has hit its daily compute limit; it resets daily)"
			: "";
		throw new Error(`HTTP ${r.status} on ${path}${hint}: ${text.slice(0, 300)}`);
	}
	return text ? JSON.parse(text) : {};
}

/* Frappe pages at 100 rows whatever you ask for, so every list read is a loop.
   Getting the last page wrong shows up as a headcount that is quietly 100
   short rather than as an error. */
export async function listAll(doctype, fields, filters = null) {
	const out = [];
	let start = 0;
	for (;;) {
		const p = new URLSearchParams({
			fields: JSON.stringify(fields),
			limit_page_length: "100",
			limit_start: String(start),
		});
		if (filters) p.set("filters", JSON.stringify(filters));
		const page = (await request(`/api/resource/${encodeURIComponent(doctype)}?${p}`)).data || [];
		out.push(...page);
		if (page.length < 100) return out;
		start += 100;
	}
}

/** One whole document. */
export const getDoc = (doctype, name) =>
	request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)
		.then((r) => r.data);

export const createDoc = (doctype, doc) =>
	request(`/api/resource/${encodeURIComponent(doctype)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(doc),
	}).then((r) => r.data);

export const updateDoc = (doctype, name, patch) =>
	request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(patch),
	}).then((r) => r.data);
