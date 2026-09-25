import { describe, expect, it, beforeEach } from "vitest";
import { act, render, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { store, getState, resetStore } from "@/store";
import { PhotoCell, PhotoDialog, photoOf } from "@/components/PunchPhoto";

/* ---------------------------------------------------------------------------
   The photo the phone app took at a punch.

   What matters is that the face somebody clicks is the face on *that* punch,
   and that a punch with no photo says so rather than drawing something that
   looks like one — a photo of the wrong punch is believed.
   --------------------------------------------------------------------------- */

const PUNCH = {
	name: "CHK-1",
	employee: "HR-EMP-00001",
	employee_name: "Rajiv CS",
	time: "2026-09-25 08:57:00",
	log_type: "IN",
	custom_photo: "/private/files/punch-HR-EMP-00001-20260925085700.jpg",
};

async function cell(r) {
	let out;
	await act(async () => {
		out = render(<Provider store={store}><PhotoCell r={r} e={{}} /><PhotoDialog /></Provider>);
	});
	return out;
}

describe("the photo on a phone punch", () => {
	beforeEach(() => resetStore());

	it("opens_the_photo_of_the_punch_that_was_clicked", async () => {
		const r = await cell(PUNCH);
		await act(async () => { fireEvent.click(r.container.querySelector(".photobtn")); });
		expect(getState().punchPhoto.src).toBe(PUNCH.custom_photo);
		expect(r.container.querySelector("img.photobig").getAttribute("src")).toBe(PUNCH.custom_photo);
	});

	it("draws_a_dash_for_a_punch_with_no_photo", async () => {
		const r = await cell({ ...PUNCH, custom_photo: "" });
		expect(r.container.querySelector(".photobtn")).toBeNull();
		expect(r.container.textContent).toContain("—");
	});

	it("draws_a_dash_when_the_photo_will_not_load_rather_than_a_broken_image", async () => {
		const r = await cell(PUNCH);
		await act(async () => { fireEvent.error(r.container.querySelector(".photobtn img")); });
		expect(r.container.querySelector(".photobtn")).toBeNull();
	});

	it("does_not_draw_an_outside_address_the_app_never_writes", () => {
		expect(photoOf({ custom_photo: "https://example.com/face.jpg" })).toBe("");
		expect(photoOf({ custom_photo: "/files/face.jpg" })).toBe("/files/face.jpg");
	});
});
