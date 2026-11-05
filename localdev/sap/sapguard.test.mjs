// node --test localdev/sap/sapguard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { refusalFor } from "./sapguard.mjs";

const TEST = ["MANNA_RUBBER_TEST"];

test("a test database named in test_dbs is allowed", () => {
	assert.equal(refusalFor("MANNA_RUBBER_TEST", TEST), "");
	assert.equal(refusalFor("manna_rubber_test", TEST), "");
});

test("each live company database is refused even when listed as a test one", () => {
	for (const db of ["MANNA_RUBBER_LIVE", "HITECH_PRETREADS_LIVE", "HITECH_RUBBER_LIVE", "MANNA_TYRE_LIVE"]) {
		assert.match(refusalFor(db, [db]), /live/i);
	}
});

test("any name ending _LIVE is refused, not just the four known ones", () => {
	assert.match(refusalFor("NEW_COMPANY_LIVE", ["NEW_COMPANY_LIVE"]), /_LIVE/);
});

test("a database nobody listed is refused, so the default is no access", () => {
	assert.match(refusalFor("SBODEMOUS", TEST), /not in test_dbs/);
	assert.match(refusalFor("MANNA_RUBBER_TEST", []), /not in test_dbs/);
});

test("an empty database name is refused rather than left to SAP's default company", () => {
	assert.notEqual(refusalFor("", TEST), "");
	assert.notEqual(refusalFor(undefined, TEST), "");
});
