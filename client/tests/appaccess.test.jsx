import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import AppAccess from "@/features/employees/AppAccess";
import { PROFILE_PANES, PROFILE_TABS } from "@/data/profile";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Employee Profile → Apps & access. The rules are the site's
   (manna_hr/appaccess.py); this holds the page to drawing them and asking. */

let calls;
let answer;
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	apiCall: (m, body) => { calls.push([m, body]); return answer(m, body); },
}));

const APPS = [
	{ key: "login", label: "Login (every app)", kind: "enabled", on: true, value: "", options: [] },
	{ key: "desk", label: "ERPNext desk", kind: "desk", on: true, value: "", options: [] },
	{ key: "fleet_driver", label: "Fleet driver app", kind: "role", on: false, value: "", options: [] },
	{ key: "cmms", label: "CMMS", kind: "level", on: true, value: "Store Manager", options: ["Store Manager", "Plant Manager"] },
];

async function draw() {
	let view;
	await act(async () => { view = render(<Provider store={store}><AppAccess emp="HR-EMP-1" /></Provider>); });
	return view;
}

beforeEach(() => {
	resetStore();
	act(() => set(loadedState()));
	calls = [];
	answer = () => Promise.resolve({ login: "paul@x.com", why: "", apps: APPS });
});

describe("Apps & access", () => {
	it("is a tab of the profile", () => {
		expect(PROFILE_TABS.map((t) => t[0])).toContain("access");
	});

	it("every tab of the profile opens a pane, so none falls back to About when pressed", () => {
		// Apps & access was a tab without a pane from 27 October to 25 November 2026.
		const leaves = PROFILE_TABS.flatMap((t) => (t[3] ? t[3] : [t])).map((t) => t[0]);
		expect(leaves.filter((k) => !PROFILE_PANES[k])).toEqual([]);
	});

	it("draws each app on or off, and offers no switch for the desk", async () => {
		const view = await draw();
		expect(view.getByRole("button", { name: /turn on fleet driver app/i })).toBeInTheDocument();
		expect(view.queryByRole("button", { name: /erpnext desk/i })).toBeNull();
		expect(view.getByRole("combobox", { name: /cmms access/i }).value).toBe("Store Manager");
	});

	it("asks the site to switch, and draws what it answers", async () => {
		const view = await draw();
		answer = (m) => Promise.resolve(m.endsWith("set_access")
			? { login: "paul@x.com", why: "", apps: APPS.map((a) => (a.key === "fleet_driver" ? { ...a, on: true } : a)) }
			: { login: "paul@x.com", why: "", apps: APPS });
		await act(async () => { view.getByRole("button", { name: /turn on fleet driver app/i }).click(); });
		expect(calls.at(-1)).toEqual(["manna_hr.appaccess_site.set_access", { employee: "HR-EMP-1", key: "fleet_driver", value: true }]);
		expect(view.getByRole("button", { name: /turn off fleet driver app/i })).toBeInTheDocument();
	});

	it("asks before turning a login off, because that ends every app", async () => {
		const view = await draw();
		await act(async () => { view.getByRole("button", { name: /turn off login/i }).click(); });
		expect(calls.some(([m]) => m.endsWith("set_access"))).toBe(false);
		expect(document.body.textContent).toContain("signed out of every app");
	});

	it("offers no switch at all on a login the site says is not this person's to change", async () => {
		answer = () => Promise.resolve({ login: "me@x.com", why: "This is the login you are signed in with.", apps: APPS });
		const view = await draw();
		expect(view.container.textContent).toContain("signed in with");
		expect(view.queryAllByRole("button")).toHaveLength(0);
	});
});

const PHONE = {
	on: false, method: "Fingerprint Machine", login: "anand@manna.in", make_login: true,
	sign_in_as: "MRP-293", password: "date of birth, DDMMYYYY", problems: [], warnings: [],
};

describe("phone punch (25 November 2026)", () => {
	it("offers it to a machine employee with no login, and says how they will sign in once asked", async () => {
		answer = () => Promise.resolve({ login: "", why: "This employee has no login.", apps: [], phone: PHONE });
		const view = await draw();
		expect(view.container.textContent).toContain("Punches on Fingerprint Machine");
		await act(async () => { view.getByRole("button", { name: /allow phone punch too/i }).click(); });
		expect(calls.some(([m]) => m.endsWith("allow_phone_punch"))).toBe(false);
		expect(document.body.textContent).toContain("The machine keeps working");
		expect(document.body.textContent).toContain("MRP-293");
	});

	it("asks the site, and draws what it answers", async () => {
		answer = (m) => Promise.resolve(m.endsWith("allow_phone_punch")
			? { login: "anand@manna.in", why: "", apps: APPS, phone: { ...PHONE, on: true, method: "Both", make_login: false } }
			: { login: "", why: "", apps: [], phone: PHONE });
		const view = await draw();
		await act(async () => { view.getByRole("button", { name: /allow phone punch too/i }).click(); });
		await act(async () => { view.getByRole("button", { name: /^allow phone punch$/i }).click(); });
		expect(calls.at(-1)).toEqual(["manna_hr.appaccess_site.allow_phone_punch", { employee: "HR-EMP-1" }]);
		expect(view.container.textContent).toContain("On · Both");
		expect(view.container.textContent).toContain("Signs in to the Manna HR app as MRP-293");
	});

	it("says what is missing, and offers nothing until it is filled in", async () => {
		answer = () => Promise.resolve({ login: "", why: "", apps: [],
			phone: { ...PHONE, problems: ["No date of birth on the record. It is their first password."] } });
		const view = await draw();
		expect(view.container.textContent).toContain("No date of birth");
		expect(view.getByRole("button", { name: /allow phone punch too/i })).toBeDisabled();
	});

	it("no email on the record: the login is named after the Emp Code, and the box says so", async () => {
		answer = () => Promise.resolve({ login: "", why: "", apps: [],
			phone: { ...PHONE, login: "mrp-293@phone.manna.invalid", stand_in: true,
				warnings: ["No email on the record, so the login is named mrp-293@phone.manna.invalid."] } });
		const view = await draw();
		expect(view.getByRole("button", { name: /allow phone punch too/i })).not.toBeDisabled();
		await act(async () => { view.getByRole("button", { name: /allow phone punch too/i }).click(); });
		expect(document.body.textContent).toContain("never receives mail");
		expect(document.body.textContent).toContain("sign in to the Manna HR app with MRP-293");
	});

	it("an existing login is linked with its own user name and password", async () => {
		answer = () => Promise.resolve({ login: "pareeth@manna.in", why: "", apps: APPS,
			phone: { ...PHONE, login: "pareeth@manna.in", make_login: false, sign_in_as: "pareeth_k_b" } });
		const view = await draw();
		await act(async () => { view.getByRole("button", { name: /allow phone punch too/i }).click(); });
		expect(document.body.textContent).toContain("user name and password are not changed");
		expect(document.body.textContent).toContain("pareeth_k_b");
	});
});

describe("reset to Emp Code + date of birth (27 November 2026)", () => {
	const ON = { ...PHONE, on: true, method: "Both", make_login: false, login: "ebin@manna.in", sign_in_as: "MRP-103", reset_login: true };

	it("offers the reset on an app-only login, asks first, then asks the site", async () => {
		answer = (m) => Promise.resolve({ login: "ebin@manna.in", why: "", apps: APPS, phone: ON });
		const view = await draw();
		await act(async () => { view.getByRole("button", { name: /reset to emp code/i }).click(); });
		expect(calls.some(([m]) => m.endsWith("reset_app_login"))).toBe(false);
		expect(document.body.textContent).toContain("stops working");
		await act(async () => { view.getByRole("button", { name: /^reset login$/i }).click(); });
		expect(calls.at(-1)).toEqual(["manna_hr.appaccess_site.reset_app_login", { employee: "HR-EMP-1" }]);
	});

	it("offers no reset on a login used for other work, and says why", async () => {
		answer = () => Promise.resolve({ login: "nikil@manna.in", why: "", apps: APPS,
			phone: { ...ON, reset_login: false, sign_in_as: "nikhil",
				warnings: ["This login is also used as HR Manager, so its user name and password are left as they are."] } });
		const view = await draw();
		expect(view.queryByRole("button", { name: /reset to emp code/i })).toBeNull();
		expect(view.container.textContent).toContain("also used as HR Manager");
	});
});

describe("the Who card's Apps row", () => {
	it("names the apps the login opens, and not the login itself", async () => {
		const { AppNames } = await import("@/features/employees/AppAccess");
		let view;
		await act(async () => { view = render(<Provider store={store}><AppNames emp="HR-EMP-1" /></Provider>); });
		expect(view.container.textContent).toContain("Apps");
		expect(view.container.textContent).toContain("ERPNext desk · CMMS");
		expect(view.container.textContent).not.toContain("Login");
	});

	it("draws nothing when the site will not say", async () => {
		answer = () => Promise.reject(new Error("Not permitted"));
		const { AppNames } = await import("@/features/employees/AppAccess");
		let view;
		await act(async () => { view = render(<Provider store={store}><AppNames emp="HR-EMP-1" /></Provider>); });
		expect(view.container.textContent).toBe("");
	});
});
