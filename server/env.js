/**
 * Read `.env` at the repo root into `process.env`, if there is one.
 *
 * ## Why this exists
 *
 * Until now the only way to give the dashboard a key was to export it in the
 * shell, which lasts exactly as long as that terminal. A credential that has to
 * be retyped is a credential nobody sets — and a dashboard started without one
 * does not announce itself as unconfigured. It comes up looking finished: every
 * panel empty, every control that opens a document dead, every report
 * generating nothing. That reads as a broken app rather than as a missing key,
 * which is a long afternoon for whoever inherits it.
 *
 * ## The environment wins
 *
 * A value already set is never overwritten. So `$env:ERP_KEY='...'` for a
 * single run still beats the file, and a real secret store on a server beats it
 * too. The file is the fallback, not the authority — which is the order that
 * lets the same checkout run on a laptop and on a box without either one
 * needing to know about the other.
 *
 * ## No dependency, for the reason server/index.js gives
 *
 * These twelve lines rather than `dotenv`. The process this feeds holds a key
 * that can write attendance for the whole group; a supply chain is not worth
 * saving twelve lines. `node --env-file` was the other option and is not used:
 * it has to be spelled on every command line, which is the thing being fixed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* The repo root, one level above this file. `.env` sits there rather than in
   `server/`, because the bridge reads the same credential and neither half
   should have to know where the other one keeps it. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @returns {boolean} whether a file was found and read. */
export function loadEnv(file = path.join(ROOT, ".env")) {
	let text;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		// No file is the normal case on a box that sets real environment
		// variables. Silence rather than a warning: the processes that call this
		// already say whether they ended up with a key, which is the useful half.
		return false;
	}

	for (const line of text.split(/\r?\n/)) {
		// Blank lines and `#` comments fail this outright, so they need no case.
		const m = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
		if (!m) continue;

		let v = m[2].trim();
		const quoted = v.length > 1
			&& ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")));
		if (quoted) {
			v = v.slice(1, -1);
		} else {
			// Unquoted, ` #` starts a comment. An API secret is base-ish text and
			// will not contain one; quote the value if yours somehow does.
			v = v.split(" #")[0].trim();
		}

		if (process.env[m[1]] === undefined) process.env[m[1]] = v;
	}
	return true;
}
