import { describe, expect, it, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { MODULES } from "@/routes/registry";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Every page opens.

   That sounds like a low bar and it is the one this app most needed: ninety-odd
   screens, one flat store that all of them read, and no way until now to find
   out that a rename in `data/payroll.js` had left one of them throwing except
   by clicking through the menu. A component that throws takes the whole page
   with it — `Boundary` catches it, which means the failure looks like a panel
   saying something went wrong rather than like a stack trace anybody sees.

   Each page is rendered twice, and the second time is the one that finds
   things:

     empty   the store as the app opens. Every screen has a "nothing yet"
             branch and it is the branch a fresh site actually shows.
     loaded  a small site with gaps in it — see fixture.js. This is where a
             report that assumes a field is present renders "undefined", and
             where a filter that assumes at least one row divides by zero.

   Rendered without the chrome. `AppShell` is one component and is covered by
   its own test below; wrapping every page in it would mean ninety renders of
   the rail and the top bar to find a fault in a table.
   --------------------------------------------------------------------------- */

/** Every page in the app, as `[module, subtab, Component]`. Read off the same
    table the router reads, so a page added to the app is a case here without
    anybody remembering to add one. */
const PAGES = Object.values(MODULES).flatMap((mod) =>
	Object.entries(mod.pages).map(([subtab, Component]) => [mod.key, subtab, Component]),
);

/** The page as the router would draw it: the store told which page is open,
    because several read `s.section` and `s.subtab` to decide what to show.

    Awaited inside `act` because six of these fire a read of their own on mount
    — Final Settlement, Work Pattern, the Leave Balance report and the three
    payroll screens all have a loader guarded by a state flag. Those resolve a
    microtask after the render and write to the store, so a bare `render` leaves
    the assertion running against a half-mounted page and React saying so. */
export async function draw(Component, section, subtab) {
	set({ section, subtab });
	let out;
	await act(async () => {
		out = render(
			<Provider store={store}>
				<Component />
			</Provider>,
		);
	});
	return out;
}

describe("every page renders", () => {
	beforeEach(() => resetStore());

	it("has pages to test — the table was found and is not empty", () => {
		/* Guards the whole file. `MODULES` is built from `SECTIONS`, and a rename
		   there would leave `mod.pages` empty for every module — at which point
		   this file would pass with nothing rendered at all, which is the one
		   failure a smoke test must not be able to have. */
		expect(PAGES.length).toBeGreaterThan(30);
	});

	describe.each(PAGES)("%s/%s", (section, subtab, Component) => {
		it("draws on an empty site", async () => {
			await expect(draw(Component, section, subtab)).resolves.toBeTruthy();
		});

		it("draws on a site with rows in it", async () => {
			set(loadedState());
			await expect(draw(Component, section, subtab)).resolves.toBeTruthy();
		});
	});
});

describe("the chrome", () => {
	beforeEach(() => resetStore());

	it("draws the shell over a loaded site", async () => {
		set(loadedState());
		const AppShell = (await import("@/layout/AppShell")).default;
		expect(() => render(<Provider store={store}><AppShell /></Provider>)).not.toThrow();
	});

	it("draws the sign-in form when nobody is signed in", async () => {
		const Login = (await import("@/features/auth/Login")).default;
		const { getByLabelText, getByRole } = render(
			<Provider store={store}><Login /></Provider>,
		);
		/* Named rather than counted: a sign-in form that renders two boxes is not
		   the same as one that renders the two boxes somebody can sign in with. */
		expect(getByLabelText(/email \/ user id/i)).toBeInTheDocument();
		expect(getByLabelText(/password/i)).toBeInTheDocument();
		expect(getByRole("button", { name: /sign in/i })).toBeInTheDocument();
	});
});
