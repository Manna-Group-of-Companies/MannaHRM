import axios from "axios";

/* ---------------------------------------------------------------------------
   The one way this app talks to anything, and the thing it talks to is the
   ERPNext site.

   There is no server of ours in between. **ERPNext is the server** — the
   doctypes are the schema, its roles are the permissions, and the rules that
   decide what somebody is paid are Server Scripts in `manna_hr/` running on the
   site's own clock (CLAUDE.md §1). A process of ours in the middle would be a
   second place for those rules to be half-stated, and it held a System Manager
   token to do it, which is the thing that made the old `app/serve.py` read-only
   by necessity rather than by choice.

   So: the browser holds the person's own Frappe session, every read and write
   is logged on the site as *them*, and what they may do is what their roles
   say. Nothing here is a security boundary and nothing here pretends to be. A
   rule enforced in this file would be a rule anybody with this file could skip.

   **One origin, and it has to be.** Frappe pins its CORS header to its own
   origin, so a page anywhere else is refused before ERPNext ever sees the
   request — and a cross-origin request would not carry the session cookie
   anyway. In development Vite proxies `/api`, `/app`, `/files` and `/private`
   to the site and rewrites the cookie for localhost; in production this bundle
   is served *by* the site, so the page and the API are one origin for real.
   Which is why `baseURL` is relative and always will be: an absolute URL here
   is that arrangement coming undone.
   --------------------------------------------------------------------------- */

const dt = (label) => encodeURIComponent(label);

export const http = axios.create({
	/* Relative, always. See above. */
	baseURL: "",
	/* The session cookie is the credential. Without this axios drops it and
	   every read comes back as Guest, which reads on screen as a site with no
	   employees rather than as a page that is not signed in. */
	withCredentials: true,
	headers: { Accept: "application/json" },
	timeout: 30000,
});

/** Where the desk lives, for the New / Edit / Delete links that open a form
    over there.

    In production this bundle is served by the site, so the desk is this same
    origin and no configuration is involved. In development the page is on
    :5173 and the site is behind the proxy, so a link has to name it outright —
    `VITE_DESK_URL` in `client/.env`. An install that must not send anybody to
    the desk sets it to `-` and those controls go quiet with the reason on them. */
const DESK = String(import.meta.env.VITE_DESK_URL || "").trim().replace(/\/+$/, "");

export async function deskBase() {
	if (DESK === "-") return "";
	return DESK || window.location.origin;
}

/** An error that still knows what the site answered. 401/403 is "sign in" or
    "not allowed", 404 is missing, 417 is Frappe's validation refusal — and it
    is also what an unknown field comes back as, which the fallback reads in
    load.js depend on. */
export class ApiError extends Error {
	constructor(message, status, excType) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.excType = excType;
	}
}

/** Frappe puts the readable half of an error in `_server_messages` (a JSON
    string of JSON strings) and the traceback in `exception`. */
function reason(e) {
	const d = e?.response?.data;
	if (!d || typeof d !== "object") return e?.message || String(e);
	const msgs = [];
	if (typeof d._server_messages === "string") {
		try {
			for (const m of JSON.parse(d._server_messages)) {
				try { msgs.push(String(JSON.parse(m).message)); } catch { msgs.push(String(m)); }
			}
		} catch { /* not the usual shape */ }
	}
	if (typeof d.message === "string" && d.message) msgs.push(d.message);
	if (!msgs.length && typeof d.exception === "string") msgs.push(d.exception.trim().split("\n").pop());
	if (!msgs.length && d.exc_type) msgs.push(String(d.exc_type));
	return msgs.join(" ").replace(/<[^>]+>/g, "") || e?.message || String(e);
}

/* ---------------------------------------------------------------------------
   The CSRF token.

   Frappe refuses any session write that arrives without one. It belongs to the
   session rather than to the page, so it cannot be bundled and it changes when
   somebody signs in again — which is the whole reason this is three functions
   rather than a constant.

   Two ways of getting it, because neither is present on every version. The
   whitelisted method is the clean one; the desk page carries the token in its
   bootinfo and always has, and is reachable here because `/app` is one origin
   with this page — proxied in development, served by the site in production.

   A token that could not be fetched is not fatal: a site running with
   `ignore_csrf` writes perfectly well without one, and a site that does not
   refuses the first write with a message saying so — at which point `retry`
   below fetches a token and sends it again. Nothing is lost by that ordering
   because Frappe raises the CSRF failure before the request does anything.
   --------------------------------------------------------------------------- */

let csrf = "";

const UNSAFE = new Set(["post", "put", "patch", "delete"]);

async function fetchCsrf() {
	/* Set on `window` when this bundle is served from inside a Frappe page,
	   which is the production shape and costs nothing to check first. */
	const booted = window.frappe?.csrf_token;
	if (booted) return String(booted);

	/* Whitelisted on some versions and not on this site — checked against
	   `mannarubber.m.frappe.cloud` on 5 September 2026, which answered
	   "Function frappe.sessions.get_csrf_token is not whitelisted". Tried first
	   anyway because it is one request and it is the only way that does not
	   depend on the desk being reachable. */
	try {
		const r = await axios.get("/api/method/frappe.sessions.get_csrf_token", {
			withCredentials: true,
		});
		if (typeof r.data?.message === "string" && r.data.message) return r.data.message;
	} catch { /* not on this version */ }

	/* The desk's bootinfo, which has carried the token in every version. Guest
	   gets a redirect to the sign-in page and no token, which is the right
	   answer — there is nothing to protect until somebody is signed in. */
	try {
		const r = await axios.get("/app", { withCredentials: true, responseType: "text" });
		const m = /csrf_token"?\s*[:=]\s*"([^"]+)"/.exec(String(r.data));
		if (m) return m[1];
	} catch { /* the desk is not reachable from here */ }

	return "";
}

/** Fetched once and remembered. Cleared on sign-in and sign-out, because the
    token is the session's and a stale one is refused exactly like none. */
async function ensureCsrf() {
	if (!csrf) csrf = await fetchCsrf();
	return csrf;
}

http.interceptors.request.use(async (config) => {
	if (!UNSAFE.has(String(config.method || "get").toLowerCase())) return config;
	const token = await ensureCsrf();
	if (token) config.headers["X-Frappe-CSRF-Token"] = token;
	return config;
});

/** Frappe's own words for the guard, which is the only way to tell a token that
    is missing from a permission that is genuinely absent. */
const CSRF_REFUSAL = /csrf/i;

http.interceptors.response.use(
	(r) => r,
	async (e) => {
		const status = e?.response?.status;
		const body = e?.response?.data;

		/* One retry, and only for the token. The site refused this before doing
		   anything — the check runs before the request is handled — so nothing was
		   created, changed or deleted and sending it again is safe. A retry after
		   any other 403 would not be. */
		if ((status === 400 || status === 403)
			&& !e.config?._csrfRetried
			&& CSRF_REFUSAL.test(JSON.stringify(body ?? ""))) {
			csrf = "";
			const token = await ensureCsrf();
			if (token) {
				e.config._csrfRetried = true;
				e.config.headers["X-Frappe-CSRF-Token"] = token;
				return http.request(e.config);
			}
		}

		return Promise.reject(new ApiError(reason(e), status, body?.exc_type));
	},
);

/* ---------------------------------------------------------------------------
   Session — Frappe's own three.

   The password crosses this wire once, to the site, over the same origin the
   page came from. Nothing of it is kept here: what the browser holds afterwards
   is the site's `sid` cookie, which is `HttpOnly` and so is not readable from
   this file either.
   --------------------------------------------------------------------------- */

/** Who the session belongs to — "Guest" when nobody is signed in.

    Frappe does not answer this one for Guest: `frappe.auth.get_logged_user` is
    not whitelisted for them, so a browser with no session gets 403 rather than
    the word "Guest". That is not a failure and must not be reported as one —
    the sign-in screen is the correct answer to it. Anything else is a real
    failure and is thrown, so "the site is down" and "you are not signed in"
    stay two different things on screen. */
export async function whoami() {
	try {
		const r = await http.get("/api/method/frappe.auth.get_logged_user");
		return r.data?.message || "Guest";
	} catch (e) {
		if (e.status === 401 || e.status === 403) return "Guest";
		throw e;
	}
}

/** Sign in with an ERPNext user. Everything the dashboard reads and writes
    afterwards runs under that user's roles, which is the whole security model. */
export async function login(usr, pwd) {
	await http.post("/api/method/login", { usr, pwd },
		{ headers: { "Content-Type": "application/json" } });
	/* The old session's token is not this session's. Cleared before the first
	   read rather than after the first refused write. */
	csrf = "";
	return whoami();
}

export async function logout() {
	await http.post("/api/method/logout").catch(() => {});
	csrf = "";
}

/* ---------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------------- */

/** One GET. Params are serialised the way Frappe wants them. */
export async function api(path, params) {
	const r = await http.get(path, { params });
	return r.data;
}

/* Frappe pages at whatever `limit_page_length` says; the loop stops at the
   first short page. Kept in one place because getting the last page wrong
   shows up as a headcount quietly 100 short rather than as an error.

   `size` is for the few reads that are big by nature — a month of everybody's
   punches is thousands of rows, and at 100 a page that is dozens of requests
   against a site with a daily compute limit. */
export async function listAll(label, fields, filters, size = 100) {
	let out = [];
	let start = 0;
	for (;;) {
		const p = {
			fields: JSON.stringify(fields),
			limit_page_length: size,
			limit_start: start,
		};
		if (filters) p.filters = JSON.stringify(filters);
		const page = (await api("/api/resource/" + dt(label), p)).data || [];
		out = out.concat(page);
		if (page.length < size) return out;
		start += size;
	}
}

/** One whole document, child tables included, or null if it cannot be read. */
export async function getDoc(label, name) {
	return api(`/api/resource/${dt(label)}/${encodeURIComponent(name)}`)
		.then((r) => r.data ?? null)
		.catch(() => null);
}

/* ---------------------------------------------------------------------------
   Writes — as the signed-in user, under the site's own permissions.

   **Nothing here submits anything.** Not because this file refuses to — it is a
   client, and a client that refuses is a client somebody can skip — but because
   no screen sends a `docstatus`, and a document created without one is a draft.
   Submitting decides that somebody is paid, and it is done on the desk where
   the validation and the audit trail are.
   --------------------------------------------------------------------------- */

/** One field change. Frappe's PUT is a partial update; a submitted document
    refuses fields not marked allow-on-submit, with 417.
    @returns {Promise<{ok: boolean, error?: string, status?: number}>} */
export async function apiWrite(label, name, patch) {
	try {
		await http.put(`/api/resource/${dt(label)}/${encodeURIComponent(name)}`, patch, {
			headers: { "Content-Type": "application/json" },
		});
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e.message, status: e.status };
	}
}

/** Create one document. Throws rather than returning `{ok}`: a save is several
    documents in order, and the second must not be attempted when the first was
    refused. */
export async function apiCreate(label, doc) {
	const body = { ...doc };
	delete body.doctype;
	/* Said outright rather than left to the default. A document created without
	   a docstatus is a draft either way, and a screen that grew a `docstatus`
	   field by accident would otherwise submit one. */
	body.docstatus = 0;
	const r = await http.post(`/api/resource/${dt(label)}`, body, {
		headers: { "Content-Type": "application/json" },
	});
	return r.data?.data ?? r.data;
}

/** Remove one document. The site's link validation refuses a master that
    anything still points at, with the count in the message. */
export async function apiDelete(label, name) {
	await http.delete(`/api/resource/${dt(label)}/${encodeURIComponent(name)}`);
}

/* ---------------------------------------------------------------------------
   Attachments
   --------------------------------------------------------------------------- */

/** One scan, filed against a record and optionally against a field.

    Frappe's own upload endpoint, in Frappe's own shape: multipart, with the
    target as fields in the body rather than in the query string. `FormData`
    sets the boundary itself, which is why no `Content-Type` is given here —
    writing that header by hand is the one way to break a multipart body.

    **`is_private` is 1 every time and there is no other branch.** A document
    scan is somebody's passport; a public file in Frappe is served to anyone who
    guesses the URL, with no session behind it at all.

    @returns {Promise<object>} the File row, as the site stored it */
export async function apiUpload(file, { doctype, name, field }) {
	const form = new FormData();
	form.append("file", file, file.name || "upload");
	form.append("is_private", "1");
	form.append("doctype", doctype);
	form.append("docname", name);
	/* Left off rather than sent empty when there is no field: a letter belongs
	   to the person, not to one box on their record, and `fieldname: ""` is a
	   request to file it against a field named "". */
	if (field) form.append("fieldname", field);
	/* Frappe's optimiser re-encodes what it is given. A scan is evidence of a
	   document, and re-encoding one to save bandwidth is the sort of quiet loss
	   that is only noticed when somebody needs to read a serial number. */
	form.append("optimize", "0");

	const r = await http.post("/api/method/upload_file", form, {
		/* A scan is bigger than anything else this app sends. The default half
		   minute is for a site that has stopped answering, not for an upload that
		   is still going. */
		timeout: 120000,
	});
	return r.data?.message ?? r.data;
}

/** One scan removed — deleting the File row removes the bytes. */
export async function apiDeleteFile(name) {
	await http.delete("/api/resource/File/" + encodeURIComponent(name));
}
