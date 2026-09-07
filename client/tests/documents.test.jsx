import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import DocumentEntry from "@/features/onboard/DocumentEntry";
import { DOC_KINDS, DOC_REGISTERS, DOC_RELATED_ORDER } from "@/data/onboard";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   On Board → Document Entry: their two dropdowns, and why New looks empty.

   **Both lists are captures, not guesses**, and that is what these tests are
   protecting. Their Document Type dropdown was photographed open on
   5 September 2026 and holds seven; this side had three, because nobody had
   seen the list and the code said so. Their Related To holds three registers
   and this side drew a one-option select saying Employee, which hid the finding
   the register above it exists to report.

   A captured list is the easiest kind of thing to quietly shrink back — a
   refactor drops the disabled options because "they do nothing", and the screen
   stops saying what this site cannot hold. Hence a test per list.
   --------------------------------------------------------------------------- */

/** Their seven, in the order the dropdown lists them. */
const THEIRS = [
	"National Id", "Visa", "Contract", "Resident Card",
	"Man Power Id", "Insurance Card", "Passport",
];

async function openNew() {
	set(loadedState());
	let view;
	await act(async () => {
		view = render(<Provider store={store}><DocumentEntry /></Provider>);
	});
	/* Their +, on the Employee register's toolbar. */
	await act(async () => { screen.getAllByRole("button", { name: /Add a document/i })[0].click(); });
	return view;
}

beforeEach(() => resetStore());

describe("the document types", () => {
	it("carries all seven of theirs, plus our PAN", () => {
		const labels = DOC_KINDS.map((k) => k.label);
		expect(labels.slice(0, THEIRS.length)).toEqual(THEIRS);
		/* PAN is ours and is not on their list at all — the only type here the
		   site can hold that they do not offer. Last, so their seven still read
		   in their order. */
		expect(labels[labels.length - 1]).toBe("PAN");
	});

	it("has a field behind exactly two of them", () => {
		// Passport is read off the site; PAN is a Custom Field added 25 Aug 2026.
		// Everything else on their list has nowhere to land, which is the finding.
		expect(DOC_KINDS.filter((k) => k.num).map((k) => k.label)).toEqual(["Passport", "PAN"]);
	});

	it("gives every type with no field a reason somebody can read", () => {
		for (const kind of DOC_KINDS.filter((k) => !k.num)) {
			expect(kind.why, kind.label).toBeTruthy();
			expect(kind.why.length, kind.label).toBeGreaterThan(60);
		}
	});

	it("offers all of them on the New form, and lets only the two be chosen", async () => {
		const view = await openNew();
		const select = view.container.querySelector("#de-type");
		const options = [...select.querySelectorAll("option")].filter((o) => o.value);
		expect(options.map((o) => o.value))
			.toEqual(DOC_KINDS.map((k) => k.key));
		/* Drawn and unselectable rather than left out. A choice disabled says
		   "this exists there and not here"; a choice absent says nothing. */
		expect(options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(["passport", "pan"]);
	});

	it("says on the dead ones that this site has no field", async () => {
		const view = await openNew();
		const dead = [...view.container.querySelectorAll("#de-type option")]
			.filter((o) => o.disabled && o.value);
		expect(dead.length).toBe(6);
		for (const o of dead) expect(o.textContent).toMatch(/no field on this site/i);
	});
});

describe("Related To", () => {
	it("draws their three registers, in the order their dropdown lists them", async () => {
		const view = await openNew();
		const options = [...view.container.querySelectorAll("#de-rel option")];
		expect(options.map((o) => o.value)).toEqual(DOC_RELATED_ORDER);
		expect(options.map((o) => o.textContent.split(" — ")[0]))
			.toEqual(["Company", "Employee", "Dependant"]);
	});

	it("lets only Employee be chosen, and says why of the other two", async () => {
		const view = await openNew();
		const options = [...view.container.querySelectorAll("#de-rel option")];
		expect(options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(["employee"]);
		for (const o of options.filter((o) => o.disabled)) {
			expect(o.textContent).toMatch(/nothing on this site holds one/i);
		}
	});

	it("is not narrower than the register list on the page", () => {
		// The dropdown and the three stacked registers are the same three things.
		// One growing without the other is the two halves of this screen
		// disagreeing about what Factor HR has.
		expect([...DOC_RELATED_ORDER].sort()).toEqual(DOC_REGISTERS.map((r) => r.key).sort());
	});
});

describe("what New says before anything is picked", () => {
	it("tells you the two choices that turn the boxes on", async () => {
		const view = await openNew();
		expect(view.container.querySelector(".denote").textContent)
			.toMatch(/pick an employee and a document type first/i);
	});

	it("does not claim to write a field that has not been chosen yet", async () => {
		// It said "Writes undefined on this employee." on every freshly opened
		// New — the one box somebody tries first, explaining itself in a word
		// that means nothing.
		const view = await openNew();
		const title = view.container.querySelector("#de-no").getAttribute("title");
		expect(title).not.toMatch(/undefined/);
		expect(title).toMatch(/pick a document type/i);
	});

	it("leaves the six boxes off until both choices are made", async () => {
		const view = await openNew();
		for (const id of ["de-no", "de-exp", "de-place", "de-iss"]) {
			expect(view.container.querySelector("#" + id).disabled, id).toBe(true);
		}
	});
});
