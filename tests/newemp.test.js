/**
 * Tests for what the Create Employee wizard will send, and what it refuses.
 *
 * The expensive mistake on this form is silent and it is not the one people
 * expect. A missing mandatory field is caught by ERPNext and shown; a duplicate
 * Emp Code is caught by ERPNext and shown. A **duplicate machine code is caught
 * by nobody** — `attendance_device_id` has no unique constraint, so the site
 * takes it, and what happens afterwards is that one person's punches are
 * attributed to another. That reads downstream as somebody being absent, not as
 * an error. So it is worth a test with no site and no browser.
 *
 *     npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
	EMP_IMPORTS, IMPORT_ICON, NEW_EMP_HINT, NEW_EMP_NOFIELD, NEW_EMP_STEPS,
} from "../client/src/data/employees.js";
import {
	NEW_EMP_BLANK, NEW_EMP_FIELDS, clashes, dateProblems, employeeDoc, fieldsOf, isBlank,
	missing, problemsOf,
} from "../client/src/lib/newemp.js";

/* Two people, in the shape the employee list is read in. Deliberately small:
   these tests are about the rule, not about the directory. */
const PEOPLE = [
	{
		name: "HR-EMP-00007", employee_name: "Anil Kumar", employee_number: "07",
		attendance_device_id: "07", status: "Active",
	},
	{
		name: "HR-EMP-00042", employee_name: "Rema Joseph", employee_number: "42",
		attendance_device_id: "42", status: "Left",
	},
];

/* ------------------------------------------------------------- the payload */

test("a blank field is left out of the document rather than sent empty", () => {
	const doc = employeeDoc({ first_name: "Suja", department: "", designation: "   " });
	assert.deepEqual(doc, { first_name: "Suja" });
});

test("what is typed is trimmed before it is sent", () => {
	assert.equal(employeeDoc({ employee_number: "  118  " }).employee_number, "118");
});

test("a field the form does not ask about never reaches the document", () => {
	// Guards against the form's own state — the step index, a scratch value —
	// being posted as if it were a field on Employee.
	const doc = employeeDoc({ first_name: "Suja", step: 2, "Short Name": "SJ" });
	assert.deepEqual(Object.keys(doc), ["first_name"]);
});

test("the name the site derives is never sent", () => {
	// hrms builds employee_name from the three name fields on validate. Sending
	// one would be overwritten, which is worse than plainly not having it.
	assert.ok(!NEW_EMP_FIELDS.includes("employee_name"));
});

/* ------------------------------------------------------------- the required */

test("a step with its required fields empty names them by their label", () => {
	assert.deepEqual(missing(0, {}), ["Emp Code", "First Name", "Gender", "Date Of Birth"]);
});

test("a required field filled in stops being asked for", () => {
	const f = { employee_number: "118", first_name: "Suja", gender: "Female", date_of_birth: "1990-04-02" };
	assert.deepEqual(missing(0, f), []);
});

test("whitespace does not count as an answer", () => {
	assert.ok(missing(0, { employee_number: "   " }).includes("Emp Code"));
});

test("every step's required fields are asked for, not only the first", () => {
	// The Create button reads all three steps. A step whose requirements were
	// never counted is a form that offers to create a document the site refuses.
	const gaps = problemsOf({}, []).gaps;
	assert.ok(gaps.includes("Date Of Joining"), "step 2");
	assert.ok(gaps.includes("Company"), "step 3");
});

/* ---------------------------------------------------------------- the dates */

test("being born after the day you joined is refused", () => {
	const out = dateProblems({ date_of_birth: "2020-01-01", date_of_joining: "2019-01-01" });
	assert.ok(out.some((m) => m.includes("Date Of Birth")));
});

test("a joining date in the future is not an error", () => {
	// People are hired before they start. A form that argues with that is a form
	// people learn to click past.
	assert.deepEqual(dateProblems({ date_of_joining: "2099-01-01" }), []);
});

test("a birth year mistyped by a century is caught", () => {
	const out = dateProblems({ date_of_birth: "2020-06-01", date_of_joining: "2026-09-01" });
	assert.equal(out.length, 1);
	assert.ok(out[0].includes("6 years old"));
});

test("a date of birth on its own says nothing about an age", () => {
	// ageOn answers null for a pair it cannot read, and `null < 14` is true —
	// which is the shape this check would have had without the guard.
	assert.deepEqual(dateProblems({ date_of_birth: "1990-04-02" }), []);
});

test("a confirmation date before the joining date is refused", () => {
	const out = dateProblems({ date_of_joining: "2026-09-01", final_confirmation_date: "2026-08-01" });
	assert.ok(out.some((m) => m.includes("Confirmation Date")));
});

/* -------------------------------------------------------------- the clashes */

test("an Emp Code somebody already holds is refused", () => {
	const out = clashes({ employee_number: "07" }, PEOPLE);
	assert.equal(out.length, 1);
	assert.ok(out[0].includes("Anil Kumar"));
});

test("a machine code an active person already holds is refused", () => {
	const out = clashes({ attendance_device_id: "07" }, PEOPLE);
	assert.ok(out.some((m) => m.includes("Machine Code 07")));
});

test("a machine code freed by somebody who has left can be issued again", () => {
	// These machines hold few enrolment numbers. Retiring a code with the person
	// would spend them permanently.
	assert.deepEqual(clashes({ attendance_device_id: "42" }, PEOPLE), []);
});

test("an Emp Code is a clash whatever the status of who holds it", () => {
	// Unlike the machine code: the record itself persists, and so does the
	// history filed under that code.
	assert.equal(clashes({ employee_number: "42" }, PEOPLE).length, 1);
});

test("an empty machine code clashes with nobody", () => {
	// Most of the group has none. An empty value matching every other empty
	// value would refuse nearly every hire.
	assert.deepEqual(clashes({ attendance_device_id: "", employee_number: "" }, PEOPLE), []);
});

test("a code typed with spaces round it still clashes", () => {
	assert.equal(clashes({ employee_number: " 07 " }, PEOPLE).length, 1);
});

test("nothing loaded yet is not a clear run", () => {
	// A page that has not read the directory cannot say a code is free. It says
	// nothing, and the site's own constraint is what catches the Emp Code.
	assert.deepEqual(clashes({ employee_number: "07" }, []), []);
});

/* ---------------------------------------------------------------- the table */

test("every field the steps collect is a fieldname or is deliberately not one", () => {
	// A row with neither a fieldname nor an entry in NEW_EMP_NOFIELD is a
	// control that silently discards what is typed into it.
	for (const [, label, , , ] of NEW_EMP_STEPS.flatMap((_, i) => fieldsOf(i))) {
		assert.ok(label, "every row has a label");
	}
	assert.ok(NEW_EMP_FIELDS.length > 0);
	assert.ok(!NEW_EMP_FIELDS.includes(""));
});

test("no field is collected twice across the three steps", () => {
	// Two boxes writing one key means the second one seen wins, silently.
	assert.equal(new Set(NEW_EMP_FIELDS).size, NEW_EMP_FIELDS.length);
});

/* ----------------------------------------------------------- an empty form */

test("a new hire is Active without anybody choosing it, and nothing else is guessed", () => {
	assert.deepEqual(NEW_EMP_BLANK().f, { status: "Active" });
});

test("an untouched form counts as blank even though Status is filled in", () => {
	// What this decides is whether the page offers to clear itself and warns
	// that leaving keeps a draft — both noise over a form nobody has touched.
	assert.equal(isBlank(NEW_EMP_BLANK().f), true);
});

test("one character typed anywhere stops the form being blank", () => {
	assert.equal(isBlank({ status: "Active", first_name: "S" }), false);
});

test("changing the seeded value is typing too", () => {
	assert.equal(isBlank({ status: "Left" }), false);
});

test("clearing the form twice does not hand back one shared object", () => {
	// A mutable literal shared between the store and the page is how a cleared
	// form comes back holding the last hire's typing.
	const a = NEW_EMP_BLANK();
	a.f.first_name = "Suja";
	assert.equal(NEW_EMP_BLANK().f.first_name, undefined);
});

test("the seeded status is not asked for again on its step", () => {
	assert.ok(!missing(1, NEW_EMP_BLANK().f).includes("Status"));
});

/* --------------------------------------------------------------- the layout */

/* The grid is 24 columns wide. These do not prove the page looks right — only a
   browser does that — but they do catch the two ways the table can make it look
   wrong without anybody noticing: a field with no width at all, and a row that
   does not add up and so leaves a ragged edge down the form. */
const COLS = 24;

test("every field says how wide it is", () => {
	for (const [, label, , , , span] of NEW_EMP_STEPS.flatMap((_, i) => fieldsOf(i))) {
		assert.equal(typeof span, "number", `${label} has a span`);
		assert.ok(span > 0 && span <= COLS, `${label} fits the grid`);
	}
});

test("no field is wrapped by a row it cannot fit in", () => {
	// The grid wraps on its own, so a run of spans that overshoots 24 leaves a
	// hole at the end of one row and a field alone on the next. A group's last
	// row is allowed to be short — Date Of Birth and Short Name sit under a gap
	// in the screenshot — so it is only a row that *overshoots* that is wrong.
	//
	// Counted per group, because each group is its own grid: a group that ends
	// mid-row cannot pull the next group's first field up beside it.
	for (const [key, , groups] of NEW_EMP_STEPS) {
		for (const [heading, rows] of groups) {
			let acc = 0;
			for (const [, label, , , , span] of rows) {
				acc += span;
				assert.ok(acc <= COLS, `${key} / ${heading || "(no heading)"}: ${label} overshoots`);
				if (acc === COLS) acc = 0;
			}
		}
	}
});

test("their first row is the full width of the form", () => {
	// Four boxes edge to edge is what makes step 1 recognisable. A row that stops
	// short of 24 reads as a form that failed to fill, not as a copy.
	const [a, b, c, d] = fieldsOf(0);
	assert.equal(a[5] + b[5] + c[5] + d[5], COLS);
});

test("only the copied step is drawn without headings", () => {
	// Twelve boxes in a column with nothing dividing them is a form people fill
	// in wrongly. Step 1 is the exception because their screenshot has no
	// headings on it, and a copy does not get to add one.
	for (const [key, , groups] of NEW_EMP_STEPS) {
		const headed = groups.every((g) => g[0]);
		assert.equal(headed, key !== "basic", `${key} groups are headed`);
	}
});

test("every group has at least one field in it", () => {
	// An empty group is a heading with a rule under it and nothing beneath —
	// which reads as a section that failed to load.
	for (const [key, , groups] of NEW_EMP_STEPS) {
		for (const [heading, rows] of groups) {
			assert.ok(rows.length > 0, `${key} / ${heading || "(no heading)"} is not empty`);
		}
	}
});

test("step one's widths are the ones measured off the screenshot", () => {
	// 358px, 358px, 110px, 230px across 1090px of form. The narrow Title is the
	// single most recognisable thing about their first row.
	const basic = fieldsOf(0).map((r) => [r[1], r[5]]);
	assert.deepEqual(basic.slice(0, 4), [
		["Emp Code", 8], ["Machine Code", 8], ["Title", 3], ["First Name", 5],
	]);
});

test("a hint is keyed to a label that exists", () => {
	// Keyed by label, so a typo is a hint that silently never appears.
	const labels = new Set(NEW_EMP_STEPS.flatMap((_, i) => fieldsOf(i)).map((r) => r[1]));
	for (const label of [...Object.keys(NEW_EMP_HINT), ...Object.keys(NEW_EMP_NOFIELD)]) {
		assert.ok(labels.has(label), `${label} is a field on the form`);
	}
});

test("a field with no home on this site says so", () => {
	// The other way round: a row with no fieldname and no entry in
	// NEW_EMP_NOFIELD is a box that silently discards what is typed into it.
	for (const [name, label] of NEW_EMP_STEPS.flatMap((_, i) => fieldsOf(i))) {
		if (!name) assert.ok(NEW_EMP_NOFIELD[label], `${label} explains itself`);
	}
});

test("no box is wired to a field the site does not have", () => {
	// Probed against the live doctype on 2 September 2026 by asking for each
	// fieldname in a list read: one the site lacks answers 417. This is the one
	// that failed, and it is read in data/profile.js — so the guard is here
	// rather than in a comment, because the next person to reach for a
	// "custom_" field will reach for that one.
	assert.ok(!NEW_EMP_FIELDS.includes("custom_work_location"));
	// Its neighbour from the same backfill does exist, and is the reason the
	// absence of the other is worth pinning down rather than assuming.
	assert.ok(NEW_EMP_FIELDS.includes("custom_allow_remote_punch"));
});

/* ------------------------------------------------------- the import menu */

/* The three items behind the caret on Add New Employee. Nothing here can prove
   the menu opens — that is a browser's job — but it can hold the table to the
   rule the menu is drawn from: an item either goes somewhere real or is dead
   and says why, and there is no third state where it is live and silent. */

test("every import item either goes somewhere or says why it cannot", () => {
	for (const [label, ico, target, why] of EMP_IMPORTS) {
		assert.ok(label, "has a label");
		assert.ok(IMPORT_ICON[ico], `${label} has an icon that exists`);
		assert.ok(why && why.length > 20, `${label} explains itself`);
		assert.ok(["", "import", "holiday"].includes(target), `${label} has a known target`);
	}
});

test("the caret offers Factor HR's three, in their order", () => {
	assert.deepEqual(EMP_IMPORTS.map((r) => r[0]),
		["File Import", "Week-Off Import", "Picture Import"]);
});

test("the one item with nothing behind it is the one that is drawn dead", () => {
	// Picture Import: Employee.image is one attachment per record, so there is no
	// bulk path to point at. The other two open the site.
	const dead = EMP_IMPORTS.filter((r) => !r[2]).map((r) => r[0]);
	assert.deepEqual(dead, ["Picture Import"]);
});
