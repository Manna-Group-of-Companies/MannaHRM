import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, set, getState, resetStore } from "@/store";
import InOut from "@/features/attendance/InOut";
import { MapDialog } from "@/components/PunchMap";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   A phone punch, on a map, from the In / Out page.

   The fixture's one phone punch carries a coordinate. What matters is that the
   coordinate somebody clicks is the coordinate the map is centred on — a map
   of the wrong punch is worse than no map, because it is believed.
   --------------------------------------------------------------------------- */

async function page() {
	let out;
	await act(async () => {
		out = render(<Provider store={store}><InOut /><MapDialog /></Provider>);
	});
	return out;
}

describe("where a phone punch was made", () => {
	beforeEach(() => resetStore());

	it("draws_the_coordinate_a_phone_sent_on_todays_punches", async () => {
		set(loadedState());
		const r = await page();
		expect(r.container.querySelector(".locbtn").textContent).toContain("9.591412, 76.522318");
	});

	it("opens_a_map_pinned_on_the_punch_that_was_clicked", async () => {
		set(loadedState());
		const r = await page();
		await act(async () => { fireEvent.click(r.container.querySelector(".locbtn")); });
		expect(getState().punchMap).toMatchObject({ lat: 9.591412, lng: 76.522318 });
		const frame = r.container.querySelector("iframe.iomap");
		expect(new URL(frame.getAttribute("src")).searchParams.get("marker")).toBe("9.591412,76.522318");
	});

	it("draws_a_dash_rather_than_a_map_button_for_a_punch_with_no_coordinate", async () => {
		set(loadedState());
		const r = await page();
		/* Three punches today, one of them from a phone. */
		expect(r.container.querySelectorAll(".locbtn").length).toBe(1);
	});
});
