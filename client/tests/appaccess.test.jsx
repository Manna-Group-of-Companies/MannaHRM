import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import AppAccess from "@/features/employees/AppAccess";
import { PROFILE_TABS } from "@/data/profile";
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
