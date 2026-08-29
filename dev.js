/**
 * `npm run dev` — the proxy and the dev server, together.
 *
 * Developing the dashboard needs two processes, and that is not obvious from
 * anywhere:
 *
 *   - `app/serve.js` holds the API token and proxies `/api` to ERPNext
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
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/* Resolved against this file rather than the shell's cwd. Vite is started with
   `cwd: app/web`, so a relative path would be looked up from there and land at
   `app/web/app/web/...`; and `npm run dev` should work from a subdirectory
   anyway. */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const at = (...p) => path.join(ROOT, ...p);

const NEEDS_KEY = !process.env.ERP_KEY || !process.env.ERP_SECRET;
if (NEEDS_KEY) {
	/* Not fatal — the page and every layout still work without a key, and that
	   is genuinely useful for styling. But the panels will all read empty, and
	   somebody should be told which of the two that is. */
	console.log(
		"\n  ERP_KEY / ERP_SECRET are not set, so the site will refuse every read.\n"
		+ "  The page will load and every panel will be empty. To see real data:\n\n"
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
const VITE = at("app", "web", "node_modules", "vite", "bin", "vite.js");

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

start("proxy", process.execPath, [at("app", "serve.js")]);
start("vite", process.execPath, [VITE], { cwd: at("app", "web") });

/* Vite prints its own URL a moment from now, and moves to another port when
   5173 is taken — so it says the address rather than this file guessing it. */
console.log("  Vite prints the address to open, below.");
console.log("  The proxy is on :8770 and holds the token. Ctrl+C stops both.\n");
