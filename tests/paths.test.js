/**
 * Tests for the URL grammar.
 *
 * The site got addresses on 31 August 2026, and these are the rules that decide
 * what an address means. Each one states the rule in its name, the way the
 * attendance rules next door do.
 *
 *     npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { pathFor, parsePath, OVERVIEW, DEFAULT_SECTION } from "../client/src/routes/paths.js";

/* A stand-in for what routes/registry.jsx builds. Small on purpose: these tests
   are about the grammar, and pinning them to the real menu would make every new
   page a failing test. */
const KNOWN = {
	dashboard: ["overview", "engagement", "approvals"],
	employees: ["overview", "salary", "profile"],
	attendance: ["overview", "shifts"],
};

test("a module's first page has no segment of its own", () => {
	// `/employees`, not `/employees/overview` — asking for the module is asking
	// for its first page, which is how the rail already behaves.
	assert.equal(pathFor("employees", OVERVIEW, KNOWN), "/employees");
	assert.equal(pathFor("employees", "", KNOWN), "/employees");
	assert.equal(pathFor("employees", "salary", KNOWN), "/employees/salary");
});

test("a module nobody has is not given a path", () => {
	assert.equal(pathFor("invented", "overview", KNOWN), "/");
});

test("a path round-trips back to the page it names", () => {
	for (const [section, pages] of Object.entries(KNOWN)) {
		for (const subtab of pages) {
			const parsed = parsePath(pathFor(section, subtab, KNOWN), KNOWN);
			assert.equal(parsed.section, section);
			assert.equal(parsed.subtab, subtab);
			assert.equal(parsed.canonical, true, `${section}/${subtab} is not canonical`);
		}
	}
});

test("an unknown path lands on the front page rather than a 404", () => {
	// A URL nobody recognises is nearly always a stale link or a typo, and the
	// honest answer to both is the front page.
	const parsed = parsePath("/nonsense", KNOWN);
	assert.equal(parsed.section, DEFAULT_SECTION);
	assert.equal(parsed.subtab, OVERVIEW);
	assert.equal(parsed.canonical, false);
});

test("an unknown page falls back to its module rather than off the site", () => {
	// Half-right is still right about the module, and dropping somebody on the
	// Dashboard for a renamed tab loses the half they got correct.
	const parsed = parsePath("/employees/gone", KNOWN);
	assert.equal(parsed.section, "employees");
	assert.equal(parsed.subtab, OVERVIEW);
	assert.equal(parsed.canonical, false);
});

test("the long spelling of the first page is not canonical", () => {
	// `/employees/overview` resolves, so an old link still works — but it is
	// rewritten, so a link that gets shared is the short one.
	const parsed = parsePath("/employees/overview", KNOWN);
	assert.equal(parsed.section, "employees");
	assert.equal(parsed.subtab, OVERVIEW);
	assert.equal(parsed.canonical, false);
	assert.equal(pathFor(parsed.section, parsed.subtab, KNOWN), "/employees");
});

test("the root is the front page", () => {
	const parsed = parsePath("/", KNOWN);
	assert.equal(parsed.section, DEFAULT_SECTION);
	assert.equal(parsed.subtab, OVERVIEW);
});

test("extra segments and slashes do not change the page", () => {
	assert.equal(parsePath("//employees//salary//", KNOWN).subtab, "salary");
	// Anything past the second segment is not part of the grammar and is
	// dropped rather than making the whole path unrecognised.
	assert.equal(parsePath("/employees/salary/4", KNOWN).subtab, "salary");
});

test("a malformed escape does not throw", () => {
	// An address bar somebody typed into is exactly where `%` on its own turns
	// up, and decodeURIComponent raises on it.
	assert.doesNotThrow(() => parsePath("/employees/%", KNOWN));
	assert.equal(parsePath("/%", KNOWN).section, DEFAULT_SECTION);
});

test("an empty or missing path is the front page rather than a crash", () => {
	assert.equal(parsePath("", KNOWN).section, DEFAULT_SECTION);
	assert.equal(parsePath(null, KNOWN).section, DEFAULT_SECTION);
	assert.equal(parsePath(undefined, KNOWN).section, DEFAULT_SECTION);
});
