import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Security from "@/features/settings/Security";
import { MODULES } from "@/routes/registry";
import { hiddenUnder, isHidden, parsePageRules, setPageRules } from "@/data/sections";
import { PAGE_ADMINS, landingFor, tabsFor } from "@/data/menus";
import { loadPageRules } from "@/api/pagerules";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Settings → Security: which pages every login is shown, changed by one login.
   A menu, not a permission — see data/sections.js. */

let doc;
let writes;

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		getDoc: () => Promise.resolve(doc),
		apiWrite: (dt, name, patch) => {
			writes.push(patch);
			doc = { ...doc, ...patch };
			return Promise.resolve({ ok: true });
		},
	};
});

const ADMIN = "hr@mannarubber.com";

beforeEach(() => {
	resetStore();
	act(() => set(loadedState()));
	doc = { name: "Manna HR Settings", page_visibility: null };
	writes = [];
});
afterEach(() => setPageRules({}));

describe("the rules", () => {
	it("shows a page the site says to show, though the code hides it", () => {
		expect(hiddenUnder({}, "employees", "all")).toBe(true);
		expect(hiddenUnder({ "employees/all": "show" }, "employees", "all")).toBe(false);
	});

	it("hides a page or a module the site says to hide", () => {
		expect(hiddenUnder({ "leave/balances": "hide" }, "leave", "balances")).toBe(true);
		expect(hiddenUnder({ reports: "hide" }, "reports")).toBe(true);
	});

	it("never hides Security, Settings, Dashboard, Employees or a module's first page — that would lock people out", () => {
		const all = { "settings/security": "hide", settings: "hide", dashboard: "hide", employees: "hide", "leave/overview": "hide" };
		expect(hiddenUnder(all, "settings", "security")).toBe(false);
		expect(hiddenUnder(all, "settings")).toBe(false);
		expect(hiddenUnder(all, "dashboard")).toBe(false);
		expect(hiddenUnder(all, "employees")).toBe(false);
		expect(hiddenUnder(all, "leave", "overview")).toBe(false);
	});

	it("drops a rule that names no module, says neither word, or is not JSON, rather than obeying it", () => {
		expect(parsePageRules('{"nope": "hide", "leave": "off", "leave/balances": "hide", "a/b/c": "hide"}'))
			.toEqual({ "leave/balances": "hide" });
		expect(parsePageRules("{broken")).toEqual({});
		expect(parsePageRules('["leave"]')).toEqual({});
	});

	it("puts the site's rules in force for the menus and the router", async () => {
		doc = { ...doc, page_visibility: '{"leave/balances": "hide"}' };
		await act(async () => { await loadPageRules(); });
		expect(isHidden("leave", "balances")).toBe(true);
		expect(store.getState().app.pageRulesState).toBe("ok");
	});

	it("says so when the site has no field to keep the rules in, since a save would be dropped", async () => {
		doc = { name: "Manna HR Settings" };
		await act(async () => { await loadPageRules(); });
		expect(store.getState().app.pageRulesState).toBe("nofield");
	});
});

describe("who is shown Security", () => {
	const tabs = MODULES.settings.tabs;
	it("is on the page admin's Settings strip", () => {
		expect(tabsFor("settings", tabs, ADMIN, false).map((t) => t[0])).toContain("security");
	});

	it("is on nobody else's, admin or not, and their old link lands on Setup readiness", () => {
		for (const [user, admin] of [["mannarubber.products@mannarubber.com", true], ["someone@x.com", null]]) {
			expect(tabsFor("settings", tabs, user, admin).map((t) => t[0])).not.toContain("security");
			expect(landingFor("settings", "security", user, admin)).toBe("overview");
		}
	});

	it("names the same logins the site's rule does", () => {
		const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/rules.py"), "utf8");
		const tuple = py.match(/^PAGE_ADMINS = \(([^)]*)\)/m)[1];
		const site = [...tuple.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
		expect(site).toEqual(PAGE_ADMINS);
	});
});

async function draw(user) {
	act(() => set({ user }));
	await act(async () => { await loadPageRules(); });
	let view;
	await act(async () => { view = render(<Provider store={store}><Security /></Provider>); });
	return view;
}

const button = (view, text) => [...view.container.querySelectorAll("button")].find((b) => b.textContent === text);

describe("the Security page", () => {
	it("saves a page hidden with its switch, and only what differs from the default", async () => {
		const view = await draw(ADMIN);
		const sw = view.container.querySelector('[aria-label="Leave → Employee Time Off"]');
		await act(async () => { [...sw.querySelectorAll("button")].find((b) => b.textContent === "Hidden").click(); });
		await act(async () => { button(view, "Save").click(); });
		expect(writes).toEqual([{ page_visibility: '{"leave/balances":"hide"}' }]);
		expect(view.container.textContent).toContain("Saved.");
		expect(isHidden("leave", "balances")).toBe(true);
	});

	it("stores nothing for a page switched back to what the code already does", async () => {
		const view = await draw(ADMIN);
		const sw = view.container.querySelector('[aria-label="Employees → All"]');
		await act(async () => { [...sw.querySelectorAll("button")].find((b) => b.textContent === "Visible").click(); });
		await act(async () => { [...sw.querySelectorAll("button")].find((b) => b.textContent === "Hidden").click(); });
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("offers no switch for Security itself", async () => {
		const view = await draw(ADMIN);
		expect(view.container.querySelector('[aria-label="Settings → Security"]')).toBeNull();
	});

	it("will not save while the site has no field to keep it in", async () => {
		doc = { name: "Manna HR Settings" };
		const view = await draw(ADMIN);
		expect(view.container.textContent).toContain("no page_visibility field");
		const sw = view.container.querySelector('[aria-label="Leave → Employee Time Off"]');
		await act(async () => { [...sw.querySelectorAll("button")].find((b) => b.textContent === "Hidden").click(); });
		expect(button(view, "Save").disabled).toBe(true);
	});

	it("changes nothing for anybody but the page admin", async () => {
		const view = await draw("mannarubber.products@mannarubber.com");
		expect(view.container.textContent).toContain("Only the page administrator");
		expect(button(view, "Save")).toBeUndefined();
	});
});
