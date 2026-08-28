"""Distance arithmetic for geofenced punches.

Ported from the field-sales app's `lib/core/proximity.dart`, where this has run
against real phones in the field since June 2026. The reasoning in the comments
came from that deployment and is the reason this is a port rather than a
rewrite — the arithmetic is trivial, the error directions are not.

Pure functions over plain numbers: no `frappe` import, no database. That is
deliberate, so the rules can be tested without a site.
"""

import math

# Metres in a degree, deliberately understated.
#
# The earth is not a sphere, so a degree of latitude is worth between about
# 110,570 m (a meridian degree at the equator) and 111,690 m. These spans size
# the database's bounding box, and the box only pre-selects rows — the exact
# haversine distance then decides. So the two error directions are not equal: a
# box a little too big costs a few extra rows, while a box a little too small
# silently drops a match before anything ever measures it. Taking the smallest
# real figure, and widening by a further 2%, makes the box err the only way it
# can afford to.
_METRES_PER_DEGREE = 110540.0
_BOX_SAFETY_MARGIN = 1.02

EARTH_RADIUS_METRES = 6371000.0


def metres_between(lat1, lng1, lat2, lng2):
	"""Metres between two coordinates, by the haversine formula.

	Great-circle rather than flat-earth: over a kilometre the difference is
	centimetres, but the formula does not care how far apart the points are, so
	nothing breaks if it is ever called with two ends of the state.
	"""
	p1, p2 = math.radians(lat1), math.radians(lat2)
	d_lat = math.radians(lat2 - lat1)
	d_lng = math.radians(lng2 - lng1)

	a = (
		math.sin(d_lat / 2) ** 2
		+ math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
	)
	# Clamped before asin: rounding can push `a` a hair above 1 for antipodal
	# points, and asin(1.0000000001) raises.
	return 2 * EARTH_RADIUS_METRES * math.asin(min(1.0, math.sqrt(a)))


def is_real_coordinate(lat, lng):
	"""True when a coordinate pair is worth comparing against.

	(0, 0) is in the Atlantic and is what an unset Float field reads as, so a
	record that was never captured must not be treated as a place. A punch that
	arrives at (0, 0) has no location, and saying so is the difference between
	refusing it honestly and measuring it against the Gulf of Guinea.
	"""
	if lat is None or lng is None:
		return False
	try:
		lat, lng = float(lat), float(lng)
	except (TypeError, ValueError):
		return False
	if math.isnan(lat) or math.isnan(lng) or math.isinf(lat) or math.isinf(lng):
		return False
	if abs(lat) > 90 or abs(lng) > 180:
		return False
	return not (lat == 0 and lng == 0)


def lat_span_for_metres(metres):
	"""Degrees of latitude covering `metres`, rounded outwards."""
	return (metres / _METRES_PER_DEGREE) * _BOX_SAFETY_MARGIN


def lng_span_for_metres(metres, at_latitude):
	"""Degrees of longitude covering `metres` at `at_latitude`, rounded outwards.

	Meridians converge towards the poles, so a degree of longitude is worth less
	the further north you go. Kerala is near the equator and the difference is
	small, but a box computed as if it were constant would be too narrow, and a
	too-narrow box silently misses matches.
	"""
	shrink = abs(math.cos(math.radians(at_latitude)))
	# Near the poles cos goes to zero and the span to infinity. Clamped so the
	# box stays a box rather than becoming the whole world.
	return (metres / (_METRES_PER_DEGREE * max(shrink, 0.01))) * _BOX_SAFETY_MARGIN


def bounding_box(lat, lng, radius_metres):
	"""(min_lat, max_lat, min_lng, max_lng) covering a circle, rounded outwards.

	For pre-selecting rows in SQL, which cannot do haversine against an index.
	Always follow it with `metres_between` — the box is a square and the rule is
	a circle, so the corners are false positives by design.
	"""
	d_lat = lat_span_for_metres(radius_metres)
	d_lng = lng_span_for_metres(radius_metres, lat)
	return (lat - d_lat, lat + d_lat, lng - d_lng, lng + d_lng)


def nearest(lat, lng, places):
	"""The closest place to a point, as `(place, metres)`, or None.

	`places` is any iterable of objects carrying `latitude` and `longitude`.

	**None means "cannot tell", not "too far".** Callers must not treat it as a
	refusal: a location whose coordinate was never captured would otherwise
	strand every employee assigned to it at the gate.
	"""
	best, best_metres = None, float("inf")
	for p in places:
		lat2 = getattr(p, "latitude", None)
		lng2 = getattr(p, "longitude", None)
		if not is_real_coordinate(lat2, lng2):
			continue
		d = metres_between(lat, lng, float(lat2), float(lng2))
		if d < best_metres:
			best, best_metres = p, d
	return None if best is None else (best, best_metres)


def format_distance(metres):
	"""Distance as a person would say it: metres up close, kilometres beyond."""
	if metres < 1000:
		return "{0} m".format(int(round(metres)))
	return "{0:.1f} km".format(metres / 1000.0)
