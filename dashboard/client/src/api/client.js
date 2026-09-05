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

/** Creating one document, as a draft. The proxy allows this on three payroll
    doctypes only, refuses any `docstatus` but 0, and logs every one — see
    CREATABLE and DRAFT_ONLY in server/index.js.

    Throws rather than returning `{ok}`, unlike `apiWrite` above: a save here is
    several documents in order, and the second must not be attempted when the
    first was refused.

    @returns {Promise<object>} the created document, as the site stored it */
export async function apiCreate(dt, doc) {
	const r = await http.post(`/api/resource/${encodeURIComponent(dt)}`, doc, {
		headers: { "Content-Type": "application/json" },
	});
	return r.data?.data ?? r.data;
}

/* ---------------------------------------------------------------------------
   Attachments — the two writes behind On Board's Document Entry form.

   Separate from `apiWrite` above because neither of these is a field change on
   a document: one puts bytes on disk and the other takes them off again. They
   throw rather than returning `{ok}`, for the same reason `apiCreate` does —
   Save on that form is several operations in order, and the second must not be
   attempted when the first was refused.
   --------------------------------------------------------------------------- */

/** A browser `File` as base64.

    Chunked through `String.fromCharCode` rather than spread in one call: the
    argument list is the stack, and a three-megabyte scan spread into one
    `apply` is tens of thousands of arguments — it throws on a file only a
    little larger than the ones this is for, and it throws as a stack overflow
    rather than as anything about the file. */
async function toBase64(file) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const CHUNK = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/** One scan, filed against a record and a field.

    The field matters as much as the record: a document on the register is
    synthesised from that pair, so an attachment filed without it belongs to
    every document that person holds and therefore to none of them.

    @returns {Promise<object>} the File row, as the site stored it */
export async function apiUpload(file, { doctype, name, field }) {
	const r = await http.post("/api/files", {
		file_name: file.name,
		attached_to_doctype: doctype,
		attached_to_name: name,
		attached_to_field: field,
		data: await toBase64(file),
	}, {
		headers: { "Content-Type": "application/json" },
		/* A scan is bigger than anything else this app sends and the encoding
		   makes it a third bigger again. The default half-minute is for a proxy
		   that has stopped answering, not for an upload that is still going. */
		timeout: 120000,
	});
	return r.data?.data ?? r.data;
}

/** One scan removed — the row and the bytes behind it. */
export async function apiDeleteFile(name) {
	await http.delete("/api/files/" + encodeURIComponent(name));
}

/** One document removed.

    Throws rather than returning `{ok}`, like the two above: a delete is the one
    write with nothing to compare against afterwards, and a caller deleting
    several in a row must stop at the first refusal rather than carry on.

    The server refuses this on every doctype but the one that names itself
    deletable, and refuses it there while anything still points at the record —
    with the count in the message. See the DELETE route in routes/resource.ts. */
export async function apiDelete(dt, name) {
	await http.delete(`/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(name)}`);
}
