/**
 * Serve the HR dashboard locally, against the live ERPNext site.
 *
 *     ERP_KEY=... ERP_SECRET=... npm start
 *     ->  http://localhost:8770
 *
 * ## Why this needs a server at all, rather than just opening the HTML
 *
 * The browser will not let a file:// page — or a page on any other origin —
 * call `mannarubber.m.frappe.cloud` directly. Frappe pins its CORS header to
 * its own origin, so the request is refused before ERPNext ever sees it.
 *
 * So this process serves the page *and* proxies `/api/...` through to ERPNext,
 * attaching the token server-side. The browser then only ever talks to one
 * origin, which is the same reason the sales dashboard needs its Cloudflare
 * function.
 *
 * ## The token never reaches the browser
 *
 * It is read from the environment here and attached on the way out. Nothing the
 * browser loads knows it, so the page can be opened, shared or screenshotted
 * without leaking a key that can write attendance for the whole group.
 *
 * Read by default: only GET is proxied unless `ERP_WRITE=1` is set, and even
 * then it is two narrow shapes rather than a console — a decision on an approval
 * (one PUT, three doctypes, two fields) and a create on four named doctypes, of
 * which the three payroll ones can only ever be drafts. See WRITABLE, CREATABLE
 * and DRAFT_ONLY below for why each is safe to open at all.
 *
 * ## No dependencies, on purpose
 *
 * Node's own `http` and `fetch` and nothing else. This process holds a key that
 * can write attendance for the whole group; a dependency tree is a supply chain,
 * and this is the one file in the repo where that trade is not worth making.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./env.js";

/* Before the constants below are read, and only as a fallback — anything
   already in the environment wins. See env.js. */
loadEnv();

const PORT = Number(process.env.PORT || 8770);
const ERP_URL = (process.env.ERP_URL || "https://mannarubber.m.frappe.cloud").replace(/\/+$/, "");
/* Either name, because there is only one credential.
 *
 * The bridge reads the same site under MANNA_API_KEY / MANNA_API_SECRET
 * (bridge/mannabridge/config.js), and a single key written down under two
 * names is a key that gets rotated in one place and not the other. So one
 * `.env` serves both, and whichever name is set here is the one that answers. */
const ERP_KEY = process.env.ERP_KEY || process.env.MANNA_API_KEY || "";
const ERP_SECRET = process.env.ERP_SECRET || process.env.MANNA_API_SECRET || "";

/* A key is not required to start. Without one nothing can be read from the
   site, but the page, the layouts and every empty state still work, and that is
   most of what styling this dashboard consists of.

   Exiting here instead used to take `npm run dev` down with it: dev.js prints
   "not fatal, the panels will just be empty" and then watches this process die,
   which stops Vite too. So the reads fail one at a time, each saying why, and
   the page keeps running. */
const HAVE_KEY = Boolean(ERP_KEY && ERP_SECRET);

/* Said per request rather than only at startup, in the shape the client already
   reads — `hint` is the half that reaches the status line. Somebody looking at
   an empty panel is looking at a browser, not at this process's log. */
const NO_KEY = {
	error: "the proxy has no ERP_KEY / ERP_SECRET, so it cannot read the site",
	hint: "no API key: restart with ERP_KEY and ERP_SECRET set",
	status: 503,
};

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* This file lives in `server/`; the site it serves is built to `dist/` at the
   repo root by `npm run build`.

   There is no fallback page any more — the single-file original was retired to
   docs/legacy/ when the site moved to `src/`. So an unbuilt checkout has
   nothing to serve, and that is said in the banner and answered with one
   sentence on every request rather than a bare 404: a blank screen that does
   not say "run npm run build" is a long afternoon for whoever inherits it. */
const ROOT = path.join(HERE, "..", "dist");
const BUILT = fs.existsSync(path.join(ROOT, "index.html"));

/* Only these are reachable through the proxy. An allowlist rather than a
   passthrough: this process holds a System Manager token, and a generic proxy
   would hand the whole site to anything that can reach localhost. */
const ALLOWED = new Set([
	"/api/resource/Employee",
	"/api/resource/Company",
	"/api/resource/Department",
	"/api/resource/Designation",
	"/api/resource/Holiday List",
	"/api/resource/Shift Type",
	"/api/resource/Employee Checkin",
	"/api/resource/Attendance",
	"/api/resource/Leave Application",
	// Both names: this app installs `Attendance Regularization`, and the older
	// page asked for the longer one. Neither exists on the site yet.
	"/api/resource/Attendance Regularization",
	"/api/resource/Employee Attendance Regularization",
	"/api/resource/Shift Assignment",
	"/api/resource/Letter Type",
	"/api/resource/Employee Letter",
	// On Board → Assets. ERPNext's own asset module, which is installed here and
	// is most of what Factor HR's two Assets screens do. Read-only like the
	// rest: an asset register is accounting as well as HR, and this page has no
	// business writing into it.
	"/api/resource/Asset",
	"/api/resource/Asset Category",
	"/api/resource/Asset Movement",
	"/api/resource/Leave Type",
	/* Payroll, added 31 August 2026 for Salary Master's revision form. Read so
	   the form can see which components already exist; written only as drafts,
	   and only under ERP_WRITE — see CREATABLE and the docstatus guard below.
	   `Salary Slip` and `Payroll Entry` are deliberately NOT here: nothing on
	   this site should be able to run a payroll. */
	"/api/resource/Salary Component",
	"/api/resource/Salary Structure",
	"/api/resource/Salary Structure Assignment",
	"/api/method/frappe.client.get_count",
]);

/* Writing is off unless asked for: `ERP_WRITE=1 npm start`.
 *
 * Deciding an approval is a write, and this process holds a System Manager
 * token, so the default stays a window. What the flag opens is deliberately not
 * a console either. Two shapes, both narrow:
 *
 *   PUT   one of three doctypes, setting one of two fields  (WRITABLE)
 *   POST  one of four doctypes: three payroll drafts, or an
 *         Employee from the Create Employee wizard              (CREATABLE)
 *
 * Everything else still 403s.
 *
 * It is safe to open at all only because the rule is not here. Setting
 * `status = Approved` on an Attendance Regularization fires `on_update` inside
 * the site, which runs `_guard_self_approval` and then writes the missing
 * Employee Checkin rows. A client cannot skip that by writing the field
 * directly — writing the field *is* how it is invoked. See CLAUDE.md §1. */
const WRITE = process.env.ERP_WRITE === "1";
const WRITABLE = new Set([
	"Attendance Regularization",
	"Employee Attendance Regularization",
	"Leave Application",
]);
/* A decision, and the sentence explaining it. Not dates, not amounts, and not
   `employee` — a proxy that can move a request to another person is a proxy
   that can pay the wrong one. */
const WRITABLE_FIELDS = new Set(["status", "decision_note"]);

/* What POST may create, and nothing else. Salary Master's revision form writes
   the first three: the components a wage type needs, the structure holding the
   typed amounts, and the assignment naming the person and the date.
 *
 * Creating is a narrower power than updating, which is why this is a separate
 * list from WRITABLE. A new draft that is wrong is deleted; a submitted
 * document that is wrong is cancelled, amended, and lives on the site forever.
 * Hence DRAFT_ONLY below.
 *
 * `Employee` was added on 2 September 2026 for Employee Master's Create
 * Employee wizard, and it is the one entry here that is not payroll. The
 * argument for it is that an Employee is a *person on file* rather than a
 * transaction: it is not submittable, so there is nothing for DRAFT_ONLY to
 * guard, and on its own it pays nobody — that still needs a Salary Structure
 * Assignment, which this proxy will only ever create as a draft. A record that
 * turns out to be wrong is corrected on the site.
 *
 * What it can get wrong is attendance, in one way worth naming here because
 * the site will not catch it: `attendance_device_id` has no unique constraint,
 * so two people can hold one machine code and every punch on that finger then
 * lands on whichever of them is found first. The wizard refuses that before it
 * posts (client/src/lib/newemp.js, `clashes`) — which is a courtesy in front
 * of the site, not enforcement. Anything holding curl can still do it, and if
 * that matters it belongs on the site. CLAUDE.md §1 and §5. */
const CREATABLE = new Set([
	"Salary Component",
	"Salary Structure",
	"Salary Structure Assignment",
	"Employee",
]);

/* The guard that makes the three above safe to expose at all.
 *
 * A submitted Salary Structure Assignment is what Payroll Entry reads, so
 * submitting one is the act that decides what somebody is paid. This proxy
 * cannot do it: `docstatus` must be absent or 0, and the two doctypes that pay
 * anybody — Salary Slip, Payroll Entry — are not reachable through here at all.
 * A human submits on the site, where the site's own rules run. CLAUDE.md §1. */
const DRAFT_ONLY = new Set(["Salary Structure", "Salary Structure Assignment"]);

const AUTH = () => `token ${ERP_KEY}:${ERP_SECRET}`;

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

function sendJson(res, code, payload) {
	const body = Buffer.from(JSON.stringify(payload));
	res.writeHead(code, {
		"Content-Type": "application/json",
		"Content-Length": body.length,
	});
	res.end(body);
}

/** One line per API call, nothing for static files. Enough to see the dashboard
    working without burying it in favicon requests. */
const logApi = (p) => process.stderr.write("  " + p.slice(0, 110) + "\n");

/* Static files, out of whichever root is in play.

   Vite writes hashed assets under `/assets/`, and those resolve normally.
   Anything else — a refresh on a deep link, a stray path — is the app rather
   than a missing file, so it gets `index.html` and the page decides what to
   draw. Only for the built tree: an unbuilt checkout has no shell to fall back
   to, and it says so rather than 404ing at whoever is looking at a blank tab. */
function serveStatic(req, res, pathname) {
	let rel = decodeURIComponent(pathname).replace(/^\/+/, "");
	if (rel === "") rel = "index.html";

	// Nothing above the root, whatever the request says. `..` in a URL is the
	// oldest way to read a file a server never meant to hand out.
	let file = path.resolve(ROOT, rel);
	if (!file.startsWith(path.resolve(ROOT))) return sendJson(res, 403, { error: "no" });

	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		/* Nothing has been built, so there is no page to fall back to. Say which
		   of the two it is: "not found" on every path reads as a broken server,
		   and the answer is one command. */
		if (!BUILT) {
			res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
			return res.end("the site has not been built yet - run `npm run build` at the repo root\n");
		}
		file = path.join(ROOT, "index.html");
	}

	const body = fs.readFileSync(file);
	res.writeHead(200, {
		"Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
		"Content-Length": body.length,
	});
	res.end(body);
}

async function proxyGet(req, res, url) {
	const pathname = decodeURIComponent(url.pathname);

	/* Where this proxy is pointed, so a page that can only read can still link to
	   the one place a change is made. The base URL and nothing else — it is
	   already in app/README.md and printed in the banner below, and it is what
	   turns the calendar's New / Edit / Delete from dead controls into a way to
	   the site. The token stays in this process. */
	if (pathname === "/api/site") return sendJson(res, 200, { url: ERP_URL });

	/* An allowed doctype covers both its list endpoint and single documents
	   under it — `/api/resource/Letter Type` and `.../Letter Type/Gratuity`.
	   Still an allowlist: a doctype absent from ALLOWED is unreachable either
	   way, which is what stops this becoming a general proxy onto a site the
	   token can rewrite. */
	let ok = false;
	for (const a of ALLOWED) {
		if (pathname === a || pathname.startsWith(a + "/")) { ok = true; break; }
	}
	if (!ok) return sendJson(res, 403, { error: "not allowed through this proxy: " + pathname });

	// After the allowlist, so a path that would never have been proxied reads as
	// refused rather than as a missing key.
	if (!HAVE_KEY) return sendJson(res, 503, NO_KEY);

	const target = ERP_URL + url.pathname + (url.search || "");
	try {
		const r = await fetch(target, {
			headers: { Authorization: AUTH(), Accept: "application/json" },
			signal: AbortSignal.timeout(90000),
		});
		const text = await r.text();
		if (!r.ok) {
			/* 429 is the daily compute limit, and it arrives as an HTML page.
			   Saying so beats the page rendering an empty list as "no staff". */
			const hint = r.status === 429
				? "The site has hit its daily compute limit. It resets daily."
				: "";
			return sendJson(res, r.status, { error: text.slice(0, 400), hint, status: r.status });
		}
		const body = Buffer.from(text);
		res.writeHead(200, {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			"Content-Length": body.length,
		});
		res.end(body);
	} catch (e) {
		sendJson(res, 502, { error: String(e && e.message ? e.message : e).slice(0, 300) });
	}
}

/** One decision, onto one document. Nothing else gets through. */
async function proxyPut(req, res, url) {
	const pathname = decodeURIComponent(url.pathname);
	const parts = pathname.includes("/api/resource/")
		? pathname.split("/api/resource/")[1].split("/")
		: [];

	if (parts.length !== 2 || !WRITABLE.has(parts[0])) {
		return sendJson(res, 403, { error: "not writable through this proxy: " + pathname });
	}
	if (!WRITE) {
		return sendJson(res, 403, {
			error: "writes are off",
			hint: "Restart with ERP_WRITE=1 to let this page decide requests. "
				+ "PowerShell:  $env:ERP_WRITE='1'; npm start",
		});
	}

	if (!HAVE_KEY) return sendJson(res, 503, NO_KEY);

	let patch;
	try {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		patch = JSON.parse(Buffer.concat(chunks).toString() || "{}");
	} catch (e) {
		return sendJson(res, 400, { error: "unreadable body: " + String(e.message).slice(0, 120) });
	}

	const extra = Object.keys(patch).filter((k) => !WRITABLE_FIELDS.has(k));
	if (extra.length) {
		return sendJson(res, 403, { error: "field not writable: " + extra.sort().join(", ") });
	}

	// Every write is printed, always. A decision that changes somebody's pay
	// should not be the one line missing from the log.
	process.stderr.write(`  PUT ${pathname} ${JSON.stringify(patch)}\n`);

	try {
		const r = await fetch(ERP_URL + url.pathname, {
			method: "PUT",
			body: JSON.stringify(patch),
			headers: {
				Authorization: AUTH(),
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(90000),
		});
		const text = await r.text();
		if (!r.ok) {
			/* A refusal from the site is the system working — a self-approval
			   guard, a permission, a validation — so it is passed through whole
			   rather than flattened into "failed". */
			return sendJson(res, r.status, { error: text.slice(0, 600), status: r.status });
		}
		const body = Buffer.from(text);
		res.writeHead(200, { "Content-Type": "application/json", "Content-Length": body.length });
		res.end(body);
	} catch (e) {
		sendJson(res, 502, { error: String(e && e.message ? e.message : e).slice(0, 300) });
	}
}

/** Creating one document, on one of three payroll doctypes, as a draft.
 *
 *  Everything a save needs and nothing it does not. There is no PATCH of an
 *  existing structure and no DELETE here: a revision that was got wrong is
 *  deleted on the site by somebody who can see what else points at it. */
async function proxyPost(req, res, url) {
	const pathname = decodeURIComponent(url.pathname);
	const parts = pathname.includes("/api/resource/")
		? pathname.split("/api/resource/")[1].split("/")
		: [];

	// One segment: a create. `/api/resource/X/y` is an update, and POST is not
	// how this proxy does those.
	if (parts.length !== 1 || !CREATABLE.has(parts[0])) {
		return sendJson(res, 403, { error: "not creatable through this proxy: " + pathname });
	}
	if (!WRITE) {
		return sendJson(res, 403, {
			error: "writes are off",
			hint: "Restart with ERP_WRITE=1 to let this page create documents. "
				+ "PowerShell:  $env:ERP_WRITE='1'; npm start",
		});
	}
	if (!HAVE_KEY) return sendJson(res, 503, NO_KEY);

	let doc;
	try {
		const chunks = [];
		for await (const c of req) chunks.push(c);
		doc = JSON.parse(Buffer.concat(chunks).toString() || "{}");
	} catch (e) {
		return sendJson(res, 400, { error: "unreadable body: " + String(e.message).slice(0, 120) });
	}

	/* The whole reason payroll can be on the allowlist at all. Submitting is
	   what makes a document payable, and this refuses to be the thing that
	   does it — however the body is shaped, and whatever the page meant. */
	if (DRAFT_ONLY.has(parts[0]) && doc.docstatus !== undefined && Number(doc.docstatus) !== 0) {
		return sendJson(res, 403, {
			error: "this proxy creates drafts only",
			hint: `A submitted ${parts[0]} is what payroll reads. Submit it on the site, `
				+ "where the approval and the audit trail on it live.",
		});
	}

	// Every write is printed, always. A document that changes somebody's pay
	// should not be the one line missing from the log.
	process.stderr.write(`  POST ${pathname} ${JSON.stringify(doc).slice(0, 300)}
`);

	try {
		const r = await fetch(ERP_URL + url.pathname, {
			method: "POST",
			body: JSON.stringify(doc),
			headers: {
				Authorization: AUTH(),
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(90000),
		});
		const text = await r.text();
		if (!r.ok) {
			/* A refusal from the site is the system working — a mandatory field, a
			   duplicate name, a validation in hrms — so it is passed through whole
			   rather than flattened into "failed". The page shows it verbatim. */
			return sendJson(res, r.status, { error: text.slice(0, 900), status: r.status });
		}
		const body = Buffer.from(text);
		res.writeHead(200, { "Content-Type": "application/json", "Content-Length": body.length });
		res.end(body);
	} catch (e) {
		sendJson(res, 502, { error: String(e && e.message ? e.message : e).slice(0, 300) });
	}
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	const isApi = url.pathname.startsWith("/api/");
	if (isApi) logApi(req.url);

	if (req.method === "GET" || req.method === "HEAD") {
		if (isApi) return void proxyGet(req, res, url);
		return serveStatic(req, res, url.pathname);
	}
	if (req.method === "PUT") return void proxyPut(req, res, url);
	if (req.method === "POST") return void proxyPost(req, res, url);
	sendJson(res, 405, { error: "method not allowed: " + req.method });
});

function main() {
	if (!HAVE_KEY) {
		/* A warning, not an exit. See HAVE_KEY above: stopping here stopped Vite
		   too, and a dashboard you cannot open is worse than an empty one. */
		process.stderr.write(`
ERP_KEY and ERP_SECRET are not set. Serving the page anyway - every read will
answer 503 and every panel will be empty.

Put the key in .env at the repo root, which outlives this terminal:

  cp .env.example .env      # then edit it

Or for one run only:

  PowerShell:  $env:ERP_KEY='...'; $env:ERP_SECRET='...'; npm start
  Git Bash:    ERP_KEY=... ERP_SECRET=... npm start

`);
	}

	console.log("Manna HR dashboard");
	console.log(`   site   ${ERP_URL}`);
	console.log(`   open   http://localhost:${PORT}`);
	console.log(`   token  ${HAVE_KEY ? "set" : "MISSING - every read answers 503"}`);
	console.log(`   write  ${WRITE
		? "ON - approvals and DRAFT salary revisions will be written to the site"
		: "off - read only (set ERP_WRITE=1 to allow decisions, salary drafts and new employees)"}`);
	// Said out loud, because "my change isn't showing up" is otherwise a long
	// afternoon: this process serves the build, never the source.
	console.log(`   page   ${BUILT
		? "dist/ - the built site"
		: "NOT BUILT - run `npm run build`, or `npm run dev` for hot reload"}`);
	console.log("   stop   Ctrl+C\n");

	/* A port already taken is almost always this same file still running from
	   an earlier terminal, and Node's default for it is an unhandled 'error'
	   event — a stack trace ending in EADDRINUSE, which under `npm run dev`
	   scrolls past and takes Vite down with it. Say the one useful sentence
	   instead. */
	server.on("error", (e) => {
		if (e.code === "EADDRINUSE") {
			process.stderr.write(`
port ${PORT} is already in use, most likely by an earlier npm start that
is still running. Stop that one, or start this one somewhere else:

  PowerShell:  $env:PORT='8771'; npm start
  Git Bash:    PORT=8771 npm start

`);
			process.exit(1);
		}
		throw e;
	});
	server.listen(PORT, "127.0.0.1");
	process.on("SIGINT", () => {
		console.log("\nstopped");
		process.exit(0);
	});
}

main();
