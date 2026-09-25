import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FORM_FIELDS, MATCH_FIELD, isoDate, mapRow, planImport } from "@/lib/onboardimport";

/* Upload Responses — the Form's answers as a file. The rule is the server's
   (manna_hr/rules.py, onboard_sync.py), copied into the browser only because
   the app is not installed yet; the first test is what keeps the copy honest. */

describe("the copy of the server's rule", () => {
	it("maps exactly the questions ONBOARDING_FORM_FIELDS in rules.py maps", () => {
		const py = readFileSync(resolve(__dirname, "../../manna_hr/rules.py"), "utf-8");
		const block = /ONBOARDING_FORM_FIELDS = \{([\s\S]*?)\n\}/.exec(py)[1];
		const pairs = Object.fromEntries([...block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
		expect(FORM_FIELDS).toEqual(pairs);
		expect(py).toContain(`ONBOARDING_MATCH_FIELD = "${MATCH_FIELD}"`);
	});
});

describe("a response row", () => {
	it("reads a day-first date the way an Indian-locale Sheet writes it", () => {
		expect(isoDate("03/04/1995")).toBe("1995-04-03");
		expect(isoDate("2026-9-1")).toBe("2026-09-01");
		expect(isoDate(new Date(Date.UTC(2026, 8, 24)))).toBe("2026-09-24");
		expect(isoDate("next monday")).toBe("next monday");
	});

	it("leaves a blank answer out rather than sending it empty", () => {
		expect(mapRow({ "Full Name": "Anu", "Personal Email": "  Anu@X.com ", Department: "" }))
			.toEqual({ employee_name: "Anu", custom_personal_email: "anu@x.com" });
	});

	it("matches a question whatever its case or stray spaces", () => {
		expect(mapRow({ " full name ": "Anu" })).toEqual({ employee_name: "Anu" });
	});
});

describe("what an upload would do", () => {
	const row = (email, extra = {}) => ({ "Full Name": "Anu", "Personal Email": email, Company: "Manna Rubber", ...extra });

	it("creates a candidate nobody has yet, as Pending", () => {
		const p = planImport([row("anu@x.com")], []);
		expect(p.creates).toEqual([{ boarding_status: "Pending", employee_name: "Anu", custom_personal_email: "anu@x.com", company: "Manna Rubber" }]);
	});

	it("skips a row with no email rather than guessing who it is", () => {
		const p = planImport([row("")], []);
		expect(p.creates).toHaveLength(0);
		expect(p.skipped[0].why).toContain("no Personal Email");
	});

	it("treats two submissions from one email as one candidate, the later answers winning", () => {
		const p = planImport([row("anu@x.com", { Department: "Sales" }), row("ANU@x.com", { Department: "HR" })], []);
		expect(p.creates).toHaveLength(1);
		expect(p.creates[0].department).toBe("HR");
	});

	it("updates an existing draft with only what changed", () => {
		const cands = [{ name: "HR-EMP-ONB-1", personal_email: "anu@x.com", employee_name: "Anu", company: "Manna Rubber", docstatus: 0 }];
		const p = planImport([row("anu@x.com", { Department: "HR" })], cands);
		expect(p.creates).toHaveLength(0);
		expect(p.updates).toEqual([{ name: "HR-EMP-ONB-1", email: "anu@x.com", patch: { department: "HR" } }]);
	});

	it("does nothing to a candidate that is already up to date", () => {
		const cands = [{ name: "N", personal_email: "anu@x.com", employee_name: "Anu", company: "Manna Rubber", docstatus: 0 }];
		expect(planImport([row("anu@x.com")], cands).updates).toHaveLength(0);
	});

	it("leaves a candidate that has moved past draft alone", () => {
		const cands = [{ name: "N", personal_email: "anu@x.com", docstatus: 1 }];
		const p = planImport([row("anu@x.com", { Department: "HR" })], cands);
		expect(p.updates).toHaveLength(0);
		expect(p.skipped).toEqual([{ email: "anu@x.com", why: "already past draft" }]);
	});
});

import { rowsOf, sheetRef } from "@/lib/googlesheet";
import { missingQuestions } from "@/lib/onboardimport";

describe("the responses Sheet", () => {
	it("takes the id and tab out of the Sheet's own address", () => {
		expect(sheetRef("https://docs.google.com/spreadsheets/d/1ocKXzWOov_CFD2he-29UKtb16_SppzF7tWbbjDVDIV0/edit?resourcekey=&gid=389438614#gid=389438614"))
			.toEqual({ id: "1ocKXzWOov_CFD2he-29UKtb16_SppzF7tWbbjDVDIV0", gid: 389438614 });
		expect(sheetRef("1ocKXzWOov_CFD2he-29UKtb16_SppzF7tWbbjDVDIV0")).toEqual({ id: "1ocKXzWOov_CFD2he-29UKtb16_SppzF7tWbbjDVDIV0", gid: null });
		expect(sheetRef("")).toBeNull();
	});

	it("keys each response by its column title, and drops empty rows", () => {
		expect(rowsOf([["Timestamp", "Full Name"], ["1/9/2026", "Anu"], ["", ""], ["2/9/2026"]]))
			.toEqual([{ Timestamp: "1/9/2026", "Full Name": "Anu" }, { Timestamp: "2/9/2026", "Full Name": "" }]);
	});

	it("names the Form questions the Sheet has no column for", () => {
		expect(missingQuestions([{ "Full Name": "A", "Email Address": "a@x" }])).toContain("Personal Email");
		expect(missingQuestions([{ "Full Name": "A" }])).not.toContain("Full Name");
	});
});

import { chainDocs } from "@/api/onboarding";

describe("a Form candidate on hrms is three documents", () => {
	const doc = { employee_name: "Anu", custom_personal_email: "anu@x.com", custom_cell_number: "98470",
		company: "Manna Rubber", designation: "Operator", date_of_joining: "2026-10-01" };

	it("makes the Job Applicant and Job Offer hrms requires behind an Employee Onboarding", () => {
		const { applicant, offer } = chainDocs(doc, "2026-09-24");
		expect(applicant).toEqual({ applicant_name: "Anu", email_id: "anu@x.com", status: "Accepted",
			phone_number: "98470", designation: "Operator" });
		expect(offer).toEqual({ applicant_name: "Anu", status: "Accepted", offer_date: "2026-09-24",
			designation: "Operator", company: "Manna Rubber" });
	});

	it("begins onboarding on the joining date, or today when the response has none", () => {
		expect(chainDocs(doc, "2026-09-24").onboarding.boarding_begins_on).toBe("2026-10-01");
		const { date_of_joining, ...none } = doc;
		expect(chainDocs(none, "2026-09-24").onboarding.boarding_begins_on).toBe("2026-09-24");
	});
});

import { dateOrder } from "@/lib/onboardimport";

describe("dates, whatever the Sheet's locale", () => {
	it("reads a US Sheet's 9/13/2026 as 13 September, not a thirteenth month", () => {
		const rows = [{ "Personal Email": "a@x", "Date of Joining": "9/13/2026" }, { "Personal Email": "b@x", "Date of Joining": "9/1/2026" }];
		expect(dateOrder(rows)).toBe("mdy");
		const p = planImport(rows, []);
		expect(p.creates.map((d) => d.date_of_joining)).toEqual(["2026-09-13", "2026-09-01"]);
	});

	it("reads an Indian Sheet's 13/9/2026 day first", () => {
		expect(dateOrder([{ "Date of Birth": "13/9/1990" }])).toBe("dmy");
		expect(isoDate("13/9/1990", "dmy")).toBe("1990-09-13");
	});

	it("reads a Sheets serial number, which is what the Google read asks for", () => {
		expect(isoDate(46278)).toBe("2026-09-13");
		expect(isoDate("46278")).toBe("2026-09-13");
	});
});

import { isoDateTime, EXTRA_FIELDS } from "@/lib/onboardimport";

describe("the rest of the Form", () => {
	it("keeps the Timestamp's time of day, from a serial or from US text", () => {
		expect(isoDateTime(46278.5)).toBe("2026-09-13 12:00:00");
		expect(isoDateTime("9/13/2026 9:05:07", "mdy")).toBe("2026-09-13 09:05:07");
	});

	it("maps every other answer into a field of ours on Employee Onboarding", () => {
		expect(EXTRA_FIELDS).toContain("custom_aadhaar_number");
		expect(EXTRA_FIELDS).toHaveLength(12);
		expect(mapRow({ "Aadhaar Number": "1234 5678 9012", "Highest Qualification": "B.Com" }))
			.toEqual({ custom_aadhaar_number: "1234 5678 9012", custom_highest_qualification: "B.Com" });
	});
});
