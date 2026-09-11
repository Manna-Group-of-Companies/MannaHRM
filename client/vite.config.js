import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
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

/* ---------------------------------------------------------------------------
   Serving this from the site itself, which is the arrangement it is written
   for: it makes the page and the API one origin for real and takes the dev
   proxy above out of the picture entirely.

   Frappe gives an app two places to put things, and this needs both, because
   they answer two different questions:

     `manna_hr/public/hr/`   the files, served at `/assets/manna_hr/hr/…`.
                             That is what `base` has to be — every `<script>`
                             and every font in the built HTML is fetched from
                             there.
     `manna_hr/www/hr.html`  the page, served at `/hr` and, with the
                             `website_route_rules` entry in hooks.py, at every
                             path under it. That is what `VITE_ROUTE_BASE` is,
                             and it is a different string from `base` — the
                             assets and the addresses do not live together.

   Getting the two confused gives a page that loads and then 404s every script,
   or one whose scripts load and whose deep links land on Frappe's own 404. Both
   are one-line mistakes and neither looks like the other on screen, which is
   why they are named apart here rather than derived from each other.
   --------------------------------------------------------------------------- */
const ASSETS_AT = "/assets/manna_hr/hr/";
const APP_DIR = path.resolve(HERE, "../manna_hr");

/** Copy the built `index.html` to `manna_hr/www/hr.html`, which is the file
    Frappe actually serves.

    A copy rather than a symlink or a build target: `www/` is Jinja's, and the
    page it renders has to be the one Vite just wrote with this build's hashed
    filenames in it. A stale `hr.html` beside a fresh `public/hr/` is a white
    screen and a 404 for a script nobody deleted. */
const publishPage = (outDir) => ({
	name: "manna-publish-www-page",
	closeBundle() {
		const from = path.join(outDir, "index.html");
		if (!fs.existsSync(from)) return;
		const to = path.join(APP_DIR, "www", "hr.html");
		fs.mkdirSync(path.dirname(to), { recursive: true });
		fs.copyFileSync(from, to);
		this.info(`www page → ${path.relative(path.resolve(HERE, ".."), to)}`);
	},
});

export default defineConfig(({ command, mode }) => {
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

	/* Only on a build for the site. `npm run dev` serves at the root off :5173,
	   so a base here would make the dev server ask for its own modules under a
	   prefix nothing answers on.

	   `--mode cloudflare` is the other home, and it is the dev arrangement
	   rather than the site one: served at the root, with `worker/index.js`
	   standing where the proxy above stands. It writes `dist/` and leaves
	   `manna_hr/public/hr/` alone — a Cloudflare build that emptied the site's
	   bundle would be one commit away from shipping a white page to `/hr`. */
	const forSite = command === "build" && mode !== "cloudflare";
	const outDir = forSite
		? path.join(APP_DIR, "public", "hr")
		: path.resolve(HERE, "dist");

	return {
		root: HERE,
		base: forSite ? ASSETS_AT : "/",
		plugins: [react(), ...(forSite ? [publishPage(outDir)] : [])],
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
				/* Where `/app` now redirects on this site's Frappe. Without it the
				   browser follows the 301 to this dev server's own index.html and
				   the token is never found. */
				"/desk": proxy,
				/* The bytes behind a `File` row, which the browser follows itself —
				   an <img>, a tab, a save. */
				"/files": proxy,
				"/private": proxy,
			},
		},
		build: {
			/* Straight into the app, so `bench build` and a deploy carry it without
			   anybody remembering to copy a directory. `emptyOutDir` is safe on
			   this path because nothing but a build ever writes there — it is
			   `manna_hr/public/hr`, not `manna_hr/public`. */
			outDir,
			emptyOutDir: true,
			/* Not on Cloudflare: everything in `dist/` is published, and a map
			   there is the whole client's source, comments and all, to anyone
			   who asks for it. The site's copy is safe because `.gitignore` keeps
			   its maps out of the repo the bench deploys from. */
			sourcemap: forSite,
		},
	};
});
