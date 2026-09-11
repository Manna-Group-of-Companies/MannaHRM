/**
 * Where a punch was made, as the dashboard draws it.
 *
 * The phone app sends the handset's coordinate on every punch (see
 * `app/lib/services/api.dart::punch`), and hrms keeps it on `Employee Checkin`
 * as `latitude` / `longitude`. This turns that pair into what a reader of the
 * In / Out report needs: the coordinate, a map, and how far it was from the
 * nearest place anybody surveyed.
 *
 * **It describes; it never judges.** Whether a punch was inside the fence is
 * `manna_hr/checkin.py`'s decision, made on the server and written as
 * `custom_geofence_result`. This file repeats that verdict where the site
 * returned one and otherwise says only a distance — no radius is applied here,
 * because a client drawing "outside" beside a punch the server accepted would
 * be a second opinion on somebody's pay (CLAUDE.md §1).
 *
 * Pure functions over plain rows: no store, no network.
 */

import { formatDistance, isRealCoordinate, nearest } from "@/lib/geo";

/** What the phone app calls itself — `kDeviceIdPrefix` in
    `app/lib/core/constants.dart`. Kept in step by hand; the two live in
    different languages. */
export const PHONE_PREFIX = "PHONE-";

/** What a punch written by an approved correction carries —
    `REGULARIZATION_PREFIX` in `manna_hr/checkin.py`. */
export const CORRECTION_PREFIX = "REG-";

/** The coordinate on a punch, or null when it has none worth drawing. */
export function coordOf(r) {
	if (!r || !isRealCoordinate(r.latitude, r.longitude)) return null;
	return { lat: Number(r.latitude), lng: Number(r.longitude) };
}

/**
 * Which stream a punch came from.
 *
 * A coordinate is enough on its own to say *phone*: no fingerprint machine
 * sends one. Otherwise the device id decides, by the two prefixes this project
 * writes itself. A device id carrying neither is called a terminal, which is
 * the weaker claim — the trusted machine prefix is still an open question, and
 * "Mobile" on a bridge punch would have somebody looking for a phone that was
 * never there. No device id at all is `Unknown`, not a guess.
 */
export function streamOf(r) {
	const dev = String(r?.device_id || "");
	if (dev.startsWith(CORRECTION_PREFIX)) return "Correction";
	if (dev.startsWith(PHONE_PREFIX) || coordOf(r)) return "Mobile";
	return dev ? "Terminal" : "Unknown";
}

/** `9.591234, 76.522345` — six places is a tenth of a metre, which is finer
    than any phone reads and coarse enough to paste into a map search box. */
export function coordText(r) {
	const c = coordOf(r);
	return c ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : "";
}

/** The coordinate in Google Maps, which is the map people here already have on
    their phones. The documented search URL, so it keeps working without a key. */
export function mapLink(lat, lng) {
	return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/* Half the side of the embedded map, in degrees — about 330 m each way in
   Kerala. Wide enough to show which gate, narrow enough to read the street. */
const EMBED_SPAN = 0.003;

/** OpenStreetMap's own embed page with a pin on the coordinate. Chosen over
    Google's for the in-page map because it is an official, keyless embed. */
export function mapEmbed(lat, lng) {
	const bbox = [lng - EMBED_SPAN, lat - EMBED_SPAN, lng + EMBED_SPAN, lat + EMBED_SPAN]
		.map((n) => n.toFixed(6)).join(",");
	return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

/** The nearest active Work Location to a punch, as `{name, metres}`, or null. */
export function nearestPlace(r, places) {
	const c = coordOf(r);
	if (!c) return null;
	const live = (places || []).filter((p) => p.is_active !== 0);
	const hit = nearest(c.lat, c.lng, live);
	return hit ? { name: hit.place.location_name || hit.place.name, metres: hit.metres } : null;
}

/* The server's words for `custom_geofence_result`, as a reader should see
   them. `not_checked` is left out: it is the state of every machine punch and
   of every punch while enforcement is off, and printing it on every row would
   bury the two that matter. */
const FENCE = {
	inside: "inside fence",
	outside: "outside fence",
	no_location: "fence could not judge",
};

/**
 * One line on where a punch was: `35 m from Main Gate`, then the server's
 * verdict when it gave one.
 *
 * Empty for a punch with no coordinate. A phone punch that arrived without one
 * is worth a word, though — it is the location permission switched off, and the
 * report is where somebody will first notice it.
 */
export function placeText(r, places) {
	const c = coordOf(r);
	const verdict = FENCE[r?.custom_geofence_result] || "";
	if (!c) {
		if (streamOf(r) !== "Mobile") return "";
		return ["no location sent", verdict].filter(Boolean).join(" · ");
	}
	const near = nearestPlace(r, places);
	const where = near ? `${formatDistance(near.metres)} from ${near.name}` : "";
	return [where, verdict].filter(Boolean).join(" · ");
}
