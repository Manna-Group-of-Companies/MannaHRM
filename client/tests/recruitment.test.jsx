import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import SeatResumes from "@/features/employees/SeatResumes";
import CompanyChart from "@/features/employees/CompanyChart";
import { seatOfPerson } from "@/lib/vacancy";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Resumes on an open seat of the hierarchy chart. The site is stubbed at the
   network calls, so api/recruitment.js runs for real; only reading a file's
   text is stubbed, by the file's name. */

let site;
let writes;
let texts;

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		listAll: async (dt, fields, filters) => {
			if (dt === "Job Opening") {
				if (!site.criteria && fields.some((f) => f.startsWith("custom_"))) throw new Error("Field not permitted in query");
				return site.openings;
			}
			if (dt === "Job Applicant") {
				if (!site.criteria && fields.includes("custom_score_detail")) throw new Error("Field not permitted in query");
				const [f, op, v] = filters[0];
				return site.applicants.filter((a) => (op === "in" ? v.includes(a[f]) : a[f] === v));
			}
			if (dt === "Job Applicant Source") return site.sources.map((name) => ({ name }));
			if (dt === "Employee") return site.seps;
			return [];
		},
		apiCreate: async (dt, doc) => {
			writes.push(["create", dt, doc]);
			if (dt === "Job Applicant") {
				const made = { ...doc, name: `HR-APP-${writes.length}`, creation: "2026-10-12" };
				site.applicants.push(made);
				return made;
			}
			if (dt === "Job Applicant Source") site.sources.push(doc.source_name);
			if (dt === "Job Opening") {
				const made = { ...doc, name: "HR-OPN-2026-0009" };
				site.openings.push(made);
				return made;
			}
			return doc;
		},
		apiWrite: async (dt, name, patch) => {
			writes.push(["write", dt, name, patch]);
			const o = site.openings.find((x) => x.name === name);
			if (o) Object.assign(o, patch);
			return { ok: true };
		},
		apiUpload: async (file, at) => { writes.push(["upload", at.doctype, at.name, at.field]); return { file_url: `/private/files/${file.name}` }; },
		/* The opening's comments, where criteria live on a site without the fields. */
		api: async (path, params) => (path.includes("form.load.getdoc")
			? { docs: [], docinfo: { comments: site.comments.filter((c) => c.reference_name === params.name) } }
			: {}),
		apiCall: async (method, body) => {
			writes.push(["call", method, body]);
			if (method.endsWith("add_comment")) site.comments.push({ ...body, creation: `2026-10-13 10:0${site.comments.length}:00` });
			return {};
		},
		whoami: async () => "hr@mannarubber.com",
		apiDelete: async (dt, name) => {
			writes.push(["delete", dt, name]);
			if (site.refuseDelete) throw new Error("Not permitted");
			site.applicants = site.applicants.filter((a) => a.name !== name);
		},
	};
});

vi.mock("@/lib/resumetext", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, resumeText: async (file) => ({ text: texts[file.name] ?? "", error: texts[file.name] == null ? "Not a PDF, Word or text file." : "" }) };
});

/** Somebody at Manna Treads who resigned and is serving notice. */
const LEAVER = {
	name: "HR-EMP-09001", employee_name: "Ravi Varma", employee_number: "MT-090", company: "Manna Treads",
	department: "Maintenance - MT", designation: "Maintenance Manager", status: "Active",
	resignation_letter_date: "2026-10-01", relieving_date: "2026-10-31",
};
const SEAT = seatOfPerson(LEAVER);
const OPENING = {
	name: "HR-OPN-2026-0001", job_title: SEAT.title, designation: "Maintenance Manager", company: "Manna Treads",
	status: "Open", custom_must_have: "PLC, Welding", custom_min_experience: 2,
};

async function draw(ui) {
	let view;
	await act(async () => { view = render(<Provider store={store}>{ui}</Provider>); });
	return view;
}

const panel = (props = {}) => draw(
	<SeatResumes seat={SEAT} openings={site.openings} criteriaOk={site.criteria}
		onOpenings={async () => {}} onClose={() => {}} {...props} />,
);

const button = (view, label) => [...view.container.querySelectorAll("button")].find((b) => b.textContent === label);

async function upload(view, ...names) {
	const input = view.getByLabelText("Upload resumes");
	const files = names.map((n) => new File(["x"], n, { type: "application/pdf" }));
	await act(async () => { fireEvent.change(input, { target: { files } }); });
}

beforeEach(() => {
	resetStore();
	act(() => set({ ...loadedState(), site: "https://erp.example" }));
	site = {
		criteria: true,
		openings: [{ ...OPENING }],
		applicants: [
			{ name: "HR-APP-1", applicant_name: "Low Scorer", email_id: "low@x.com", job_title: OPENING.name,
				applicant_rating: 0.21, custom_score_detail: "Must have: ✗ PLC — 2.1/7.1", creation: "2026-10-01" },
			{ name: "HR-APP-2", applicant_name: "High Scorer", email_id: "high@x.com", job_title: OPENING.name,
				applicant_rating: 0.93, custom_score_detail: "Must have: ✓ PLC — 7.1/7.1", creation: "2026-10-02" },
		],
		sources: [],
		seps: [],
		comments: [],
	};
	writes = [];
	texts = {
		"anil.pdf": "Anil Kumar\nanil@example.com\n9847012345\nExperience\nFitter Jan 2020 - Present\nSkills: PLC, Welding, lathe and pipe work",
		"repeat.pdf": "Low Scorer\nlow@x.com\nSkills: PLC and a good deal of other text to read",
	};
});

describe("resumes for an open seat", () => {
	it("lists the seat's resumes best score first, each out of ten, and says whose seat it is", async () => {
		const view = await panel();
		expect(view.container.textContent).toContain("replacing Ravi Varma");
		const rows = [...view.container.querySelectorAll("table.rlist tbody tr")];
		expect(rows.map((r) => r.children[1].querySelector("a").textContent)).toEqual(["High Scorer", "Low Scorer"]);
		expect(rows[0].textContent).toContain("9.3/10");
	});

	it("reads and scores resumes before anything is written, and adds only the ones that can be", async () => {
		const view = await panel();
		await upload(view, "anil.pdf", "repeat.pdf", "photo.jpg");
		const batch = [...view.container.querySelectorAll(".rbatch tbody tr")];
		expect(batch).toHaveLength(3);
		expect(batch[0].textContent).toContain("10.0/10");
		expect(batch[1].textContent).toContain("Already applied");
		expect(batch[2].textContent).toContain("Not scored");
		expect(writes).toEqual([]);

		fireEvent.change(view.getByLabelText("Email for photo.jpg"), { target: { value: "Photo@Example.com" } });
		fireEvent.change(view.getByLabelText("Name for photo.jpg"), { target: { value: "Scanned Person" } });
		await act(async () => { button(view, "Add 2 resumes").click(); });

		expect(writes.filter((w) => w[1] === "Job Applicant Source").map((w) => w[2].source_name)).toEqual(["LinkedIn", "Indeed"]);
		const made = writes.filter((w) => w[0] === "create" && w[1] === "Job Applicant").map((w) => w[2]);
		expect(made[0]).toMatchObject({
			applicant_name: "Anil Kumar", email_id: "anil@example.com", job_title: OPENING.name,
			source: "LinkedIn", status: "Open", applicant_rating: 1,
		});
		/* Unscored is no rating, not a rating of nought. */
		expect(made[1]).not.toHaveProperty("applicant_rating");
		expect(writes.filter((w) => w[0] === "upload")).toHaveLength(2);
		expect([...view.container.querySelectorAll(".rbatch tbody tr")]).toHaveLength(1);
	});

	it("deletes a resume only after Yes, and leaves it when No", async () => {
		const view = await panel();
		await act(async () => { view.getByLabelText("Delete Low Scorer").click(); });
		expect(writes).toEqual([]);
		await act(async () => { button(view, "No").click(); });
		expect(writes).toEqual([]);

		await act(async () => { view.getByLabelText("Delete Low Scorer").click(); });
		await act(async () => { view.getByLabelText("Yes, delete Low Scorer").click(); });
		expect(writes).toEqual([["delete", "Job Applicant", "HR-APP-1"]]);
		const names = [...view.container.querySelectorAll("table.rlist tbody tr")].map((r) => r.children[1].textContent);
		expect(names.join()).not.toContain("Low Scorer");
		expect(view.container.textContent).toContain("Low Scorer deleted.");
	});

	it("says in the site's words when a delete is refused, and keeps the resume", async () => {
		site.refuseDelete = true;
		const view = await panel();
		await act(async () => { view.getByLabelText("Delete Low Scorer").click(); });
		await act(async () => { view.getByLabelText("Yes, delete Low Scorer").click(); });
		expect(view.container.textContent).toContain("Low Scorer was not deleted: Not permitted");
		expect(view.container.querySelectorAll("table.rlist tbody tr")).toHaveLength(2);
	});

	it("files resumes under the source picked for the upload", async () => {
		const view = await panel();
		await act(async () => { button(view, "Indeed").click(); });
		await upload(view, "anil.pdf");
		expect(view.getByLabelText("Source for anil.pdf").value).toBe("Indeed");
	});

	it("saves only the criteria that changed", async () => {
		const view = await panel();
		fireEvent.change(view.getByLabelText("Qualification"), { target: { value: "ITI / Diploma" } });
		await act(async () => { button(view, "Save").click(); });
		expect(writes).toEqual([["write", "Job Opening", OPENING.name, { custom_qualification: "ITI / Diploma" }]]);
	});

	it("keeps criteria as a comment on the opening when the site has no fields for them, and scores by them", async () => {
		site.criteria = false;
		site.openings = [{ ...OPENING, custom_must_have: undefined, custom_min_experience: undefined }];
		const view = await panel();
		expect(button(view, "Rescore").disabled).toBe(true);

		fireEvent.change(view.getByLabelText("Must have"), { target: { value: "PLC, Welding" } });
		await act(async () => { button(view, "Save").click(); });
		const call = writes.find((w) => w[0] === "call");
		expect(call[1]).toBe("frappe.desk.form.utils.add_comment");
		expect(call[2]).toMatchObject({ reference_doctype: "Job Opening", reference_name: OPENING.name });
		expect(call[2].content).toContain("Must have: PLC, Welding");
		expect(writes.some((w) => w[0] === "write" && w[1] === "Job Opening")).toBe(false);

		await upload(view, "anil.pdf");
		expect(view.container.querySelector(".rbatch tbody tr").textContent).toContain("10.0/10");
	});

	it("reads criteria back from the opening's latest criteria comment", async () => {
		site.criteria = false;
		site.openings = [{ ...OPENING, custom_must_have: undefined, custom_min_experience: undefined }];
		site.comments = [
			{ reference_name: OPENING.name, creation: "2026-10-13 09:00:00", content: "Resume scoring criteria<br>Must have: AutoCAD" },
			{ reference_name: OPENING.name, creation: "2026-10-13 11:00:00", content: "<p>Resume scoring criteria<br>Must have: PLC<br>Minimum experience (years): 4</p>" },
			{ reference_name: OPENING.name, creation: "2026-10-13 12:00:00", content: "Called the candidate" },
		];
		const view = await panel();
		expect(view.getByLabelText("Must have").value).toBe("PLC");
		expect(view.getByLabelText("Minimum experience (years)").value).toBe("4");
	});

	it("opens the seat's position first when it has none, named for whose seat it is", async () => {
		site.openings = [];
		let reread = 0;
		const view = await panel({ onOpenings: async () => { reread++; } });
		expect(view.queryByLabelText("Upload resumes")).toBeNull();
		expect(view.getByLabelText("Designation").value).toBe("");
		const desig = view.getByLabelText("Designation");
		fireEvent.change(desig, { target: { value: desig.options[1].value } });
		await act(async () => { button(view, "Open this position").click(); });
		const made = writes.find((w) => w[1] === "Job Opening")[2];
		expect(made).toMatchObject({
			job_title: "Maintenance Manager — replacing Ravi Varma (MT-090)", company: "Manna Treads",
			department: "Maintenance - MT", status: "Open",
		});
		expect(reread).toBe(1);
	});
});

describe("the company chart's open seats", () => {
	it("puts a Find replacement button under somebody serving notice", async () => {
		site.seps = [LEAVER];
		act(() => set({
			employees: [...loadedState().employees, LEAVER],
			companies: [{ name: "Manna Group Headquarters" }, { name: "Manna Treads" }],
			hcCompany: "Manna Treads", sepState: "",
		}));
		const view = await draw(<CompanyChart />);
		expect(view.container.textContent).toContain("Resigned · leaves 31-Oct-2026");
		const btn = view.getByLabelText("Find a replacement for Ravi Varma");
		/* The seat's opening already holds two resumes. */
		expect(btn.textContent).toBe("Resumes (2)");
		await act(async () => { btn.click(); });
		expect(view.getByRole("dialog").textContent).toContain("Resumes — Maintenance Manager");
	});

	it("draws a seat somebody left on its level, with who left it", async () => {
		const gone = { ...LEAVER, status: "Left", relieving_date: "2026-09-30" };
		site.seps = [gone];
		site.openings = [];
		act(() => set({
			companies: [{ name: "Manna Group Headquarters" }, { name: "Manna Treads" }],
			hcCompany: "Manna Treads", sepState: "",
		}));
		const view = await draw(<CompanyChart />);
		const card = view.container.querySelector(".hcvacant");
		expect(card.textContent).toContain("Vacated");
		expect(card.textContent).toContain("by Ravi Varma");
		expect(view.getByLabelText("Add resumes for Maintenance Manager")).toBeTruthy();
	});
});
