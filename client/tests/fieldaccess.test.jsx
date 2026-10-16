import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import CreateEmployee from "@/features/employees/CreateEmployee";
import EmployeeProfile from "@/features/employees/EmployeeProfile";
import Security from "@/features/settings/Security";
import { ACCESS_FIELDS, FORMS, LEVELS, accessFor, canLock, lockedFields, parseFieldAccess } from "@/lib/fieldaccess";
import { createEmployee } from "@/api/employee";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Settings → Security → Employee fields: Write, Read or Hidden per field, on
   Create Employee and on Employee Profile, for every login but the page admin. */

let doc;
const writes = [];
const created = [];

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		getDoc: () => Promise.resolve(doc),
		apiWrite: (dt, name, patch) => {
			writes.push([dt, patch]);
			if (dt === "Manna HR Settings") doc = { ...doc, ...patch };
			return Promise.resolve({ ok: true });
		},
		apiCreate: (dt, body) => { created.push(body); return Promise.resolve({ name: "HR-EMP-9" }); },
	};
});

const ADMIN = "hr@mannarubber.com";
/* Any login but the page admin that may still edit a record — not one of the
   four company logins, which edit no employee at all (data/menus.js). */
const CLERK = "clerk@mannarubber.com";
const RULES = { new: { middle_name: "hidden", last_name: "read" }, edit: { cell_number: "read", personal_email: "hidden" } };

beforeEach(() => {
	writes.length = 0;
	created.length = 0;
	resetStore();
	act(() => set(loadedState()));
	doc = { name: "Manna HR Settings", page_visibility: null, employee_field_access: null };
});

describe("the rules", () => {
	it("drops anything that is not a form, a fieldname and read or hidden, rather than obeying it", () => {
		expect(parseFieldAccess('{"new": {"a": "read", "b": "write", "C D": "hidden"}, "other": {"x": "read"}}'))
			.toEqual({ new: { a: "read" } });
		expect(parseFieldAccess("{nope")).toEqual({});
	});

	it("binds every login but the page admin", () => {
		expect(accessFor(RULES, "edit", "cell_number", CLERK)).toBe("read");
		expect(accessFor(RULES, "edit", "cell_number", ADMIN)).toBe("write");
		expect(lockedFields(RULES, ADMIN, "new").size).toBe(0);
	});

	it("takes the tightest of a row's spellings, so the other fieldname is no way round it", () => {
		expect(accessFor({ edit: { final_confirmation_date: "hidden" } }, "edit",
			["custom_confirmation_date", "final_confirmation_date"], CLERK)).toBe("hidden");
	});

	it("never locks a field Create Employee cannot do without, Machine Code among them", () => {
		for (const f of ["employee_number", "first_name", "company", "date_of_joining", "attendance_device_id"]) {
			expect(canLock("new", f)).toBe(false);
		}
		expect(canLock("edit", "employee_number")).toBe(true);
		expect(canLock("new", "middle_name")).toBe(true);
	});

	it("lists each field once, with a switch for each form that has it", () => {
		const emp = ACCESS_FIELDS.filter((r) => r.fields.includes("employee_number"));
		expect(emp).toHaveLength(1);
		expect(emp[0]).toMatchObject({ onNew: true, onEdit: true });
	});

	it("says the same words the site's rule does", () => {
		const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/rules.py"), "utf8");
		const tuple = (name) => [...py.match(new RegExp(`^${name} = \\(([^)]*)\\)`, "m"))[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		expect(tuple("FIELD_ACCESS_FORMS")).toEqual(FORMS);
		expect(tuple("FIELD_ACCESS_LEVELS")).toEqual(LEVELS.filter((l) => l !== "write"));
	});
});

describe("Create Employee", () => {
	const draw = () => render(<Provider store={store}><CreateEmployee /></Provider>);

	it("leaves a hidden field off and draws a read-only one disabled", () => {
		act(() => set({ user: CLERK, fieldAccess: RULES }));
		const view = draw();
		expect(view.container.querySelector("#ne-middle_name")).toBeNull();
		expect(view.container.querySelector("#ne-last_name").disabled).toBe(true);
		expect(view.container.querySelector("#ne-first_name").disabled).toBe(false);
	});

	it("draws every box for the page admin", () => {
		act(() => set({ user: ADMIN, fieldAccess: RULES }));
		const view = draw();
		expect(view.container.querySelector("#ne-middle_name")).not.toBeNull();
		expect(view.container.querySelector("#ne-last_name").disabled).toBe(false);
	});

	it("sends no value for a locked field, even one an onboarding candidate brought", async () => {
		await createEmployee({ first_name: "Anu", last_name: "K" }, { middle_name: "M" }, new Set(["middle_name", "last_name"]));
		expect(created[0]).toEqual({ first_name: "Anu" });
	});
});

describe("Employee Profile", () => {
	const DOC = { name: "HR-EMP-00001", employee_name: "Anand R", first_name: "Anand", employee_number: "MR001",
		status: "Active", cell_number: "9000000001", personal_email: "anand@x.invalid", company_email: null,
		doctype: "Employee", docstatus: 0 };
	const draw = () => render(<Provider store={store}><EmployeeProfile /></Provider>);
	const edit = (v) => act(() => {
		[...v.container.querySelectorAll(".proico button")].find((b) => b.textContent.trim() === "✎").click();
	});

	beforeEach(() => {
		act(() => set({ empSel: "HR-EMP-00001", empDoc: { "HR-EMP-00001": DOC }, proftab: "about" }));
	});

	it("gives a read-only field no box, and says who decided", () => {
		act(() => set({ user: CLERK, fieldAccess: RULES }));
		const view = draw();
		edit(view);
		expect(view.container.querySelector("#pe-cell_number")).toBeNull();
		expect(view.container.querySelector("#pe-employee_number")).not.toBeNull();
		expect(view.container.textContent).toContain("Settings → Security");
	});

	it("does not show a hidden field at all, reading or editing", () => {
		act(() => set({ user: CLERK, fieldAccess: RULES }));
		const view = draw();
		expect(view.container.textContent).not.toContain("anand@x.invalid");
		edit(view);
		expect(view.container.querySelector("#pe-personal_email")).toBeNull();
	});

	it("holds the page admin to none of it", () => {
		act(() => set({ user: ADMIN, fieldAccess: RULES }));
		const view = draw();
		expect(view.container.textContent).toContain("anand@x.invalid");
		edit(view);
		expect(view.container.querySelector("#pe-cell_number")).not.toBeNull();
	});
});

describe("the Employee fields editor", () => {
	async function draw() {
		const { loadPageRules } = await import("@/api/pagerules");
		act(() => set({ user: ADMIN }));
		await act(async () => { await loadPageRules(); });
		let view;
		await act(async () => { view = render(<Provider store={store}><Security /></Provider>); });
		const btn = (t) => [...view.container.querySelectorAll("button")].find((b) => b.textContent === t);
		await act(async () => { btn("Employee fields").click(); });
		return { view, btn };
	}

	it("saves Emp Code as read-only on editing, under every spelling of it", async () => {
		const { view, btn } = await draw();
		const sw = view.container.querySelector('[aria-label="Emp Code — Editing"]');
		await act(async () => { [...sw.querySelectorAll("button")].find((b) => b.textContent === "Read").click(); });
		await act(async () => { btn("Save").click(); });
		expect(writes).toEqual([["Manna HR Settings", { employee_field_access: '{"edit":{"employee_number":"read"}}' }]]);
		expect(store.getState().app.fieldAccess).toEqual({ edit: { employee_number: "read" } });
	});

	it("offers no switch for Emp Code on a new employee, since nobody could create one without it", async () => {
		const { view } = await draw();
		expect(view.container.querySelector('[aria-label="Emp Code — New employee"]')).toBeNull();
	});

	it("finds a field by name", async () => {
		const { view } = await draw();
		const box = view.container.querySelector('input[aria-label="Find a field"]');
		act(() => { fireEvent.change(box, { target: { value: "aadhaar" } }); });
		expect(view.container.querySelector('[aria-label="Aadhaar Number — New employee"]')).not.toBeNull();
		expect(view.container.querySelector('[aria-label="Emp Code — Editing"]')).toBeNull();
	});

	it("will not save while the site has no field to keep it in", async () => {
		doc = { name: "Manna HR Settings", page_visibility: null };
		const { view, btn } = await draw();
		expect(view.container.textContent).toContain("no employee_field_access field");
		expect(btn("Save").disabled).toBe(true);
	});
});
