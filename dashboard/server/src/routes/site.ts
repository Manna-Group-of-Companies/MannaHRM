import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../env.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { allDoctypes } from "../doctypes/registry.js";

/* ---------------------------------------------------------------------------
   /api/site — what this server is and what it will let you do.

   `url` is the one field the client reads. It is fire-and-forget there and
   never fatal: the dashboard draws perfectly well without knowing where it is
   pointed, and the few controls that link out stay disabled with the reason on
   them — a link to nowhere is worse than a dead button that says why.

   Everything else on this response is for a person with curl. Which doctypes
   are served, and which of them can be written, is the question somebody asks
   first when a write comes back 403, and answering it here saves them reading
   registry.ts to find out.
   --------------------------------------------------------------------------- */

export const siteRouter = Router();

const READY: Record<number, string> = {
	0: "disconnected",
	1: "connected",
	2: "connecting",
	3: "disconnecting",
};

/** **A `SITE_URL` pointing at this server is the one value that cannot be true**,
    and it is the easy mistake to make: `.env.example` used to carry
    `http://localhost:8770` as its sample, which is this API.

    It does not fail loudly. `url` goes to the client, the client builds
    `<url>/app/holiday-list/new` out of it — a Frappe desk route — and this
    server answers that path with the SPA's own `index.html`, because everything
    it does not recognise falls through to the client bundle. So New, Edit and
    Delete each open a new tab containing *the dashboard again*, which reads as
    a button that does nothing rather than as a misconfiguration.

    Dropped here rather than in the client because this is the end that knows
    its own address. Reported back as `urlIgnored` so the person with curl who
    is wondering where their setting went is told, rather than left to diff the
    response against the file they edited. */
function siteUrl(host: string): { url: string; ignored?: string } {
	const set = env.siteUrl.trim().replace(/\/+$/, "");
	if (!set) return { url: "" };

	/* `host` carries the port, which is what makes it comparable. Both schemes,
	   because a reverse proxy in front of this terminates TLS and the value
	   somebody typed is as likely to be https as http. */
	const mine = [
		`http://localhost:${env.port}`,
		`http://127.0.0.1:${env.port}`,
		`http://[::1]:${env.port}`,
		...(host ? [`http://${host}`, `https://${host}`] : []),
	];
	return mine.some((m) => m.toLowerCase() === set.toLowerCase())
		? { url: "", ignored: set }
		: { url: set };
}

siteRouter.get(
	"/site",
	asyncRoute(async (req, res) => {
		const site = siteUrl(String(req.headers.host || ""));
		res.json({
			url: site.url,
			/* Absent unless SITE_URL was dropped for naming this server. */
			...(site.ignored ? { urlIgnored: site.ignored } : {}),
			/* Not a boolean called `ok`. "Connected" and "connecting" are different
			   answers to somebody watching a container come up, and collapsing them
			   loses the only one that says to wait rather than to investigate. */
			database: READY[mongoose.connection.readyState] ?? "unknown",
			/* The same switch the client's read-only screens explain to the person
			   in front of them. Said here too, because a control that is disabled
			   and a server that would refuse it are two halves of one answer. */
			write: env.write,
			doctypes: allDoctypes().map((d) => ({
				name: d.label,
				creatable: d.creatable,
				writable: d.writable ?? [],
			})),
		});
	}),
);
