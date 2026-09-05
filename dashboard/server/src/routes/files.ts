import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { ApiError } from "../http/ApiError.js";
import { asyncRoute } from "../http/asyncRoute.js";

/* ---------------------------------------------------------------------------
   /files/<name> — the bytes behind a `File` row.

   Two things happen at one URL, because the popover on the Document register
   offers two verbs against one attachment and they differ by a single header:

     /files/x.svg              Open      — shown in the tab
     /files/x.svg?download=1   Download  — saved, under the name a person gave it

   Not `express.static`. Static would answer either verb identically, and
   "Download" that opens a passport scan in the tab instead of saving it is the
   kind of control somebody clicks twice and then gives up on.

   **Registered before the SPA fallback in app.ts.** Everything unrecognised
   there falls through to `index.html`, so a missing file served by the wrong
   handler would come back as the dashboard, at 200, and reach the browser as a
   page where an image was expected.
   --------------------------------------------------------------------------- */

export const filesRouter = Router();

/** The absolute path this request is asking for, or null if it is asking for
    something outside the directory.

    `path.resolve` collapses `..` before the check rather than after, which is
    the ordering that matters: `/files/../server/.env` normalises to a path that
    simply does not start with the files directory, and is refused for that
    reason rather than by pattern-matching the dots. */
function resolveWithin(root: string, rel: string): string | null {
	const abs = path.resolve(root, rel);
	if (abs !== root && !abs.startsWith(root + path.sep)) return null;
	return abs;
}

/** A filename safe to put in a header. Quotes and newlines out — a `"` closes
    the parameter early and a newline splits the response into two. */
function headerName(name: string): string {
	return name.replace(/[\r\n"\\]/g, "").trim() || "attachment";
}

filesRouter.get(
	"/files/*",
	asyncRoute(async (req, res) => {
		/* Decoded once. The name on disk carries spaces — a scan is called
		   "Aravind Kumar Passport.svg" because that is what somebody saving it
		   wants to see — so the URL carries `%20` and this is where it stops. */
		let rel: string;
		try {
			rel = decodeURIComponent(String((req.params as Record<string, string>)[0] ?? ""));
		} catch {
			throw ApiError.invalid("BadPath", "That file path is not valid percent-encoding.");
		}

		const abs = rel ? resolveWithin(env.filesDir, rel) : null;
		if (!abs) {
			throw ApiError.forbidden(
				"OutsideFiles",
				"That path resolves outside the files directory. Nothing was served.",
			);
		}

		/* `statSync` rather than `existsSync`, because a directory exists too and
		   `sendFile` on one is an EISDIR five frames deeper than the cause. */
		const stat = await fs.promises.stat(abs).catch(() => null);
		if (!stat?.isFile()) {
			throw ApiError.notFound(
				"NoFile",
				`There is no file at /files/${rel}. The File row pointing at it is still on the site — `
				+ "a row whose bytes have gone is worth seeing rather than hiding, because it is the "
				+ "one state a filing cabinet must not be in quietly.",
			);
		}

		if (req.query.download !== undefined) {
			/* The name a person gave it, not the name on disk. The two differ on
			   purpose: two passports are both "Passport.svg" and one would
			   overwrite the other in the directory. */
			const asked = String(req.query.name || path.basename(abs));
			res.setHeader("Content-Disposition", `attachment; filename="${headerName(asked)}"`);
		}

		/* A scan is somebody's identity document. It must not sit in a shared
		   cache, and it must not be re-served to the next person on this machine
		   from the browser's disk cache either. */
		res.setHeader("Cache-Control", "private, no-store");
		res.setHeader("X-Content-Type-Options", "nosniff");

		/* **This is what makes it safe to serve a file somebody uploaded.** These
		   bytes are on the same origin as the dashboard, and an SVG is a document
		   that can carry script — so without this, Open on a crafted attachment
		   would run that script with the page's own origin and everything it can
		   reach. `sandbox` with no allowances puts the response in an opaque
		   origin: images and PDFs still render, scripts do not run, and nothing
		   in the file can reach the app. It is the same header GitHub serves raw
		   content under, for the same reason.

		   Set here rather than on the upload route because it has to hold for the
		   seeded files too, and for anything already on disk from before the
		   upload route existed. */
		res.setHeader("Content-Security-Policy", "sandbox");
		res.sendFile(abs);
	}),
);
