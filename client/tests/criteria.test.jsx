import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import SeatCriteria, { criteriaSummary } from "@/features/employees/SeatCriteria";
import Recruitment from "@/features/recruitment/Recruitment";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   A seat's scoring criteria, from its box on the hierarchy chart and from its
   job on Recruitment (asked for by HR, 11 November 2026). One form, one save:
   added, edited and updated, and what was saved is what the box says.
   --------------------------------------------------------------------------- */

const calls = { saved: [], opened: [], rescored: [] };
let applicants = [];

vi.mock("@/api/recruitment", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		saveCriteria: async (opening, draft, inFields) => {
			calls.saved.push({ opening: opening.name, draft, inFields });
			return { ok: true, patch: { custom_must_have: draft.must } };
		},
		createOpening: async (doc) => { calls.opened.push(doc); return { name: "HR-OPN-NEW" }; },
		loadApplicants: async () => ({ rows: applicants, detail: true }),
		rescore: async (opening, rows) => {
			calls.rescored.push({ opening: opening.name, n: rows.length });
			return { changed: rows.length, same: 0, unread: [], details: {} };
		},
		readCriteriaNote: async () => ({}),
	};
});

const OPENING = {
	name: "HR-OPN-0001", job_title: "Accountant (Head Office)", company: "Manna Rubber", status: "Open",
	custom_must_have: "Tally", custom_good_to_have: "", custom_min_experience: 2,
	custom_qualification: "B.Com", custom_preferred_location: "",
};
const SEAT = { title: "Accountant (Head Office)", label: "Accountant", company: "Manna Rubber", designation: "Accountant", department: "", who: null };

beforeEach(() => {
	resetStore();
	set(loadedState());
	calls.saved = []; calls.opened = []; calls.rescored = [];
	applicants = [];
});

describe("what a seat's box says", () => {
	it("is the criteria in one line", () => {
		expect(criteriaSummary(OPENING)).toBe("Must: Tally · 2+ yrs · B.Com");
	});

	it("is nothing when none are set, so the box can say so", () => {
		expect(criteriaSummary({ name: "x" })).toBe("");
		expect(criteriaSummary(null)).toBe("");
	});
});

describe("the criteria, opened from a seat", () => {
	const draw = (openings, onOpenings = vi.fn(async () => {})) => ({
		onOpenings,
		...render(<Provider store={store}>
			<SeatCriteria seat={SEAT} openings={openings} criteriaOk onOpenings={onOpenings} onClose={() => {}} />
		</Provider>),
	});

	it("shows what is saved, and saves an edit to the same opening", async () => {
		const { onOpenings } = draw([OPENING]);
		await act(async () => {});
		expect(screen.getByLabelText("Must have").value).toBe("Tally");
		expect(screen.getByLabelText("Minimum experience (years)").value).toBe("2");
		const save = screen.getByRole("button", { name: "Save" });
		expect(save.disabled).toBe(true);
		act(() => { fireEvent.change(screen.getByLabelText("Must have"), { target: { value: "Tally, GST" } }); });
		expect(save.disabled).toBe(false);
		await act(async () => { save.click(); });
		expect(calls.saved).toEqual([{ opening: "HR-OPN-0001", draft: expect.objectContaining({ must: "Tally, GST" }), inFields: true }]);
		expect(String(calls.saved[0].draft.experience)).toBe("2");
		expect(onOpenings).toHaveBeenCalled();
		expect(document.body.textContent).toContain("Criteria saved");
	});

	it("opens the position first when the seat has no opening, then takes criteria", async () => {
		draw([]);
		await act(async () => {});
		expect(screen.queryByLabelText("Must have")).toBeNull();
		await act(async () => { screen.getByRole("button", { name: "Open this position" }).click(); });
		expect(calls.opened).toEqual([expect.objectContaining({ job_title: "Accountant (Head Office)", designation: "Accountant", company: "Manna Rubber" })]);
	});

	it("rescores the candidates already on the job, once the criteria are saved", async () => {
		applicants = [{ name: "HR-APP-1", applicant_name: "Gibin Joy", applicant_rating: 0 }];
		draw([OPENING]);
		await act(async () => {});
		expect(document.body.textContent).toContain("1 candidate on this job · 1 not scored");
		await act(async () => { screen.getByRole("button", { name: "Rescore" }).click(); });
		expect(calls.rescored).toEqual([{ opening: "HR-OPN-0001", n: 1 }]);
	});

	it("will not rescore against criteria that are typed but not saved", async () => {
		applicants = [{ name: "HR-APP-1", applicant_name: "Gibin Joy", applicant_rating: 0 }];
		draw([OPENING]);
		await act(async () => {});
		act(() => { fireEvent.change(screen.getByLabelText("Qualification"), { target: { value: "ITI" } }); });
		expect(screen.getByRole("button", { name: "Rescore" }).disabled).toBe(true);
	});
});

describe("a job on Recruitment", () => {
	const drawJob = (job) => {
		act(() => set({
			...loadedState(),
			section: "recruitment", subtab: "job", recJob: job.name,
			rec: { state: "ok", jobs: [job], apps: [], criteria: true, detail: true, err: "" },
		}));
		return render(<Provider store={store}><Recruitment /></Provider>);
	};

	it("says what its candidates are scored against", async () => {
		const view = drawJob(OPENING);
		await act(async () => {});
		const strip = view.getByRole("region", { name: "Job scoring criteria" });
		expect(strip.textContent).toContain("Must: Tally · 2+ yrs · B.Com");
		expect(strip.textContent).toContain("Edit criteria");
	});

	it("says when nothing is set — why its candidates read Not scored — and opens the form", async () => {
		const view = drawJob({ ...OPENING, custom_must_have: "", custom_min_experience: 0, custom_qualification: "" });
		await act(async () => {});
		const strip = view.getByRole("region", { name: "Job scoring criteria" });
		expect(strip.textContent).toContain("None set — candidates on this job are not scored.");
		await act(async () => { view.getByRole("button", { name: /Set criteria/ }).click(); });
		expect(screen.getByLabelText("Must have")).toBeTruthy();
	});
});
