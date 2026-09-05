import type { Server } from "node:http";
import { createApp } from "./app.js";
import { connect, disconnect } from "./db.js";
import { env } from "./env.js";

/* ---------------------------------------------------------------------------
   Start, and stop properly.

   The database is connected *before* the port is opened. The other order gets a
   server that accepts requests it cannot answer, and the first minute of every
   deploy is then a burst of 503s that look like an outage rather than like a
   boot.
   --------------------------------------------------------------------------- */

async function main(): Promise<void> {
	await connect();
	console.log(`[db]     connected to ${redact(env.mongoUri)}`);

	const app = createApp();
	const server: Server = app.listen(env.port, () => {
		console.log(`[api]    http://localhost:${env.port}/api`);
		console.log(`[writes] ${env.write ? "ENABLED (ERP_WRITE=1)" : "off — read-only"}`);
	});

	/* Both signals, because a container sends TERM and a terminal sends INT, and
	   a process that only handles one of them looks fine in development and
	   loses in-flight requests in production. */
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => {
			console.log(`\n[api]    ${signal} — closing`);
			server.close(() => {
				void disconnect().then(() => process.exit(0));
			});
			/* If something is holding a socket open, do not hang forever. Ten
			   seconds is longer than any request this API makes. */
			setTimeout(() => process.exit(1), 10_000).unref();
		});
	}
}

/** The connection string with its password taken out, for the log line. A URI
    printed whole on startup is a password in every log aggregator it reaches. */
function redact(uri: string): string {
	return uri.replace(/\/\/([^:@/]+):([^@]+)@/, "//$1:***@");
}

main().catch((err: unknown) => {
	console.error("[api]    failed to start:", err);
	process.exit(1);
});
