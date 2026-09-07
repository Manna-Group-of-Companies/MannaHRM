import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import AssignEntry from "@/features/onboard/AssignEntry";
import { store, set, patch, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   On Board → Assets Assignment, once the form writes.

   Seven of Factor HR's fifteen boxes had nowhere to land in ERPNext, because an
   `Asset Movement` is a log and their form is a little contract:  Valid Till,
   Return Unit, Lost Units, Lost On, Recovery Amount, Remarks and Assets Detail.
   `Asset Assignment` is where they live, and this is the screen that writes it.

   What is pinned here is the boundary rather than the layout: the boxes are
   statements until somebody starts a handover and controls after, the document
   that goes over the wire carries what was typed, an empty box is left out
   rather than sent as "", and a handover that does not add up never reaches the
   site at all — the same arithmetic runs there, and this check is to name the
   box first, not to replace it.
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

vi.mock("@/api/load", () => ({
	loadOnBoard: () => {
		calls.reloaded += 1;
		return Promise.resolve();
	},
	load: () => Promise.resolve(),
}));

const draw = () => render(<Provider store={store}><AssignEntry /></Provider>);

const text = (view) => view.container.textContent;

const button = (view, label) =>
	[...view.container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

const type = (view, sel, v) => act(() => {
	fireEvent.change(view.container.querySelector(sel), { target: { value: v } });
});

/** Somebody picked, and the asset they are holding selected in the table. */
const withPerson = () => {
	set(loadedState());
	patch("asg", { emp: "HR-EMP-00001", pick: "ACC-ASS-00001" });
};

const start = (view) => act(() => { button(view, "New handover").click(); });

beforeEach(() => {
	calls.created = [];
	calls.reloaded = 0;
	creates = () => Promise.resolve({ name: "HR-ASN-2026-00001" });
	resetStore();
	withPerson();
});

/* ---------------------------------------------------------------------------
   The caret-eating bug, and it was real.

   The boxes only went live after the New handover button, so the ordinary
   thing — pick somebody, start typing — took the caret and discarded every
   keystroke. Nobody reports that as a bug; they report that the form did not
   save. `tests/inputs.test.jsx` exists for this failure across every other
   screen, and this describe block is its equivalent here.
   --------------------------------------------------------------------------- */
describe("typing into it", () => {
	it("takes typing as soon as somebody is picked, with no button first", () => {
		patch("asg", { pick: "" });
		const view = draw();

		const box = view.container.querySelector("#ag-assign_units");
		expect(box.readOnly).toBe(false);
		expect(box.disabled).toBe(false);

		type(view, "#ag-assign_units", "4");
		expect(getState().asg.form.assign_units).toBe("4");
	});

	it("keeps every typed box live even when the site answered a short read", () => {
		/* Serial Number reads off an Asset field added on 3 Sep, and Assign Date
		   off a movement column added the same day. A site answering the older
		   shape of either used to disable those boxes — on a *new* handover,
		   where there is nothing to have failed to read. */
		patch("asg", { pick: "" });
		set({ assetTier: "standard", moveTier: "standard" });
		const view = draw();

		for (const id of ["#ag-serial_no", "#ag-assign_date", "#ag-returned_on"]) {
			const box = view.container.querySelector(id);
			expect(box.disabled, id).toBe(false);
			expect(box.readOnly, id).toBe(false);
		}
	});

	it("accepts a keystroke in every box it draws as a control", () => {
		patch("asg", { pick: "" });
		const view = draw();

		const typed = [
			["#ag-serial_no", "BG-1"], ["#ag-assign_units", "2"], ["#ag-assign_date", "2026-09-07"],
			["#ag-valid_till", "2026-10-01"], ["#ag-return_unit", "1"], ["#ag-returned_on", "2026-09-20"],
			["#ag-lost_units", "1"], ["#ag-lost_on", "2026-09-21"], ["#ag-recovery_amount", "500"],
			["#ag-remarks", "note"], ["#ag-assets_detail", "dented"],
		];
		for (const [sel, v] of typed) type(view, sel, v);

		const f = getState().asg.form;
		expect(f.serial_number).toBe("BG-1");
		expect(f.valid_till).toBe("2026-10-01");
		expect(f.lost_on).toBe("2026-09-21");
		expect(f.assets_detail).toBe("dented");
	});

	it("offers an asset to hand over, since the table only lists what is already held", () => {
		patch("asg", { pick: "" });
		const view = draw();

		const sel = view.container.querySelector("#ag-assets");
		expect(sel.tagName.toLowerCase()).toBe("select");
		type(view, "#ag-assets", "ACC-ASS-00001");

		const f = getState().asg.form;
		expect(f.asset).toBe("ACC-ASS-00001");
		/* Picking it fills the three that are facts about the thing rather than
		   about the handover. */
		expect(f.serial_number).toBe("BG-9912");
		expect(f.assets_code).toBe("TOOL-001");
		expect(f.asset_type).toBe("Plant");
	});

	it("stays a statement over a saved row from the table", () => {
		const view = draw();   // withPerson() picked a row
		expect(view.container.querySelector("#ag-assign_units").readOnly).toBe(true);
	});
});

describe("Assets Assignment writes a handover", () => {
	it("keeps the boxes read-only until one is being typed", () => {
		const view = draw();
		expect(view.container.querySelector("#ag-assign_units").readOnly).toBe(true);

		start(view);
		expect(view.container.querySelector("#ag-assign_units").readOnly).toBe(false);
	});

	it("seeds the new handover from the asset already on screen", () => {
		const view = draw();
		start(view);
		const f = getState().asg.form;
		expect(f.employee).toBe("HR-EMP-00001");
		expect(f.asset).toBe("ACC-ASS-00001");
		/* Read off the asset rather than retyped — the code and the serial are
		   facts about the thing, not about the handover. */
		expect(f.assets_code).toBe("TOOL-001");
		expect(f.serial_number).toBe("BG-9912");
	});

	it("sends one Asset Assignment carrying what was typed", async () => {
		const view = draw();
		start(view);
		type(view, "#ag-assign_units", "3");
		type(view, "#ag-assign_date", "2026-09-07");
		type(view, "#ag-valid_till", "2026-12-31");
		type(view, "#ag-remarks", "Site work.");
		await act(async () => { button(view, "Save").click(); });

		expect(calls.created).toHaveLength(1);
		const [label, doc] = calls.created[0];
		expect(label).toBe("Asset Assignment");
		expect(doc.employee).toBe("HR-EMP-00001");
		expect(doc.asset).toBe("ACC-ASS-00001");
		expect(doc.assign_units).toBe("3");
		expect(doc.valid_till).toBe("2026-12-31");
		expect(doc.remarks).toBe("Site work.");
	});

	it("leaves an untouched box out rather than sending it empty", async () => {
		const view = draw();
		start(view);
		await act(async () => { button(view, "Save").click(); });

		const doc = calls.created[0][1];
		/* Frappe refuses a Date given "" and simply leaves an absent one unset. */
		expect("returned_on" in doc).toBe(false);
		expect("lost_on" in doc).toBe(false);
		expect("recovery_amount" in doc).toBe(false);
	});

	it("never sends a handover that does not add up", async () => {
		const view = draw();
		start(view);
		type(view, "#ag-assign_units", "2");
		type(view, "#ag-return_unit", "5");

		expect(text(view)).toContain("more than the 2 that went out");
		expect(button(view, "Save").disabled).toBe(true);

		await act(async () => { button(view, "Save").click(); });
		expect(calls.created).toHaveLength(0);
	});

	it("refuses money recovered with no loss behind it, before the round trip", () => {
		const view = draw();
		start(view);
		type(view, "#ag-recovery_amount", "4500");

		expect(text(view)).toContain("needs the loss it recovers");
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("re-reads the register afterwards rather than patching it here", async () => {
		const view = draw();
		start(view);
		await act(async () => { button(view, "Save").click(); });

		/* `asset_status` is computed on the server and the type is filled from
		   the asset there, so a row assembled in the browser would be missing
		   exactly the fields the register shows. */
		expect(calls.reloaded).toBe(1);
		expect(getState().asg.new).toBe(false);
		expect(text(view)).toContain("Handover saved.");
	});

	it("says what the site refused and keeps what was typed", async () => {
		creates = () => Promise.reject(new Error("Not permitted to create Asset Assignment"));
		const view = draw();
		start(view);
		type(view, "#ag-remarks", "Site work.");
		await act(async () => { button(view, "Save").click(); });

		expect(text(view)).toContain("Not permitted to create Asset Assignment");
		expect(getState().asg.form.remarks).toBe("Site work.");
		expect(getState().asg.new).toBe(true);
	});

	it("throws the handover away on Cancel rather than keeping it for the next person", () => {
		const view = draw();
		start(view);
		type(view, "#ag-remarks", "Site work.");
		act(() => { button(view, "Cancel").click(); });

		expect(getState().asg.form).toEqual({});
		expect(getState().asg.new).toBe(false);
	});

	it("cannot start one when the site has no such doctype", () => {
		set({ assignErr: "DocType Asset Assignment not found" });
		const view = draw();
		expect(button(view, "New handover").disabled).toBe(true);
		expect(text(view)).toContain("Asset Assignment could not be read");
	});
});

/* ---------------------------------------------------------------------------
   Their two dropdowns, added 7 September 2026 off the Factor HR screenshots.

   ASSET STATUS carries the five words theirs does, plus the two `Partly` states
   ours has unit counts for. ASSET TYPE narrows the Assets dropdown under it,
   which is what it is for on their form as well.

   The rule under the first one is that the counts still decide: the dropdown
   may impose Scrapped or Damaged Or Not Working — the two no count can produce
   — and any other word that disagrees is refused with both spelled out, rather
   than quietly rewritten on save. tests/assign.test.js holds that arithmetic;
   this is that it reaches the screen.
   --------------------------------------------------------------------------- */
describe("the two dropdowns", () => {
	const options = (view, sel) =>
		[...view.container.querySelectorAll(sel + " option")].map((o) => o.value);

	/** Two categories and one asset in each. The fixture site has a single
	    category, which cannot show a filter narrowing anything. */
	const twoTypes = () => set({
		assets: [
			{ name: "ACC-ASS-00001", asset_name: "Bench grinder", asset_category: "Plant",
				company: "Manna Rubber", status: "Submitted", docstatus: 1,
				custodian: "HR-EMP-00001", serial_no: "BG-9912", item_code: "TOOL-001" },
			{ name: "ACC-ASS-00002", asset_name: "Dell laptop", asset_category: "Computer",
				company: "Manna Rubber", status: "Submitted", docstatus: 1,
				custodian: "", serial_no: "DL-4471", item_code: "IT-001" },
		],
		assetCats: [
			{ name: "Plant", asset_category_name: "Plant", creation: "2025-01-01 00:00:00" },
			{ name: "Computer", asset_category_name: "Computer", creation: "2025-01-02 00:00:00" },
		],
	});

	it("offers every state Asset Status can hold, judgments included", () => {
		patch("asg", { pick: "" });
		const view = draw();

		expect(options(view, "#ag-asset_status")).toEqual([
			"", "Assigned", "Partly Returned", "Returned", "Partly Lost", "Lost",
			"Scrapped", "Damaged Or Not Working",
		]);
	});

	it("takes a judgment and sends it, because no count can produce one", async () => {
		patch("asg", { pick: "" });
		const view = draw();

		type(view, "#ag-assets", "ACC-ASS-00001");
		type(view, "#ag-asset_status", "Damaged Or Not Working");
		expect(getState().asg.form.asset_status).toBe("Damaged Or Not Working");
		expect(text(view)).not.toContain("does not add up");

		await act(async () => { button(view, "Save").click(); });
		expect(calls.created[0][1].asset_status).toBe("Damaged Or Not Working");
	});

	it("refuses a status the counts contradict, and names both words", () => {
		patch("asg", { pick: "" });
		const view = draw();

		type(view, "#ag-assets", "ACC-ASS-00001");
		type(view, "#ag-asset_status", "Returned");

		expect(text(view)).toContain("says Returned");
		expect(text(view)).toContain("make it Assigned");
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("offers the Asset Category master under Asset Type", () => {
		patch("asg", { pick: "" });
		twoTypes();
		const view = draw();

		expect(options(view, "#ag-asset_type")).toEqual(["", "Plant", "Computer"]);
	});

	it("narrows the Assets dropdown to the type picked above it", () => {
		patch("asg", { pick: "" });
		twoTypes();
		const view = draw();

		expect(options(view, "#ag-assets")).toEqual(["", "ACC-ASS-00001", "ACC-ASS-00002"]);

		type(view, "#ag-asset_type", "Computer");
		expect(options(view, "#ag-assets")).toEqual(["", "ACC-ASS-00002"]);
	});

	it("drops an asset the type is narrowed out from under, rather than saving it unseen", () => {
		/* The box would otherwise show nothing while still holding a value that
		   would be written — worse than a box that empties in front of somebody. */
		patch("asg", { pick: "" });
		twoTypes();
		const view = draw();

		type(view, "#ag-assets", "ACC-ASS-00001");
		expect(getState().asg.form.asset).toBe("ACC-ASS-00001");

		type(view, "#ag-asset_type", "Computer");
		expect(getState().asg.form.asset).toBe("");
	});

	it("keeps an asset the narrowing still includes", () => {
		patch("asg", { pick: "" });
		twoTypes();
		const view = draw();

		type(view, "#ag-assets", "ACC-ASS-00002");
		type(view, "#ag-asset_type", "Computer");
		expect(getState().asg.form.asset).toBe("ACC-ASS-00002");
	});
});

/* ---------------------------------------------------------------------------
   That the two dropdowns are *visible* as dropdowns.

   Reported from the running app as "not showing the drop down", and it was two
   things at once: a `dist/` older than the change, and — the real one — a form
   that drew every box as a flat read-only input until somebody was picked. On
   Factor HR's screen Asset Status has an arrow on it always. A flat box where
   somebody is looking for a dropdown reads as a missing feature, not as a form
   waiting for input, so these two carry their arrow in every state and are
   disabled rather than live when there is nothing to choose for.
   --------------------------------------------------------------------------- */
describe("the dropdowns are dropdowns in every state", () => {
	const el = (view, id) => view.container.querySelector(id);

	it("draws them before anybody is picked at all", () => {
		patch("asg", { emp: "", pick: "" });
		const view = draw();

		for (const id of ["#ag-asset_status", "#ag-asset_type"]) {
			expect(el(view, id).tagName, id).toBe("SELECT");
			expect(el(view, id).disabled, id).toBe(true);
		}
	});

	it("draws them while a saved handover is being read", () => {
		const view = draw();

		for (const id of ["#ag-asset_status", "#ag-asset_type"]) {
			expect(el(view, id).tagName, id).toBe("SELECT");
			expect(el(view, id).disabled, id).toBe(true);
		}
	});

	it("shows what the record holds even when it is not one of the states", () => {
		/* Asset Status falls back to ERPNext's own Asset.status — Submitted, In
		   Location — none of which is a handover state. A select whose value is
		   not among its options renders blank, which reads as no data. */
		const view = draw();

		expect(el(view, "#ag-asset_status").value).toBe("Submitted");
	});

	it("is live and full once a handover is being typed", () => {
		patch("asg", { pick: "" });
		const view = draw();

		const box = el(view, "#ag-asset_status");
		expect(box.disabled).toBe(false);
		expect([...box.querySelectorAll("option")].map((o) => o.value)).toEqual([
			"", "Assigned", "Partly Returned", "Returned", "Partly Lost", "Lost",
			"Scrapped", "Damaged Or Not Working",
		]);
	});
});

/* ---------------------------------------------------------------------------
   An empty Asset Category master, which is the state the live site is in.

   Factor HR classifies by four types — Computer, Mobile Phone, SIM Card, Swift
   Car — and none of them was on the site, so this dropdown had nothing to offer
   and read as broken. An empty master is not the same finding as a failed read,
   and neither is the same as a site with types on it.
   --------------------------------------------------------------------------- */
describe("when the site has no asset types", () => {
	const noTypes = () => set({ assetCats: [], assetCatErr: "" });

	it("says so in the dropdown rather than drawing an empty one", () => {
		patch("asg", { pick: "" });
		noTypes();
		const view = draw();

		const box = view.container.querySelector("#ag-asset_type");
		expect(box.tagName).toBe("SELECT");
		expect(box.disabled).toBe(true);
		expect(box.textContent).toContain("No asset types on the site yet");
	});

	it("offers Add Asset Types, which is where the master is filled", () => {
		patch("asg", { pick: "" });
		noTypes();
		const view = draw();

		expect(button(view, "Add Asset Types")).toBeTruthy();
	});

	it("opens that dialog on the Assets screen rather than a second copy here", () => {
		patch("asg", { pick: "" });
		noTypes();
		const view = draw();

		act(() => { button(view, "Add Asset Types").click(); });
		expect(getState().subtab).toBe("assets");
		expect(getState().aform.types).toBe(true);
	});

	it("keeps free text for a master that could not be read, which is a different fault", () => {
		patch("asg", { pick: "" });
		set({ assetCats: [], assetCatErr: "DocType Asset Category not found" });
		const view = draw();

		const box = view.container.querySelector("#ag-asset_type");
		expect(box.tagName).toBe("INPUT");
		expect(button(view, "Add Asset Types")).toBeFalsy();
	});

	it("draws the dropdown normally once types exist", () => {
		patch("asg", { pick: "" });
		const view = draw();

		const box = view.container.querySelector("#ag-asset_type");
		expect(box.tagName).toBe("SELECT");
		expect(box.disabled).toBe(false);
		expect(box.textContent).not.toContain("No asset types");
	});
});
