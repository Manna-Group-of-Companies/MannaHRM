import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

import { machineVerdict } from "@/lib/onmachine";
import OnMachine from "@/components/OnMachine";

/* ---------------------------------------------------------------------------
   "Is the person just created on the machine?" — yes, no, or cannot tell.

   Read off `Attendance Device User`, which the bridge fills from each machine
   on every pass. The rule that matters most: **"No" is never said on a site
   the bridge has not reported to**, because that sends somebody to a gate for
   a person who may well be enrolled there.
   --------------------------------------------------------------------------- */

const GATE1 = { name: "BIO-MRP-GATE1-851", device_id: "BIO-MRP-GATE1", device_user_id: "851",
	name_on_device: "ANIL K", employee: null, on_device: 1, enrolled_at: "2026-09-17 10:02:00" };
const OTHER = { name: "BIO-MRP-GATE1-12", device_id: "BIO-MRP-GATE1", device_user_id: "12",
	name_on_device: "SOMEONE", employee: "HR-EMP-00001", on_device: 1 };

describe("the verdict", () => {
	it("is yes when a machine holds the number", () => {
		const v = machineVerdict("851", { rows: [GATE1], heard: true });
		expect(v.state).toBe("yes");
		expect(v.on[0].device_id).toBe("BIO-MRP-GATE1");
	});

	it("is no when the bridge has reported and no machine holds the number", () => {
		expect(machineVerdict("851", { rows: [], heard: true }).state).toBe("no");
	});

	it("is never no on a site the bridge has not reported to", () => {
		expect(machineVerdict("851", { rows: [], heard: false }).state).toBe("unknown");
	});

	it("is unknown when the site has no Attendance Device User doctype", () => {
		expect(machineVerdict("851", { missing: true }).state).toBe("unknown");
	});

	it("is removed when every row for the number is off the machine", () => {
		expect(machineVerdict("851", { rows: [{ ...GATE1, on_device: 0 }], heard: true }).state).toBe("removed");
	});

	it("does not count a different number that happens to be read back", () => {
		expect(machineVerdict("851", { rows: [OTHER], heard: true }).state).toBe("no");
	});

	it("names a machine row still linked to somebody else", () => {
		const v = machineVerdict("851", { rows: [{ ...GATE1, employee: "HR-EMP-00009" }], heard: true }, "HR-EMP-00500");
		expect(v.others).toEqual(["HR-EMP-00009"]);
	});
});

/* ---- the box on Create Employee's done screen ---- */

let rows = [];
let anyRow = true;
let fail = null;

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (label, fields, filters) => (fail ? Promise.reject(fail) : Promise.resolve(
		rows.filter((r) => r.device_user_id === filters[0][2]),
	)),
	api: () => (fail ? Promise.reject(fail) : Promise.resolve({ data: anyRow ? [{ name: "x" }] : [] })),
}));

async function show(number = "851") {
	let out;
	await act(async () => {
		out = render(<OnMachine number={number} employee="HR-EMP-00500" employeeName="Anil K" />);
	});
	return out.container.querySelector(".onmachine");
}

const button = (box, text) =>
	[...box.querySelectorAll("button")].find((b) => b.textContent.includes(text));

beforeEach(() => {
	rows = [];
	anyRow = true;
	fail = null;
});

describe("the box", () => {
	it("says yes and names the machine", async () => {
		rows = [GATE1];
		const box = await show();
		expect(box.dataset.state).toBe("yes");
		expect(box.textContent).toContain("On the machine: Yes");
		expect(box.textContent).toContain("BIO-MRP-GATE1");
	});

	it("says no, and that the finger cannot be sent from a web page", async () => {
		rows = [OTHER];
		const box = await show();
		expect(box.dataset.state).toBe("no");
		expect(box.textContent).toContain("cannot be sent from a web page");
	});

	it("says it cannot tell on a site without the doctype, rather than no", async () => {
		fail = Object.assign(new Error("not found"), { status: 404, excType: "DoesNotExistError" });
		const box = await show();
		expect(box.dataset.state).toBe("unknown");
		expect(box.textContent).not.toContain("On the machine: No");
	});

	it("checks again on the button and picks up somebody enrolled since", async () => {
		const first = await show();
		expect(first.dataset.state).toBe("no");
		rows = [GATE1];
		await act(async () => { fireEvent.click(button(first, "Check again")); });
		expect(document.querySelector(".onmachine").dataset.state).toBe("yes");
	});
});
