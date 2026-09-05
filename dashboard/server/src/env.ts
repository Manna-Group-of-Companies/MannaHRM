import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ---------------------------------------------------------------------------
   Configuration, read once and never read again.

   Everything that can differ between two runs of this process is here, so that
   "what is this server pointed at" is one file rather than a grep for
   `process.env`. Read at import time and frozen: a value that can change while
   the process is up is a value that two requests can disagree about.
   --------------------------------------------------------------------------- */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repo root — `server/src` in development, `server/dist` once built, so
    two levels up either way. `CLIENT_DIST` is resolved against it. */
const ROOT = path.resolve(HERE, "..", "..");

function str(key: string, fallback: string): string {
	const v = process.env[key];
	return v === undefined || v === "" ? fallback : v;
}

function int(key: string, fallback: number): number {
	const v = Number(process.env[key]);
	return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = Object.freeze({
	port: int("PORT", 8770),

	mongoUri: str("MONGODB_URI", "mongodb://127.0.0.1:27017/manna_hrm"),

	siteUrl: str("SITE_URL", ""),

	/* Exactly "1", not "true" and not "yes". One spelling, so that a run that
	   somebody believes is writing and a run that is writing are the same run —
	   a flag with three accepted spellings has three chances to be off when it
	   was meant to be on, and this one decides whether a dashboard can change
	   payroll. */
	write: process.env.ERP_WRITE === "1",

	/** Comma-separated, empty for same-origin only. */
	corsOrigins: str("CORS_ORIGIN", "").split(",").map((s) => s.trim()).filter(Boolean),

	clientDist: path.resolve(ROOT, str("CLIENT_DIST", "dist")),

	/* Where the bytes behind a `File` row live. Outside the client bundle on
	   purpose: `dist/` is wiped by every build, and a passport scan that
	   disappears when somebody rebuilds the front end is a scan nobody can rely
	   on. Resolved against the repo root, so the default is `<root>/files`. */
	filesDir: path.resolve(ROOT, str("FILES_DIR", "files")),

	isProd: process.env.NODE_ENV === "production",
});

export type Env = typeof env;
