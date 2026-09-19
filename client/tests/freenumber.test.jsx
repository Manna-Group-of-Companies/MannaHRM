import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import { heldOnMachines, heldOnSite, nextFreeNumber, numberProblem, SUGGEST_FROM } from "@/lib/freenumber";
import MachineNumber from "@/components/MachineNumber";

/* ---------------------------------------------------------------------------
   Picking a Machine Code nobody holds.

   The rule this file exists for: **a number free in ERPNext is not a number
   free on the machine**. On 18 September 2026 one record was given 899, then
   999, then 912 — every one of them already somebody's at the gate, fingers
   enrolled, and none of it visible from this app.
   --------------------------------------------------------------------------- */

const EMPLOYEES = [
	{ name: "HR-EMP-00489", employee_name: "FARISAMOL VS", attendance_device_id: "860", status: "Active" },
	{ name: "HR-EMP-00162", employee_name: "IT Department", attendance_device_id: "", status: "Active" },
	{ name: "HR-EMP-00478", employee_name: "JAGESHAR ORAON", attendance_device_id: "1039", status: "Inactive" },
];
const ROSTER = [
	{ device_user_id: "860", name_on_device: "Farisamol V S", device_id: "BIO-MRP-GATE1", on_device: 1 },
	{ device_user_id: "899", name_on_device: "Sunit Thithiyo", device_id: "BIO-MRP-GATE1", on_device: 1 },
	{ device_user_id: "912", name_on_device: "Chandan Kumar", device_id: "BIO-MRP-GATE1", on_device: 1 },
	{ device_user_id: "999", name_on_device: "Plansing A Sangma", device_id: "BIO-MRP-GATE1", on_device: 1 },
];

const site = () => heldOnSite(EMPLOYEES);
const machines = () => heldOnMachines(ROSTER);

describe("what is wrong with a number", () => {
	it("names the employee already holding it, whatever their status", () => {
		expect(numberProblem("860", { site: site(), machines: machines() }).kind).toBe("site");
		// A leaver still holding a number still catches its punches.
		expect(numberProblem("1039", { site: site(), machines: machines() }).text).toContain("HR-EMP-00478");
	});

	it("catches a number free here that the gate has already given to somebody", () => {
		const p = numberProblem("899", { site: site(), machines: machines() });
		expect(p.kind).toBe("machine");
		expect(p.text).toContain("Sunit Thithiyo");
	});

	it("refuses anything that is not plain short digits, because the machine truncates", () => {
		expect(numberProblem("EMP-105", { site: site(), machines: machines() }).kind).toBe("bad");
		expect(numberProblem("1234567890", { site: site(), machines: machines() }).kind).toBe("bad");
	});

	it("says unchecked, never free, when the machines cannot be read", () => {
		const p = numberProblem("899", { site: site(), machines: null });
		expect(p.kind).toBe("unchecked");
		expect(p.text).toContain("not on this site yet");
	});

	it("is happy with a number neither list holds", () => {
		expect(numberProblem("9001", { site: site(), machines: machines() })).toBeNull();
	});
});

describe("the suggestion", () => {
	it("is above everything the gate has ever issued", () => {
		expect(Number(nextFreeNumber({ site: site(), machines: machines() }))).toBeGreaterThanOrEqual(SUGGEST_FROM);
	});

	it("skips a number either list holds", () => {
		const taken = heldOnMachines([{ device_user_id: "9001" }, { device_user_id: "9002" }]);
		expect(nextFreeNumber({ site: site(), machines: taken })).toBe("9003");
	});

	it("suggests nothing at all when the machines cannot be read", () => {
		// Suggesting one then would be the same guess that caused the trouble,
		// made by a computer instead of a person.
		expect(nextFreeNumber({ site: site(), machines: null })).toBeNull();
	});
});

/* ---- the box under the Machine Code field ---- */

let roster = ROSTER;
let fail = false;

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: () => (fail ? Promise.reject(Object.assign(new Error("no doctype"), { status: 404 })) : Promise.resolve(roster)),
}));

const box = () => document.querySelector(".machinenum");

async function show(value) {
	let picked = null;
	await act(async () => {
		render(<MachineNumber value={value} employees={EMPLOYEES} onPick={(n) => { picked = n; }} />);
	});
	return () => picked;
}

beforeEach(() => { roster = ROSTER; fail = false; });

describe("the box", () => {
	it("warns in red about a number the gate already gave to somebody", async () => {
		await show("912");
		expect(box().dataset.kind).toBe("machine");
		expect(box().textContent).toContain("Chandan Kumar");
	});

	it("offers a free number and hands it back when clicked", async () => {
		const picked = await show("");
		const button = box().querySelector("button");
		expect(button.textContent).toContain("free on both lists");
		await act(async () => { fireEvent.click(button); });
		expect(picked()).toBe("9001");
	});

	it("offers nothing and says why when the machines' lists are not on the site", async () => {
		fail = true;
		await show("");
		expect(box().querySelector("button")).toBeNull();
		expect(box().textContent).toContain("eSSL");
	});

	it("says a good number is held by nobody", async () => {
		await show("9500");
		expect(box().dataset.kind).toBe("ok");
		expect(box().textContent).toContain("held by nobody");
	});
});
