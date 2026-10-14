/* ---------------------------------------------------------------------------
   npm run demo — the dashboard, on the practice site's dummy data.

   Starts demo/server.mjs, then the ordinary dev server pointed at it instead of
   the real site. vite.config.js reads ERP_URL through loadEnv, where a value
   already in the process beats client/.env — which names the real site — so it
   is set here before Vite reads anything. And then checked: if the proxy did
   not come out pointing at the practice site, nothing is started. A practice
   page that could write to the real site is the one thing this must never be.

   127.0.0.1:5310 and not localhost:5300, so the practice sign-in cookie and the
   page's stored preferences never mix with a real session in the same browser.
   --------------------------------------------------------------------------- */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { startPracticeSite } from "./server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DEMO_PORT) || 5310;

const site = await startPracticeSite({ port: Number(process.env.DEMO_SITE_PORT) || 5301 }).catch((e) => {
	console.error(e.code === "EADDRINUSE"
		? "The practice site's port is in use — it may already be running. Close the other window first."
		: `The practice site could not start: ${e.message || e}`);
	process.exit(1);
});

process.env.ERP_URL = site.url;
/* No "Open in Frappe" link may point at the real desk from here. */
process.env.VITE_DESK_URL = "-";
/* The leave rules write Leave Applications on sign-in; on dummy data that only
   changes the dummy month under the person looking at it. */
process.env.VITE_LEAVE_RULES = "off";

const { createServer } = await import("vite");
const vite = await createServer({
	configFile: path.join(HERE, "..", "vite.config.js"),
	root: path.join(HERE, ".."),
	server: { host: "127.0.0.1", port: PORT, strictPort: true, open: false },
});

const targets = Object.values(vite.config.server.proxy || {}).map((p) => (typeof p === "string" ? p : p && p.target));
if (!targets.length || targets.some((t) => String(t).replace(/\/+$/, "") !== site.url)) {
	console.error(`Stopped: the dashboard would have talked to ${targets.join(", ") || "nothing"} instead of the practice site (${site.url}).`);
	await vite.close();
	await site.close();
	process.exit(1);
}

try {
	await vite.listen();
} catch (e) {
	console.error(e.code === "EADDRINUSE" || /in use/i.test(String(e.message))
		? `Port ${PORT} is in use — the practice site may already be running. Close the other window first.`
		: `The dashboard could not start: ${e.message || e}`);
	await site.close();
	process.exit(1);
}

const m = site.meta;
console.log(`
  Practice site ready:  http://127.0.0.1:${PORT}

  Sign in with any name and any password.
  ${m.people} made-up people, ${m.monthLabel}:
    ${m.companies[0]}  —  ${m.slipsCompany ? "salary slips made and submitted" : "no salary slips"}
    ${m.companies[1]}  —  pay set, no salary slips (its wages register is the preview)

  Nothing here reaches mannarubber.m.frappe.cloud.
  Restarting the practice site puts the dummy data back as it was.
  Ctrl+C stops it.
`);

const stop = async () => { await vite.close(); await site.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
