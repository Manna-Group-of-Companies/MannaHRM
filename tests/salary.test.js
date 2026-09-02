/**
 * Tests for what a salary revision becomes on the site.
 *
 * These are the rules that decide which figure lands on which half of a Salary
 * Structure, and which figures must never land on one at all. They are worth
 * having without a site because the expensive mistake here is silent: a wrong
 * `kind` pays an employer's contribution to the employee, and a total written
 * as a component counts the same money twice. Neither shows up as an error.
 *
 * Each test states the rule in its name, the way the attendance rules do.
 *
 *     npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SAL_REV_COMP, SAL_REV_ROWS, SAL_REV_TWINS } from "../client/src/data/masters.js";
import { abbrFor, num, planRevision } from "../client/src/lib/salary.js";

/** The form as the store holds it, with only the named rows filled in. */
const draft = (cells, on = "2026-07-15") => ({
	on,
	cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { amt: String(v) }])),
});

const WAGE_TYPES = SAL_REV_ROWS.filter((r) => r.desc);

/* ------------------------------------------------------- the mapping table */

test("every wage type on the form has a mapping", () => {
	// The form and the table are two lists, and a row added to one and not the
	// other would be a figure somebody types that is silently never written.
	const missing = WAGE_TYPES.filter((r) => !SAL_REV_COMP[r.desc]).map((r) => r.desc);
	assert.deepEqual(missing, []);
});

test("every mapping either names a component or says why it is skipped", () => {
	for (const r of WAGE_TYPES) {
		const m = SAL_REV_COMP[r.desc];
		assert.ok(m.skip || (m.comp && m.kind), `${r.desc} is neither written nor explained`);
		if (m.comp) assert.ok(m.kind === "Earning" || m.kind === "Deduction", r.desc);
	}
});

test("no two wage types write to the same salary component", () => {
	// hrms rejects a structure carrying one component twice, so a collision here
	// is a save that fails for everybody who types both rows.
	const names = WAGE_TYPES.map((r) => SAL_REV_COMP[r.desc].comp).filter(Boolean);
	const dupes = names.filter((n, i) => names.indexOf(n) !== i);
	assert.deepEqual(dupes, []);
});

test("the three rows that are totals are never written as components", () => {
	// Each is a sum of the rows around it. Writing one as a component counts the
	// same money a second time, which is the one mistake on this form that pays
	// somebody the wrong amount.
	for (const desc of ["CTC TOTAL", "MONTHLY GROSS", "NET PAY CTC"]) {
		assert.ok(SAL_REV_COMP[desc].skip, `${desc} must be skipped`);
		assert.equal(SAL_REV_COMP[desc].comp, undefined);
	}
});

test("employer contributions are marked as CTC-only", () => {
	// Without the flag, `do_not_include_in_total` is 0 and the employer's own PF
	// contribution is paid to the employee as salary.
	for (const desc of ["EMPLOYER PF CTC", "EMPLOYER ESI CTC", "EMPLOYER EDLI CTC",
		"EMPLOYER PF ADMIN CHARGES CTC", "GRATUITY CONTRIBUTION CTC"]) {
		assert.equal(SAL_REV_COMP[desc].ctc, true, desc);
		assert.equal(SAL_REV_COMP[desc].kind, "Earning", desc);
	}
});

test("the two employee rows filed under company contribution are deductions", () => {
	// Their form files these under COMPANY CONTRIBUTION, but the money comes out
	// of the person's own pay. Following the heading would pay it to them twice.
	assert.equal(SAL_REV_COMP["EMPLOYEE PF CTC"].kind, "Deduction");
	assert.equal(SAL_REV_COMP["EMPLOYEE ESI CTC"].kind, "Deduction");
	assert.equal(SAL_REV_COMP["EMPLOYEE PF CTC"].ctc, undefined);
});

test("statutory deductions land on the deduction half", () => {
	const group = ["EPS CONTRIBUTION ARREARS MANUAL", "ESIC EMPLOYEE CONTRIBUTION MANUAL",
		"LWF MANUAL", "MPF CONTRIBUTION MANUAL", "PROF. TAX MANUAL", "TDS MANUAL"];
	for (const desc of group) assert.equal(SAL_REV_COMP[desc].kind, "Deduction", desc);
});

/* ------------------------------------------------------------- the numbers */

test("a lakh written with commas is one number", () => {
	assert.equal(num("1,20,000"), 120000);
	assert.equal(num(" 4800 "), 4800);
});

test("text that is not a number reads as nothing rather than as zero", () => {
	// Zero is a figure somebody meant. Nothing is a box they had not finished,
	// and the difference decides whether a component is written with 0 against
	// it or left off the structure entirely.
	assert.equal(num(""), null);
	assert.equal(num("abc"), null);
	assert.equal(num("12k"), null);
	assert.equal(num("0"), 0);
});

test("a trailing comma is still the number in front of it", () => {
	// Mid-typing, and it is the commas that are being stripped anyway. Refusing
	// "12," would blank the subtotal under somebody who has not finished the
	// word, which reads as the form losing what they typed.
	assert.equal(num("12,"), 12);
	assert.equal(num("1,20,"), 120);
});

/* ---------------------------------------------------------------- the plan */

test("only rows with an amount are written", () => {
	const p = planRevision({
		on: "2026-07-15",
		cells: {
			"BASIC SALARY": { amt: "12000" },
			// Typed into, but with a remark rather than a figure.
			"FOOD ALLOWANCE": { amt: "", ref: "under discussion" },
		},
	});
	assert.deepEqual(p.rows.map((r) => r.desc), ["BASIC SALARY"]);
});

test("CTC TOTAL becomes the assignment base rather than a component", () => {
	const p = planRevision(draft({ "CTC TOTAL": 600000, "BASIC SALARY": 12000 }));
	assert.equal(p.base, 600000);
	assert.deepEqual(p.rows.map((r) => r.comp), ["Basic"]);
	assert.deepEqual(p.skipped.map((r) => r.desc), ["CTC TOTAL"]);
});

test("a form with nothing but totals on it plans no rows", () => {
	// It has to fail loudly rather than write an empty structure, which would
	// look on the site exactly like a salary of nothing.
	const p = planRevision(draft({ "CTC TOTAL": 600000, "MONTHLY GROSS": 50000 }));
	assert.equal(p.rows.length, 0);
	assert.equal(p.skipped.length, 2);
});

test("the plan keeps the form's order", () => {
	// Their order is the order HR reads down, and a structure listing components
	// in a different one cannot be checked against the sheet it came from.
	const p = planRevision(draft({
		"SPECIAL ALLOWANCE": 1000, "BASIC SALARY": 12000, "DA": 500,
	}));
	assert.deepEqual(p.rows.map((r) => r.desc), ["BASIC SALARY", "DA", "SPECIAL ALLOWANCE"]);
});

test("professional tax typed twice is flagged, not refused", () => {
	// Their form asks for the same money twice — once as a deduction, once
	// restated as CTC. Only one of the two moves any, so the safe direction is a
	// sentence a human reads rather than a save that fails.
	const p = planRevision(draft({ "PROF. TAX MANUAL": 200, "PROF TAX CTC": 200 }));
	assert.deepEqual(p.twins, [["PROF. TAX MANUAL", "PROF TAX CTC"]]);
	assert.equal(p.rows.length, 2);
});

test("one of a twinned pair on its own is not flagged", () => {
	assert.deepEqual(planRevision(draft({ "PROF. TAX MANUAL": 200 })).twins, []);
});

test("every twinned pair names two real wage types", () => {
	for (const pair of SAL_REV_TWINS) {
		for (const desc of pair) {
			assert.ok(SAL_REV_COMP[desc], `${desc} is not a wage type on the form`);
		}
	}
});

/* --------------------------------------------------------- abbreviations */

test("a component abbreviation avoids one the site already uses", () => {
	// Two components sharing an abbreviation surfaces months later as an
	// unreadable payslip column, so the collision is resolved before the write.
	assert.equal(abbrFor("Education Allowance", new Set()), "EA");
	assert.equal(abbrFor("Education Allowance", new Set(["EA"])), "EA2");
	assert.equal(abbrFor("Education Allowance", new Set(["EA", "EA2"])), "EA3");
});

test("a component with no letters in its name still gets an abbreviation", () => {
	assert.equal(abbrFor("!!!", new Set()), "SC");
});
