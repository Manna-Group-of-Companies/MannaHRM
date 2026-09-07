import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";

import AssetEntry from "@/features/onboard/AssetEntry";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   On Board → Assets Details: when the boxes take typing, and when they do not.

   Reported from the running app as "unable to type and save", which is the
   right description of what happens and not of why. Three separate gates
   decide it and only one of them is a fault:

     no record picked   every box is `readOnly`. Deliberate — the value is
                        still selectable and copyable, which a `disabled` box
                        is not — and it is why the form looks live at rest.
     not in edit mode   `typeable` needs `edit`, set by New or by Edit. A form
                        somebody has not opened for editing does not take
                        typing, which is ordinary.
     the asset is
     submitted          Edit is disabled outright. **This is the one that bites
                        on a real site**, because an asset that is actually in
                        use has been submitted, so the button is dead on nearly
                        every row somebody would pick.

   These tests pin all three, so the next person who reports "I cannot type"
   gets an answer rather than a rediscovery.
   --------------------------------------------------------------------------- */

const DRAFT_ASSET = {
	name: "ACC-ASS-00002", asset_name: "Office chair", item_code: "FURN-002",
	asset_category: "Plant", company: "Manna Rubber", status: "Draft",
	docstatus: 0, location: "Office", custodian: "",
	purchase_date: "2026-01-15", gross_purchase_amount: 4200,
	asset_quantity: 1, warranty_expiry_date: "", supplier: "Kochi Furniture",
	serial_no: "",
};

/** The form as somebody meets it, with `pick` naming a row of the register. */
async function draw({ pick = "", assets } = {}) {
	const state = loadedState();
	if (assets) state.assets = assets;
	set(state);
	set({ aform: { ...store.getState().app.aform, pick } });
	let view;
	await act(async () => {
		view = render(<Provider store={store}><AssetEntry /></Provider>);
	});
	return view;
}

/** Every box on the form that a person could put a cursor in. */
const boxes = (view) => [...view.container.querySelectorAll("input, textarea")]
	.filter((el) => (el.getAttribute("type") || "text") === "text" || el.tagName === "TEXTAREA");

const typeable = (view) => boxes(view).filter((el) => !el.disabled && !el.readOnly);

const press = async (name) => {
	await act(async () => { screen.getByRole("button", { name }).click(); });
};

beforeEach(() => resetStore());

describe("with nothing picked", () => {
	it("draws the form but takes no typing", async () => {
		const view = await draw();
		expect(boxes(view).length).toBeGreaterThan(8);
		expect(typeable(view)).toHaveLength(0);
	});

	it("offers New, and disables everything that needs a record", async () => {
		await draw();
		expect(screen.getByRole("button", { name: /New/ })).toBeEnabled();
		expect(screen.getByRole("button", { name: /Edit/ })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
	});
});

describe("New", () => {
	it("turns the writable boxes on", async () => {
		const view = await draw();
		await press(/New/);
		/* Nine of their thirteen — see ASSET_WRITABLE. The other four have no
		   field on ERPNext's Asset under any name and stay dead with the reason
		   on them, which is the design rather than a gap. */
		expect(typeable(view).length).toBeGreaterThan(0);
	});

	it("takes typing, and keeps it", async () => {
		const view = await draw();
		await press(/New/);
		const box = typeable(view)[0];
		await act(async () => {
			box.value = "Bench grinder";
			box.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(box.value).toBe("Bench grinder");
	});
});

describe("a draft asset", () => {
	it("can be edited, and the boxes then take typing", async () => {
		const view = await draw({ pick: DRAFT_ASSET.name, assets: [DRAFT_ASSET] });
		expect(typeable(view)).toHaveLength(0);

		const edit = screen.getByRole("button", { name: /Edit/ });
		expect(edit).toBeEnabled();
		await press(/Edit/);
		expect(typeable(view).length).toBeGreaterThan(0);
	});
});

describe("a submitted asset", () => {
	/* **The gate that bites on the live site.** An asset that is actually in use
	   has been submitted, and a submitted document is history — the site refuses
	   to amend one too, so this is not a restriction this dashboard invented.
	   What it means in practice is that Edit is dead on nearly every row
	   somebody would pick, and the reason is on the button rather than on the
	   boxes they tried to type into first. */
	it("cannot be edited here", async () => {
		const view = await draw({ pick: "ACC-ASS-00001" });
		expect(screen.getByRole("button", { name: /Edit/ })).toBeDisabled();
		expect(typeable(view)).toHaveLength(0);
	});

	it("says why, on the button", async () => {
		await draw({ pick: "ACC-ASS-00001" });
		expect(screen.getByRole("button", { name: /Edit/ }).getAttribute("title"))
			.toMatch(/submitted/i);
	});

	it("still offers Open, so the record can be reached where it can be amended", async () => {
		await draw({ pick: "ACC-ASS-00001" });
		expect(screen.getByRole("link", { name: /Open on the site/ })).toBeInTheDocument();
	});
});

describe("the form says why it is not taking typing", () => {
	/* The fix for the report. Each of the three resting states now explains
	   itself on the form, where somebody who has just tried to type is looking —
	   rather than only in a tooltip on a button they had no reason to hover. */

	it("with nothing picked, names the two ways in", async () => {
		const view = await draw();
		const note = view.container.querySelector(".afnote");
		expect(note.textContent).toMatch(/No asset picked/i);
		expect(note.textContent).toMatch(/New/);
		expect(note.textContent).toMatch(/Search/);
	});

	it("with a draft picked, says to press Edit", async () => {
		const view = await draw({ pick: DRAFT_ASSET.name, assets: [DRAFT_ASSET] });
		expect(view.container.querySelector(".afnote").textContent)
			.toMatch(/press Edit to type/i);
	});

	it("with a submitted asset, says it is history and where to amend it", async () => {
		const view = await draw({ pick: "ACC-ASS-00001" });
		const note = view.container.querySelector(".afnote").textContent;
		expect(note).toMatch(/Submitted/i);
		expect(note).toMatch(/site/i);
	});

	it("says nothing once the form is actually open", async () => {
		// A note explaining why you cannot type, on a form you are typing into,
		// is the kind of stale text people learn to stop reading.
		const view = await draw();
		await press(/New/);
		expect(view.container.querySelector(".afnote")).toBeNull();
	});

	it("leaves every resting box visibly read-only rather than merely inert", async () => {
		// `readOnly`, never `disabled` — the value has to stay selectable, which
		// is what the CSS in index.css exists to make visible.
		const view = await draw({ pick: DRAFT_ASSET.name, assets: [DRAFT_ASSET] });
		const resting = boxes(view).filter((el) => !el.disabled);
		expect(resting.length).toBeGreaterThan(0);
		expect(resting.every((el) => el.readOnly)).toBe(true);
	});
});

/* ---------------------------------------------------------------------------
   Add Asset Types, and Factor HR's four.

   The Asset Type box on the handover form reads `Asset Category`, which is
   stock ERPNext and starts empty — so on a site where nobody has filled it that
   box has nothing to offer. Their four are recorded in data/onboard.js and
   seeded by manna_hr/install.py; this is the way onto a site the app is not
   installed on, which is every site today.
   --------------------------------------------------------------------------- */
describe("Add Asset Types", () => {
	const open = () => {
		const view = render(<Provider store={store}><AssetEntry /></Provider>);
		act(() => { screen.getByText("Add Asset Types").click(); });
		return view;
	};

	const act_button = (act_) => document.querySelector(`button[data-act="${act_}"]`);

	const blanks = () =>
		[...document.querySelectorAll(".attnew .attname")].map((b) => b.value);

	it("fills the blank rows with the types the site has not got", () => {
		set({ assetCats: [] });
		open();

		act(() => { act_button("factohr").click(); });
		expect(blanks()).toEqual(["Computer", "Mobile Phone", "SIM Card", "Swift Car"]);
	});

	it("writes nothing on its own — Save is where a master is made", () => {
		set({ assetCats: [] });
		open();

		act(() => { act_button("factohr").click(); });
		expect(getState().assetCats).toEqual([]);
		expect(act_button("save").disabled).toBe(false);
	});

	it("offers only the ones missing, so pressing it twice cannot clash", () => {
		set({
			assetCats: [
				{ name: "Computer", asset_category_name: "Computer", creation: "2025-01-01 00:00:00" },
				{ name: "SIM Card", asset_category_name: "SIM Card", creation: "2025-01-01 00:00:00" },
			],
		});
		open();

		act(() => { act_button("factohr").click(); });
		expect(blanks()).toEqual(["Mobile Phone", "Swift Car", "", ""]);
	});

	it("goes dead once every one of them is on the master", () => {
		set({
			assetCats: ["Computer", "Mobile Phone", "SIM Card", "Swift Car"].map((n) => (
				{ name: n, asset_category_name: n, creation: "2025-01-01 00:00:00" }
			)),
		});
		open();

		expect(act_button("factohr").disabled).toBe(true);
	});
});
