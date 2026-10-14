/* ---------------------------------------------------------------------------
   The practice site on a port: demo/site.mjs behind node's own HTTP server.

   Listens on 127.0.0.1 only, so nobody else on the network can reach a site
   that lets anybody sign in. It makes no outgoing request of any kind — there
   is no fetch, no proxy and no address of the real site anywhere in this
   folder, and tests/demosite.test.js keeps it that way.

       node demo/server.mjs          # the site alone, for poking at with curl
       npm run demo                  # the site and the dashboard together
   --------------------------------------------------------------------------- */

import http from "node:http";
import { pathToFileURL } from "node:url";
import { makeData } from "./data.mjs";
import { createSite } from "./site.mjs";

const cookiesOf = (header) => Object.fromEntries(String(header || "").split(";").map((c) => c.trim()).filter(Boolean)
	.map((c) => { const i = c.indexOf("="); return i < 0 ? [c, ""] : [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));

/** A request's body as Frappe would read it: JSON, a form, or nothing (a file
    upload, which the site refuses without needing to read it). */
function bodyOf(type, raw) {
	if (!raw) return {};
	if (/json/i.test(type)) { try { return JSON.parse(raw); } catch { return {}; } }
	if (/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(raw));
	return {};
}

/**
 * Start the practice site.
 * @param {{port?: number, host?: string, seed?: object}} [opts]
 * @returns {Promise<{url: string, meta: object, close: () => Promise<void>}>}
 */
export async function startPracticeSite({ port = 5301, host = "127.0.0.1", seed = makeData() } = {}) {
	const site = createSite(seed);
	const server = http.createServer((req, res) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			let out;
			try {
				const url = new URL(req.url, `http://${host}`);
				out = site.handle({
					method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
					body: bodyOf(req.headers["content-type"], Buffer.concat(chunks).toString("utf8")),
					cookies: cookiesOf(req.headers.cookie),
				});
			} catch (e) {
				out = { status: 500, headers: { "Content-Type": "application/json" }, body: { exc_type: "PracticeSiteError", exception: String(e && e.stack || e) } };
			}
			res.writeHead(out.status, out.headers);
			res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
		});
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, resolve);
	});
	return {
		url: `http://${host}:${server.address().port}`,
		meta: site.meta,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}

/* Run directly: the site alone. */
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
	const s = await startPracticeSite({ port: Number(process.env.DEMO_SITE_PORT) || 5301 });
	console.log(`Practice site (data only) at ${s.url} — ${s.meta.people} dummy people, ${s.meta.monthLabel}.`);
}
