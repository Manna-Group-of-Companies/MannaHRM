import { describe, expect, it } from "vitest";

import {
	coordOf, coordText, mapEmbed, mapLink, nearestPlace, placeText, streamOf,
} from "../src/lib/punchplace.js";

/* ---------------------------------------------------------------------------
   Where a punch was made, as the In / Out report draws it.

   The phone app sends a coordinate on every punch; these are the rules for
   turning it into something HR can read — and the one thing this file must
   never do, which is decide the geofence itself. That is the server's, and a
   test below is named after it.
   --------------------------------------------------------------------------- */

const GATE = { name: "Main Gate", location_name: "Main Gate", latitude: 9.591, longitude: 76.522, is_active: 1 };
const YARD = { name: "Yard", location_name: "Yard", latitude: 9.62, longitude: 76.55, is_active: 1 };

const phone = (extra) => ({ device_id: "PHONE-HR-EMP-00001", ...extra });

describe("streamOf", () => {
	it("calls a punch written by the phone app mobile, though it carries a device id", () => {
		expect(streamOf(phone())).toBe("Mobile");
	});

	it("calls any punch carrying a coordinate mobile, because no fingerprint machine sends one", () => {
		expect(streamOf({ device_id: "GATE-2", latitude: 9.59, longitude: 76.52 })).toBe("Mobile");
	});

	it("calls a punch written by an approved correction a correction, not a terminal", () => {
		expect(streamOf({ device_id: "REG-HR-AREG-00001" })).toBe("Correction");
	});

	it("calls a device id with neither prefix a terminal", () => {
		expect(streamOf({ device_id: "BIO-GATE-1" })).toBe("Terminal");
	});

	it("says unknown rather than guessing when there is no device id at all", () => {
		expect(streamOf({})).toBe("Unknown");
	});
});

describe("coordOf and coordText", () => {
	it("treats 0, 0 as no location, because that is what an unset Float field reads as", () => {
		expect(coordOf(phone({ latitude: 0, longitude: 0 }))).toBeNull();
		expect(coordText(phone({ latitude: 0, longitude: 0 }))).toBe("");
	});

	it("reads a coordinate the site returned as a string", () => {
		expect(coordOf({ latitude: "9.5912", longitude: "76.5221" })).toEqual({ lat: 9.5912, lng: 76.5221 });
	});

	it("writes six places, which pastes straight into a map search box", () => {
		expect(coordText({ latitude: 9.5, longitude: 76.25 })).toBe("9.500000, 76.250000");
	});
});

describe("nearestPlace", () => {
	it("names the closest surveyed place and how far the punch was from it", () => {
		const n = nearestPlace(phone({ latitude: 9.5913, longitude: 76.522 }), [YARD, GATE]);
		expect(n.name).toBe("Main Gate");
		expect(n.metres).toBeGreaterThan(20);
		expect(n.metres).toBeLessThan(50);
	});

	it("ignores a place that has been switched off", () => {
		const n = nearestPlace(phone({ latitude: 9.591, longitude: 76.522 }), [{ ...GATE, is_active: 0 }, YARD]);
		expect(n.name).toBe("Yard");
	});

	it("ignores a place whose coordinate was never captured", () => {
		const n = nearestPlace(phone({ latitude: 9.591, longitude: 76.522 }),
			[{ ...GATE, latitude: 0, longitude: 0 }, YARD]);
		expect(n.name).toBe("Yard");
	});
});

describe("placeText", () => {
	it("says how far a punch was from the nearest place, and nothing about a fence the server did not judge", () => {
		const t = placeText(phone({ latitude: 9.591, longitude: 76.522 }), [GATE]);
		expect(t).toBe("0 m from Main Gate");
		expect(t).not.toMatch(/inside|outside/);
	});

	it("repeats the server's geofence verdict rather than working one out", () => {
		/* 40 km from the gate, and the server said inside — so inside is what is
		   drawn. A client applying its own radius here would be a second opinion
		   on somebody's pay. */
		const r = phone({ latitude: 9.95, longitude: 76.52, custom_geofence_result: "inside" });
		expect(placeText(r, [GATE])).toMatch(/inside fence$/);
	});

	it("does not print not_checked on every machine punch", () => {
		expect(placeText({ device_id: "BIO-1", custom_geofence_result: "not_checked" }, [GATE])).toBe("");
	});

	it("says a phone punch sent no location, because that is the permission switched off", () => {
		expect(placeText(phone(), [GATE])).toBe("no location sent");
	});

	it("claims no distance when no place has been surveyed, leaving the coordinate to speak", () => {
		expect(placeText(phone({ latitude: 9.591, longitude: 76.522 }), [])).toBe("");
	});
});

describe("map addresses", () => {
	it("puts the pin on the punch and the punch in the middle of the embedded map", () => {
		const u = new URL(mapEmbed(9.5, 76.25));
		expect(u.searchParams.get("marker")).toBe("9.5,76.25");
		const [w, sth, e, n] = u.searchParams.get("bbox").split(",").map(Number);
		expect((w + e) / 2).toBeCloseTo(76.25, 6);
		expect((sth + n) / 2).toBeCloseTo(9.5, 6);
	});

	it("links out with the coordinate as the search", () => {
		expect(new URL(mapLink(9.5, 76.25)).searchParams.get("query")).toBe("9.5,76.25");
	});
});
