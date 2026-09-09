/// Distance arithmetic, for saying where a punch was made from.
///
/// A port of `manna_hr/geo.py`, which is itself a port of the field-sales app's
/// `core/proximity.dart`. Three copies of forty lines of trigonometry is worth
/// it because the arithmetic is trivial and the error directions are not, and
/// the reasoning below came off a real deployment rather than out of a formula.
///
/// **Nothing here refuses a punch.** The server measures the same distance
/// against the same `Work Location` and decides — see
/// `manna_hr/checkin.py::_check_geofence`. This is so the app can say "you are
/// 1.4 km from Keezhillam gate" *before* the button, which is the difference
/// between somebody walking fifty metres and somebody arguing with HR.
library;

import 'dart:math' as math;

const double _metresPerDegree = 110540.0;
const double kEarthRadiusMetres = 6371000.0;

double _toRadians(double deg) => deg * math.pi / 180.0;

/// Metres between two coordinates, by the haversine formula.
double metresBetween(double lat1, double lng1, double lat2, double lng2) {
  final p1 = _toRadians(lat1);
  final p2 = _toRadians(lat2);
  final dLat = _toRadians(lat2 - lat1);
  final dLng = _toRadians(lng2 - lng1);

  final sLat = math.sin(dLat / 2);
  final sLng = math.sin(dLng / 2);
  final a = sLat * sLat + math.cos(p1) * math.cos(p2) * sLng * sLng;
  // Clamped before asin: rounding can push `a` a hair above 1, and asin of that
  // is NaN — which then propagates silently through every comparison
  // downstream instead of raising.
  return 2 * kEarthRadiusMetres * math.asin(math.min(1.0, math.sqrt(a)));
}

/// True when a coordinate pair is worth comparing against.
///
/// (0, 0) is in the Atlantic and is what an unset Float field reads as, so a
/// location that was never captured must not be treated as a place. A punch
/// that arrives at (0, 0) has no location, and saying so is the difference
/// between recording that honestly and measuring it against the Gulf of Guinea.
bool isRealCoordinate(num? lat, num? lng) {
  if (lat == null || lng == null) return false;
  final a = lat.toDouble();
  final b = lng.toDouble();
  if (!a.isFinite || !b.isFinite) return false;
  if (a.abs() > 90 || b.abs() > 180) return false;
  return !(a == 0 && b == 0);
}

/// Degrees of latitude covering `metres`, rounded outwards. Kept beside the
/// haversine because a bounding box that is a little too small silently drops a
/// match before anything ever measures it.
double latSpanForMetres(double metres) => (metres / _metresPerDegree) * 1.02;

/// Distance as a person would say it: metres up close, kilometres beyond.
String formatDistance(double metres) => metres < 1000
    ? '${metres.round()} m'
    : '${(metres / 1000).toStringAsFixed(1)} km';
