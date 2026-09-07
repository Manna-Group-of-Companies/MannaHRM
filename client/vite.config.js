import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* ---------------------------------------------------------------------------
   The page and the API have to look like one origin to the browser, and the
   API is the ERPNext site itself.

   Frappe pins its CORS header to its own origin, so a page on :5173 cannot call
   `mannarubber.m.frappe.cloud` — the request is refused before ERPNext ever
   sees it, and a cross-origin request would not carry the session cookie
   anyway. This proxy is what makes development look like production, where the
   site serves this bundle and the two are one origin for real.

   Three things it has to get right, and every one of them fails silently:

     `changeOrigin`   Frappe Cloud is multi-tenant and picks the site from the
                      Host header. Without this the request arrives at a site
                      that does not exist.
     the cookie       the site sets `sid` with its own Domain and with Secure.
                      A browser on http://localhost drops both, so the sign-in
                      succeeds and every request after it is Guest — which
                      reads on screen as a company with no employees.
     the Origin       sent as the site's own, so nothing on that side treats
                      this as a cross-site request.

   Nothing about the site reaches the bundle. `VITE_DESK_URL` does, and it is a
   link somebody clicks rather than an address this app calls.
   --------------------------------------------------------------------------- */

const HERE = import.meta.dirname;

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, HERE, "");
	const target = (env.ERP_URL || "https://mannarubber.m.frappe.cloud").replace(/\/+$/, "");
	const origin = new URL(target).origin;

	const proxy = {
		target,
		changeOrigin: true,
		secure: true,
		/* The site's Domain attribute off, so the browser keeps the cookie for
		   localhost. `Secure` has to come off too and there is no option for it —
		   see `configure`. */
		cookieDomainRewrite: "",
		configure(px) {
			px.on("proxyReq", (req) => {
				req.setHeader("origin", origin);
				/* Frappe reads Referer on a few paths. One that names :5173 is not
				   wrong, it is just a second thing to explain in a log. */
				if (req.getHeader("referer")) req.setHeader("referer", origin + "/");
			});
			px.on("proxyRes", (res) => {
				const set = res.headers["set-cookie"];
				if (!set) return;
				/* `Secure` and `SameSite=None` are a pair — a browser refuses
				   SameSite=None without Secure — so both come off together and Lax
				   is what is left, which is what the site would have sent for a
				   same-site request anyway. */
				res.headers["set-cookie"] = set.map((c) =>
					c.replace(/;\s*Secure/gi, "").replace(/;\s*SameSite=None/gi, "; SameSite=Lax"));
			});
		},
	};

	return {
		root: HERE,
		plugins: [react()],
		resolve: {
			alias: { "@": path.resolve(HERE, "./src") },
			extensions: [".mjs", ".js", ".jsx", ".json"],
		},
		server: {
			port: 5173,
			proxy: {
				"/api": proxy,
				/* The desk page, for the one thing this app reads out of it: the CSRF
				   token in its bootinfo, when the whitelisted method is not on this
				   site's version. See `fetchCsrf` in src/api/client.js. */
				"/app": proxy,
				/* The bytes behind a `File` row, which the browser follows itself —
				   an <img>, a tab, a save. */
				"/files": proxy,
				"/private": proxy,
			},
		},
		build: {
			/* Plain `dist/`, and `base` left at `/` with it.

			   **Where this gets served in production is still open**, and building
			   to a prefix would decide it silently. The pages route on the path —
			   `/employees/salary-master` is an address, see routes/router.js — so
			   whatever serves this has to answer every unmatched path with
			   `index.html`, and on a Frappe site that means a `website_route_rules`
			   hook and a `base` to match. That is a change to `manna_hr/hooks.py`
			   and to the router, not a line in this file. See client/README.md. */
			outDir: path.resolve(HERE, "dist"),
			emptyOutDir: true,
			sourcemap: true,
		},
	};
});
