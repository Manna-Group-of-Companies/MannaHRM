import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { RECORD_DOCTYPES, SCHEMA, fieldsOf, listFields } from "@/data/schema";

/* ---------------------------------------------------------------------------
   `src/data/schema.js` against the doctype JSON it was generated from.

   **This is the test that keeps the form and the table honest.** Frappe accepts
   a key its doctype has not got and drops it without a word, so a form built
   from a stale copy of the schema takes a value, saves, reports success, and
   shows nothing on reload — which reads to whoever typed it as the record
   refusing their work. Nothing else in this suite would notice.

   So the generator is run again here and its output compared. A doctype edited
   without `node scripts/schema.mjs` fails, and the failure names the fix.
   --------------------------------------------------------------------------- */

describe("the generated schema is current", () => {
	it("matches what the generator produces from the doctype JSON right now", () => {
		/* Line endings are not content. The generator writes LF, and on a Windows
		   checkout core.autocrlf hands back CRLF — which failed this test once
		   after every checkout (25 Sep 2026), then passed, because the run itself
		   had rewritten the file. */
		const lf = (t) => t.replace(/\r\n/g, "\n");
		const before = lf(readFileSync("src/data/schema.js", "utf8"));
		execFileSync("node", ["scripts/schema.mjs"], { stdio: "pipe" });
		const after = lf(readFileSync("src/data/schema.js", "utf8"));
		expect(after, "Run `node scripts/schema.mjs` — a doctype changed and the client's copy did not")
			.toBe(before);
	});
});

describe("what the schema carries", () => {
	it("has every doctype this app installs", () => {
		// 21 restored on 8 September, plus Manna Announcement, added the same day
		// so that Factor HR's Announcements and CEO Speak panels have something
		// behind them. One doctype with a kind, because the two differ in a word.
		// Attendance Submission on 11 September — Submit Attendance's month freeze.
		// Attendance Device User on 15 September — who is enrolled on each machine.
		// Employee Overtime on 16 September — the OT HR grants, a day at a time.
		// Machine Command on 18 September — what somebody asks a fingerprint
		// machine to do from a page that cannot reach one; the bridge does it.
		expect(Object.keys(SCHEMA)).toHaveLength(26);
		expect(RECORD_DOCTYPES).toHaveLength(20);
	});

	it("keeps child tables and Singles out of the record list", () => {
		// A child row is created on the record that holds it, and a Single always
		// exists — neither is something a New button makes.
		for (const d of RECORD_DOCTYPES) {
			expect(SCHEMA[d].istable, d).toBe(0);
			expect(SCHEMA[d].issingle, d).toBe(0);
		}
		expect(RECORD_DOCTYPES).not.toContain("Manna HR Settings");
		expect(RECORD_DOCTYPES).not.toContain("Employee Survey Question");
	});

	it("gives every doctype at least one column worth listing", () => {
		// `in_list_view` on the doctype decides. A record list with only an id
		// column is a list nobody can pick a row out of.
		for (const d of RECORD_DOCTYPES) expect(listFields(d).length, d).toBeGreaterThan(0);
	});

	it("names the doctype behind every Link, so a box knows what it points at", () => {
		for (const d of Object.keys(SCHEMA)) {
			for (const f of fieldsOf(d)) {
				if (f.kind === "link") expect(f.link, `${d}.${f.name}`).toBeTruthy();
			}
		}
	});

	it("answers for a doctype it has never heard of rather than throwing", () => {
		// A stale link should draw nothing, not break the page it is on.
		expect(fieldsOf("No Such Doctype")).toEqual([]);
		expect(listFields("No Such Doctype")).toEqual([]);
	});
});
