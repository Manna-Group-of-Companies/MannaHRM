import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import { companyView } from "@/lib/scope";
import { COMPANY_PAGES, companyForSlug } from "@/data/companies";
import { MODULES } from "@/routes/registry";
import { store, set, resetStore } from "@/store";

/* ---------------------------------------------------------------------------
   The per-company dashboards.

   `pages.test.jsx` already renders all four, but only ever into their absent
   branch: the fixture site's companies are "Manna Rubber" and "Manna Tyre UAE",
   and none of the four registered ones is on it. So the branch that actually
   draws numbers — and the narrowing that decides which numbers — has no
   coverage there at all.

   That narrowing is the whole claim these pages make. A page headed "Manna
   Treads" that counts the group's punches is worse than no page, because it is
   wrong in the direction nobody checks: the figure looks plausible, it is
   larger than it should be, and the heading says it belongs to one company.
   --------------------------------------------------------------------------- */

const MT = "Manna Treads";
const MTR = "Manna Tyre Retreads";

/** A tiny two-company site: one person each, one punch each, one correction and
    one leave application each, and one punch by somebody the directory has
    never heard of. */
function twoCompanies() {
	const employees = [
		{ name: "HR-EMP-001", employee_name: "Asha", company: MT, status: "Active" },
		{ name: "HR-EMP-002", employee_name: "Biju", company: MTR, status: "Active" },
	];
	return {
		employees,
		byName: Object.fromEntries(employees.map((e) => [e.name, e])),
		companies: [{ name: MT, abbr: "MT" }, { name: MTR, abbr: "MTR" }],
		checkins: [
			{ name: "CI-1", employee: "HR-EMP-001", time: "2026-09-16 09:00:00", log_type: "IN" },
			{ name: "CI-2", employee: "HR-EMP-002", time: "2026-09-16 09:05:00", log_type: "IN" },
			{ name: "CI-3", employee: "HR-EMP-999", time: "2026-09-16 09:10:00", log_type: "IN" },
		],
		letters: [{ name: "L-1", employee: "HR-EMP-002", letter_type: "Offer" }],
		approvals: {
			attendance: [{ name: "R-1", employee: "HR-EMP-001", attendance_date: "2026-09-15" }],
			leave: [{ name: "LV-1", employee: "HR-EMP-002", leave_type: "Casual Leave" }],
		},
	};
}

describe("companyView", () => {
	it("narrows the punches too, and not only the employee list", () => {
		const v = companyView(twoCompanies(), MT);
		expect(v.employees.length).toBe(2); // untouched — `scoped` does that half
		expect(v.checkins.map((c) => c.name)).toEqual(["CI-1"]);
	});

	it("narrows corrections, leave and letters by the employee behind each row", () => {
		const v = companyView(twoCompanies(), MTR);
		expect(v.approvals.attendance).toEqual([]);
		expect(v.approvals.leave.map((r) => r.name)).toEqual(["LV-1"]);
		expect(v.letters.map((l) => l.name)).toEqual(["L-1"]);
	});

	it("drops a punch whose employee the directory cannot place", () => {
		// CI-3 belongs to nobody this reader can see. Keeping it would add a row
		// to whichever company happened to be on screen — see the note in scope.js.
		const v = companyView(twoCompanies(), MT);
		expect(v.checkins.some((c) => c.employee === "HR-EMP-999")).toBe(false);
	});

	it("leaves every list alone when no company is pinned and none is picked", () => {
		const s = twoCompanies();
		const v = companyView({ ...s, company: "" }, undefined);
		expect(v.checkins.length).toBe(3);
		expect(v.letters.length).toBe(1);
	});

	it("lets a pinned company beat the company picker", () => {
		// The picker says one thing and the page says another. The page wins, or a
		// control in the top bar can silently retitle somebody's numbers.
		const v = companyView({ ...twoCompanies(), company: MTR }, MT);
		expect(v.company).toBe(MT);
		expect(v.checkins.map((c) => c.name)).toEqual(["CI-1"]);
	});

	it("falls back to the picked company when nothing is pinned", () => {
		const v = companyView({ ...twoCompanies(), company: MTR }, undefined);
		expect(v.company).toBe(MTR);
		expect(v.checkins.map((c) => c.name)).toEqual(["CI-2"]);
	});
});

describe("the company dashboard pages", () => {
	beforeEach(() => resetStore());

	const draw = async (slug) => {
		const Page = MODULES.dashboard.pages[slug];
		set({ section: "dashboard", subtab: slug });
		await act(async () => {
			render(
				<Provider store={store}>
					<Page />
				</Provider>,
			);
		});
	};

	it("gives every company in the table an address and a page", () => {
		for (const c of COMPANY_PAGES) {
			expect(MODULES.dashboard.pages[c.slug], `no page for ${c.slug}`).toBeTypeOf("function");
			expect(MODULES.dashboard.tabs.some((t) => t[0] === c.slug), `no tab for ${c.slug}`).toBe(true);
			expect(companyForSlug(c.slug)).toBe(c.company);
		}
	});

	it("says the company is not on the site rather than drawing a headcount of zero", async () => {
		set({ ...twoCompanies(), companies: [] });
		await draw("mt");
		expect(screen.getByText(/is not on this site/i)).toBeTruthy();
		// The distinction the panel exists to keep: absent is not empty.
		expect(screen.queryByText("Employee Attendance Summary")).toBeNull();
	});

	it("draws the dashboard once the site has the company", async () => {
		set(twoCompanies());
		await draw("mt");
		expect(screen.queryByText(/is not on this site/i)).toBeNull();
		expect(screen.getByText("Employee Attendance Summary")).toBeTruthy();
	});

	it("counts one company on a page headed with that company", async () => {
		set(twoCompanies());
		await draw("mt");
		// Asha punched and Biju punched. This page is Manna Treads, so the
		// activity feed names Asha and must not name Biju.
		expect(screen.getAllByText("Asha").length).toBeGreaterThan(0);
		expect(screen.queryByText("Biju")).toBeNull();
	});
});
