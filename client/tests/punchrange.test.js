import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The punch reads behind Daily Detail and the month reach noon the day after
   their range. The last night of a range ends that morning; a read that stops
   at 23:59:59 leaves it "in, never out", and the rule that pairs it
   (`workDateOf`) has nothing to pair it with.
   --------------------------------------------------------------------------- */

const asked = [];
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (doctype, fields, filters) => {
		asked.push({ doctype, filters });
		return Promise.resolve([]);
	},
}));

const { loadDda, loadRegGrid, loadRegMonth } = await import("@/api/attendance");
const { resetStore } = await import("@/store");

const punchTill = () => {
	const read = asked.find((a) => a.doctype === "Employee Checkin");
	return read.filters.find((f) => f[0] === "time" && f[1] === "<=")[2];
};

describe("the punch reads reach the morning after", () => {
	beforeEach(() => { asked.length = 0; resetStore(); });

	it("daily detail reads to noon the day after its last day", async () => {
		await loadDda("2026-09-01", "2026-09-30", "", true);
		expect(punchTill()).toBe("2026-10-01 11:59:59");
	});

	it("the register reads to noon on the first of the next month", async () => {
		await loadRegGrid("2026-12", true);
		expect(punchTill()).toBe("2027-01-01 11:59:59");
	});

	it("one person's month reads to noon on the first of the next month", async () => {
		await loadRegMonth("E1", "2026-02", true);
		expect(punchTill()).toBe("2026-03-01 11:59:59");
	});
});
