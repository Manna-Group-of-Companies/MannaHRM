/* ---------------------------------------------------------------------------
   The app, in a real browser, against the real site.

       npm run dev            # in one terminal
       npm run smoke          # in another

   `npm test` renders every page under jsdom with axios replaced, which is the
   right tool for "does this component throw" and cannot answer the question
   this script is for: **does the whole path work** — the browser, the Vite
   proxy, the session cookie, and `mannarubber.m.frappe.cloud` at the end of it.
   Those are four things that each look fine on their own and fail together, and
   every one of the three that this catches failed silently the first time:

     the Host header    Frappe Cloud is multi-tenant and picks the site from it.
                        Get it wrong and the request lands nowhere.
     the cookie         the site sets `sid` Secure and for its own domain. A
                        browser on http://localhost drops both, so the sign-in
                        succeeds and every request after it is Guest — which
                        reads on screen as a company with no employees.
     the CSRF token     `frappe.sessions.get_csrf_token` is not whitelisted on
                        this site, so the token comes from the desk bootinfo.
                        A write refused for it is refused with no useful message.

   **It signs in with a password that is deliberately wrong**, and that is the
   whole design rather than a limitation. The 401 comes back from the live site,
   travels the same path a real session would, and proves every hop of it —
   without this repo needing a credential in it. See docs/OPEN_QUESTIONS.md on
   where the real key lives and why it is not here.

   Chrome is used as installed rather than downloaded: `channel: "chrome"`, so
   `npm i` does not pull a browser nobody asked for.
   --------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const APP = process.env.SMOKE_URL || "http://localhost:5173";
const SHOTS = process.env.SMOKE_SHOTS || path.join("scripts", ".smoke");

/* Every deep link is checked, because the one thing a router can get wrong that
   nothing else notices is a refresh landing on the wrong page. `/nonsense` is
   here for the opposite reason: an address nobody recognises must land on the
   front page rather than on a blank screen. */
const ROUTES = [
	["/employees/salary", "/employees/salary"],
	["/attendance/shifts", "/attendance/shifts"],
	["/employees", "/employees"],
	["/nonsense", "/dashboard"],
];

let failures = 0;

const ok = (label, pass, detail = "") => {
	if (!pass) failures++;
	console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

async function main() {
	await waitForServer();
	fs.mkdirSync(SHOTS, { recursive: true });

	const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

	const errors = [];
	const seen = [];
	page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
	page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
	page.on("response", (r) => {
		if (r.status() >= 400) seen.push(`${r.status()} ${new URL(r.url()).pathname}`);
	});

	console.log("\nthe page");
	await page.goto(APP, { waitUntil: "networkidle" });
	await page.waitForSelector(".loginbox", { timeout: 20000 });
	ok("sign-in renders", await page.locator(".loginbox h1").isVisible());
	ok("both boxes are there",
		await page.locator('.loginbox input[type="text"]').isVisible()
		&& await page.locator('.loginbox input[type="password"]').isVisible());
	ok("submit is disabled until both are filled",
		await page.locator('.loginbox button[type="submit"]').isDisabled());
	await page.screenshot({ path: `${SHOTS}/01-signin.png` });

	console.log("\nthe form takes typing");
	const user = page.locator('.loginbox input[type="text"]');
	const pass = page.locator('.loginbox input[type="password"]');
	await user.fill("smoke@example.invalid");
	await pass.fill("deliberately-wrong");
	ok("user box holds what was typed", (await user.inputValue()) === "smoke@example.invalid");
	ok("password box holds what was typed", (await pass.inputValue()).length === 18);
	ok("submit is enabled now", await page.locator('.loginbox button[type="submit"]').isEnabled());

	console.log("\nthe site answers");
	await page.locator('.loginbox button[type="submit"]').click();
	await page.waitForSelector(".loginbox [role=alert]", { timeout: 30000 });
	const message = (await page.locator(".loginbox [role=alert]").innerText()).trim();
	/* The words matter. A 401 read as anything else means `reason()` stopped
	   understanding Frappe's error shape, and every refusal on every screen
	   goes with it. */
	ok("a wrong password is reported as one", message === "Wrong user or password.", message);
	ok("the login request reached the site", seen.some((s) => s.startsWith("401 /api/method/login")));
	await page.screenshot({ path: `${SHOTS}/02-refused.png` });

	console.log("\ndeep links survive a cold load");
	for (const [ask, want] of ROUTES) {
		await page.goto(APP + ask, { waitUntil: "networkidle" });
		await page.waitForSelector(".loginbox", { timeout: 20000 });
		const got = new URL(page.url()).pathname;
		ok(`${ask} → ${want}`, got === want, got === want ? "" : `got ${got}`);
	}

	console.log("\nnothing broke on the way");
	/* Three failures are the run working, and each is named rather than the
	   check being loosened — a filter that lets anything through is a check
	   that will pass the day something real breaks.

	     403 get_logged_user        Frappe does not whitelist it for Guest, so
	                                this is how `whoami` learns nobody is signed
	                                in and the sign-in screen appears.
	     403 get_csrf_token         not whitelisted on this site — checked
	                                5 Sep 2026. `fetchCsrf` falls through to the
	                                desk bootinfo, which is the next line.
	     401 login                  the deliberately wrong password. It is the
	                                point of the run. */
	const EXPECTED = [
		/^403 \/api\/method\/frappe\.auth\.get_logged_user$/,
		/^403 \/api\/method\/frappe\.sessions\.get_csrf_token$/,
		/^401 \/api\/method\/login$/,
	];
	const unexpected = seen.filter((s) => !EXPECTED.some((p) => p.test(s)));
	ok("no unexpected failed requests", unexpected.length === 0, unexpected.join(", "));
	/* Guest cannot call `get_logged_user` — Frappe does not whitelist it for
	   them — so 403 there is the sign-in screen working, not a fault. Anything
	   else in the console is. */
	const real = errors.filter((e) => !/403 \(FORBIDDEN\)|401 \(UNAUTHORIZED\)/.test(e));
	ok("no unexplained console errors", real.length === 0, real.slice(0, 3).join(" | "));

	await browser.close();

	console.log(`\nscreenshots: ${SHOTS}`);
	console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
	process.exit(failures ? 1 : 0);
}

async function waitForServer() {
	for (let i = 0; i < 30; i++) {
		try {
			const r = await fetch(APP, { signal: AbortSignal.timeout(2000) });
			if (r.ok) return;
		} catch { /* not up yet */ }
		await new Promise((r) => setTimeout(r, 1000));
	}
	console.error(`Nothing is serving ${APP}. Start it with \`npm run dev\` first.`);
	process.exit(2);
}

await main();
