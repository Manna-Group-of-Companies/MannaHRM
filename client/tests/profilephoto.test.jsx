import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import EmployeeProfile from "@/features/employees/EmployeeProfile";
import EmployeeCard from "@/components/EmployeeCard";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Employees → Employee Profile → the ✎ on the avatar.

   It used to open the record on the ERPNext desk. It picks a file here now and
   saves it the moment it is picked. What is worth pinning is the boundary:

   - it is **two writes** — the upload, then `Employee.image` pointed at it —
     because Frappe's upload records which field a file belongs to and does not
     set the field, so the upload alone leaves the avatar blank;
   - a refused second write **takes the first one back**, because a photograph
     on the site that nothing points at is one nobody will find to delete;
   - a photograph that will not load draws the **initials**, not a broken image;
   - Employee Master's cards draw the **same** photograph, off the list read,
     and see a new one without a reload.
   --------------------------------------------------------------------------- */

const calls = { up: [], wrote: [], deleted: [] };
let uploads; // what apiUpload does, per test
let writes;  // what apiWrite does, per test
let onSite;  // what reading the record back returns

vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	apiUpload: (...a) => {
		calls.up.push(a);
		return uploads(...a);
	},
	apiWrite: (...a) => {
		calls.wrote.push(a);
		return writes(...a);
	},
	apiDeleteFile: (name) => {
		calls.deleted.push(name);
		return Promise.resolve();
	},
	api: () => Promise.resolve({ data: onSite }),
}));

const EMP = "HR-EMP-00001";
const DOC = {
	name: EMP, employee_name: "Anand Raghavan", employee_number: "MR001", status: "Active",
	company: "Manna Rubber", image: null, doctype: "Employee", docstatus: 0,
};
const URL_ = "/private/files/anand.jpg";

const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);
const picker = (v) => v.container.querySelector('.proava input[type="file"]');
const avatar = (v) => v.container.querySelector(".proava img");
const photo = (name = "anand.jpg", type = "image/jpeg") => new File(["x"], name, { type });

const choose = async (v, file = photo()) => {
	await act(async () => { fireEvent.change(picker(v), { target: { files: [file] } }); });
};

beforeEach(() => {
	calls.up = [];
	calls.wrote = [];
	calls.deleted = [];
	uploads = () => Promise.resolve({ name: "FILE-001", file_url: URL_ });
	writes = () => Promise.resolve({ ok: true });
	onSite = { ...DOC, image: URL_ };
	resetStore();
	set(loadedState());
	set({ empSel: EMP, empDoc: { [EMP]: DOC }, proftab: "about" });
});

describe("the avatar", () => {
	it("draws the initials when the record names no photograph", () => {
		const view = draw();
		expect(avatar(view)).toBeNull();
		expect(view.container.querySelector(".proava").textContent).toContain("AR");
	});

	it("draws the photograph the record names", () => {
		set({ empDoc: { [EMP]: { ...DOC, image: URL_ } } });
		const view = draw();
		expect(avatar(view).getAttribute("src")).toBe(URL_);
	});

	it("falls back to the initials when the named photograph will not load", () => {
		// A File deleted on the desk leaves `image` naming nothing, and a broken
		// image in a circle reads as this page being broken rather than the record.
		set({ empDoc: { [EMP]: { ...DOC, image: "/private/files/gone.jpg" } } });
		const view = draw();
		act(() => { fireEvent.error(avatar(view)); });
		expect(avatar(view)).toBeNull();
		expect(view.container.querySelector(".proava").textContent).toContain("AR");
	});

	it("offers to add one here rather than sending somebody to the desk", () => {
		const view = draw();
		expect(picker(view)).not.toBeNull();
		expect(picker(view).getAttribute("aria-label")).toBe("Add a photograph");
		expect(view.container.querySelector(".proava a")).toBeNull();
	});
});

describe("what a picked photograph sends", () => {
	it("uploads it against the record's image field, optimised", async () => {
		const view = draw();
		await choose(view);

		expect(calls.up).toHaveLength(1);
		const [file, target] = calls.up[0];
		expect(file.name).toBe("anand.jpg");
		expect(target).toEqual({ doctype: "Employee", name: EMP, field: "image", optimize: true });
	});

	it("then points the image field at the file, because the upload alone does not", async () => {
		const view = draw();
		await choose(view);

		expect(calls.wrote).toEqual([["Employee", EMP, { image: URL_ }]]);
	});

	it("reads the record back and draws what the site now holds", async () => {
		const view = draw();
		await choose(view);

		expect(avatar(view).getAttribute("src")).toBe(URL_);
		expect(getState().profpic).toEqual({ busy: false, msg: "Photograph saved.", bad: false });
		expect(view.container.textContent).toContain("Photograph saved.");
	});

	it("sends nothing for a file that is not a picture", async () => {
		const view = draw();
		await choose(view, photo("payslip.pdf", "application/pdf"));

		expect(calls.up).toHaveLength(0);
		expect(calls.wrote).toHaveLength(0);
		expect(view.container.textContent).toContain("payslip.pdf is not a picture.");
	});
});

describe("when the site refuses", () => {
	it("shows a refused upload in the site's words, and writes nothing after it", async () => {
		uploads = () => Promise.reject(new Error("File size exceeded the maximum allowed size of 10.0 MB"));
		onSite = DOC;
		const view = draw();
		await choose(view);

		expect(calls.wrote).toHaveLength(0);
		expect(view.container.textContent).toContain("File size exceeded the maximum allowed size");
		expect(getState().profpic.bad).toBe(true);
	});

	it("deletes the file it uploaded when the field write is refused", async () => {
		// A photograph filed against `image` that `image` does not name is on the
		// site with nothing pointing at it, and nobody will ever find it to delete.
		writes = () => Promise.resolve({ ok: false, error: "No permission for Employee", status: 403 });
		onSite = DOC;
		const view = draw();
		await choose(view);

		expect(calls.deleted).toEqual(["FILE-001"]);
		expect(view.container.textContent).toContain("No permission for Employee");
		expect(avatar(view)).toBeNull();
	});
});

describe("the card on Employee Master", () => {
	const card = (e) => render(<EmployeeCard e={e} onOpen={() => {}} />);

	it("draws the photograph the list read carried", () => {
		const view = card({ ...getState().byName[EMP], image: URL_ });
		expect(view.container.querySelector(".ava img").getAttribute("src")).toBe(URL_);
	});

	it("draws the initials for somebody with no photograph", () => {
		const view = card({ ...getState().byName[EMP], image: "" });
		expect(view.container.querySelector(".ava img")).toBeNull();
		expect(view.container.querySelector(".ava").textContent).not.toBe("");
	});

	it("falls back to the initials when the photograph will not load", () => {
		const view = card({ ...getState().byName[EMP], image: "/private/files/gone.jpg" });
		act(() => { fireEvent.error(view.container.querySelector(".ava img")); });
		expect(view.container.querySelector(".ava img")).toBeNull();
	});

	it("shows a photograph saved on the profile without waiting for a reload", async () => {
		// The cards draw from the list read made at load. Without this, somebody
		// who adds a photograph and goes back to Employee Master sees the old face.
		const view = draw();
		await choose(view);
		expect(getState().byName[EMP].image).toBe(URL_);
		expect(getState().employees.find((e) => e.name === EMP).image).toBe(URL_);
	});

	it("leaves the list alone when the site refused the photograph", async () => {
		writes = () => Promise.resolve({ ok: false, error: "No permission for Employee", status: 403 });
		const before = getState().byName[EMP].image;
		const view = draw();
		await choose(view);
		expect(getState().byName[EMP].image).toBe(before);
	});
});

describe("reading the record again", () => {
	it("comes back after ↻ rather than sitting on reading the record", async () => {
		// `forgetEmployeeDoc` is how ↻, Save and a new photograph all ask for a
		// fresh copy. The read used to be keyed on the person alone, so it never
		// ran again and the page waited for a record nobody was fetching.
		const view = draw();
		const reload = view.container.querySelector('.proacts button[aria-label="Reload this record"]');
		await act(async () => { reload.click(); });

		expect(view.container.textContent).not.toContain("reading the record…");
		expect(avatar(view).getAttribute("src")).toBe(URL_);
	});
});

describe("the message belongs to one person", () => {
	it("is cleared when the record being looked at changes", async () => {
		const view = draw();
		await choose(view);
		expect(getState().profpic.msg).toBe("Photograph saved.");

		act(() => { set({ empSel: "HR-EMP-00002", empDoc: { "HR-EMP-00002": { ...DOC, name: "HR-EMP-00002" } } }); });
		expect(getState().profpic.msg).toBe("");
	});
});
