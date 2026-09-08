import { afterEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The mount prefix — `/hr`, when this is served by the site that is its API.

   Two strings decide where this app lives and they are not the same one. The
   *files* are fetched from `/assets/manna_hr/hr/…`, which is `base` in
   vite.config.js. The *addresses* are `/hr/employees/salary-master`, which is
   `VITE_ROUTE_BASE` and is what this file is about. Confusing them gives a page
   that loads and 404s every script, or one whose scripts load and whose deep
   links land on Frappe's own 404 — one-line mistakes that look nothing like
   each other on screen.

   The prefix is the boundary between the browser's idea of an address and this
   app's, so `routes/paths.js` never sees it and the 93 tests over that grammar
   do not know it exists. Everything below is about the boundary itself: that
   what goes out carries the prefix, what comes in has it taken off, and that
   the two are inverses — because a round trip that is not an inverse is a
   refresh that lands somewhere other than where somebody was.

   `import.meta.env` is read at module scope in the router, so each case has to
   stub it and re-import. `vi.resetModules` between them is what stops the
   second case seeing the first one's prefix.
   --------------------------------------------------------------------------- */

/** The router, loaded fresh with `VITE_ROUTE_BASE` set to `value`. */
async function routerWith(value) {
	vi.resetModules();
	vi.stubEnv("VITE_ROUTE_BASE", value);
	return import("@/routes/router");
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("mounted at the root, which is development", () => {
	it("adds no prefix when the variable is unset", async () => {
		const r = await routerWith("");
		expect(r.MOUNT).toBe("");
		expect(r.pathFor("employees", "salary")).toBe("/employees/salary");
	});

	/* A person who writes `/` means the root, and a `.env` is written by hand.
	   Left alone this becomes a prefix of "/" on every path — `//employees`,
	   which the browser reads as a host. */
	it("reads a bare slash as the root rather than as a prefix", async () => {
		const r = await routerWith("/");
		expect(r.MOUNT).toBe("");
		expect(r.pathFor("employees", "salary")).toBe("/employees/salary");
	});
});

describe("mounted under a prefix, which is the site", () => {
	it("puts the prefix on every path it builds", async () => {
		const r = await routerWith("/hr");
		expect(r.pathFor("employees", "salary")).toBe("/hr/employees/salary");
		expect(r.pathFor("dashboard", "overview")).toBe("/hr/dashboard");
	});

	it("takes the prefix off a path the browser gives it", async () => {
		const r = await routerWith("/hr");
		expect(r.routeFromPath("/hr/employees/salary"))
			.toMatchObject({ section: "employees", subtab: "salary" });
	});

	/* The mount on its own is the front page — the same answer `/` gives at the
	   root, tidied by `startRouter` to `/hr/dashboard` on arrival. Not canonical,
	   for that reason, and the assertion says so rather than leaving the reader
	   to wonder whether a redirect is a bug.

	   Without the special case it parses as a section called "hr", which does not
	   exist; the fallback would still land on the Dashboard, so nothing would
	   look wrong, and `/hr/anything-at-all` would behave identically. */
	it("reads the mount on its own as the front page", async () => {
		const r = await routerWith("/hr");
		const at = r.routeFromPath("/hr");
		expect(at.section).toBe(r.DEFAULT_SECTION);
		expect(at.canonical).toBe(false);
		expect(r.pathFor(at.section, at.subtab)).toBe("/hr/dashboard");
	});

	/* The round trip is the one that matters: every path this app writes into
	   the address bar is a path it will be handed back on a refresh. */
	it("round-trips every page it can build", async () => {
		const r = await routerWith("/hr");
		const { MODULES } = await import("@/routes/registry");
		for (const [section, m] of Object.entries(MODULES)) {
			for (const subtab of Object.keys(m.pages)) {
				const path = r.pathFor(section, subtab);
				expect(path.startsWith("/hr/")).toBe(true);
				expect(r.routeFromPath(path)).toMatchObject({ section, subtab });
			}
		}
	});

	/* Both spellings anybody would reach for, because the value is typed into a
	   file by hand and a trailing slash is not a different deployment. */
	it.each(["/hr/", "hr", "//hr"])("normalises %s to /hr", async (given) => {
		const r = await routerWith(given);
		expect(r.MOUNT).toBe("/hr");
		expect(r.pathFor("employees", "salary")).toBe("/hr/employees/salary");
	});

	/* A path from outside the mount still lands somewhere. `parsePath` falls
	   back to the front page for anything it does not recognise — this site has
	   no addresses worth telling somebody they got wrong — and the prefix must
	   not turn that into a throw. */
	it("still resolves a path that is not under the mount", async () => {
		const r = await routerWith("/hr");
		expect(r.routeFromPath("/app/employee").section).toBe(r.DEFAULT_SECTION);
		expect(r.routeFromPath("/").section).toBe(r.DEFAULT_SECTION);
	});

	/* `/hrms` is not `/hr` plus a page, and a prefix match on the string alone
	   would say it was. Frappe HR's own portal is at `/hrms` on this very site,
	   so this is a collision that exists rather than one invented for a test. */
	it("does not claim a path that merely starts with the same letters", async () => {
		const r = await routerWith("/hr");
		expect(r.routeFromPath("/hrms/employees").section).toBe(r.DEFAULT_SECTION);
	});
});
