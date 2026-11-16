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

// The one exception: the go-live set-up (13 Nov 2026). These pin how narrow it is.
import { liveSetupRefusal, liveSetupAllows, openLiveSetupSession, SapSession } from "./sapguard.mjs";

test("the live set-up may reach the two order-flow companies and no other live one", () => {
	assert.equal(liveSetupRefusal("MANNA_TREADS_LIVE"), "");
	assert.equal(liveSetupRefusal("hitech_pretreads_live"), "");
	for (const db of ["MANNA_RUBBER_LIVE", "HITECH_RUBBER_LIVE", "MANNA_TYRE_LIVE", "NEW_COMPANY_LIVE", "TEST_MANNA_TREADS", ""]) {
		assert.notEqual(liveSetupRefusal(db), "", db);
	}
});

test("the live set-up reads anything and adds only a user table, a user field and a settings row", () => {
	assert.equal(liveSetupAllows("GET", "Orders?$top=1"), true);
	for (const rel of ["Login", "Logout", "UserTablesMD", "UserFieldsMD", "U_MANNA_IC", "/UserFieldsMD"]) assert.equal(liveSetupAllows("POST", rel), true, rel);
	for (const rel of ["Orders", "PurchaseOrders", "InventoryGenEntries", "Items", "$batch", "U_OTHER", "UserTablesMD_x", "SQLQueries"]) assert.equal(liveSetupAllows("POST", rel), false, rel);
});

test("the live set-up can change and delete nothing, not even what it may add, except the ENABLED switch", () => {
	for (const m of ["PUT", "DELETE", "MERGE"]) {
		for (const rel of ["U_MANNA_IC('ENABLED')", "UserFieldsMD(TableName='OPKL',FieldID=1)", "Items('X')", "UserTablesMD('MANNA_IC')"]) assert.equal(liveSetupAllows(m, rel, { U_Value: "Y" }), false, `${m} ${rel}`);
	}
	for (const rel of ["UserFieldsMD(TableName='OPKL',FieldID=1)", "Items('X')", "Orders(1)", "UserTablesMD('MANNA_IC')", "U_MANNA_IC('VENDOR')", "U_MANNA_IC('DATE_SYNC')", "U_MANNA_IC('ENABLED')?x=1", "U_MANNA_IC('ENABLED ')", "U_MANNA_IC(\"ENABLED\")", "U_MANNA_IC"]) {
		assert.equal(liveSetupAllows("PATCH", rel, { U_Value: "Y" }), false, rel);
	}
});

test("the one change it may make is ENABLED to Y or N, with no other field and no other value", () => {
	assert.equal(liveSetupAllows("PATCH", "U_MANNA_IC('ENABLED')", { U_Value: "Y" }), true);
	assert.equal(liveSetupAllows("patch", "/U_MANNA_IC('ENABLED')", { U_Value: "N" }), true);
	for (const body of [undefined, null, {}, [], "Y", { U_Value: "y" }, { U_Value: "YES" }, { U_Value: "" }, { U_Value: 1 }, { U_Value: "Y", Name: "X" }, { Code: "ENABLED", U_Value: "Y" }, { Name: "Y" }]) {
		assert.equal(liveSetupAllows("PATCH", "U_MANNA_IC('ENABLED')", body), false, JSON.stringify(body));
	}
});

const CFG = { url: "https://192.0.2.1:50000/b1s/v1", fingerprint256: "00", username: "u", password: "p", test_dbs: ["TEST_MANNA_TREADS"] };

test("a live company is still refused to every ordinary session, with or without an option", () => {
	assert.throws(() => new SapSession(CFG, "MANNA_TREADS_LIVE"), /live company/);
	assert.throws(() => new SapSession(CFG, "MANNA_TREADS_LIVE", true), /live company/);
	assert.throws(() => new SapSession(CFG, "MANNA_TREADS_LIVE", { liveSetup: true }), /live company/);
	assert.throws(() => new SapSession(CFG, "MANNA_TREADS_LIVE", Symbol("the live set-up's door")), /live company/);
});

test("the live set-up needs its own login for each company and never falls back to the test one", () => {
	assert.throws(() => openLiveSetupSession(CFG, "MANNA_TREADS_LIVE"), /No live login/);
	assert.throws(() => openLiveSetupSession({ ...CFG, live_setup: { username: "m", passwords: { HITECH_PRETREADS_LIVE: "x" } } }, "MANNA_TREADS_LIVE"), /No live login/);
	assert.throws(() => openLiveSetupSession({ ...CFG, live_setup: { username: "m", passwords: { MANNA_TREADS_LIVE: "PUT_PASSWORD_HERE" } } }, "MANNA_TREADS_LIVE"), /No live login/);
	assert.throws(() => openLiveSetupSession({ ...CFG, live_setup: { username: "m", passwords: { MANNA_RUBBER_LIVE: "x" } } }, "MANNA_RUBBER_LIVE"), /not one of the two/);
	const s = openLiveSetupSession({ ...CFG, live_setup: { username: "m", passwords: { MANNA_TREADS_LIVE: "x" } } }, "MANNA_TREADS_LIVE");
	assert.equal(s.db, "MANNA_TREADS_LIVE");
});

test("a live set-up session refuses a change before anything leaves this PC", async () => {
	const s = openLiveSetupSession({ ...CFG, live_setup: { username: "m", passwords: { MANNA_TREADS_LIVE: "x" } } }, "MANNA_TREADS_LIVE");
	await assert.rejects(s.request("PATCH", "U_MANNA_IC('ENABLED')", { U_Value: "X" }), /Refused on a live company/);
	await assert.rejects(s.request("PATCH", "U_MANNA_IC('VENDOR')", { U_Value: "Y" }), /Refused on a live company/);
	await assert.rejects(s.request("PATCH", "U_MANNA_IC('ENABLED')", { U_Value: "Y", Name: "x" }), /Refused on a live company/);
	await assert.rejects(s.request("POST", "PurchaseOrders", {}), /Refused on a live company/);
	await assert.rejects(s.request("DELETE", "UserTablesMD('MANNA_IC')"), /Refused on a live company/);
});
