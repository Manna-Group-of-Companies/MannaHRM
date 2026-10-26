import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Shortcuts from "@/layout/Shortcuts";
import { GO_KEYS, keyTarget } from "@/data/shortcuts";
import { SHORTCUTS } from "@/features/help/NotesHelp";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The reference's keyboard shortcuts (21 October 2026): `?`, `g` then a
   letter, and `n` — never somewhere the login's menu does not go.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const at = (over = {}) => ({
	gPending: false, section: "dashboard",
	can: () => true, first: (s) => (s === "settings" ? "company" : "overview"), mayCreate: () => true,
	...over,
});
const press = (key, target = document.body) => act(() => { fireEvent.keyDown(target, { key }); });

beforeEach(() => {
	resetStore();
	window.history.replaceState({}, "", "/");
});
afterEach(() => window.history.replaceState({}, "", "/"));

describe("where a key goes", () => {
	it("takes g then a letter to that module's first page for this login", () => {
		expect(keyTarget("a", at({ gPending: true }))).toEqual(["attendance", "overview"]);
		expect(keyTarget("s", at({ gPending: true }))).toEqual(["settings", "company"]);
		expect(keyTarget("m", at({ gPending: true }))).toBeNull();
	});

	it("goes nowhere the login is not shown", () => {
		expect(keyTarget("p", at({ gPending: true, can: (s) => s !== "payroll" }))).toBeNull();
		expect(keyTarget("?", at({ can: () => false }))).toBeNull();
	});

	it("opens Keyboard shortcuts on ?, and n only where a page makes a new one", () => {
		expect(keyTarget("?", at())).toEqual(["help", "shortcuts"]);
		expect(keyTarget("n", at({ section: "news" }))).toEqual(["news", "new"]);
		expect(keyTarget("n", at({ section: "attendance" }))).toBeNull();
		expect(keyTarget("n", at({ section: "employees", mayCreate: () => false }))).toBeNull();
	});

	it("lists on Help exactly the g keys it binds", () => {
		const listed = SHORTCUTS.filter(([k]) => k.length === 2 && k[0] === "g").map(([k]) => k[1]).sort();
		expect(listed).toEqual(Object.keys(GO_KEYS).sort());
	});
});

describe("the keys on the page", () => {
	const draw = async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "dashboard", subtab: "overview" }));
		return render(<Provider store={store}><Shortcuts /><input aria-label="Somewhere to type" /></Provider>);
	};

	it("goes to attendance on g then a, and to Keyboard shortcuts on ?", async () => {
		await draw();
		press("g");
		press("a");
		expect(getState().section).toBe("attendance");
		press("?");
		expect(getState().section).toBe("help");
		expect(getState().subtab).toBe("shortcuts");
	});

	it("leaves keys alone while somebody is typing in a box", async () => {
		const view = await draw();
		const box = view.getByLabelText("Somewhere to type");
		press("g", box);
		press("a", box);
		expect(getState().section).toBe("dashboard");
	});

	it("makes a new news post on n, on News", async () => {
		await draw();
		await act(async () => set({ section: "news", subtab: "overview" }));
		press("n");
		expect(getState().section).toBe("news");
		expect(getState().subtab).toBe("new");
	});
});
