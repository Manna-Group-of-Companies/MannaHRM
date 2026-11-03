import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Welcome from "@/layout/Welcome";
import { store, set, resetStore } from "@/store";

/* The first-visit welcome (HR, 29 October 2026): once per login per browser. */

const draw = () => render(<Provider store={store}><Welcome /></Provider>);

describe("the welcome window", () => {
	beforeEach(() => { localStorage.clear(); resetStore(); });

	it("welcomes a login the first time only, and a second login on the same browser too", async () => {
		await act(async () => set({ user: "hr@mannarubber.com", me: { first_name: "Pristia" } }));
		const first = draw();
		expect(first.container.textContent).toContain("Welcome to Manna HR, Pristia");
		await act(async () => { first.getByText("Get started").click(); });
		expect(first.container.querySelector("[role='dialog']")).toBeNull();
		first.unmount();

		expect(draw().container.querySelector("[role='dialog']")).toBeNull();

		await act(async () => set({ user: "accounts@mannarubber.com", me: null }));
		expect(draw().container.textContent).toContain("Welcome to Manna HR, Accounts");
	});

	it("shows nothing before anybody has signed in", async () => {
		expect(draw().container.querySelector("[role='dialog']")).toBeNull();
	});
});
