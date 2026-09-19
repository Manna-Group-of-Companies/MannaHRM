import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import { ADD, CHECK, commandDoc, commandState, isFinished } from "@/lib/machinecmd";
import OnMachine from "@/components/OnMachine";

/* ---------------------------------------------------------------------------
   Asking a fingerprint machine something from a page that cannot reach one.

   The page leaves a `Machine Command`; the bridge on the gate PC does it and
   writes the answer back. What is checked here is the shape of the request, how
   the answer reads, and — the one worth a test of its own — that a request
   nobody picks up is reported as **no bridge is running**, not as a spinner
   that never stops.
   --------------------------------------------------------------------------- */

describe("the request", () => {
	it("carries the number, the name and who it is for", () => {
		const doc = commandDoc({
			device_id: "BIO-MRP-GATE1", action: ADD, device_user_id: " 851 ",
			name_on_device: "Anil K", employee: "HR-EMP-00500",
		});
		expect(doc).toEqual({
			device_id: "BIO-MRP-GATE1", action: "Add User", status: "Pending",
			device_user_id: "851", name_on_device: "Anil K", employee: "HR-EMP-00500",
		});
	});

	it("cuts a name to what the machine holds, because the machine cuts it silently", () => {
		expect(commandDoc({ device_id: "g", action: ADD, name_on_device: "A".repeat(40) }).name_on_device)
			.toHaveLength(24);
	});

	it("leaves out the number for an action that does not need one", () => {
		expect(commandDoc({ device_id: "g", action: "List Users" }).device_user_id).toBeUndefined();
	});
});

describe("the answer", () => {
	it("is finished only once the bridge has said so", () => {
		expect(isFinished({ status: "Pending" })).toBe(false);
		expect(isFinished({ status: "Running" })).toBe(false);
		expect(isFinished({ status: "Done" })).toBe(true);
		expect(isFinished({ status: "Failed" })).toBe(true);
	});

	it("shows the machine's own words when it comes back", () => {
		const s = commandState({ status: "Done", result: "Yes. 851 is on the machine as ANIL K." });
		expect(s.ok).toBe(true);
		expect(s.text).toContain("ANIL K");
	});

	it("says no bridge has picked it up rather than waiting for ever", () => {
		const s = commandState({ status: "Pending" }, { waitedSeconds: 120 });
		expect(s.waited).toBe(true);
		expect(s.text).toContain("No bridge has picked this up");
	});

	it("says the bridge is at the machine while it is running", () => {
		expect(commandState({ status: "Running" }).text).toContain("at the machine");
	});
});

/* ---- the buttons ---- */

let created = null;
let refuse = "";
let answer = { status: "Done", result: "851 added as ANIL K." };

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label, fields, filters) => Promise.resolve(
		label === "Attendance Device"
			? [{ name: "MRP Gate 1", device_id: "BIO-MRP-GATE1", device_name: "MRP Gate 1" }]
			: [],
	),
	api: () => Promise.resolve({ data: [{ name: "seen" }] }),
	apiCreate: (label, doc) => {
		if (refuse) return Promise.reject(new Error(refuse));
		created = { label, doc };
		return Promise.resolve({ name: "cmd1" });
	},
	getDoc: () => Promise.resolve({ name: "cmd1", ...answer }),
}));

const box = () => document.querySelector(".onmachine");
const button = (text) => [...box().querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(() => {
	created = null;
	refuse = "";
	answer = { status: "Done", result: "851 added as ANIL K." };
});

async function show() {
	await act(async () => {
		render(<OnMachine number="851" employee="HR-EMP-00500" employeeName="Anil K" />);
	});
}

describe("the box", () => {
	it("asks the bridge to add the number, with the person's name", async () => {
		await show();
		await act(async () => { fireEvent.click(button("Add to the machine")); });
		expect(created.label).toBe("Machine Command");
		expect(created.doc).toMatchObject({
			device_id: "BIO-MRP-GATE1", action: ADD, device_user_id: "851",
			name_on_device: "Anil K", employee: "HR-EMP-00500", status: "Pending",
		});
	});

	it("shows what the machine answered", async () => {
		await show();
		await act(async () => { fireEvent.click(button("Add to the machine")); });
		expect(box().textContent).toContain("851 added as ANIL K.");
	});

	it("asks the machine now without writing to it", async () => {
		answer = { status: "Done", result: "No. 851 is not on the machine." };
		await show();
		await act(async () => { fireEvent.click(button("Ask the machine now")); });
		expect(created.doc.action).toBe(CHECK);
		expect(box().textContent).toContain("No. 851 is not on the machine.");
	});

	it("shows the site's refusal rather than swallowing it", async () => {
		// The server refuses a number another employee holds, and that sentence
		// is the whole answer — a tidied "could not send" is a second trip to
		// find out the same thing.
		refuse = "Machine number 851 already belongs to HR-EMP-00009 (SIJU NP, Left).";
		await show();
		await act(async () => { fireEvent.click(button("Add to the machine")); });
		expect(box().textContent).toContain("The site refused the request.");
		expect(box().textContent).toContain("already belongs to HR-EMP-00009");
	});
});
