import { describe, expect, it } from "vitest";

import { MODULES } from "@/routes/registry";
import { FACTOHR_MENU } from "@/data/factohr";
import { BLUEPRINTS, addressFor, slugOf } from "@/data/blueprints";
import { needFor } from "@/data/needs";

/* ---------------------------------------------------------------------------
   **Every one of Factor HR's 160 menu items has an address here.**

   54 open a page that does the work and 106 open a page that says what the item
   is, what it would take and what the site holds towards it. This file is the
   proof of that sentence, because it is the sentence the whole comparison rests
   on: a reader holding the two systems side by side has to be able to click
   anything on their menu and get an answer, and "nothing happened" is
   indistinguishable from "nobody has looked at this".

   The address is derived from their own title rather than kept in a list, so
   these tests are what stands between that and a link that 404s.
   --------------------------------------------------------------------------- */

const KNOWN = Object.fromEntries(
	Object.entries(MODULES).map(([key, m]) => [key, Object.keys(m.pages)]),
);

describe("an address for all 160", () => {
	it.each(FACTOHR_MENU.map((r) => [r[3], r]))("%s opens something", (title, row) => {
		const [section, tab] = addressFor(row);
		expect(KNOWN[section], `${title} → ${section}`).toBeDefined();
		expect(KNOWN[section], `${title} → ${section}/${tab}`).toContain(tab);
	});

	it("leaves 106 of them as blueprints", () => {
		expect(BLUEPRINTS).toHaveLength(106);
		expect(FACTOHR_MENU.filter((r) => r[5])).toHaveLength(54);
	});
});

describe("the slug", () => {
	it("never collides inside a module", () => {
		// `Form 16` and `Form 16B` are one character apart, and two items sharing
		// one address would silently hide the second — on a page whose whole job
		// is to prove nothing was left out.
		for (const section of new Set(BLUEPRINTS.map((b) => b.section))) {
			const mine = BLUEPRINTS.filter((b) => b.section === section);
			expect(new Set(mine.map((b) => b.slug)).size, section).toBe(mine.length);
		}
	});

	it("never lands on a page that already exists", () => {
		// A blueprint slug equal to a real tab would replace the working page
		// with a page explaining that it does not exist.
		const built = new Set(FACTOHR_MENU.filter((r) => r[5]).map((r) => r[5].join("/")));
		for (const b of BLUEPRINTS) expect(built.has(`${b.section}/${b.slug}`), b.title).toBe(false);
	});

	it("survives punctuation the way a URL has to", () => {
		expect(slugOf("In/Out Count Report")).toBe("in-out-count-report");
		expect(slugOf("PAN Aadhaar Verification & Linkage")).toBe("pan-aadhaar-verification-linkage");
		expect(slugOf("Prof. Tax Statement")).toBe("prof-tax-statement");
	});
});

describe("what each blueprint says", () => {
	it.each(BLUEPRINTS.map((b) => [b.title, b]))("%s says what it would take", (title, b) => {
		const row = FACTOHR_MENU.find((r) => r[0] === b.section && r[3] === title);
		const plan = needFor(b.section, row[1], title);
		expect(plan.need, title).toBeTruthy();
		expect(plan.need.length, title).toBeGreaterThan(60);
		expect(plan.doctype, title).toBeTruthy();
	});

	it("marks the two that should not be built, rather than leaving them out", () => {
		// An item quietly missing from the menu reads as an oversight. These are
		// the opposite: they are refusals, and the page says so.
		const refused = BLUEPRINTS.filter((b) => {
			const row = FACTOHR_MENU.find((r) => r[0] === b.section && r[3] === b.title);
			return needFor(b.section, row[1], b.title).refuse;
		});
		expect(refused.map((b) => b.title).sort()).toEqual(["Manual Process Attendance", "Online Attendance"]);
	});
});
