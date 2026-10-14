import { describe, expect, it } from "vitest";

import {
	RECENT_DAYS, filled, guessDesignation, leftRecently, openingFor, replacementTitle, resigning, seatTitle, vacatedSeats,
} from "@/lib/vacancy";

/* Which seats on the hierarchy chart take resumes — lib/vacancy.js. */

const TODAY = "2026-10-12";
const person = (o) => ({ name: "E1", employee_name: "Ravi Varma", employee_number: "MT-090", company: "Manna Treads",
	designation: "Maintenance Manager", status: "Active", ...o });

describe("an open seat", () => {
	it("is somebody still Active whose record carries a resignation or a relieving date", () => {
		expect(resigning(person({ resignation_letter_date: "2026-10-01" }))).toBe(true);
		expect(resigning(person({ relieving_date: "2026-10-31" }))).toBe(true);
		expect(resigning(person({}))).toBe(false);
		expect(resigning(person({ status: "Left", relieving_date: "2026-10-01" }))).toBe(false);
	});

	it("is somebody who left within RECENT_DAYS, and not somebody who left before that", () => {
		expect(leftRecently(person({ status: "Left", relieving_date: "2026-09-30" }), TODAY)).toBe(true);
		const long = new Date(Date.parse(TODAY) - (RECENT_DAYS + 1) * 86400000).toISOString().slice(0, 10);
		expect(leftRecently(person({ status: "Left", relieving_date: long }), TODAY)).toBe(false);
	});

	it("is not drawn for somebody who Left with no relieving date, since nothing says when", () => {
		expect(leftRecently(person({ status: "Left" }), TODAY)).toBe(false);
	});

	it("stops being drawn once its opening is Closed, which is how HR says it is filled", () => {
		const gone = person({ status: "Left", relieving_date: "2026-09-30" });
		const open = [{ name: "O1", job_title: replacementTitle(gone), company: "Manna Treads", status: "Open" }];
		expect(vacatedSeats([gone], "Manna Treads", TODAY, open)).toHaveLength(1);
		const closed = [{ ...open[0], status: "Closed" }];
		expect(filled(closed, replacementTitle(gone), "Manna Treads")).toBe(true);
		expect(vacatedSeats([gone], "Manna Treads", TODAY, closed)).toEqual([]);
	});

	it("sits on the level the person sat on — their grade first, else their designation", () => {
		const gone = person({ status: "Left", relieving_date: "2026-09-30" });
		expect(vacatedSeats([gone], "Manna Treads", TODAY, [])[0].level).toBe("Manager");
		expect(vacatedSeats([{ ...gone, grade: "Head" }], "Manna Treads", TODAY, [])[0].level).toBe("Head");
	});

	it("follows the chart's office-only rule on a company that is not the head office", () => {
		const fitter = person({ status: "Left", relieving_date: "2026-09-30", designation: "Fitter" });
		expect(vacatedSeats([fitter], "Manna Treads", TODAY, [], { officeOnly: true })).toEqual([]);
	});
});

describe("the seat's opening", () => {
	it("is named for whose seat it is, by code, so two people of one name get two openings", () => {
		expect(replacementTitle(person({}))).toBe("Maintenance Manager — replacing Ravi Varma (MT-090)");
		expect(seatTitle("Logistics")).toBe("Logistics (Head Office)");
	});

	it("is the open one when there are several, and only in the seat's company", () => {
		const rows = [
			{ name: "A", job_title: "Logistics (Head Office)", company: "HQ", status: "Closed" },
			{ name: "B", job_title: "Logistics (Head Office)", company: "HQ", status: "Open" },
			{ name: "C", job_title: "Logistics (Head Office)", company: "Other", status: "Open" },
		];
		expect(openingFor(rows, "Logistics (Head Office)", "HQ").name).toBe("B");
		expect(openingFor(rows, "Sales (Head Office)", "HQ")).toBeNull();
	});

	it("suggests a designation from the seat's role, preferring a head or manager", () => {
		const d = ["Logistics Executive", "Logistics Manager", "R&D Head", "HR Executive"];
		expect(guessDesignation("Logistics", d)).toBe("Logistics Manager");
		expect(guessDesignation("R&D", d)).toBe("R&D Head");
		expect(guessDesignation("Plant Head", d)).toBe("");
	});
});
