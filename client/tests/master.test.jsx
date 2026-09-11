import { describe, expect, it, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, resetStore } from "@/store";
import { EMP_SHOWN } from "@/data/employees";
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

describe("Employee Master on a site bigger than the cap", () => {
	beforeEach(() => resetStore());

	it("draws_the_first_page_of_people_rather_than_all_of_them_on_first_paint", async () => {
		set(crowd(EMP_SHOWN + 120));
		const r = await draw();
		expect(drawn(r)).toBe(EMP_SHOWN);
	});

	it("says_how_many_it_is_holding_back_rather_than_cutting_the_list_silently", async () => {
		const total = EMP_SHOWN + 120;
		set(crowd(total));
		const r = await draw();
		/* The two numbers a reader compares: what is on screen, and what there
		   is. Both have to be on the page for the cut to be visible at all. */
		expect(r.container.textContent).toContain(`Showing ${EMP_SHOWN}`);
		expect(r.container.textContent).toContain(String(total));
	});

	it("draws_every_person_once_somebody_asks_for_all_of_them", async () => {
		const total = EMP_SHOWN + 120;
		set(crowd(total));
		set({ empall: true });
		const r = await draw();
		expect(drawn(r)).toBe(total);
	});

	it("draws_every_person_in_the_list_view_too_not_only_in_the_cards", async () => {
		const total = EMP_SHOWN + 120;
		set(crowd(total));
		set({ empview: "list", empall: true });
		const r = await draw();
		expect(drawn(r)).toBe(total);
	});

	it("offers_nothing_to_expand_on_a_site_that_fits", async () => {
		/* A control reading "showing 16 of 16" is noise on every site small
		   enough for none of this to matter, which is most of them. */
		set(loadedState());
		const r = await draw();
		expect(r.container.textContent).not.toContain("Showing");
	});

	it("counts_what_is_left_after_the_filters_not_what_is_loaded", async () => {
		/* The cap applies to the rows somebody just asked for. A search that
		   leaves 20 people draws 20 and offers nothing, however many are
		   loaded — otherwise the footer answers a question nobody asked. */
		set(crowd(EMP_SHOWN + 120));
		set({ q: "Person 7" });
		const r = await draw();
		expect(drawn(r)).toBeLessThan(EMP_SHOWN);
		expect(r.container.textContent).not.toContain("Showing");
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
