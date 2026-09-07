import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import LetterForm from "@/features/onboard/LetterForm";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   On Board → Create Letter / Form → the pencil on a row.

   It used to be a link to `…/app/employee-letter/HR-LTR-…` on the ERPNext desk,
   from when nothing on this dashboard wrote anything. The register issues
   letters now, so editing one had no business being the one job that sent
   somebody to a second application.

   What is worth pinning is the boundary rather than the boxes: the pencil stays
   here, the write is one PUT carrying only what actually changed, and the two
   fields that decide the *stored text* — the employee and the letter type —
   cannot be changed from this dialog at all. A letter whose register row says
   one person and whose body says another is worse than a letter somebody has
   to re-issue.
   --------------------------------------------------------------------------- */

const calls = { wrote: [], read: 0 };
let doc;        // the letter, as the site answers
let person;     // the employee the merge reads
let template;   // the letter type's stored template
let writes;     // what apiWrite does, per test

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		getDoc: (label) => {
			calls.read += 1;
			if (label === "Employee") return Promise.resolve({ ...person });
			if (label === "Letter Type") return Promise.resolve({ body: template });
			return Promise.resolve({ ...doc });
		},
		apiWrite: (...a) => {
			calls.wrote.push(a);
			return writes(...a);
		},
	};
});

vi.mock("@/api/load", () => ({ load: () => Promise.resolve() }));

const DOC = {
	/* The name the register fixture holds: the dialog writes to the row it was
	   opened on, not to whatever the read happens to answer with. */
	name: "HR-LTR-00001",
	employee: "HR-EMP-00001",
	employee_name: "Anand Raghavan",
	letter_type: "Offer Letter",
	letter_date: "2026-08-01",
	letter_number: 1,
	reference_number: "MR/2026/1",
	remarks: "",
	body: "<p>Dear Anand Raghavan,</p>",
};

const draw = () => render(<Provider store={store}><LetterForm /></Provider>);

const text = (view) => view.container.textContent;

const button = (view, label) =>
	[...view.container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

/** Open the pencil on the register's one row. */
async function pencil(view) {
	await act(async () => {
		view.container.querySelector('button[aria-label="Edit"]').click();
	});
	return view;
}

const type = (view, sel, v) => act(() => {
	fireEvent.change(view.container.querySelector(sel), { target: { value: v } });
});

beforeEach(() => {
	calls.wrote = [];
	calls.read = 0;
	doc = { ...DOC };
	person = { name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001",
		designation: "Operator", custom_father_name: "", relieving_date: "" };
	/* Two tokens the record answers and two it cannot — which is what puts rows
	   in their Custom Fields table. */
	template = "<p>{EmployeeName}, {Designation}. Father: {EmployeesFatherName}. Left: {DOL}.</p>";
	writes = () => Promise.resolve({ ok: true });
	resetStore();
	set(loadedState());
	set({ site: "https://mannarubber.m.frappe.cloud" });
});

describe("the pencil edits the letter here", () => {
	it("is a button on this page, not a link to the desk", async () => {
		const view = draw();
		const pen = view.container.querySelector('[aria-label="Edit"]');
		expect(pen.tagName.toLowerCase()).toBe("button");
		/* The one shape this must never be again. */
		expect(pen.getAttribute("href")).toBeNull();
	});

	it("opens on their form, with the letter read whole from the site", async () => {
		const view = await pencil(draw());
		expect(text(view)).toContain("Edit Letter");
		expect(text(view)).toContain("HR-LTR-00001");
		expect(view.container.querySelector("#el-ref").value).toBe("MR/2026/1");
	});

	it("draws the letter number, the type and the employee as values, as theirs does", async () => {
		const view = await pencil(draw());
		const vals = [...view.container.querySelectorAll(".letef .val")].map((v) => v.textContent);
		expect(vals.join(" | ")).toContain("Offer Letter");
		expect(vals.join(" | ")).toContain("Anand Raghavan");
		/* Neither is a control on their capture, and neither is one here. */
		expect(view.container.querySelector("#el-type")).toBeNull();
		expect(view.container.querySelector("#el-emp")).toBeNull();
	});

	it("puts the tokens nothing could fill in their Custom Fields table", async () => {
		const view = await pencil(draw());
		const toks = [...view.container.querySelectorAll(".letcf td.tok")].map((t) => t.textContent);
		/* The two the record has no answer for. The two it does resolve —
		   EmployeeName and Designation — are not rows: their table is the gaps,
		   not every token in the template. */
		expect(toks).toContain("EmployeesFatherName");
		expect(toks).toContain("DOL");
		expect(toks).not.toContain("EmployeeName");
		expect(toks).not.toContain("Designation");
	});

	it("draws a date token as a date box, the way their capture does", async () => {
		const view = await pencil(draw());
		expect(view.container.querySelector("#el-cf-dol").getAttribute("type")).toBe("date");
		expect(view.container.querySelector("#el-cf-employeesfathername").getAttribute("type"))
			.toBe("text");
	});

	it("stays dead until something actually changes", async () => {
		const view = await pencil(draw());
		expect(button(view, "Save").disabled).toBe(true);

		type(view, "#el-ref", "MR/2026/9");
		expect(button(view, "Save").disabled).toBe(false);

		/* Typed back to what it was is not a change: an identical save still
		   bumps `modified` and still lands in the version history. */
		type(view, "#el-ref", "MR/2026/1");
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("sends only the fields that moved", async () => {
		const view = await pencil(draw());
		type(view, "#el-rem", "Reissued after a typo.");
		await act(async () => { button(view, "Save").click(); });

		expect(calls.wrote).toHaveLength(1);
		const [label, name, patch] = calls.wrote[0];
		expect(label).toBe("Employee Letter");
		expect(name).toBe("HR-LTR-00001");
		expect(patch).toEqual({ remarks: "Reissued after a typo." });
	});

	it("sends an emptied box as empty rather than dropping it", async () => {
		const view = await pencil(draw());
		type(view, "#el-ref", "");
		await act(async () => { button(view, "Save").click(); });

		expect(calls.wrote[0][2]).toEqual({ reference_number: "" });
	});

	it("merges an answered token into the letter and stores the text", async () => {
		const view = await pencil(draw());
		type(view, "#el-cf-employeesfathername", "PKK Nair");
		await act(async () => { button(view, "Save").click(); });

		const patch = calls.wrote[0][2];
		expect(patch.body).toContain("PKK Nair");
		/* The one still unanswered stays visible rather than being blanked. */
		expect(patch.body).toContain("[[DOL]]");
	});

	it("never re-merges the body when no token was answered", async () => {
		const view = await pencil(draw());
		type(view, "#el-rem", "Just a remark.");
		await act(async () => { button(view, "Save").click(); });

		/* The stored text may carry values typed on an earlier edit. A merge on
		   every save would replace them with [[Token]] again. */
		expect("body" in calls.wrote[0][2]).toBe(false);
	});

	it("says what the site refused and keeps the dialog open", async () => {
		writes = () => Promise.resolve({ ok: false, error: "A letter needs the date it was issued on.", status: 417 });
		const view = await pencil(draw());
		type(view, "#el-date", "");
		await act(async () => { button(view, "Save").click(); });

		expect(text(view)).toContain("A letter needs the date it was issued on.");
		expect(button(view, "Save")).toBeTruthy();
	});
});
