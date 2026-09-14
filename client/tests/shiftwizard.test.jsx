import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Shifts from "@/features/attendance/Shifts";
import { store, set, getState, resetStore } from "@/store";
import { shiftDoc, toInput, SHW_BLANK } from "@/data/shiftwizard";
import { shiftPatch } from "@/api/shifttype";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Attendance → Manage Shift → +, all the way to the site and back.

   The + used to open Frappe's own form in another tab. It opens Factor HR's
   shift form here now and Save writes the Shift Type, so what is pinned is the
   round trip: what goes over the wire, that the list is read back from the site,
   that a refusal is printed and the typing kept, and that an existing shift is
   changed by only the boxes that were changed.

   `@/api/client` is mocked rather than api/shifttype.js, so the document
   builder, the patch and the read-back are all under test.
   --------------------------------------------------------------------------- */

const calls = { created: [], written: [], listed: [], read: [] };
let creates;
let writes;
let onSite = null;
let rowsAfter = [];

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiCreate: (...a) => { calls.created.push(a); return creates(...a); },
		apiWrite: (...a) => { calls.written.push(a); return writes(...a); },
		getDoc: (...a) => { calls.read.push(a); return Promise.resolve(onSite); },
		listAll: (...a) => { calls.listed.push(a); return Promise.resolve(rowsAfter); },
	};
});

const draw = () => render(<Provider store={store}><Shifts /></Provider>);

const type = (view, sel, v) => act(() => {
	fireEvent.change(view.container.querySelector(sel), { target: { value: v } });
});

const button = (view, name) => [...view.container.querySelectorAll(".modal button")]
	.find((b) => b.textContent.trim() === name);

const click = async (el) => { await act(async () => { el.click(); }); };

/** Open +, name it, and walk to the last step. */
async function fillNew(view, name = "Day 8-5") {
	await click(view.container.querySelector('button[aria-label="Add"]'));
	if (name) type(view, "#shw_name", name);
	await click(button(view, "Next"));
	type(view, "#shw_start", "08:00");
	type(view, "#shw_end", "17:00");
	await click(button(view, "Next"));
}

beforeEach(() => {
	resetStore();
	Object.keys(calls).forEach((k) => { calls[k] = []; });
	creates = async (_dt, doc) => ({ ...doc });
	writes = async () => ({ ok: true });
	onSite = null;
	rowsAfter = [];
	act(() => set(loadedState()));
});

describe("+ creates a Shift Type", () => {
	it("opens the shift form in the dashboard rather than a link to the desk", async () => {
		const view = draw();
		const add = view.container.querySelector('button[aria-label="Add"]');
		expect(add.tagName).toBe("BUTTON");
		await click(add);
		expect(view.container.querySelector("#dlgtitle").textContent).toBe("New Shift");
		expect(view.container.querySelector("#shw_name").value).toBe("");
		/* A new shift has nothing to read. */
		expect(calls.read).toHaveLength(0);
	});

	it("sends one Shift Type with the window and tolerances typed", async () => {
		const view = draw();
		await fillNew(view);
		await click(button(view, "Save"));

		expect(calls.created).toHaveLength(1);
		const [doctype, doc] = calls.created[0];
		expect(doctype).toBe("Shift Type");
		expect(doc).toMatchObject({
			name: "Day 8-5",
			start_time: "08:00:00",
			end_time: "17:00:00",
			begin_check_in_before_shift_start_time: 60,
			allow_check_out_after_shift_end_time: 60,
		});
	});

	it("reads the list back off the site and closes, so the new shift is a row", async () => {
		rowsAfter = [{ name: "General" }, { name: "Night" }, { name: "Day 8-5" }];
		const view = draw();
		await fillNew(view);
		await click(button(view, "Save"));

		expect(calls.listed.map((c) => c[0])).toContain("Shift Type");
		expect(getState().shiftTypes.map((r) => r.name)).toContain("Day 8-5");
		expect(getState().counts.shift).toBe(3);
		expect(getState().shw.open).toBe(false);
		expect(view.container.textContent).toContain("Day 8-5");
	});

	it("prints what the site refused it with, and keeps the form open and filled", async () => {
		creates = async () => { throw new Error("Shift Type Day 8-5 already exists"); };
		const view = draw();
		await fillNew(view);
		await click(button(view, "Save"));

		expect(getState().shw.open).toBe(true);
		expect(getState().shw.f.name).toBe("Day 8-5");
		expect(view.container.querySelector(".modal .gap").textContent).toContain("already exists");
		expect(calls.listed).toHaveLength(0);
	});

	it("will not go past the first step without a name, because the shift is named by it", async () => {
		const view = draw();
		await click(view.container.querySelector('button[aria-label="Add"]'));
		await click(button(view, "Next"));
		expect(getState().shw.step).toBe("kind");
		expect(calls.created).toHaveLength(0);
	});
});

describe("✎ changes an existing Shift Type", () => {
	const SITE = {
		name: "General", start_time: "9:00:00", end_time: "18:00:00",
		begin_check_in_before_shift_start_time: 60, allow_check_out_after_shift_end_time: 60,
		late_entry_grace_period: 0, early_exit_grace_period: 0,
	};

	it("sends only the boxes that changed, to the row it was opened on", async () => {
		onSite = SITE;
		const view = draw();
		await click(view.container.querySelector('tbody button[aria-label="Edit"]'));
		/* The site's short time is read as 09:00, not as blank. */
		expect(getState().shw.f.start).toBe("09:00");
		await click(button(view, "Next"));
		type(view, "#shw_end", "18:30");
		await click(button(view, "Next"));
		await click(button(view, "Save"));

		expect(calls.created).toHaveLength(0);
		expect(calls.written).toEqual([["Shift Type", "General", { end_time: "18:30:00" }]]);
	});

	it("locks the name, which is the shift's id", async () => {
		onSite = SITE;
		const view = draw();
		await click(view.container.querySelector('tbody button[aria-label="Edit"]'));
		expect(view.container.querySelector("#shw_name").readOnly).toBe(true);
	});
});

describe("the document, pure", () => {
	it("reads a Frappe short time as HH:MM", () => {
		expect(toInput("8:30:00")).toBe("08:30");
		expect(toInput("20:15:00")).toBe("20:15");
		expect(toInput("")).toBe("");
	});

	it("ticks late marking when a grace is given, since hrms ignores the grace without it", () => {
		const doc = shiftDoc({ ...SHW_BLANK("X").f, gstart: "10", gend: "0" });
		expect(doc.late_entry_grace_period).toBe(10);
		expect(doc.enable_late_entry_marking).toBe(1);
		expect(doc.enable_early_exit_marking).toBeUndefined();
	});

	it("sends no grace at all when grace is by category, which the site has nowhere to put", () => {
		const doc = shiftDoc({ ...SHW_BLANK("X").f, gmode: "cat", gstart: "10" });
		expect(doc.late_entry_grace_period).toBeUndefined();
	});

	it("patches nothing when nothing was changed", () => {
		const f = { ...SHW_BLANK("G").f, start: "09:00", end: "18:00", early: "60", late: "60" };
		expect(shiftPatch({
			name: "G", start_time: "9:00:00", end_time: "18:00:00",
			begin_check_in_before_shift_start_time: 60, allow_check_out_after_shift_end_time: 60,
			late_entry_grace_period: 0, early_exit_grace_period: 0,
		}, f)).toEqual({});
	});
});
