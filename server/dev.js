/**
 * `npm run dev` — the proxy and the dev server, together.
 *
 * Developing the dashboard needs two processes, and that is not obvious from
 * anywhere:
 *
 *   - `server/index.js` holds the API token and proxies `/api` to ERPNext
 *   - Vite serves the page on :5173 and forwards `/api` to that proxy
 *
 * Running only the second gives a page that loads and then reports every panel
 * as empty, which reads as a broken app rather than as a missing process. So
 * this starts both, prefixes their output so it is clear which is speaking, and
 * stops both when either one dies or you press Ctrl+C.
 *
 * No dependencies. A launcher is not worth a supply chain, and `child_process`
 * already does this.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./env.js";

/* Read here as well as in server/index.js, because the children inherit this
   environment and the check below has to see the same key they will. */
loadEnv();

/* The repo root, one level above this file. Resolved against the file rather
   than the shell's cwd, so `npm run dev` works from a subdirectory — and both
   children below are given an explicit cwd rather than inheriting one. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => path.join(ROOT, ...p);

// Either name — see the note in server/index.js. One credential, two spellings.
const KEY = process.env.ERP_KEY || process.env.MANNA_API_KEY;
const SECRET = process.env.ERP_SECRET || process.env.MANNA_API_SECRET;
const NEEDS_KEY = !KEY || !SECRET;
if (NEEDS_KEY) {
	/* Not fatal — the page and every layout still work without a key, and that
	   is genuinely useful for styling. But the panels will all read empty, and
	   somebody should be told which of the two that is.

	   `.env` is named first because it is the one that survives closing the
	   terminal, and a key that has to be retyped is a key nobody sets. */
	console.log(
		"\n  ERP_KEY / ERP_SECRET are not set, so the proxy cannot read the site.\n"
		+ "  The page will load and every panel will be empty. To see real data,\n"
		+ "  copy .env.example to .env and put the key in it:\n\n"
		+ "    cp .env.example .env      # then edit it, and run npm run dev again\n\n"
		+ "  Or for one run only:\n\n"
		+ "    PowerShell:  $env:ERP_KEY='...'; $env:ERP_SECRET='...'; npm run dev\n"
		+ "    Git Bash:    ERP_KEY=... ERP_SECRET=... npm run dev\n",
	);
}

/* Vite's own JS entry rather than `npm run dev` in a subdirectory.
 *
 * Spawning `npm` here means spawning `npm.cmd` on Windows, and since Node 20
 * that fails outright with `spawn EINVAL` unless `shell: true` — which then
 * puts every argument through cmd's quoting rules, and this repo lives under a
 * path with a space in it. Running the entry point with the Node we are already
 * in sidesteps both. */
const VITE = at("node_modules", "vite", "bin", "vite.js");

/* Step past a busy port instead of dying on one.
 *
 * The process holding 8770 is nearly always this repo's own proxy, still
 * running in a terminal that was closed rather than Ctrl+C'd. The proxy used to
 * exit on that, which brought Vite down with it and made `npm run dev` read as
 * broken when nothing was. Vite has always moved to the next free port; the
 * proxy now does the same, and tells Vite where it landed. */
function portIsFree(port) {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.once("error", () => resolve(false));
		probe.once("listening", () => probe.close(() => resolve(true)));
		probe.listen(port, "127.0.0.1");
	});
}

async function freePort(first) {
	for (let port = first; port < first + 20; port++) {
		if (await portIsFree(port)) return port;
	}
	/* Twenty of them taken is not a stale server, it is something else wrong,
	   and silently trying forever would hide it. */
	throw new Error(`no free port between ${first} and ${first + 19}`);
}

const children = [];
let stopping = false;

function start(name, command, args, options = {}) {
	const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
	children.push(child);

	const prefix = (stream, chunk) => {
		for (const line of String(chunk).split(/\r?\n/)) {
			if (line.trim()) stream.write(`  [${name}] ${line}\n`);
		}
	};
	child.stdout.on("data", (c) => prefix(process.stdout, c));
	child.stderr.on("data", (c) => prefix(process.stderr, c));

	child.on("exit", (code) => {
		if (stopping) return;
		// One half of a two-process setup dying leaves the other looking fine
		// and answering nothing, which is the confusion this file exists to
		// prevent. So the pair goes down together.
		console.log(`\n  [${name}] exited (${code}). Stopping the other.\n`);
		stop(code ?? 0);
	});
	return child;
}

function stop(code) {
	if (stopping) return;
	stopping = true;
	for (const c of children) {
		try { c.kill(); } catch { /* already gone */ }
	}
	process.exit(code);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

/* An explicit PORT is still honoured — it just becomes where the search starts,
   so `PORT=9000 npm run dev` means what it says. */
const PORT = await freePort(Number(process.env.PORT || 8770));

start("proxy", process.execPath, [at("server", "index.js")], {
	env: { ...process.env, PORT: String(PORT) },
});
/* Vite's /api proxy has to reach wherever the proxy actually landed, so the
   port is handed over rather than hard-coded in vite.config.js. */
/* `client` is Vite's root, given as the positional argument rather than left
   to the cwd — the same spelling `npm run build` uses, so the dev server and
   the build cannot end up reading two different trees. */
start("vite", process.execPath, [VITE, at("client")], {
	cwd: ROOT,
	env: { ...process.env, MANNA_PROXY_PORT: String(PORT) },
});

/* Vite prints its own URL a moment from now, and moves to another port when
   5173 is taken — so it says the address rather than this file guessing it. */
console.log("  Vite prints the address to open, below.");
console.log(`  The proxy is on :${PORT} and holds the token. Ctrl+C stops both.\n`);
