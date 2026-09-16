import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, resetStore } from "@/store";
import RecordForm from "@/features/records/RecordForm";
import { canCreate, canEdit } from "@/lib/write";

/* ---------------------------------------------------------------------------
   The people on a fingerprint machine, shown on that machine's own record.

   The bridge reads each machine's user list and writes one `Attendance Device
   User` per person. What a person opening a machine here needs to see is who
   is on it, who was enrolled most recently, and — above all — who the machine
   lets punch but ERPNext cannot match, because every punch those people make
   is refused and they read as absent every day.
   --------------------------------------------------------------------------- */

const calls = [];
let answer = () => Promise.resolve([]);

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label, fields, filters) => {
		calls.push([label, fields, filters]);
		return answer(label, fields, filters);
	},
}));

const GATE = { name: "MRP Gate 1", device_name: "MRP Gate 1", device_id: "BIO-MRP-GATE1", company: "Manna Rubber" };

const PEOPLE = [
	{ name: "BIO-MRP-GATE1-101", device_id: "BIO-MRP-GATE1", device_user_id: "101", name_on_device: "PRASEETHA IK",
		employee: "HR-EMP-00042", on_device: 1, enrolled_at: null },
	{ name: "BIO-MRP-GATE1-887", device_id: "BIO-MRP-GATE1", device_user_id: "887", name_on_device: "NEW JOINER",
		employee: null, on_device: 1, enrolled_at: "2026-09-15 08:05:00" },
	{ name: "BIO-MRP-GATE1-12", device_id: "BIO-MRP-GATE1", device_user_id: "12", name_on_device: "LEFT IN 2024",
		employee: null, on_device: 0, enrolled_at: null },
];

async function open(doc) {
	let out;
	await act(async () => {
		out = render(
			<Provider store={store}>
				<RecordForm doctype="Attendance Device" doc={doc} onDone={() => {}} onCancel={() => {}} />
			</Provider>,
		);
	});
	return out;
}

const panel = (r) => r.container.querySelector("section.related");
const rowsOf = (r) => [...panel(r).querySelectorAll("tbody tr")].map((tr) => tr.textContent);

beforeEach(() => {
	resetStore();
	calls.length = 0;
	answer = (label) => Promise.resolve(label === "Attendance Device User" ? PEOPLE : []);
});

describe("a machine's record shows who is enrolled on it", () => {
	it("reads the people by the machine's device id, not by the register link", async () => {
		// The bridge reads a machine's users whether or not anybody has registered
		// it, so the link can be blank on rows that belong here.
		await open(GATE);
		const read = calls.find((c) => c[0] === "Attendance Device User");
		expect(read[2]).toEqual([["device_id", "=", "BIO-MRP-GATE1"]]);
	});

	it("puts the person enrolled most recently first", async () => {
		const r = await open(GATE);
		expect(rowsOf(r)[0]).toContain("NEW JOINER");
	});

	it("says how many are on the machine and how many no employee is linked to", async () => {
		const r = await open(GATE);
		expect(panel(r).textContent).toContain("2 enrolled · 1 not linked to an employee · 1 removed");
	});

	it("finds a person by the number the machine calls them", async () => {
		const r = await open(GATE);
		const box = panel(r).querySelector("input[type=search]");
		await act(async () => fireEvent.change(box, { target: { value: "887" } }));
		expect(rowsOf(r)).toHaveLength(1);
		expect(rowsOf(r)[0]).toContain("NEW JOINER");
	});

	it("says so when the site has not got the doctype, instead of showing an empty machine", async () => {
		answer = (label) => (label === "Attendance Device User"
			? Promise.reject(new Error("DocType Attendance Device User not found"))
			: Promise.resolve([]));
		const r = await open(GATE);
		expect(panel(r).textContent).toContain("not found");
	});

	it("is not drawn on a machine that is still being created", async () => {
		const r = await open(null);
		expect(panel(r)).toBeNull();
		expect(calls.find((c) => c[0] === "Attendance Device User")).toBeUndefined();
	});
});

describe("nobody writes a machine's users from here", () => {
	it("refuses to create or edit one, and says to enrol on the machine instead", () => {
		expect(canCreate("Attendance Device User").ok).toBe(false);
		expect(canCreate("Attendance Device User").why).toContain("enrol them on the machine");
		expect(canEdit("Attendance Device User", { name: "BIO-MRP-GATE1-101" }).ok).toBe(false);
	});
});
