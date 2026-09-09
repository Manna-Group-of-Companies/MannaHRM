import { describe, expect, it } from "vitest";
import { MODULES } from "@/routes/registry";
import { ATT_BUCKETS, FNF_TILES, PAYROLL_TILES, QUICK_LINKS, QUICK_REPORTS, THEIRS_EMPTY } from "@/data/startup";
import { byStanding, findPeople } from "@/lib/summary";
import { PANELS } from "@/features/dashboard/Dashboard";
import { FACTOHR_MENU, NOTES } from "@/data/factohr";

/* ---------------------------------------------------------------------------
   Factor HR's Quick Links and Quick Reports, pointed at pages that exist.

   These nineteen rows are the front page's promise: somebody who used Factor HR
   every morning opens this one, finds the list they know, and clicks it. **A
   row that points at a page this app has not got is worse than a row that says
   so**, because the first looks like the feature is here until the click, and
   the second is a finding somebody can act on. The list is read off the real
   page table rather than a fixture, so a page renamed anywhere fails here
   rather than under somebody's finger.

   The nulls are deliberate and are checked too — a row dropped from the list
   entirely is the one kind of gap this whole project exists to make visible,
   so "no page here" has to be said rather than left out.
   --------------------------------------------------------------------------- */

const KNOWN = Object.fromEntries(
	Object.entries(MODULES).map(([key, m]) => [key, Object.keys(m.pages)]),
);

const rows = [...QUICK_LINKS, ...QUICK_REPORTS];

describe("their Quick Links and Quick Reports", () => {
	it("carries all nineteen of theirs", () => {
		expect(QUICK_LINKS).toHaveLength(10);
		expect(QUICK_REPORTS).toHaveLength(9);
	});

	it.each(rows.filter((r) => r[1]))("%s opens a page that exists", (label, section, subtab) => {
		expect(KNOWN[section], `${label}: no module ${section}`).toBeDefined();
		expect(KNOWN[section], `${label}: ${section}/${subtab}`).toContain(subtab);
	});

	it("says why, for every row with nowhere to go", () => {
		for (const [label, section, , why] of rows) {
			if (section) continue;
			expect(why, `${label} is dropped without a reason`).toBeTruthy();
			expect(why.length).toBeGreaterThan(40);
		}
	});

	it("never has a reason on a row that does open something", () => {
		// Both would be drawn, and the tooltip would explain why a working link
		// does not work.
		for (const [label, section, , why] of rows) {
			if (section) expect(why, `${label} both opens a page and says it cannot`).toBeUndefined();
		}
	});
});

describe("the tiles Factor HR counts in", () => {
	it("keeps their six attendance buckets in their order", () => {
		// Their order is the order somebody reads left to right every morning.
		// Sorting it into something tidier breaks the comparison this page is for.
		expect(ATT_BUCKETS.map((b) => b[0])).toEqual(["team", "in", "notIn", "late", "leave", "future"]);
	});

	it("gives every bucket, tile and row a sentence saying what it means", () => {
		for (const [, label, , why] of ATT_BUCKETS) expect(why, label).toBeTruthy();
		for (const [label, why] of [...PAYROLL_TILES, ...FNF_TILES]) expect(why, label).toBeTruthy();
	});

	it("carries their six payroll tiles and their five F&F tiles", () => {
		expect(PAYROLL_TILES).toHaveLength(6);
		expect(FNF_TILES).toHaveLength(5);
	});
});

/* ---------------------------------------------------------------------------
   Factor HR's whole menu, read off their tenant on 8 Sep 2026.

   **The count is the point of this file.** 160 of their items against this
   app's pages: before the menu was captured, "what is left" was answered from
   the four or five menus somebody had screenshotted, and that answer always
   came out flattering. These tests are here so it cannot quietly drift back —
   a row deleted to make the list shorter, or a page claimed that is not the
   same screen, fails here.
   --------------------------------------------------------------------------- */

describe("their whole menu", () => {
	it("has all 160 of their items", () => {
		expect(FACTOHR_MENU).toHaveLength(160);
	});

	it("only ever points at a page that exists", () => {
		// A row claiming a page this app has not got sends somebody to the
		// module overview and looks like the feature is there.
		for (const [, , , title, , to] of FACTOHR_MENU) {
			if (!to) continue;
			expect(KNOWN[to[0]], `${title} → ${to[0]}`).toBeDefined();
			expect(KNOWN[to[0]], `${title} → ${to[0]}/${to[1]}`).toContain(to[1]);
		}
	});

	it("keeps every item in one of their three kinds", () => {
		for (const [, kind, , title] of FACTOHR_MENU) {
			expect(["Transaction", "Reports", "Setup"], title).toContain(kind);
		}
	});

	it("gives every item their own description", () => {
		// The description is what tells a reader what an unbuilt screen was for.
		for (const [, , , title, desc] of FACTOHR_MENU) expect(desc, title).toBeTruthy();
	});

	it("names a real menu item in every note of ours", () => {
		// A note keyed to a title that no longer exists is a paragraph nobody
		// will ever see, and it would go on being true-looking for years.
		const titles = new Set(FACTOHR_MENU.map((r) => r[3]));
		for (const key of Object.keys(NOTES)) expect(titles, key).toContain(key);
	});

	it("says out loud how much of their menu is not built", () => {
		// Not a threshold to pass — a number to look at. If this fails because
		// somebody built a page, change it and be pleased.
		const built = FACTOHR_MENU.filter((r) => r[5]).length;
		expect(built).toBe(54);
		expect(FACTOHR_MENU.length - built).toBe(106);
	});

	it("gives every module on the rail an All page carrying its menu", () => {
		for (const section of new Set(FACTOHR_MENU.map((r) => r[0]))) {
			// Survey's single item is its own overview, so it needs no index.
			if (section === "survey") continue;
			expect(KNOWN[section], `${section} has no All`).toContain("all");
		}
	});
});

/* ---------------------------------------------------------------------------
   Their Welcome page's own controls, read off the page on 8 September 2026:
   Active / InActive / All, a Search, Expand All and Collapse All, and the
   composer behind Announcements and CEO Speak.
   --------------------------------------------------------------------------- */

describe("their Active / InActive / All switch", () => {
	const PEOPLE = [
		{ name: "A", status: "Active", employee_name: "Anand", department: "Production - MR" },
		{ name: "B", status: "Left", employee_name: "Bijoy", department: "Quality - MR" },
		{ name: "C", status: "Suspended", employee_name: "Chandran", department: "Stores - MR" },
	];

	it("counts InActive as everybody who is not Active", () => {
		// Their own tab does, and splitting it into three here would make the two
		// screens disagree by exactly the suspended.
		expect(byStanding(PEOPLE, "inactive").map((e) => e.name)).toEqual(["B", "C"]);
	});

	it("counts Active as Active alone", () => {
		expect(byStanding(PEOPLE, "active").map((e) => e.name)).toEqual(["A"]);
	});

	it("adds up to All", () => {
		expect(byStanding(PEOPLE, "active").length + byStanding(PEOPLE, "inactive").length)
			.toBe(byStanding(PEOPLE, "all").length);
	});
});

describe("their Search", () => {
	const PEOPLE = [
		{ employee_name: "Anand Raghavan", employee_number: "MR001", department: "Production - MR", designation: "Operator" },
		{ employee_name: "Bijoy Thomas", employee_number: "MR042", department: "Quality - MR", designation: "Inspector" },
	];

	it("matches the columns a reader can see", () => {
		expect(findPeople(PEOPLE, "quality").map((e) => e.employee_number)).toEqual(["MR042"]);
		expect(findPeople(PEOPLE, "operator").map((e) => e.employee_number)).toEqual(["MR001"]);
		expect(findPeople(PEOPLE, "MR042").map((e) => e.employee_number)).toEqual(["MR042"]);
	});

	it("returns everybody for an empty box rather than nobody", () => {
		expect(findPeople(PEOPLE, "   ")).toHaveLength(2);
	});

	it("does not match the record id", () => {
		// Nobody types HR-EMP-00042, and matching it would make a search for "42"
		// return a person called nothing like it.
		const rows = [{ ...PEOPLE[0], name: "HR-EMP-00042" }];
		expect(findPeople(rows, "HR-EMP-00042")).toHaveLength(0);
	});
});

describe("their Expand All and Collapse All", () => {
	it("names every panel drawn on the page", () => {
		// Written out rather than discovered from the DOM: a control that shuts
		// "whatever happens to be rendered" behaves differently on a site with no
		// punches than on one with a full day of them.
		for (const [title] of THEIRS_EMPTY) {
			if (title === "CEO Speak" || title === "Announcements") continue;
			expect(PANELS, title).toContain(title);
		}
		expect(PANELS).toContain("Employee Attendance Summary");
		expect(PANELS).toContain("Wish Celebration");
		expect(PANELS).toContain("CEO Speak");
		expect(PANELS).toContain("Announcements");
	});

	it("has no duplicate, so Collapse All shuts each panel once", () => {
		expect(new Set(PANELS).size).toBe(PANELS.length);
	});
});
