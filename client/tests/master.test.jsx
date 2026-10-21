import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import { http } from "@/api/client";
import EmployeeMaster from "@/features/employees/EmployeeMaster";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employee Master, on a site with more people on it than a screen.

   This page used to draw the first 400 rows of the table and the first 300
   cards and say nothing about either, while the heading above them counted
   everybody. On the sixteen people this site holds today the two numbers agree
   and no test could tell the difference; on a group with a factory in it they
   do not, and the page is then quietly wrong in the direction that matters —
   somebody looks for a person who is loaded, on a screen that says it has them,
   and does not find them.

   So the rule is not "draw everybody" but the weaker and more useful one: **the
   page never claims to be showing more than it is drawing.** A cap is fine. A
   silent cap is not.
   --------------------------------------------------------------------------- */

/** A site big enough for the cap to bite, built out of the fixture's own first
    person so every field a card or a row reads is present and only the identity
    changes. */
function crowd(n) {
	const one = loadedState();
	const employees = Array.from({ length: n }, (_, i) => ({
		...one.employees[0],
		name: `HR-EMP-${String(i + 1).padStart(5, "0")}`,
		employee_name: `Person ${i + 1}`,
		employee_number: `MR${String(i + 1).padStart(3, "0")}`,
		/* Every other person has no biometric id, so the "phone" branch is drawn
		   here too rather than only on the one-person fixture. */
		attendance_device_id: i % 2 ? "" : String(2000 + i),
	}));
	return {
		...one,
		employees,
		byName: Object.fromEntries(employees.map((e) => [e.name, e])),
	};
}

async function draw() {
	let out;
	await act(async () => {
		out = render(<Provider store={store}><EmployeeMaster /></Provider>);
	});
	return out;
}

/** How many people the page has actually put on screen, in whichever view it
    is in — cards are articles and rows are `data-emp`, and both carry the
    employee's own name, so neither counts a header or an empty state. */
const drawn = (r) => r.container.querySelectorAll("[data-emp], article.ecard").length;

describe("Employee Master on a site bigger than a page", () => {
	beforeEach(() => resetStore());

	/* Since 21 October 2026 the page is the HRDashboard reference's table, ten
	   to a page with its pager, and the cards twelve to one. The rule is the
	   one above: what is drawn and what there is are both on the page. */
	const TOTAL = 120;
	const pager = (r) => r.container.querySelector(".k-pager");

	it("draws_the_first_page_of_people_rather_than_all_of_them_on_first_paint", async () => {
		set(crowd(TOTAL));
		const r = await draw();
		expect(drawn(r)).toBe(10);
	});

	it("says_how_many_it_is_holding_back_rather_than_cutting_the_list_silently", async () => {
		set(crowd(TOTAL));
		const r = await draw();
		expect(pager(r).textContent).toContain(`Showing 1 to 10 of ${TOTAL} entries`);
	});

	it("reaches_every_person_through_the_pager", async () => {
		set(crowd(TOTAL));
		const r = await draw();
		const last = [...pager(r).querySelectorAll("button")].find((b) => b.textContent === String(TOTAL / 10));
		await act(async () => { last.click(); });
		expect(pager(r).textContent).toContain(`Showing ${TOTAL - 9} to ${TOTAL} of ${TOTAL} entries`);
		expect(drawn(r)).toBe(10);
	});

	it("draws_a_page_of_cards_in_the_card_view_too_and_says_so", async () => {
		set(crowd(TOTAL));
		set({ empview: "grid" });
		const r = await draw();
		expect(r.container.querySelectorAll("article.ecard").length).toBe(12);
		expect(pager(r).textContent).toContain(`Showing 1 to 12 of ${TOTAL} entries`);
	});

	it("offers_no_next_page_on_a_site_that_fits", async () => {
		set(loadedState());
		const r = await draw();
		expect(pager(r).querySelector('[aria-label="Next page"]').disabled).toBe(true);
	});

	it("counts_what_is_left_after_the_filters_not_what_is_loaded", async () => {
		/* The pager counts the rows somebody just asked for: a search that
		   leaves eleven people says eleven, however many are loaded. */
		set(crowd(TOTAL));
		set({ q: "Person 7" });
		const r = await draw();
		const left = crowd(TOTAL).employees.filter((e) => e.employee_name.includes("Person 7")).length;
		expect(pager(r).textContent).toContain(`of ${left} entries`);
	});
});

describe("the biometric id, on every screen that lists people", () => {
	beforeEach(() => resetStore());

	it("a_card_reads_phone_rather_than_a_dash_when_nobody_is_enrolled", async () => {
		/* Empty is a fact here, not a gap: somebody with no machine code punches
		   from the phone and the geofence judges it. A dash says "we do not
		   know", which is a different and wrong claim. See CLAUDE.md §5. */
		set(crowd(4));
		const r = await draw();
		expect(r.container.textContent).toContain("phone");
	});

	it("a_card_shows_the_machine_code_of_somebody_who_is_enrolled", async () => {
		set(crowd(4));
		const r = await draw();
		expect(r.container.textContent).toContain("2000");
	});
});

describe("the reference's Employees controls", () => {
	beforeEach(() => resetStore());
	const rowsOf = (r) => [...r.container.querySelectorAll("tbody [data-emp]")];

	it("narrows only when the drawer is applied, and a chip takes its filter off", async () => {
		set(loadedState());
		const r = await draw();
		const before = rowsOf(r).length;
		const dept = loadedState().employees.find((e) => e.status === "Active" && e.department).department;
		await act(async () => { [...r.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Filter")).click(); });
		const box = [...document.querySelectorAll(".k-drawer .k-chk-l")].find((l) => l.closest(".k-sec").querySelector("h3").textContent === "Department" && l.textContent.includes(dept.split(" - ")[0]));
		await act(async () => { box.querySelector("input").click(); });
		expect(rowsOf(r).length).toBe(before);
		await act(async () => { fireEvent.submit(document.querySelector(".k-drawer form")); });
		expect(getState().empdept).toEqual([dept]);
		expect(rowsOf(r).every((tr) => getState().byName[tr.dataset.emp].department === dept)).toBe(true);
		await act(async () => { r.container.querySelector('.k-tag button').click(); });
		expect(getState().empdept).toEqual([]);
		expect(rowsOf(r).length).toBe(before);
	});

	it("sorts by a column, and the other way on a second press", async () => {
		set(loadedState());
		const r = await draw();
		const names = () => rowsOf(r).map((tr) => getState().byName[tr.dataset.emp].employee_name);
		const sortedAsc = names().slice().sort((a, b) => a.localeCompare(b));
		expect(names()).toEqual(sortedAsc);
		const head = [...r.container.querySelectorAll("th button")].find((b) => b.textContent.startsWith("Employee Name"));
		await act(async () => { head.click(); });
		expect(names()).toEqual(sortedAsc.slice().reverse());
		expect(head.closest("th").getAttribute("aria-sort")).toBe("descending");
	});

	it("deactivates the people ticked by writing their status and nothing else", async () => {
		set(loadedState());
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		const r = await draw();
		const first = rowsOf(r)[0];
		await act(async () => { first.querySelector('input[type="checkbox"]').click(); });
		expect(r.container.textContent).toContain("1 selected");
		await act(async () => { [...r.container.querySelectorAll("button")].find((b) => b.textContent === "Deactivate").click(); });
		await act(async () => { fireEvent.submit(document.querySelector(".k-modal form")); });
		expect(wrote).toEqual([[`/api/resource/Employee/${first.dataset.emp}`, { status: "Inactive" }]]);
		expect(getState().byName[first.dataset.emp].status).toBe("Inactive");
	});

	it("offers no ticking and no Deactivate to a login that only reads employees", async () => {
		set({ ...loadedState(), user: "mannarubber.products@mannarubber.com" });
		const r = await draw();
		expect(r.container.querySelector('tbody input[type="checkbox"]')).toBeNull();
		expect(r.container.textContent).not.toContain("Add new profile");
	});
});
