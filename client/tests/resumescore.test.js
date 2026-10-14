import { describe, expect, it } from "vitest";

import {
	CRITERIA_FIELDS, OUT_OF, WEIGHTS, criteriaOf, experienceYears, explain, findItem, findPhone, fromRating,
	guessName, guessSource, parseList, readContact, scoreResume, statedYears, termPattern, toRating, workedMonths,
} from "@/lib/resumescore";
import { problemOf, rankApplicants, storedScore } from "@/api/recruitment";

/* Recruitment's score — lib/resumescore.js. Ten is a resume that shows
   everything the position asks for; a file with no text is not scored. */

const TODAY = 2026 * 12 + 9; // October 2026

const opening = (o) => ({
	[CRITERIA_FIELDS.must]: o.must || "",
	[CRITERIA_FIELDS.good]: o.good || "",
	[CRITERIA_FIELDS.experience]: o.years || 0,
	[CRITERIA_FIELDS.qualification]: o.qual || "",
	[CRITERIA_FIELDS.location]: o.place || "",
});

const RESUME = `ANIL KUMAR
anil.kumar@example.com | +91 98470 12345 | Kottayam, Kerala

Professional Summary
Maintenance engineer with experience in rubber processing plants.

Work Experience
Maintenance Engineer, MRF Ltd
Jan 2020 - Present
Junior Engineer, Apollo Tyres
June 2016 - Dec 2019

Education
B.Tech Mechanical Engineering, 2012 - 2016

Skills
AutoCAD, PLC, Preventive Maintenance, MS-Excel`;

describe("the criteria", () => {
	it("splits items on commas and spellings of one item on slashes", () => {
		expect(parseList("AutoCAD, Tally / Tally Prime\nGST")).toEqual([
			{ label: "AutoCAD", alts: ["AutoCAD"] },
			{ label: "Tally / Tally Prime", alts: ["Tally", "Tally Prime"] },
			{ label: "GST", alts: ["GST"] },
		]);
	});

	it("reads a minimum of nought as no minimum", () => {
		expect(criteriaOf(opening({ must: "PLC", years: 0 })).years).toBe(0);
		expect(criteriaOf(opening({ must: "PLC", years: "3" })).years).toBe(3);
	});
});

describe("finding a term", () => {
	it("finds B.Tech written any of the ways people write it", () => {
		for (const t of ["B.Tech", "BTech", "B. Tech", "B-Tech", "b.tech."]) {
			expect(findItem(`Degree: ${t} Mechanical`, { alts: ["B.Tech"] }), t).toBe("B.Tech");
		}
	});

	it("matches an abbreviation in capitals only, so BE is not found in the word be", () => {
		expect(findItem("I would like to be considered", { alts: ["BE"] })).toBe("");
		expect(findItem("Qualification: B.E. Mechanical", { alts: ["BE"] })).toBe("BE");
		expect(findItem("Passed I.T.I in fitter trade", { alts: ["ITI"] })).toBe("ITI");
	});

	it("does not find C++ in a bare C, nor C in C++", () => {
		expect(findItem("Languages: C", { alts: ["C++"] })).toBe("");
		expect(findItem("Languages: C++", { alts: ["C"] })).toBe("");
		expect(findItem("Languages: C++, Java", { alts: ["C++"] })).toBe("C++");
	});

	it("does not find a skill inside a longer word", () => {
		expect(termPattern("SAP").test("SAPPHIRE")).toBe(false);
		expect(findItem("Excellent communication", { alts: ["Excel"] })).toBe("");
	});

	it("finds any one spelling of an item", () => {
		expect(findItem("Worked on Tally Prime daily", { alts: ["Tally ERP", "Tally Prime"] })).toBe("Tally Prime");
	});
});

describe("years of experience", () => {
	it("adds up the work dates under the experience heading, to today for Present", () => {
		/* Jun 2016 – Dec 2019 is 43 months, Jan 2020 – Oct 2026 is 82. */
		expect(experienceYears(RESUME, TODAY)).toEqual({ years: 10.4, from: "dates" });
	});

	it("does not count a degree's years as work", () => {
		const text = "Experience\nFitter, Jan 2024 - Dec 2024\nEducation\nDiploma 2018 - 2021";
		expect(experienceYears(text, TODAY).years).toBe(1);
	});

	it("counts overlapping jobs once", () => {
		expect(workedMonths("Jan 2020 - Dec 2020\nJun 2020 - Jun 2021", TODAY, false)).toBe(18);
	});

	it("counts a date after today only up to today", () => {
		expect(workedMonths("Jan 2026 - Dec 2030", TODAY, false)).toBe(10);
	});

	it("takes what the resume states when it is more than the dates show — in the applicant's favour", () => {
		const text = "Over 12+ years of experience in tyre retreading.\nExperience\nSupervisor, Jan 2023 - Present";
		expect(experienceYears(text, TODAY)).toEqual({ years: 12, from: "stated" });
	});

	it("reads years and months stated together", () => {
		expect(statedYears("Total Experience: 6 Years 6 Months")).toBe(6.5);
	});

	it("does not read a number of years with no mention of experience as experience", () => {
		expect(statedYears("A 3 year warranty on all tyres")).toBe(0);
	});

	it("reads month-and-year dates written with slashes", () => {
		expect(workedMonths("06/2017 - 05/2018", TODAY, false)).toBe(12);
	});
});

describe("who the resume belongs to", () => {
	it("reads the name, email and Indian mobile number off the top", () => {
		expect(readContact(RESUME, "resume.pdf")).toEqual({
			name: "Anil Kumar", email: "anil.kumar@example.com", phone: "+91 98470 12345",
		});
	});

	it("does not take a run of years for a phone number", () => {
		expect(findPhone("2012 2014 2016 2018 then call 9847012345")).toBe("9847012345");
	});

	it("falls back to the file's name, then the email's, for the name", () => {
		expect(guessName("Contact\nsomebody", "Resume_Priya_Nair.pdf", "")).toBe("Priya Nair");
		expect(guessName("Contact\nsomebody", "Profile.pdf", "rahul.menon91@gmail.com")).toBe("Rahul Menon");
	});

	it("knows an Indeed resume by Indeed's relay address, and otherwise keeps the source HR picked", () => {
		expect(guessSource("", "anil-xyz@indeedemail.com", "LinkedIn")).toBe("Indeed");
		expect(guessSource("Some resume", "a@b.com", "Indeed")).toBe("Indeed");
		expect(guessSource("Top Skills\nPLC\nwww.linkedin.com/in/anil", "a@b.com", "Indeed")).toBe("LinkedIn");
	});
});

describe("the score", () => {
	it("is ten for a resume that shows everything the position asks for", () => {
		const c = criteriaOf(opening({ must: "AutoCAD, PLC", good: "MS Excel", years: 5, qual: "B.Tech / Diploma", place: "Kottayam" }));
		const r = scoreResume(RESUME, c, TODAY);
		expect(r.score).toBe(OUT_OF);
		expect(r.parts.map((p) => p.key)).toEqual(["must", "experience", "qualification", "good", "location"]);
	});

	it("weighs the parts as WEIGHTS says when all five are set", () => {
		const c = criteriaOf(opening({ must: "SolidWorks", good: "SAP", years: 5, qual: "MBA", place: "Chennai" }));
		const r = scoreResume(RESUME, c, TODAY);
		expect(Object.fromEntries(r.parts.map((p) => [p.key, p.of]))).toEqual(WEIGHTS);
		/* Only the experience is met. */
		expect(r.score).toBe(WEIGHTS.experience);
	});

	it("is still out of ten when a position sets only some parts", () => {
		const c = criteriaOf(opening({ must: "AutoCAD, SolidWorks" }));
		const r = scoreResume(RESUME, c, TODAY);
		expect(r.parts).toHaveLength(1);
		expect(r.parts[0]).toMatchObject({ of: 10, got: 5, found: ["AutoCAD"], missing: ["SolidWorks"] });
		expect(r.score).toBe(5);
	});

	it("gives experience short of the minimum its share", () => {
		const c = criteriaOf(opening({ years: 20 }));
		/* 10.4 of 20 years. */
		expect(scoreResume(RESUME, c, TODAY).score).toBe(5.2);
	});

	it("scores a resume that states no experience as having none, and says so", () => {
		const c = criteriaOf(opening({ must: "PLC", years: 2 }));
		const r = scoreResume("Fresher\nSkills: PLC, wiring and panel work for industrial machines", c, TODAY);
		/* Must-have is 5 of the 7 points set, so the whole of it is 7.1 of ten. */
		expect(r.score).toBe(7.1);
		expect(explain(r, c)).toContain("Experience: none found of 2");
	});

	it("does not score a file with no text in it, rather than scoring it zero", () => {
		const r = scoreResume("   \n  ", criteriaOf(opening({ must: "PLC" })), TODAY);
		expect(r.score).toBeNull();
		expect(r.why).toMatch(/no text/i);
	});

	it("does not score against a position that has set nothing", () => {
		expect(scoreResume(RESUME, criteriaOf(opening({})), TODAY).score).toBeNull();
	});

	it("explains itself one line per part, with what was found and missed", () => {
		const c = criteriaOf(opening({ must: "AutoCAD, SolidWorks", years: 3 }));
		expect(explain(scoreResume(RESUME, c, TODAY), c)).toBe(
			"Must have: ✓ AutoCAD, ✗ SolidWorks — 3.6/7.1\nExperience: 10.4 yrs of 3 — 2.9/2.9",
		);
	});
});

describe("the score on the site", () => {
	it("goes into hrms's star rating and comes back exact", () => {
		for (const s of [0, 0.1, 3.3, 7.4, 9.9, 10]) expect(fromRating(toRating(s))).toBe(s);
		expect(toRating(null)).toBeNull();
	});

	it("reads an applicant's zero as unscored unless the breakdown says it was scored", () => {
		expect(storedScore({ applicant_rating: 0 })).toBeNull();
		expect(storedScore({ applicant_rating: 0, custom_score_detail: "Must have: ✗ PLC — 0/10" })).toBe(0);
		expect(storedScore({ applicant_rating: 0, custom_score_detail: "No text could be read from this file." })).toBeNull();
		expect(storedScore({ applicant_rating: 0.74 })).toBe(7.4);
	});

	it("ranks the best first and the unscored last", () => {
		const rows = [
			{ name: "a", applicant_rating: 0, creation: "1" },
			{ name: "b", applicant_rating: 0.5, creation: "2" },
			{ name: "c", applicant_rating: 0.9, creation: "3" },
			{ name: "d", applicant_rating: 0.5, creation: "0" },
		];
		expect(rankApplicants(rows).map((r) => r.name)).toEqual(["c", "d", "b", "a"]);
	});
});

describe("whether a row can be added", () => {
	const row = (email, name = "Anil") => ({ name, email });

	it("needs a name and a valid email, because the site refuses either missing", () => {
		expect(problemOf(row("a@b.com", " "), new Set(), [])).toBe("Name needed");
		expect(problemOf(row(""), new Set(), [])).toBe("Email needed");
		expect(problemOf(row("not-an-email"), new Set(), [])).toBe("Email not valid");
	});

	it("refuses somebody who has already applied for this position, whatever the case of their email", () => {
		expect(problemOf(row("Anil@B.com"), new Set(["anil@b.com"]), [])).toBe("Already applied");
	});

	it("refuses the same email twice in one upload", () => {
		const batch = [row("a@b.com"), row("A@b.com")];
		expect(problemOf(batch[0], new Set(), batch)).toBe("Twice in this upload");
		expect(problemOf(row("c@d.com"), new Set(), batch)).toBe("");
	});
});
