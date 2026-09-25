import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Onboarding from "@/features/onboard/Onboarding";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* On Board → Onboarding, on a site where the manna_hr app is not installed —
   the live site's state today. Share must keep working and the page must say
   plainly why Sync Now does not, rather than print Frappe's error. */

let method;
let settings;

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiCall: (...a) => method(...a),
		getDoc: () => Promise.resolve(settings),
		listAll: () => Promise.resolve([]),
	};
});

const NOT_INSTALLED = "App manna_hr is not installed Failed to get method for command "
	+ "manna_hr.onboard_sync.onboarding_share_info with App manna_hr is not installed";

async function draw() {
	let view;
	await act(async () => { view = render(<Provider store={store}><Onboarding /></Provider>); });
	return view;
}

beforeEach(() => {
	resetStore();
	act(() => set(loadedState()));
	method = () => Promise.reject(new Error(NOT_INSTALLED));
	settings = null;
});

describe("Onboarding without the manna_hr app on the site", () => {
	it("keeps Share working and says why Sync Now does not, without Frappe's raw error", async () => {
		const view = await draw();
		const text = view.container.textContent;
		expect(text).toContain("Upload Responses");
		expect(text).toContain("once the Manna HR app is installed");
		expect(text).not.toContain("Failed to get method");
		const share = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Share Google Form");
		expect(share.disabled).toBe(false);
		const sync = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Sync Now");
		expect(sync.disabled).toBe(true);
	});

	it("uses the Form link on Manna HR Settings when the site holds one", async () => {
		settings = { onboarding_form_url: "https://forms.example/ours" };
		const view = await draw();
		expect(view.container.querySelector('a[href="https://forms.example/ours"]')).not.toBeNull();
	});

	it("still prints an error that is not the missing app, since that one means something else", async () => {
		method = () => Promise.reject(new Error("Not permitted"));
		const view = await draw();
		expect(view.container.textContent).toContain("Not permitted");
	});

	it("syncs when the app answers", async () => {
		method = () => Promise.resolve({ form_url: "https://forms.example/x", last_sync: "" });
		const view = await draw();
		const sync = [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Sync Now");
		expect(sync.disabled).toBe(false);
	});
});

import { fireEvent } from "@testing-library/react";

describe("Upload Responses with no Designation in the Sheet", () => {
	it("will not import until a designation is chosen, since hrms refuses a Job Offer without one", async () => {
		act(() => set({ candState: "ok", candTier: "full", cands: [], designations: [{ name: "Operator" }] }));
		const view = await draw();
		const body = "Full Name,Personal Email\nAnu,anu@x.com\n";
		/* jsdom's File has no .text(); a browser's does. */
		const csv = Object.assign(new File([body], "responses.csv", { type: "text/csv" }), { text: async () => body });
		const input = view.container.querySelector('input[type="file"]');
		await act(async () => { fireEvent.change(input, { target: { files: [csv] } }); });
		await act(async () => {});
		expect(view.container.textContent).toContain("1 new");
		const importBtn = () => [...view.container.querySelectorAll("button")].find((b) => b.textContent === "Import");
		expect(importBtn().disabled).toBe(true);
		const pick = view.container.querySelector('select[aria-label="Designation for responses without one"]');
		act(() => { fireEvent.change(pick, { target: { value: "Operator" } }); });
		expect(importBtn().disabled).toBe(false);
	});
});

describe("Add New Employee on Onboarding", () => {
	it("opens the same Create Employee form Employee Master's Add opens", async () => {
		const view = await draw();
		const add = view.container.querySelector('button[aria-label="Add New Employee"]');
		await act(async () => { add.click(); });
		expect(store.getState().app.section).toBe("employees");
		expect(store.getState().app.subtab).toBe("new");
	});
});

describe("a card shows every Form answer", () => {
	it("shows an answer from the uploaded Sheet that the site has no field for yet", async () => {
		const view = await draw();
		act(() => set({ candState: "ok", candTier: "full", cands: [{ name: "HR-ONB-1", employee_name: "Anu", personal_email: "anu@x.com", docstatus: 0 }] }));
		const body = "Full Name,Personal Email,Aadhaar Number,Highest Qualification\nAnu,anu@x.com,1234 5678 9012,B.Com\n";
		const csv = Object.assign(new File([body], "responses.csv", { type: "text/csv" }), { text: async () => body });
		await act(async () => { fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [csv] } }); });
		await act(async () => {});
		const text = view.container.textContent;
		expect(text).toContain("1234 5678 9012");
		expect(text).toContain("B.Com");
		expect(text).toContain("not saved");
	});
});

import { wizardFromCandidate } from "@/api/candidate";

describe("Create Employee from a candidate", () => {
	const cand = { name: "HR-EMP-ONB-2026-00001", employee_name: "msmsms", personal_email: "msmskmsk@gmail.com",
		cell_number: "6875678687", date_of_birth: "1996-06-03", date_of_joining: "2026-09-13",
		company: "Manna Rubber Products Private Limited", designation: "Designer",
		aadhaar_number: "1234 5678 9012", current_address: "Kottayam", marital_status: "married",
		family_members: "4", family_details: "Father, mother, sister", docstatus: 0 };

	it("fills the wizard's boxes from the candidate, and carries what it has no box for", () => {
		const w = wizardFromCandidate(cand);
		expect(w.f).toMatchObject({ first_name: "msmsms", personal_email: "msmskmsk@gmail.com", cell_number: "6875678687",
			date_of_birth: "1996-06-03", date_of_joining: "2026-09-13", company: "Manna Rubber Products Private Limited",
			designation: "Designer", custom_aadhaar_number: "1234 5678 9012", current_address: "Kottayam", status: "Active" });
		expect(w.extra).toEqual({ marital_status: "Married", family_background: "Members: 4\nFather, mother, sister" });
		expect(w.from).toBe("HR-EMP-ONB-2026-00001");
	});

	it("leaves off a marital status ERPNext has no option for, rather than have the Employee refused", () => {
		expect(wizardFromCandidate({ ...cand, marital_status: "Engaged" }).extra.marital_status).toBeUndefined();
	});

	it("opens Create Employee from the card's button, filled in", async () => {
		const view = await draw();
		act(() => set({ candState: "ok", candTier: "extra", cands: [cand] }));
		const btn = view.container.querySelector('button[aria-label="Create Employee from msmsms"]');
		await act(async () => { btn.click(); });
		const st = store.getState().app;
		expect(st.subtab).toBe("new");
		expect(st.newemp.f.personal_email).toBe("msmskmsk@gmail.com");
		expect(st.newemp.from).toBe("HR-EMP-ONB-2026-00001");
	});

	it("is not offered for a candidate who is already an employee", async () => {
		const view = await draw();
		act(() => set({ candState: "ok", candTier: "extra", cands: [{ ...cand, employee: "HR-EMP-00099" }] }));
		expect(view.container.querySelector('button[aria-label="Create Employee from msmsms"]')).toBeNull();
	});
});
