import express, { type Express } from "express";
import cors from "cors";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";
import { errorHandler, notFound } from "./http/errors.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { filesRouter } from "./routes/files.js";
import { resourceRouter } from "./routes/resource.js";
import { siteRouter } from "./routes/site.js";

/* ---------------------------------------------------------------------------
   The server, assembled.

   One process serves the API *and* the built client, and that is the whole
   reason the client's `baseURL` is relative and carries no auth header: the
   browser only ever sees one origin. In development Vite proxies `/api` here
   for the same effect. If a header or an absolute URL ever appears on the
   client side, the two halves have stopped being one origin and everything
   that arrangement was protecting has to be reconsidered.
   --------------------------------------------------------------------------- */

export function createApp(): Express {
	const app = express();

	/* Behind a reverse proxy in production, so that a rate limiter or a log line
	   sees the caller's address rather than the proxy's. */
	app.set("trust proxy", 1);
	/* One less thing telling the internet what this is built on. */
	app.disable("x-powered-by");

	app.use(morgan(env.isProd ? "combined" : "dev"));

	/* Empty by default, and that is the intended production shape: this process
	   serves the page, so there is no cross-origin call to allow. The setting
	   exists for the case where somebody runs the client from a different host
	   during development and knows they are doing it. */
	if (env.corsOrigins.length) {
		app.use(cors({ origin: env.corsOrigins, credentials: true }));
	}

	/* A Salary Structure carries two child tables and can run to a few hundred
	   rows; 1MB is Express's default and is comfortably above that. Anything
	   larger arriving here is a mistake worth refusing rather than absorbing. */
	app.use(express.json({ limit: "1mb" }));

	app.use("/api", siteRouter);
	/* Before the resource router, and with its own body parser: an upload
	   carries bytes and needs a limit the rest of the API has no use for. */
	app.use("/api", attachmentsRouter);
	app.use("/api/resource", resourceRouter);

	/* Anything under /api that matched no route is an API error and gets the
	   API's shape. Registered before the static handler so a mistyped endpoint
	   answers as JSON rather than as the client's index.html, which would reach
	   axios as HTML and read as "the site is down". */
	app.use("/api", notFound);

	/* The bytes behind a `File` row, and they are *not* under /api: the browser
	   follows this URL itself — an <img>, a tab, a save — so a JSON envelope
	   around it would be the one thing on this API nobody can use. Before the
	   static handler and the SPA fallback below, both of which would answer a
	   missing scan with index.html at 200. */
	app.use(filesRouter);

	serveClient(app);

	app.use(errorHandler);
	return app;
}

/** The built client, if it has been built.

    Absent is a normal state — the API is useful on its own, and `npm run dev`
    in `client/` serves the page itself. So a missing `dist/` is a line on
    startup rather than a refusal to run. */
function serveClient(app: Express): void {
	const index = path.join(env.clientDist, "index.html");
	if (!fs.existsSync(index)) {
		console.warn(
			`[client] ${env.clientDist} has no index.html — serving the API only. `
			+ "Run `npm run build` in client/ to have this process serve the page too.",
		);
		return;
	}

	/* The hashed assets are immutable by construction: Vite puts the content
	   hash in the filename, so a change is a different URL. `index.html` is not
	   and must not be cached, or a deploy leaves browsers asking for asset names
	   that no longer exist. */
	app.use(express.static(env.clientDist, { index: false, maxAge: "1y", etag: true }));

	/* The client routes on the path — /attendance/shifts is a page, not a file —
	   so anything that reached here and is not an API call is the page. */
	app.get("*", (_req, res) => {
		res.setHeader("Cache-Control", "no-store");
		res.sendFile(index);
	});
}
