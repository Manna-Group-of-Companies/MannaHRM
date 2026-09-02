/**
 * Tests for the distance arithmetic behind a geofenced punch.
 *
 * Ported from `manna_hr/tests/test_rules.py`, case for case, when the Python
 * app was removed on 31 August 2026.
 *
 *     npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import * as geo from "../client/src/lib/geo.js";

test("zero, zero is not a place", () => {
	// (0, 0) is in the Atlantic and is what an unset Float field reads as. A
	// punch measured against it would be half a world from every gate.
	assert.equal(geo.isRealCoordinate(0, 0), false);
	assert.equal(geo.isRealCoordinate(null, null), false);
	assert.equal(geo.isRealCoordinate(undefined, undefined), false);
	assert.equal(geo.isRealCoordinate(91, 0), false);
	assert.equal(geo.isRealCoordinate("not a number", 0), false);
	assert.equal(geo.isRealCoordinate(9.9312, 76.2673), true);
});

test("distance between two known points", () => {
	// Kochi to Thrissur, about 70 km by air.
	const metres = geo.metresBetween(9.9312, 76.2673, 10.5276, 76.2144);
	assert.ok(metres > 65_000 && metres < 72_000, `${metres} m is not about 70 km`);
});

test("a point is zero metres from itself", () => {
	assert.equal(geo.metresBetween(9.9312, 76.2673, 9.9312, 76.2673), 0);
});

test("antipodal points do not produce NaN", () => {
	// Rounding can push the haversine term a hair above 1, and Math.asin of
	// that is NaN — which propagates silently instead of raising. Clamped.
	const metres = geo.metresBetween(0, 0, 0, 180);
	assert.ok(Number.isFinite(metres) && metres > 0, `got ${metres}`);
});

test("the bounding box never falls inside the circle", () => {
	// The box only narrows the list; the haversine then decides. A box a little
	// too big costs extra comparisons, a box too small silently drops a match —
	// so the only acceptable error is outwards.
	const lat = 9.9312;
	const lng = 76.2673;
	const radius = 300.0;
	const { minLat, maxLat, minLng, maxLng } = geo.boundingBox(lat, lng, radius);

	assert.ok(geo.metresBetween(lat, lng, maxLat, lng) >= radius);
	assert.ok(geo.metresBetween(lat, lng, minLat, lng) >= radius);
	assert.ok(geo.metresBetween(lat, lng, lat, maxLng) >= radius);
	assert.ok(geo.metresBetween(lat, lng, lat, minLng) >= radius);
});

test("nearest skips places with no coordinate", () => {
	const uncaptured = { latitude: 0, longitude: 0 };
	const real = { latitude: 9.9312, longitude: 76.2673 };

	const found = geo.nearest(9.931, 76.267, [uncaptured, real]);
	assert.notEqual(found, null);
	assert.equal(found.place, real);
});

test("nearest returns null when nothing can be measured", () => {
	// null means "cannot tell", not "too far". A caller that treats it as a
	// refusal strands every employee whose gate was never captured.
	assert.equal(geo.nearest(9.93, 76.26, []), null);
	assert.equal(geo.nearest(9.93, 76.26, [{ latitude: 0, longitude: 0 }]), null);
});

test("distance reads the way a person would say it", () => {
	assert.equal(geo.formatDistance(240.4), "240 m");
	assert.equal(geo.formatDistance(2400), "2.4 km");
});
