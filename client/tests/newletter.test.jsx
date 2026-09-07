import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import LetterForm from "@/features/onboard/LetterForm";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   On Board → Create Letter / Form → Create Letter, all the way to the site and
   back.

   This form used to open a pre-filled `Employee Letter` on the ERPNext desk and
   leave somebody to press Save over there. It writes the document itself now,
   so what is worth pinning is the round trip rather than the drawing: that
   there is one create call, what is in it, that the register is re-read from
   the site rather than patched here, that the assigned name is shown where
   their dash was, and that a refusal is said out loud with the boxes still
   holding what was typed.

   `@/api/client` and `@/api/load` are both mocked, because "it did not throw"
   and "it sent the right document to the right doctype" are very different
   claims — and the second is the one that decides whether a letter exists.
   --------------------------------------------------------------------------- */

const calls = { created: [], loaded: 0 };
let creates;   // what apiCreate does, per test

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiCreate: (...a) => {
			calls.created.push(a);
			return creates(...a);
		},
	};
});

vi.mock("@/api/load", () => ({
	load: () => {
		calls.loaded += 1;
		return Promise.resolve();
	},
}));

const draw = () => render(<Provider store={store}><LetterForm /></Provider>);

const text = (view) => view.container.textContent;

const button = (view, label) =>
	[...view.container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

const click = (el) => act(() => { el.click(); });

const type = (view, sel, v) => act(() => {
	fireEvent.change(view.container.querySelector(sel), { target: { value: v } });
});

/** Open their blue Create Letter and answer the three the site requires. */
function fill(view, { who = "Priya", ltype = "Offer Letter", date = "2026-09-07" } = {}) {
	click(button(view, "Create Letter"));
	if (who) {
		type(view, "#nl-emp", who);
		click(view.container.querySelector(".regfind button"));
	}
	if (ltype) type(view, "#nl-type", ltype);
	if (date) type(view, "#nl-date", date);
}

const save = async (view) => {
	await act(async () => { button(view, "Save").click(); });
};

beforeEach(() => {
	calls.created = [];
	calls.loaded = 0;
	creates = () => Promise.resolve({ name: "HR-LTR-2026-00004" });
	resetStore();
	set(loadedState());
	set({ site: "https://mannarubber.m.frappe.cloud" });
});

describe("Create New Letter writes the document", () => {
	it("sends one Employee Letter carrying the person, the type and the date", async () => {
		const view = draw();
		fill(view);
		await save(view);

		expect(calls.created).toHaveLength(1);
		const [doctype, doc] = calls.created[0];
		expect(doctype).toBe("Employee Letter");
		expect(doc.employee).toBe("HR-EMP-00002");
		expect(doc.letter_type).toBe("Offer Letter");
		expect(doc.letter_date).toBe("2026-09-07");
	});

	it("leaves out an untouched reference and remark rather than sending them empty", async () => {
		const view = draw();
		fill(view);
		await save(view);

		const [, doc] = calls.created[0];
		expect("reference_number" in doc).toBe(false);
		expect("remarks" in doc).toBe(false);
	});

	it("sends a reference and a remark that were typed", async () => {
		const view = draw();
		fill(view);
		type(view, "#nl-ref", "MR/2026/9");
		type(view, "#nl-rem", "Issued on request.");
		await save(view);

		const [, doc] = calls.created[0];
		expect(doc.reference_number).toBe("MR/2026/9");
		expect(doc.remarks).toBe("Issued on request.");
	});

	it("never merges the body here — the site does that on the way in", async () => {
		const view = draw();
		fill(view);
		await save(view);

		expect("body" in calls.created[0][1]).toBe(false);
	});

	it("re-reads the register from the site afterwards", async () => {
		const view = draw();
		fill(view);
		await save(view);

		expect(calls.loaded).toBe(1);
	});

	it("shows the name the site assigned where their dash was", async () => {
		const view = draw();
		expect(text(view)).not.toContain("HR-LTR-2026-00004");
		fill(view);
		await save(view);

		expect(view.container.querySelector("#nl-num").textContent).toContain("HR-LTR-2026-00004");
		expect(text(view)).toContain("It is on the register.");
	});

	it("stays dead until an employee, a type and a date are all answered", async () => {
		const view = draw();
		click(button(view, "Create Letter"));
		expect(button(view, "Save").disabled).toBe(true);

		type(view, "#nl-type", "Offer Letter");
		expect(button(view, "Save").disabled).toBe(true);

		type(view, "#nl-emp", "Priya");
		click(view.container.querySelector(".regfind button"));
		expect(button(view, "Save").disabled).toBe(false);
	});

	it("does not go to the desk to make the document", async () => {
		const view = draw();
		fill(view);
		await save(view);

		const links = [...view.container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
		expect(links.some((h) => (h || "").includes("/new"))).toBe(false);
	});

	it("offers the letter it made on the site, by name", async () => {
		const view = draw();
		fill(view);
		await save(view);

		const open = [...view.container.querySelectorAll("a")]
			.find((a) => a.textContent.trim() === "Open on the site");
		expect(open.getAttribute("href")).toContain("HR-LTR-2026-00004");
	});

	it("says what the site refused and keeps what was typed", async () => {
		creates = () => Promise.reject(new Error("Not permitted to create Employee Letter"));
		const view = draw();
		fill(view);
		type(view, "#nl-ref", "MR/2026/9");
		await save(view);

		expect(text(view)).toContain("Not permitted to create Employee Letter");
		expect(view.container.querySelector("#nl-ref").value).toBe("MR/2026/9");
		/* Still offering to try again rather than reporting a letter that does
		   not exist — the one failure mode this screen must not have. */
		expect(button(view, "Save")).toBeTruthy();
		expect(text(view)).not.toContain("It is on the register.");
	});

	it("keeps the type and the date for the next letter and clears the person", async () => {
		const view = draw();
		fill(view);
		await save(view);
		click(button(view, "Create another"));

		expect(view.container.querySelector("#nl-type").value).toBe("Offer Letter");
		expect(view.container.querySelector("#nl-date").value).toBe("2026-09-07");
		expect(view.container.querySelector("#nl-emp").value).toBe("");
		expect(button(view, "Save").disabled).toBe(true);
	});
});
