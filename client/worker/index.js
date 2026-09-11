/* ---------------------------------------------------------------------------
   The dashboard on Cloudflare: the bundle out of `dist/`, and the ERPNext site
   behind the same hostname.

   This is `server.proxy` in vite.config.js, for production. The reason is the
   same one: Frappe pins its CORS header to its own origin and the session
   cookie belongs to whichever host set it, so the page and `/api` have to look
   like one origin to the browser. Read that file's comment first — every trap
   it names applies here too.

   **It is a pipe and must stay one.** It forwards four prefixes to one fixed
   host and changes nothing but the headers that would otherwise break the
   session. No rule lives here: what somebody is paid is still decided on the
   site, as the signed-in user, by the site's own permission checks (CLAUDE.md
   §1). A check added here would be a second place to disagree with the site.

   It does see every password and every session cookie on the way through. That
   is the price of not being served by the site, and why the site serving the
   page at `/hr` is the other supported home.
   --------------------------------------------------------------------------- */

/* What the dashboard asks the site for, and nothing else. `/app` and `/desk`
   are only for `fetchCsrf`, which reads a token out of the desk's bootinfo —
   both, because this site's Frappe moved the desk: `/app` now answers 301 to
   `/desk`, and the browser follows that on its own. Forward `/app` alone and
   the redirect lands on this Worker's index.html, which has no token in it, and
   every write is refused for CSRF. `/files` and `/private` are the bytes behind
   a `File` row, followed by the browser itself. None of the dashboard's own
   pages is under any of these — they are `/employees/…`, `/attendance/…` — so
   claiming them shadows nothing. */
const SITE_PATHS = ["/api", "/app", "/desk", "/files", "/private"];

export const forSite = (pathname) =>
	SITE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

/* Cloudflare's own headers about the hop into this Worker. Forwarded, they
   describe a request the site never received. */
const HOP = ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "x-real-ip"];

export async function forward(request, site) {
	const origin = new URL(site).origin;
	const url = new URL(request.url);

	const headers = new Headers(request.headers);
	for (const h of HOP) headers.delete(h);
	/* Sent as the site's own, as the dev proxy does, so nothing there reads this
	   as a cross-site request. */
	if (headers.has("origin")) headers.set("origin", origin);
	if (headers.has("referer")) headers.set("referer", origin + "/");
	/* Without this every request arrives from one of Cloudflare's addresses, and
	   Frappe's login lockout — which counts failures per address as well as per
	   user — would lock out the whole group the moment one person mistyped a
	   password often enough. Frappe takes the first value of this header as the
	   caller. */
	const caller = request.headers.get("cf-connecting-ip");
	if (caller) headers.set("x-forwarded-for", caller);

	const bodyless = request.method === "GET" || request.method === "HEAD";
	/* Concatenated, never `new URL(path, origin)`: a path of `//elsewhere.com/x`
	   resolves against a base to a different host, and this Worker would then be
	   an open relay carrying somebody's session cookie to it. */
	const res = await fetch(origin + url.pathname + url.search, {
		method: request.method,
		headers,
		body: bodyless ? undefined : request.body,
		/* A redirect is the browser's to follow, so it lands on this origin
		   (see `location` below) rather than being followed here and handed back
		   as if it had been the answer. */
		redirect: "manual",
		/* `/private/files/payslip.pdf` has an extension Cloudflare caches by
		   default. Cached at the edge, the next person to ask for that address
		   is handed it without the site ever checking who they are. */
		cache: "no-store",
	});

	const out = new Headers(res.headers);
	/* The site's Domain attribute off, so the browser files the cookie under
	   this hostname instead of refusing it. Secure stays: this is HTTPS. */
	out.delete("set-cookie");
	for (const c of res.headers.getSetCookie()) {
		out.append("set-cookie", c.replace(/;\s*Domain=[^;]*/gi, ""));
	}
	/* Logout and a lapsed session both redirect to the site's own address.
	   Followed as-is, that takes somebody off this origin onto one where they are
	   not signed in, and the dashboard is gone from the address bar. */
	const location = out.get("location");
	if (location && (location === origin || location.startsWith(origin + "/"))) {
		out.set("location", location.slice(origin.length) || "/");
	}

	return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export default {
	fetch(request, env) {
		return forSite(new URL(request.url).pathname)
			? forward(request, env.ERP_URL)
			: env.ASSETS.fetch(request);
	},
};
