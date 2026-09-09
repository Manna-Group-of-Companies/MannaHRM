import { describe, expect, it } from "vitest";

import {
	NEVER_DELETE, NEVER_EDIT, NEVER_WRITE, blankDoc, canCreate, canDelete, canEdit,
	fieldWarning, formFields, isMaster, missingRequired, namingField, patchOf,
} from "@/lib/write";
import { RECORD_DOCTYPES, SCHEMA } from "@/data/schema";
import { MANAGED } from "@/data/manage";

/* ---------------------------------------------------------------------------
   What this app will write, and what it will not.

   No DOM and no site. Every rule below is a sentence about a record.

   **The one that earns its place above all the others is `Attendance`.** It is
   generated from `Employee Checkin` by the shift job, and a hand-written row is
   invisible to the thing that would have created it: the two disagree the
   moment anything is reprocessed, and what disagrees is somebody's pay. A form
   that offered it would look like a helpful shortcut and would be a way to make
   the attendance record and the punch record tell different stories. CLAUDE.md
   §5 says never, and this is the test named after it.

   None of this is enforcement — it runs in a browser, and a rule enforced in a
   client is a suggestion to anyone holding `curl` (CLAUDE.md §1). What it buys
   is that the app does not *offer* a control the site would refuse, or worse
   would accept.
   --------------------------------------------------------------------------- */

describe("what is never written from here", () => {
	it("never offers to create an Attendance row", () => {
		expect(canCreate("Attendance").ok).toBe(false);
		expect(canCreate("Attendance").why).toContain("Employee Checkin");
	});

	it("says to write the punch instead, which is the thing somebody can act on", () => {
		expect(NEVER_WRITE["Attendance"]).toContain("Regularization");
	});

	it("never offers to write a leave ledger entry", () => {
		// A balance is read from the ledger. An entry typed by hand makes a
		// balance that no application accounts for.
		expect(canCreate("Leave Ledger Entry").ok).toBe(false);
	});

	it("never offers to write a salary slip", () => {
		expect(canEdit("Salary Slip", {}).ok).toBe(false);
	});
});

describe("what is never deleted from here", () => {
	it("will not delete a punch", () => {
		// The machine's copy may already be gone. This may be the last record
		// that somebody was at work, which is a day's pay.
		const d = canDelete("Employee Checkin", {});
		expect(d.ok).toBe(false);
		expect(d.why).toContain("evidence");
	});

	it("will not delete a person", () => {
		expect(canDelete("Employee", {}).ok).toBe(false);
		expect(NEVER_DELETE["Employee"]).toContain("Left");
	});

	it("will not delete a loan or a repayment against one", () => {
		expect(canDelete("Employee Loan Application", {}).ok).toBe(false);
		expect(canDelete("Employee Loan Repayment", {}).ok).toBe(false);
	});

	it("gives a reason for every refusal, not a blank", () => {
		// A greyed-out Delete reads as a permission this reader has not got.
		// Every one of these is a decision about the record instead.
		for (const [doctype, why] of Object.entries(NEVER_DELETE)) {
			expect(why, doctype).toBeTruthy();
			expect(why.length, doctype).toBeGreaterThan(60);
		}
	});
});

describe("Frappe's own rules about a submitted document", () => {
	it("will not edit a submitted document", () => {
		const e = canEdit("Employee Letter", { docstatus: 1 });
		expect(e.ok).toBe(false);
		expect(e.why).toContain("amend");
	});

	it("will not delete a submitted document — cancel leaves it visible", () => {
		const d = canDelete("Employee Document", { docstatus: 1 });
		expect(d.ok).toBe(false);
		expect(d.why).toContain("Cancel");
	});

	it("will not edit a cancelled one either", () => {
		expect(canEdit("Employee Letter", { docstatus: 2 }).ok).toBe(false);
	});

	it("edits an ordinary draft", () => {
		expect(canEdit("Work Location", { docstatus: 0 }).ok).toBe(true);
	});
});

describe("masters", () => {
	it("knows a doctype whose id is one of its fields", () => {
		expect(isMaster("Work Location")).toBe(true);
		expect(namingField("Work Location")).toBe("location_name");
	});

	it("knows one that is named by a series instead", () => {
		expect(isMaster("Employee Letter")).toBe(false);
		expect(namingField("Employee Letter")).toBe("");
	});

	it("warns before deleting a master rather than refusing", () => {
		// The site refuses a linked one and says how many. This is the sentence
		// before the click rather than the traceback after it.
		const d = canDelete("Work Location", {});
		expect(d.ok).toBe(true);
		expect(d.warn).toContain("master");
	});

	it("says that renaming the naming field renames the record", () => {
		// Every Link that named the old id stops resolving, and nothing about
		// the box being typed into says so.
		expect(fieldWarning("Work Location", "location_name")).toContain("renames");
	});

	it("says what a device id is for, because getting it wrong geofences somebody", () => {
		expect(fieldWarning("Attendance Device", "device_id")).toContain("geofenced");
	});
});

describe("what would be sent", () => {
	const DOC = { name: "WL-1", location_name: "Factory", radius_metres: 120, is_active: 1 };

	it("sends only what changed", () => {
		expect(patchOf(DOC, { radius_metres: 200 })).toEqual({ radius_metres: 200 });
	});

	it("sends nothing for a box typed back to what the record says", () => {
		expect(patchOf(DOC, { radius_metres: "120" })).toEqual({});
	});

	it("clears a field with null rather than an empty string", () => {
		expect(patchOf(DOC, { location_name: "" })).toEqual({ location_name: null });
	});

	it("never sends Frappe's own bookkeeping, whatever a form put in the draft", () => {
		// A whole-document write re-sends columns this reader may not write, so
		// an edited radius is refused over a field nobody touched.
		expect(patchOf(DOC, { name: "WL-2", owner: "x", modified: "y", radius_metres: 5 }))
			.toEqual({ radius_metres: 5 });
		for (const k of ["name", "owner", "creation", "modified", "docstatus", "naming_series"]) {
			expect(NEVER_EDIT.has(k), k).toBe(true);
		}
	});

	it("starts a new record with the doctype's own defaults and nothing else", () => {
		// Not every field with a blank value: a document posted with explicit
		// empties for fields nobody saw overwrites what the server would derive.
		const blank = blankDoc("Work Location");
		expect(blank.is_active).toBe(1);
		expect(Object.keys(blank)).not.toContain("latitude");
	});

	it("names the empty required fields before the site refuses them", () => {
		expect(missingRequired("Work Location", {})).toContain("Location Name");
	});

	it("counts a geofence with no coordinate as incomplete", () => {
		// A Work Location is the thing a mobile punch is measured against, and
		// the doctype makes latitude and longitude required for that reason: a
		// fence with no centre accepts a punch from anywhere. Naming them before
		// the save is the difference between a sentence beside the box and a
		// Frappe traceback afterwards.
		expect(missingRequired("Work Location", { location_name: "F", company: "Manna Rubber" }))
			.toEqual(["Latitude", "Longitude"]);
		expect(missingRequired("Work Location",
			{ location_name: "F", company: "Manna Rubber", latitude: 9.9, longitude: 76.3 }))
			.toEqual([]);
	});
});

describe("the form is built from the doctype, not by hand", () => {
	it("offers a field for every doctype this app installs", () => {
		for (const d of RECORD_DOCTYPES) {
			expect(formFields(d).length, d).toBeGreaterThan(0);
		}
	});

	it("never offers a field Frappe sets itself", () => {
		for (const d of RECORD_DOCTYPES) {
			for (const f of formFields(d)) expect(NEVER_EDIT.has(f.name), `${d}.${f.name}`).toBe(false);
		}
	});

	it("gives every field a control this app can draw", () => {
		const KNOWN = new Set(["text", "long", "int", "float", "currency", "check", "date",
			"datetime", "time", "select", "link", "attach", "readonly", "password"]);
		for (const d of RECORD_DOCTYPES) {
			for (const f of formFields(d)) expect(KNOWN, `${d}.${f.name}:${f.kind}`).toContain(f.kind);
		}
	});

	it("gives every Select its options, so the box is not empty", () => {
		for (const d of Object.keys(SCHEMA)) {
			for (const f of SCHEMA[d].fields) {
				if (f.kind === "select") expect(f.choices, `${d}.${f.name}`).toBeTruthy();
			}
		}
	});
});

describe("every record doctype has somewhere to be managed", () => {
	it("covers all fifteen", () => {
		expect(MANAGED).toHaveLength(RECORD_DOCTYPES.length);
		expect(MANAGED.map((m) => m[3]).sort()).toEqual([...RECORD_DOCTYPES].sort());
	});

	it("names a doctype this app actually installs", () => {
		for (const [, , , doctype] of MANAGED) expect(SCHEMA[doctype], doctype).toBeDefined();
	});

	it("says on every page what the records are for", () => {
		for (const [, , title, , note] of MANAGED) {
			expect(note, title).toBeTruthy();
			expect(note.length, title).toBeGreaterThan(80);
		}
	});
});
