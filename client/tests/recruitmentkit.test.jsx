import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Recruitment from "@/features/recruitment/Recruitment";
import { STAGES, STAGE_LABEL } from "@/api/jobs";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Recruitment as the HRDashboard reference draws it (21 October 2026), on
   hrms's Job Opening and Job Applicant. The pipeline's stages are hrms's
   statuses (D5): moving somebody writes their status and nothing else.
   --------------------------------------------------------------------------- */

const JOBS = [
	{ name: "HR-OPN-0001", job_title: "Accountant (Head Office)", designation: "Accountant", company: "Manna Rubber", department: "Accounts", status: "Open", posted_on: "2026-10-01" },
	{ name: "HR-OPN-0002", job_title: "Driver", designation: "Driver", company: "Manna Rubber", department: "", status: "Closed", posted_on: "2026-09-01" },
];
const APPS = [
	{ name: "HR-APP-1", applicant_name: "Asha Menon", email_id: "asha@example.invalid", job_title: "HR-OPN-0001", source: "LinkedIn", status: "Open", applicant_rating: 0.8, custom_score_detail: "Tally — 5/5", creation: "2026-10-05 10:00:00" },
	{ name: "HR-APP-2", applicant_name: "Binu Joseph", email_id: "binu@example.invalid", job_title: "HR-OPN-0001", source: "Indeed", status: "Replied", applicant_rating: 0, creation: "2026-10-06 10:00:00" },
];
const withRec = (extra = {}) => ({
	...loadedState(),
	rec: { state: "ok", jobs: JOBS, apps: APPS, criteria: false, detail: true, err: "" },
	...extra,
});
const draw = () => render(<Provider store={store}><Recruitment /></Provider>);

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("Jobs", () => {
	it("draws the open jobs as cards, with how many applied", async () => {
		await act(async () => set(withRec({ section: "recruitment", subtab: "overview" })));
		const { container } = draw();
		const cards = [...container.querySelectorAll(".k-job")];
		expect(cards).toHaveLength(1);
		expect(cards[0].textContent).toContain("Accountant (Head Office)");
		expect(cards[0].textContent).toContain("2 applicants");
	});

	it("opens a job onto its pipeline, one column per hrms status", async () => {
		await act(async () => set(withRec({ section: "recruitment", subtab: "overview" })));
		const { container } = draw();
		await act(async () => { within(container.querySelector(".k-job")).getByText(/Candidates/).click(); });
		expect(getState().recJob).toBe("HR-OPN-0001");
		expect([...container.querySelectorAll(".k-col-h")].map((h) => h.firstChild.textContent)).toEqual(STAGES.map((st) => STAGE_LABEL[st]));
	});
});

describe("one job", () => {
	it("moves somebody forward by writing their status and nothing else", async () => {
		await act(async () => set(withRec({ section: "recruitment", subtab: "job", recJob: "HR-OPN-0001" })));
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		const { container } = draw();
		const card = [...container.querySelectorAll(".k-cand")].find((c) => c.textContent.includes("Asha Menon"));
		await act(async () => { card.querySelector('[aria-label="Move forward"]').click(); });
		expect(wrote).toEqual([["/api/resource/Job Applicant/HR-APP-1", { status: "Replied" }]]);
		expect(getState().rec.apps.find((a) => a.name === "HR-APP-1").status).toBe("Replied");
	});
});

describe("the applicant", () => {
	it("shows their score out of ten and its breakdown", async () => {
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [] } }));
		await act(async () => set(withRec({ section: "recruitment", subtab: "applicant", recApp: "HR-APP-1" })));
		const { container } = draw();
		expect(container.textContent).toContain("8 / 10");
		await act(async () => { within(container.querySelector('[role="tablist"]')).getByText("Evaluation").click(); });
		expect(container.textContent).toContain("Tally — 5/5");
	});
});

describe("Post a job", () => {
	it("asks for a title, a designation and a company before it goes on", async () => {
		await act(async () => set(withRec({ section: "recruitment", subtab: "new", company: "" })));
		const post = vi.spyOn(http, "post");
		const { container } = draw();
		await act(async () => { fireEvent.submit(container.querySelector("form")); });
		expect(container.textContent).toContain("Enter a job title");
		expect(container.textContent).toContain("Pick a designation");
		expect(container.textContent).toContain("Pick a company");
		expect(post).not.toHaveBeenCalled();
	});
});
