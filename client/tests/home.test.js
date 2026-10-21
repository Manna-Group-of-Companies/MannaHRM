import { describe, expect, it } from "vitest";
import { attention, birthdaysOn, greeting, monthsBack, stateOf, stateSegments, tableRows, tiles, trend, typeBand } from "@/lib/home";

/* ---------------------------------------------------------------------------
   The front page's arithmetic (lib/home.js) — the HRDashboard reference's
   Dashboard, on this site's records.

   The rule these hold it to: a figure is a real one or none. The reference
   prints +25.5% beside every tile whatever happened; here a trend is worked
   out or left off.
   --------------------------------------------------------------------------- */

const NOW = new Date("2026-10-21T10:00:00");
const ago = (d) => {
	const t = new Date(NOW);
	t.setDate(t.getDate() - d);
	return t.toISOString().slice(0, 10);
};
const emp = (name, joined, extra = {}) => ({
	name, employee_name: name, company: "Manna Rubber", status: "Active", date_of_joining: joined,
	department: "Production", designation: "Operator", ...extra,
});

describe("birthdays today", () => {
	const P = (name, dob, extra = {}) => ({ name, employee_name: name, status: "Active", company: "Manna Rubber", date_of_birth: dob, ...extra });

	it("finds the active people born on this day, by name, in the company picked", () => {
		const rows = [P("Zara", "1990-10-21"), P("Anita", "1985-10-21"), P("Bina", "1990-10-22"),
			P("Left", "1990-10-21", { status: "Left" }), P("Other Co", "1990-10-21", { company: "Manna Polymers" })];
		expect(birthdaysOn(rows, "2026-10-21").map((e) => e.name)).toEqual(["Anita", "Other Co", "Zara"]);
		expect(birthdaysOn(rows, "2026-10-21", "Manna Rubber").map((e) => e.name)).toEqual(["Anita", "Zara"]);
	});

	it("wishes nobody on the placeholder birth date a machine-made record carries", () => {
		const rows = [P("Device user", "2000-01-01", { custom_needs_details: 1 }), P("Flag lost", "2000-01-01")];
		expect(birthdaysOn(rows, "2027-01-01")).toEqual([]);
	});

	it("wishes somebody born on 29 February on the 28th in a year without one", () => {
		const rows = [P("Leap", "1996-02-29")];
		expect(birthdaysOn(rows, "2027-02-28").map((e) => e.name)).toEqual(["Leap"]);
		expect(birthdaysOn(rows, "2028-02-28")).toEqual([]);
		expect(birthdaysOn(rows, "2028-02-29").map((e) => e.name)).toEqual(["Leap"]);
	});

	it("skips a record with no birth date rather than guessing one", () => {
		expect(birthdaysOn([P("Nobody", "")], "2026-10-21")).toEqual([]);
	});
});

describe("the four tiles", () => {
	const employees = [
		emp("A", ago(400)), emp("B", ago(300)), emp("C", ago(10)), emp("D", ago(60)),
		emp("E", ago(200)), emp("F", ago(700), { status: "Left" }),
		emp("G", ago(20), { company: "Manna Treads" }),
	];
	const seps = [{ name: "F", company: "Manna Rubber", relieving_date: ago(30) }];

	it("counts the active people in the company picked, and only them", () => {
		const t = tiles({ employees, seps, company: "Manna Rubber", now: NOW });
		expect(t.find((x) => x.key === "total").value).toBe(5);
		expect(tiles({ employees, seps, now: NOW }).find((x) => x.key === "total").value).toBe(6);
	});

	it("counts who joined and who left in the reference's 120 days", () => {
		const t = tiles({ employees, seps, company: "Manna Rubber", now: NOW });
		expect(t.find((x) => x.key === "new").value).toBe(2);
		expect(t.find((x) => x.key === "left").value).toBe(1);
	});

	it("leaves a trend off when there is nothing before to compare with", () => {
		const t = tiles({ employees, seps, company: "Manna Rubber", now: NOW });
		expect(t.find((x) => x.key === "left").trend).toBeNull();
		expect(t.find((x) => x.key === "applicants").trend).toBeNull();
	});

	it("works the headcount trend out from who came and went since", () => {
		/* Five now; two joined and one left in the window, so four before. */
		const t = tiles({ employees, seps, company: "Manna Rubber", now: NOW });
		expect(t.find((x) => x.key === "total").trend).toBe(25);
	});

	it("shows no applicant figure the site did not give", () => {
		expect(tiles({ employees, seps, now: NOW }).find((x) => x.key === "applicants").value).toBeNull();
		expect(tiles({ employees, seps, applicants: 3, now: NOW }).find((x) => x.key === "applicants").value).toBe(3);
	});
});

describe("a person's state", () => {
	it("is Offboarding with a leaving date still to come, Onboarding in their first thirty days, else Active", () => {
		expect(stateOf(emp("A", ago(400)), { relieving_date: ago(-10) }, NOW)).toBe("Offboarding");
		expect(stateOf(emp("A", ago(400)), { resignation_letter_date: ago(5) }, NOW)).toBe("Offboarding");
		expect(stateOf(emp("A", ago(12)), null, NOW)).toBe("Onboarding");
		expect(stateOf(emp("A", ago(400)), null, NOW)).toBe("Active");
	});

	it("splits everybody active into the donut's three, adding up to all of them", () => {
		const employees = [emp("A", ago(400)), emp("B", ago(5)), emp("C", ago(500))];
		const segs = stateSegments(employees, { C: { relieving_date: ago(-3) } }, "", NOW);
		expect(segs.map((s) => [s.label, s.value])).toEqual([["Others", 1], ["Onboarding", 1], ["Offboarding", 1]]);
	});
});

describe("the strip over the page", () => {
	it("says what is waiting, and sends the button to the requests first", () => {
		const a = attention({ leave: 5, corrections: 1, unpaid: 26 });
		expect(a.bits.map((b) => b.join(""))).toEqual(["5 time-off requests waiting", "1 attendance correction waiting", "26 unpaid this month"]);
		expect(a.go.subtab).toBe("approvals");
	});

	it("is not drawn when nothing is waiting", () => {
		expect(attention({})).toBeNull();
	});

	it("sends the button to payroll when pay is all that is waiting", () => {
		expect(attention({ unpaid: 3 }).go.section).toBe("payroll");
	});
});

describe("the employees table", () => {
	const employees = [
		emp("Anita Das", ago(400), { department: "Stores" }),
		emp("Raghav Menon", ago(400), { designation: "Supervisor" }),
		emp("Gone", ago(400), { status: "Left" }),
	];

	it("lists the active people, by name, matched on name, designation or department", () => {
		expect(tableRows(employees, {}, {}, NOW).map((e) => e.name)).toEqual(["Anita Das", "Raghav Menon"]);
		expect(tableRows(employees, {}, { q: "stores" }, NOW).map((e) => e.name)).toEqual(["Anita Das"]);
		expect(tableRows(employees, {}, { designation: "Supervisor" }, NOW).map((e) => e.name)).toEqual(["Raghav Menon"]);
	});
});

describe("the rest", () => {
	it("greets by the hour, as the reference does", () => {
		expect(greeting(new Date("2026-10-21T09:00:00"))).toBe("Good morning");
		expect(greeting(new Date("2026-10-21T14:00:00"))).toBe("Good afternoon");
		expect(greeting(new Date("2026-10-21T20:00:00"))).toBe("Good evening");
	});

	it("rounds a trend to one place", () => {
		expect(trend(3, 2)).toBe(50);
		expect(trend(2, 3)).toBe(-33.3);
		expect(trend(5, 0)).toBeNull();
	});

	it("names the months the chart covers, oldest first, ending with this one", () => {
		const m = monthsBack(3, NOW);
		expect(m.map((x) => x.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
		expect(m[2]).toMatchObject({ from: "2026-10-01", to: "2026-10-31", label: "Oct" });
	});

	it("bands the four largest employment types, with their change over the month", () => {
		const employees = [
			emp("A", ago(400), { employment_type: "Permanent" }), emp("B", ago(10), { employment_type: "Permanent" }),
			emp("C", ago(400), { employment_type: "Contract" }),
		];
		const band = typeBand(employees, [], "", NOW);
		expect(band[0]).toEqual({ type: "Permanent", value: 2, change: 100 });
		expect(band[1]).toEqual({ type: "Contract", value: 1, change: 0 });
	});
});
