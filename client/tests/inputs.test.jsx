import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { MODULES } from "@/routes/registry";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Every box somebody can type in, actually takes typing.

   This is the failure that does not look like one. A controlled React input —
   one given a `value` — silently discards every keystroke if its `onChange` is
   missing or writes somewhere the value is not read back from. The box looks
   live, the cursor goes in, the caret blinks, and nothing appears. Nobody
   reports it as a bug; they report that the form "did not save".

   Three checks, in the order they catch things:

     1. **React's own warning.** `value` without `onChange` is a warning at
        render, and it names the component. Any of those fails the page. This is
        the cheapest and most precise of the three and it is why `console.error`
        is captured rather than left to scroll past in a test log.

     2. **Typing changes the value.** Every enabled, writable box on every page
        gets a keystroke appropriate to its type, and the DOM has to show it. A
        box wired to a store key nothing reads back fails here and passes 1.

     3. **The dead ones stay counted.** Plenty of controls on this dashboard are
        deliberately disabled — Factor HR's screens are drawn whole, with the
        boxes this site has no field for greyed and the reason on them. That is
        the design, not a defect (see NEW_EMP_NOFIELD in data/employees.js). So
        they are counted per page rather than banned, and the count is pinned:
        newly-dead boxes have to be looked at and re-pinned deliberately, which
        is the only way a design decision and an accident stay distinguishable.
   --------------------------------------------------------------------------- */

const PAGES = Object.values(MODULES).flatMap((mod) =>
	Object.entries(mod.pages).map(([subtab, C]) => [mod.key, subtab, C]));

/** What to type into a box, by what kind of box it is. A date input rejects
    anything that is not a date and a number input rejects letters, so a single
    test string would fail on the two types most worth testing. */
const KEYSTROKE = {
	date: "2026-09-15",
	number: "42",
	month: "2026-09",
	time: "09:30",
	email: "someone@example.invalid",
	tel: "9000000000",
	search: "raghav",
	text: "raghav",
	"": "raghav",
};

/** The keystroke for one box, narrowed to what that box can legitimately hold.

    **A bounded number has to be typed a value inside its bounds**, and getting
    this wrong is what the first run of this file did: it typed 42 into the
    letter register's `Page` box, which is `max={pages}` over a one-page
    register, and read the clamp back to 1 as a box refusing to be typed in.
    That is the pager working — a page that does not exist is not a page you can
    go to — and a test that calls it a defect would have had somebody delete the
    clamp to make the suite green. */
function keystrokeFor(el) {
	const type = el.tagName === "TEXTAREA" ? "text" : (el.getAttribute("type") || "");
	const typed = KEYSTROKE[type];
	if (type !== "number" || typed === undefined) return typed;

	const min = Number(el.getAttribute("min"));
	const max = Number(el.getAttribute("max"));
	let n = Number(typed);
	if (Number.isFinite(min)) n = Math.max(n, min);
	if (Number.isFinite(max)) n = Math.min(n, max);
	return String(n);
}

/** Boxes a keystroke test cannot speak for. Not "boxes that may fail" — these
    are the ones where "the value did not change" is the correct behaviour. */
const notTypeable = (el) =>
	el.disabled
	|| el.readOnly
	/* A checkbox or radio is toggled, not typed into; `fireEvent.change` on one
	   is meaningless. They are covered by check 1 like everything else. */
	|| ["checkbox", "radio", "file", "hidden", "submit", "button", "range", "color"]
		.includes(el.getAttribute("type") || "");

function boxesIn(container) {
	return [...container.querySelectorAll("input, textarea")].filter((el) => !notTypeable(el));
}

/** A name a failure can be read by. The label if there is one, then anything
    else that says what the box is for — a page with nine unnamed text boxes and
    a failure on "the fourth one" is a failure nobody can act on. */
function describeBox(el) {
	const id = el.getAttribute("id");
	const byFor = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
	const wrap = el.closest("label");
	const text = (
		el.getAttribute("aria-label")
		|| (byFor && byFor.textContent)
		|| (wrap && (wrap.querySelector(".lab")?.textContent || wrap.textContent))
		|| el.getAttribute("placeholder")
		|| el.getAttribute("name")
		|| el.getAttribute("id")
		|| el.getAttribute("title")
		|| "(unnamed)"
	).trim().replace(/\s+/g, " ").slice(0, 70);
	return `${el.tagName.toLowerCase()}[${el.getAttribute("type") || "text"}] "${text}"`;
}

/* How many deliberately-dead controls each page draws, with nothing loaded and
   with a small site loaded — see check 3 above. Taken from the app as it
   stands; a change here is a change somebody has to mean.

   Pages absent from this table draw none, which is most of them. */
const DEAD_CONTROLS = {
	"attendance/submit": { empty: 2, loaded: 2 },
	"employees/calendar": { empty: 2, loaded: 1 },
	"employees/detail": { empty: 13, loaded: 13 },
	"employees/import": { empty: 1, loaded: 0 },
	"employees/new": { empty: 1, loaded: 1 },
	"leave/overview": { empty: 1, loaded: 1 },
	"loans/overview": { empty: 3, loaded: 3 },
	"onboard/assets": { empty: 12, loaded: 12 },
	"onboard/assignment": { empty: 15, loaded: 15 },
	"payroll/bank": { empty: 2, loaded: 2 },
	"payroll/itdec": { empty: 1, loaded: 1 },
	"payroll/overview": { empty: 4, loaded: 4 },
	"payroll/process": { empty: 3, loaded: 3 },
};

let warnings = [];
let realError;

beforeEach(() => {
	resetStore();
	warnings = [];
	realError = console.error;
	console.error = (...args) => {
		warnings.push(args.map(String).join(" "));
		/* Not swallowed. A warning this test does not assert on is still worth
		   seeing in the run, and hiding React's output to make a suite quiet is
		   how a suite stops being worth running. */
		realError(...args);
	};
});

afterEach(() => {
	console.error = realError;
	vi.restoreAllMocks();
});

async function draw(Component, section, subtab, mode) {
	if (mode === "loaded") set(loadedState());
	set({ section, subtab });
	let view;
	await act(async () => {
		view = render(<Provider store={store}><Component /></Provider>);
	});
	return view;
}

describe.each(PAGES)("%s/%s", (section, subtab, Component) => {
	describe.each(["empty", "loaded"])("%s", (mode) => {
		it("draws no form control React considers unwired", async () => {
			await draw(Component, section, subtab, mode);
			/* React's exact wording for the bug this file exists to catch, plus
			   the sibling it reports for a checkbox. */
			const unwired = warnings.filter((w) =>
				/You provided a `?(value|checked)`? prop to a form field without an `?onChange`? handler/.test(w));
			expect(unwired, `${section}/${subtab} (${mode})`).toEqual([]);
		});

		it("accepts typing in every box that is not deliberately dead", async () => {
			const view = await draw(Component, section, subtab, mode);
			const refused = [];

			for (const el of boxesIn(view.container)) {
				const type = el.tagName === "TEXTAREA" ? "text" : (el.getAttribute("type") || "");
				const typed = keystrokeFor(el);
				/* A type this test has no keystroke for is not a pass — it is a box
				   nobody has decided about, and saying so beats skipping it. */
				if (typed === undefined) {
					refused.push(`${describeBox(el)} — no keystroke defined for type "${type}"`);
					continue;
				}
				const before = el.value;
				await act(async () => { fireEvent.change(el, { target: { value: typed } }); });
				if (el.value === before && before !== typed) {
					refused.push(`${describeBox(el)} — typed ${JSON.stringify(typed)}, still ${JSON.stringify(before)}`);
				}
			}

			expect(refused, `${section}/${subtab} (${mode}) refused typing`).toEqual([]);
		});

		it("draws only the dead controls it is meant to", async () => {
			const view = await draw(Component, section, subtab, mode);
			const dead = [...view.container.querySelectorAll("input, select, textarea")]
				.filter((el) => el.disabled || el.readOnly);
			const expected = DEAD_CONTROLS[`${section}/${subtab}`]?.[mode] ?? 0;
			expect(dead.length, `${section}/${subtab} (${mode}): ${dead.map(describeBox).join("; ")}`)
				.toBe(expected);
		});
	});
});
