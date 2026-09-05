/**
 * Distance arithmetic for geofenced punches.
 *
 * Ported from the field-sales app's `lib/core/proximity.dart`, where this has
 * run against real phones in the field since June 2026, by way of
 * `manna_hr/geo.py`. The reasoning in the comments came from that deployment
 * and is the reason this is a port rather than a rewrite — the arithmetic is
 * trivial, the error directions are not.
 *
 * Pure functions over plain numbers: no store, no network. That is deliberate,
 * so the rules can be tested without a site — see `tests/geo.test.js`.
 */

/* Metres in a degree, deliberately understated.
 *
 * The earth is not a sphere, so a degree of latitude is worth between about
 * 110,570 m (a meridian degree at the equator) and 111,690 m. These spans size
 * the bounding box, and the box only pre-selects candidates — the exact
 * haversine distance then decides. So the two error directions are not equal: a
 * box a little too big costs a few extra comparisons, while a box a little too
 * small silently drops a match before anything ever measures it. Taking the
 * smallest real figure, and widening by a further 2%, makes the box err the
 * only way it can afford to. */
const METRES_PER_DEGREE = 110540.0;
const BOX_SAFETY_MARGIN = 1.02;

export const EARTH_RADIUS_METRES = 6371000.0;

const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Metres between two coordinates, by the haversine formula.
 *
 * Great-circle rather than flat-earth: over a kilometre the difference is
 * centimetres, but the formula does not care how far apart the points are, so
 * nothing breaks if it is ever called with two ends of the state.
 */
export function metresBetween(lat1, lng1, lat2, lng2) {
	const p1 = toRadians(lat1);
	const p2 = toRadians(lat2);
	const dLat = toRadians(lat2 - lat1);
	const dLng = toRadians(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
	/* Clamped before asin: rounding can push `a` a hair above 1 for antipodal
	   points, and Math.asin(1.0000000001) is NaN — which then propagates
	   silently through every comparison downstream instead of raising. */
	return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * True when a coordinate pair is worth comparing against.
 *
 * (0, 0) is in the Atlantic and is what an unset Float field reads as, so a
 * record that was never captured must not be treated as a place. A punch that
 * arrives at (0, 0) has no location, and saying so is the difference between
 * refusing it honestly and measuring it against the Gulf of Guinea.
 */
export function isRealCoordinate(lat, lng) {
	if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
	const a = Number(lat);
	const b = Number(lng);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
	if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
	return !(a === 0 && b === 0);
}

/** Degrees of latitude covering `metres`, rounded outwards. */
export function latSpanForMetres(metres) {
	return (metres / METRES_PER_DEGREE) * BOX_SAFETY_MARGIN;
}

/**
 * Degrees of longitude covering `metres` at `atLatitude`, rounded outwards.
 *
 * Meridians converge towards the poles, so a degree of longitude is worth less
 * the further north you go. Kerala is near the equator and the difference is
 * small, but a box computed as if it were constant would be too narrow, and a
 * too-narrow box silently misses matches.
 */
export function lngSpanForMetres(metres, atLatitude) {
	const shrink = Math.abs(Math.cos(toRadians(atLatitude)));
	/* Near the poles cos goes to zero and the span to infinity. Clamped so the
	   box stays a box rather than becoming the whole world. */
	return (metres / (METRES_PER_DEGREE * Math.max(shrink, 0.01))) * BOX_SAFETY_MARGIN;
}

/**
 * A box covering a circle, rounded outwards, as `{minLat, maxLat, minLng, maxLng}`.
 *
 * For narrowing a list of places before measuring. Always follow it with
 * `metresBetween` — the box is a square and the rule is a circle, so the
 * corners are false positives by design.
 */
export function boundingBox(lat, lng, radiusMetres) {
	const dLat = latSpanForMetres(radiusMetres);
	const dLng = lngSpanForMetres(radiusMetres, lat);
	return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * The closest place to a point, as `{place, metres}`, or null.
 *
 * `places` is any iterable of objects carrying `latitude` and `longitude`.
 *
 * **null means "cannot tell", not "too far".** Callers must not treat it as a
 * refusal: a location whose coordinate was never captured would otherwise
 * strand every employee assigned to it at the gate.
 */
export function nearest(lat, lng, places) {
	let best = null;
	let bestMetres = Infinity;
	for (const p of places) {
		if (!isRealCoordinate(p?.latitude, p?.longitude)) continue;
		const d = metresBetween(lat, lng, Number(p.latitude), Number(p.longitude));
		if (d < bestMetres) {
			best = p;
			bestMetres = d;
		}
	}
	return best === null ? null : { place: best, metres: bestMetres };
}

/** Distance as a person would say it: metres up close, kilometres beyond. */
export function formatDistance(metres) {
	if (metres < 1000) return `${Math.round(metres)} m`;
	return `${(metres / 1000).toFixed(1)} km`;
}
