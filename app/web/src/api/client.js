import axios from "axios";

/* ---------------------------------------------------------------------------
   The one way this app talks to the site.

   It never talks to `mannarubber.m.frappe.cloud` directly. A `file://` page —
   or a page on any other origin — cannot: Frappe pins its CORS header to its
   own origin, so the request is refused before ERPNext ever sees it. `serve.py`
   therefore serves the page *and* proxies `/api/...`, so the browser only ever
   sees one origin, and the API token stays in that process rather than in
   anything the browser can read. See app/README.md.

   Which is why `baseURL` is relative and there is no auth header here. If you
   ever find yourself adding one, the token has reached the browser and the
   page can no longer be opened, shared or screenshotted safely.
   --------------------------------------------------------------------------- */

export const http = axios.create({
	baseURL: "",
	headers: { Accept: "application/json" },
	/* Nothing on this page is worth a browser hanging on. The proxy is local;
	   if it has not answered in half a minute, the site behind it is down. */
	timeout: 30000,
});

/** An error that still knows what the proxy answered. The status matters: a 403
    is "the proxy refused", a 417 is "this site has no such field", and only the
    second of those is about the data. */
export class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/** The proxy answers a refusal as `{error, hint}` — the hint is the readable half. */
function reason(e) {
	const d = e?.response?.data;
	return d?.hint || d?.error || e?.message || String(e);
}

http.interceptors.response.use(
	(r) => r,
	(e) => Promise.reject(new ApiError(reason(e), e?.response?.status)),
);

/** One GET against the proxy. Params are serialised the way Frappe wants them. */
export async function api(path, params) {
	const r = await http.get(path, { params });
	return r.data;
}

/* Frappe pages at 100 rows whatever you ask for, so every list read is a loop.
   Kept in one place because getting the last page wrong shows up as a headcount
   that is quietly 100 short rather than as an error. */
export async function listAll(dt, fields, filters) {
	let out = [];
	let start = 0;
	for (;;) {
		const p = {
			fields: JSON.stringify(fields),
			limit_page_length: 100,
			limit_start: start,
		};
		if (filters) p.filters = JSON.stringify(filters);
		const page = (await api("/api/resource/" + encodeURIComponent(dt), p)).data || [];
		out = out.concat(page);
		if (page.length < 100) return out;
		start += 100;
	}
}

/** One whole document, or null if it cannot be read. */
export async function getDoc(dt, name) {
	return api(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(name)}`)
		.then((r) => r.data ?? null)
		.catch(() => null);
}

/* The one write this page can make, and only when the proxy was started for it
   with ERP_WRITE=1 — one PUT, onto an allowlisted doctype, setting `status` or
   `decision_note`. Everything else 403s in serve.py rather than here, because a
   rule enforced in a client is a suggestion to anyone holding curl.

   Writing the field is how the rule is *invoked*, not a way around it: setting
   `status = Approved` fires `on_update` inside the site, which runs the
   self-approval guard and writes the missing Employee Checkin rows. See
   CLAUDE.md §1.

   @returns {Promise<{ok: boolean, error?: string, status?: number}>} */
export async function apiWrite(dt, name, patch) {
	try {
		await http.put(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(name)}`, patch, {
			headers: { "Content-Type": "application/json" },
		});
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e.message, status: e.status };
	}
}
