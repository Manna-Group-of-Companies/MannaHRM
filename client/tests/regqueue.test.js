import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetStore, getState } from "@/store";

/* The approval queue on a site whose hand-built doctype lacks a field the
   dashboard asks for. The request was saved; the approver must still see it. */
const reads = [];
let refuse = () => false;
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (dt, fields) => {
		reads.push(fields);
		return refuse(fields)
			? Promise.reject(new Error("Field not permitted in query: decision_note"))
			: Promise.resolve([{ name: "HR-REG-1", employee: "E1", status: "Pending Approval" }]);
	},
}));

const { pendingRegularizations } = await import("@/api/load");

describe("the approval queue", () => {
	beforeEach(() => { reads.length = 0; resetStore(); });

	it("still lists a request when the site refuses one of the extra fields", async () => {
		refuse = (f) => f.includes("decision_note");
		const rows = await pendingRegularizations();
		expect(rows.map((r) => r.name)).toEqual(["HR-REG-1"]);
		expect(reads).toHaveLength(2);
		expect(getState().regDoctype).toBe("Employee Attendance Regularization");
		expect(getState().regQueueErr).toBe("");
	});

	it("keeps the site's own reason when nothing can be read at all", async () => {
		refuse = () => true;
		expect(await pendingRegularizations()).toEqual([]);
		expect(getState().regDoctype).toBe("");
		expect(getState().regQueueErr).toMatch(/not permitted/);
	});
});
