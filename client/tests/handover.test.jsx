import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import HandOverAssets from "@/features/onboard/BoardingAssets";
import FnF from "@/features/payroll/FnF";
import Checklist from "@/features/checklist/Checklist";
import { heldBy, issuable } from "@/lib/assign";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Assets on the way in and on the way out.

   In: Create Employee's done screen hands over what goes out with a new joiner,
   each one an ordinary `Asset Assignment` so the site's handover rules run.
   Out: a leaver's card on FNF & Separation lists everything they still hold,
   from the asset's custodian and from any handover not yet closed — either
   one alone misses something.
   --------------------------------------------------------------------------- */

const calls = { created: [], reloaded: 0 };
let creates;

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		apiCreate: (...a) => {
			calls.created.push(a);
			return creates(...a);
		},
	};
});

/* The checklist's own reads, answered from here: what is being tested is the
   asset card under it, not how a checklist is read. */
let checklist;
vi.mock("@/api/checklist", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		loadBoarding: () => Promise.resolve(),
		readChecklist: () => Promise.resolve(checklist),
	};
});

vi.mock("@/api/load", () => ({
	loadOnBoard: () => {
		calls.reloaded += 1;
		return Promise.resolve();
	},
	loadSeparations: () => Promise.resolve(),
	load: () => Promise.resolve(),
}));

const LAPTOP = {
	name: "ACC-ASS-00002", asset_name: "Dell laptop", asset_category: "Computers",
	company: "Manna Rubber", status: "Submitted", docstatus: 1, custodian: "", serial_no: "DL-77",
};
const PHONE = {
	name: "ACC-ASS-00003", asset_name: "Samsung phone", asset_category: "Mobile",
	company: "Manna Rubber", status: "Submitted", docstatus: 1, custodian: "", serial_no: "",
};
const DRAFT = { ...PHONE, name: "ACC-ASS-00004", asset_name: "Unsubmitted chair", docstatus: 0 };
const ELSEWHERE = { ...PHONE, name: "ACC-ASS-00005", asset_name: "Treads drill", company: "Manna Treads" };

const contract = (over) => ({
	name: "HR-ASN-00001", employee: "HR-EMP-00004", asset: "ACC-ASS-00002",
	asset_type: "Computers", assign_units: 1, assign_date: "2025-01-10", ...over,
});

beforeEach(() => {
	calls.created = [];
	calls.reloaded = 0;
	creates = () => Promise.resolve({ name: "HR-ASN-2026-00009" });
	resetStore();
	set({ ...loadedState(), onboardRead: true, onboardBusy: false,
		assets: [...loadedState().assets, LAPTOP, PHONE, DRAFT, ELSEWHERE], assignments: [], assignErr: "" });
});

describe("what a person is holding", () => {
	it("counts an asset that names them as custodian, with no contract behind it", () => {
		const held = heldBy("HR-EMP-00001", getState().assets, []);
		expect(held.map((h) => h.asset)).toEqual(["ACC-ASS-00001"]);
		expect(held[0].assignment).toBe("");
	});

	it("counts an open handover even when the asset's custodian says nobody", () => {
		const held = heldBy("HR-EMP-00004", [LAPTOP], [contract()]);
		expect(held).toHaveLength(1);
		expect(held[0]).toMatchObject({ asset: "ACC-ASS-00002", asset_name: "Dell laptop", assignment: "HR-ASN-00001" });
	});

	it("leaves out a handover that has come back", () => {
		expect(heldBy("HR-EMP-00004", [LAPTOP],
			[contract({ return_unit: 1, returned_on: "2026-06-30" })])).toEqual([]);
	});

	it("keeps a damaged one, because broken is not the same as back", () => {
		expect(heldBy("HR-EMP-00004", [LAPTOP],
			[contract({ asset_status: "Damaged Or Not Working" })])).toHaveLength(1);
	});

	it("lists an asset once when the custodian and the contract both name the person", () => {
		const held = heldBy("HR-EMP-00004", [{ ...LAPTOP, custodian: "HR-EMP-00004" }], [contract()]);
		expect(held).toHaveLength(1);
	});
});

describe("what can be handed to a new joiner", () => {
	it("offers only submitted assets with nobody, in the person's company", () => {
		const names = issuable(getState().assets, [], "Manna Rubber").map((a) => a.name);
		expect(names).toEqual(["ACC-ASS-00002", "ACC-ASS-00003"]);
	});

	it("does not offer one tied up in an open handover", () => {
		const names = issuable(getState().assets, [contract()], "Manna Rubber").map((a) => a.name);
		expect(names).toEqual(["ACC-ASS-00003"]);
	});
});

describe("hand over assets, on the day somebody joins", () => {
	const draw = () => render(
		<Provider store={store}>
			<HandOverAssets employee="HR-EMP-00002" employeeName="Priya Menon" company="Manna Rubber" />
		</Provider>,
	);
	const tick = (view, label) => act(() => {
		fireEvent.click(view.getByLabelText(label));
	});

	it("writes one Asset Assignment per ticked asset, and re-reads the register", async () => {
		const view = draw();
		tick(view, "Hand over Dell laptop");
		tick(view, "Hand over Samsung phone");
		await act(async () => { view.getByText("Hand over 2").click(); });

		expect(calls.created.map(([dt, doc]) => [dt, doc.asset])).toEqual([
			["Asset Assignment", "ACC-ASS-00002"],
			["Asset Assignment", "ACC-ASS-00003"],
		]);
		expect(calls.created[0][1]).toMatchObject({ employee: "HR-EMP-00002", assign_units: 1 });
		expect(calls.created[0][1]).not.toHaveProperty("valid_till");
		expect(calls.reloaded).toBe(1);
		expect(view.container.textContent).toContain("2 handed over.");
	});

	it("keeps going past a refusal and names the asset it was about", async () => {
		creates = (_dt, doc) => (doc.asset === "ACC-ASS-00002"
			? Promise.reject(new Error("ACC-ASS-00002 is with Anand"))
			: Promise.resolve({ name: "HR-ASN-2026-00010" }));
		const view = draw();
		tick(view, "Hand over Dell laptop");
		tick(view, "Hand over Samsung phone");
		await act(async () => { view.getByText("Hand over 2").click(); });

		expect(calls.created).toHaveLength(2);
		expect(view.container.textContent).toContain("1 handed over.");
		expect(view.container.textContent).toContain("Dell laptop: ACC-ASS-00002 is with Anand");
	});

	it("refuses a Valid Till before the day it went out, before anything is sent", () => {
		const view = draw();
		tick(view, "Hand over Dell laptop");
		act(() => { fireEvent.change(view.getByLabelText("Assign date"), { target: { value: "2026-11-09" } }); });
		act(() => { fireEvent.change(view.getByLabelText("Valid till"), { target: { value: "2026-11-01" } }); });
		expect(view.getByText("Hand over 1").disabled).toBe(true);
		expect(view.container.textContent).toContain("Valid Till is before");
	});

	it("says there is nowhere to write when the site has no Asset Assignment", () => {
		set({ assignErr: "DocType Asset Assignment not found" });
		const view = draw();
		expect(view.container.textContent).toContain("nowhere to write a handover");
		expect(view.queryByLabelText("Hand over Dell laptop")).toBeNull();
	});
});

describe("a leaver's card shows what they still hold", () => {
	const draw = () => render(<Provider store={store}><FnF /></Provider>);

	it("lists the open handover and offers to collect it", () => {
		set({ assignments: [contract()] });
		const view = draw();
		const strip = view.getByRole("note", { name: "Assets with Sunitha Joseph" });
		expect(strip.textContent).toContain("1 asset still out");
		expect(strip.textContent).toContain("Dell laptop");

		act(() => { view.getByText("Collect assets").click(); });
		expect(getState().asg.emp).toBe("HR-EMP-00004");
		expect(getState().subtab).toBe("assignment");
	});

	it("says None when nothing is out", () => {
		const view = draw();
		expect(view.queryByRole("note", { name: "Assets with Sunitha Joseph" })).toBeNull();
		expect(view.container.textContent).toContain("Assets outNone");
	});
});

describe("the checklist pages carry the assets", () => {
	const draw = () => render(<Provider store={store}><Checklist /></Provider>);
	const offboarding = { name: "HR-EMP-SEP-1", employee: "HR-EMP-00004", employee_name: "Sunitha Joseph", boarding_status: "In Process" };
	const onboarding = { name: "HR-EMP-ONB-1", employee: "HR-EMP-00002", employee_name: "Priya Menon", company: "Manna Rubber", boarding_status: "Pending" };

	it("lists what a leaver still holds on their offboarding checklist", async () => {
		checklist = { doc: offboarding, items: [] };
		set({ assignments: [contract()], section: "checklist", subtab: "list", chkList: { kind: "Offboarding", name: offboarding.name } });
		let view;
		await act(async () => { view = draw(); });
		const card = await vi.waitFor(() => view.getByRole("region", { name: "Assets to collect" }));
		expect(card.textContent).toContain("still holds 1");
		expect(card.textContent).toContain("Dell laptop");

		act(() => { view.getByText("Collect assets").click(); });
		expect(getState().asg.emp).toBe("HR-EMP-00004");
		expect(getState().subtab).toBe("assignment");
	});

	it("offers the free assets on a joiner's onboarding checklist", async () => {
		checklist = { doc: onboarding, items: [] };
		set({ section: "checklist", subtab: "list", chkList: { kind: "Onboarding", name: onboarding.name } });
		let view;
		await act(async () => { view = draw(); });
		await vi.waitFor(() => view.getByRole("region", { name: "Hand over assets" }));
		act(() => { fireEvent.click(view.getByLabelText("Hand over Dell laptop")); });
		await act(async () => { view.getByText("Hand over 1").click(); });
		expect(calls.created.map(([dt, doc]) => [dt, doc.employee, doc.asset]))
			.toEqual([["Asset Assignment", "HR-EMP-00002", "ACC-ASS-00002"]]);
	});

	it("counts each leaver's assets on the Offboarding list", async () => {
		set({ assignments: [contract()], section: "checklist", subtab: "overview",
			boarding: { state: "ok", Onboarding: [], Offboarding: [offboarding] } });
		let view;
		await act(async () => { view = draw(); });
		const heads = [...view.container.querySelectorAll("th")].map((t) => t.textContent);
		expect(heads).toContain("Assets");
		expect(view.container.textContent).toContain("1 to collect");
	});
});
