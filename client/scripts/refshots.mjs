/* ---------------------------------------------------------------------------
   The HRDashboard reference, photographed — every route and every popup worth
   comparing, both palettes, a desktop and a phone.

       npm run refshots                 # everything, about ten minutes
       REF_ONLY=jobs,job/ npm run refshots   # the views starting with these

   docs/design/hrdashboard-reference.html is the app this client is being
   rebuilt to match (asked for 21 October 2026). These pictures are the
   targets the rebuilt pages are compared against, so they are taken the way
   `shots.mjs` takes ours: Chrome as installed, the palette chosen by
   `colorScheme` rather than by clicking the switch, and motion reduced so a
   count-up or a donut is photographed where it ends rather than halfway. The
   reference reads reduced motion once, at load, so it holds for the whole run.

   **The pictures are not committed.** They land in docs/design/reference-shots/,
   which .gitignore keeps out of the repo for the reason it gives for every
   other screenshot: this repo is what `bench get-app` clones onto the site,
   and several hundred PNGs would be most of it. The reference file is
   committed and the list of views is `refroutes.mjs`, so the set is one
   command away on any machine.

   **Layout, not figures.** The reference seeds its people with Math.random in
   places and dates everything from today, and ours reads the live site, so
   two pictures of one page never share their numbers. What is compared is
   everything else.

   Long pages scroll inside `.main`, not the document, so a full-page
   screenshot would stop at the window. Each route is photographed at the
   window and then once per further screenful of `.main`: `__02`, `__03`…
   --------------------------------------------------------------------------- */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { AUTH_ROUTES, APP_ROUTES, STATES } from "./refroutes.mjs";

const HERE = import.meta.dirname;
const REF = process.env.REF_FILE || path.resolve(HERE, "../../docs/design/hrdashboard-reference.html");
const OUT = process.env.REF_DIR || path.resolve(HERE, "../../docs/design/reference-shots");
const ONLY = (process.env.REF_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const want = (name) => !ONLY.length || ONLY.some((o) => name.startsWith(o));

const SIZES = [
	["1440", 1440, 1024],
	["390", 390, 844],
];
const SCHEMES = ["light", "dark"];
/* A screenful past the fifth is the same table again. */
const MAX_SCROLLS = 5;
const STORE = "hrms-full-v1";

const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

async function settle(page) {
	await page.evaluate(() => document.fonts.ready);
	/* The router fades the old view for 140 ms before drawing the new one,
	   even with motion reduced; two frames after that is a drawn page. */
	await page.waitForTimeout(240);
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** To a view, as a fresh load of the page. Not a hash change: the reference
    keeps every menu group it has opened, and every stepper's step, for as
    long as the page lives, so after a hundred views in one load the side
    menu is open from top to bottom. A visitor arriving at the view sees only
    its own group open, and that is the picture to match. What the reference
    saved — the session, and the welcome popup already seen — carries over. */
async function visit(page, route) {
	const url = page.url().split("#")[0];
	await page.goto("about:blank");
	await page.goto(`${url}#/${route}`, { waitUntil: "load" });
	await settle(page);
}

async function shoot(page, file) {
	await page.screenshot({ path: `${file}.png` });
	const { h, c } = await page.evaluate(() => {
		const m = document.querySelector("#mainScroll");
		return m ? { h: m.scrollHeight, c: m.clientHeight } : { h: 0, c: 0 };
	});
	let n = 1;
	for (; n < MAX_SCROLLS && c && n * c < h; n++) {
		await page.evaluate((y) => {
			const m = document.querySelector("#mainScroll");
			m.style.scrollBehavior = "auto";
			m.scrollTop = y;
		}, n * c);
		await page.waitForTimeout(60);
		await page.screenshot({ path: `${file}__${String(n + 1).padStart(2, "0")}.png` });
	}
	return n;
}

/** The reference signs in anybody whose email is on an employee record, and
    wants six characters of anything for a password. The address is typed
    rather than left to the form: it remembers the last one tried, and the
    sign-in error above leaves a wrong one there. */
const FIRST_EMPLOYEE = "pristia.candra@company.com";
async function signIn(page) {
	await visit(page, "signin");
	await page.locator('input[name="email"]').fill(FIRST_EMPLOYEE);
	await page.locator("#pw-password").fill("reference");
	await page.locator('form[data-form="signin"] button.btn-ink').click();
	await page.waitForFunction(() => location.hash.startsWith("#/dashboard"));
	await settle(page);
}

async function pass(browser, url, scheme, [tag, width, height], failures) {
	const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: "reduce" });
	const page = await ctx.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	const name = (view) => path.join(OUT, `${slug(view)}__${scheme}__${tag}`);
	let shots = 0;
	const attempt = async (label, fn) => {
		const before = errors.length;
		try {
			await fn();
		} catch (e) {
			failures.push(`${label} ${scheme} ${tag}: ${String(e.message).split("\n")[0]}`);
		}
		if (errors.length > before) failures.push(`${label} ${scheme} ${tag}: page error — ${errors.slice(before).join("; ")}`);
	};

	await page.goto(url + "#/signin", { waitUntil: "networkidle" });

	/* Signed out: the auth screens, and the sign-in form's two failures. */
	for (const r of AUTH_ROUTES.filter(want)) {
		await attempt(r, async () => { await visit(page, r); shots += await shoot(page, name(r)); });
	}
	if (want("state-signin")) {
		await attempt("state-signin-error", async () => {
			await visit(page, "signin");
			await page.locator('input[name="email"]').fill("nobody@example.com");
			await page.locator("#pw-password").fill("reference");
			await page.locator('form[data-form="signin"] button.btn-ink').click();
			await settle(page);
			shots += await shoot(page, name("state-signin-error"));
		});
		await attempt("state-signin-invalid", async () => {
			await visit(page, "signin");
			await page.locator('input[name="email"]').fill("");
			await page.locator('form[data-form="signin"] button.btn-ink').click();
			await settle(page);
			shots += await shoot(page, name("state-signin-invalid"));
		});
	}

	/* In. The first dashboard after signing in opens the welcome popup, 700 ms
	   later; it is photographed then, and closed, so no other view carries it. */
	await signIn(page);
	await attempt("state-welcome", async () => {
		await page.locator(".welcome-hero").waitFor({ state: "visible", timeout: 4000 });
		await settle(page);
		if (want("state-welcome")) {
			await page.screenshot({ path: `${name("state-welcome")}.png` });
			shots++;
		}
		await page.locator('#ov [data-act="close"]').last().click();
		await page.locator("#ov.show").waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
	});

	const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), STORE);
	for (const r of APP_ROUTES) {
		const [label, route] = typeof r === "string" ? [r, r] : [r.name, r.resolve(saved)];
		if (!want(label)) continue;
		await attempt(label, async () => {
			if (!route) throw new Error("no such record in the reference's seed");
			await visit(page, route);
			shots += await shoot(page, name(label));
		});
	}

	for (const st of STATES) {
		if (st.only && st.only !== tag) continue;
		if (!want("state-" + st.name)) continue;
		await attempt("state-" + st.name, async () => {
			await visit(page, st.route);
			await st.open(page);
			await settle(page);
			await page.screenshot({ path: `${name("state-" + st.name)}.png` });
			shots++;
			if (st.close) await st.close(page);
		});
	}

	/* The skeleton is drawn only while the page boots with a session, and
	   reduced motion makes that zero milliseconds — so it is the one view
	   taken with motion on, the moment the document is in. */
	if (want("state-skeleton")) {
		await attempt("state-skeleton", async () => {
			await page.emulateMedia({ reducedMotion: "no-preference" });
			/* A real load: a goto that differs only in its hash is the same
			   document, and the skeleton is drawn only by `boot()`. */
			await page.goto("about:blank");
			await page.goto(url + "#/dashboard", { waitUntil: "domcontentloaded" });
			await page.locator("#view .sk").first().waitFor({ state: "visible", timeout: 2000 });
			await page.screenshot({ path: `${name("state-skeleton")}.png` });
			shots++;
		});
	}

	await ctx.close();
	return shots;
}

async function main() {
	if (!fs.existsSync(REF)) throw new Error(`No reference at ${REF}`);
	fs.mkdirSync(OUT, { recursive: true });
	const url = pathToFileURL(REF).href;
	const browser = await chromium.launch({ channel: "chrome" });
	const failures = [];
	let shots = 0;
	for (const scheme of SCHEMES) {
		for (const size of SIZES) {
			shots += await pass(browser, url, scheme, size, failures);
			console.log(`${scheme} ${size[0]}: done`);
		}
	}
	await browser.close();
	console.log(`${shots} pictures in ${path.relative(process.cwd(), OUT)}`);
	if (failures.length) {
		console.log(`${failures.length} views not taken:`);
		for (const f of failures) console.log("  ✗ " + f);
		process.exitCode = 1;
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
