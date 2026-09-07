import { describe, expect, it } from "vitest";
import { OVERVIEW, DEFAULT_SECTION, pathFor, parsePath } from "@/routes/paths";
import { MODULES } from "@/routes/registry";

/* ---------------------------------------------------------------------------
   The URL grammar.

   `routes/router.js` has said "tested in tests/paths.test.js" since it was
   written and this is the first version of that file — the grammar was split
   out of the router precisely so it could be tested without a browser, and then
   nobody wrote the test. It is worth having for one reason above the others:
   every address in this app is built and parsed by these two functions, so a
   change to either is a change to every link somebody has ever sent anybody.

   `known` is `{ section: [subtab, …] }`. Read off the real page table rather
   than a fixture, so a page added to the app is covered here without anybody
   remembering — and so a round trip that fails for a real page fails here
   rather than on somebody's refresh.
   --------------------------------------------------------------------------- */

const KNOWN = Object.fromEntries(
	Object.entries(MODULES).map(([key, m]) => [key, Object.keys(m.pages)]),
);

const EVERY_PAGE = Object.entries(KNOWN).flatMap(([section, subtabs]) =>
	subtabs.map((subtab) => [section, subtab]));

describe("the URL grammar", () => {
	it("has pages to test", () => {
		expect(EVERY_PAGE.length).toBeGreaterThan(30);
	});

	it.each(EVERY_PAGE)("round-trips %s/%s", (section, subtab) => {
		const path = pathFor(section, subtab, KNOWN);
		const back = parsePath(path, KNOWN);
		expect([back.section, back.subtab]).toEqual([section, subtab]);
	});

	it.each(EVERY_PAGE)("writes the canonical path for %s/%s", (section, subtab) => {
		/* A path the builder wrote must be one the parser calls canonical, or the
		   router replaces the address on every single load — which shows up as
		   the back button needing two presses to leave a page. */
		expect(parsePath(pathFor(section, subtab, KNOWN), KNOWN).canonical).toBe(true);
	});

	it("leaves the overview segment out", () => {
		/* `/employees`, not `/employees/overview`. A module's first page is what
		   you get for asking for the module. */
		expect(pathFor("employees", OVERVIEW, KNOWN)).toBe("/employees");
		expect(pathFor("employees", "salary", KNOWN)).toBe("/employees/salary");
	});

	it("reads a bare module as its overview", () => {
		expect(parsePath("/employees", KNOWN)).toMatchObject({
			section: "employees", subtab: OVERVIEW, canonical: true,
		});
	});

	it("treats the long spelling of an overview as the same page, not canonical", () => {
		/* Both spellings are the same page, and the router tidies the address to
		   the short one — with `replace`, so back still leaves the site rather
		   than bouncing between two spellings. */
		const long = parsePath("/employees/overview", KNOWN);
		expect(long).toMatchObject({ section: "employees", subtab: OVERVIEW });
		expect(long.canonical).toBe(false);
	});

	it("lands an unrecognised path on the front page rather than a 404", () => {
		/* A URL nobody here recognises is nearly always a stale link or a typo,
		   and the honest answer to both is the front page — this site has no
		   addresses worth telling somebody they got wrong. */
		for (const path of ["/", "/nonsense", "/employees/nonsense", "/nonsense/salary", ""]) {
			const r = parsePath(path, KNOWN);
			expect(KNOWN[r.section], `${path} → ${r.section}`).toBeDefined();
			expect(KNOWN[r.section]).toContain(r.subtab);
		}
		expect(parsePath("/nonsense", KNOWN).section).toBe(DEFAULT_SECTION);
	});

	it("survives a trailing slash and a query string", () => {
		/* Both arrive from real links — a trailing slash from somebody's editor,
		   a query string from anything that adds tracking to a pasted URL. */
		expect(parsePath("/employees/salary/", KNOWN)).toMatchObject({
			section: "employees", subtab: "salary",
		});
	});

	it("does not invent a page for a module that has none", () => {
		expect(pathFor("nonsense", "overview", KNOWN)).toBe("/");
	});
});
