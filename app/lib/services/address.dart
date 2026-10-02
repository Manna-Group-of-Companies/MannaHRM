/// The street a punch was made in, as the phone's own geocoder names it:
/// `4F6J+23R, Perumbavoor, Kerala, 683542`.
///
/// For the dashboard's Location column, beside the coordinate it was looked up
/// from. **The coordinate is the evidence and this is a caption** — a geocoder
/// names the nearest thing it knows of, which at a factory gate can be the
/// shop across the road. Nothing judges by it.
///
/// Looked up on the phone rather than by the dashboard so it is written once,
/// on the punch, and every report and export reads the same words — and so no
/// page has to send a month of somebody's coordinates to a map service to draw
/// a table. Android's geocoder is free and keyless, and it is the phone's.
///
/// Never throws and never waits long. A punch is not delayed past
/// [kAddressTimeLimit] for a caption, and goes without one.
library;

import 'dart:async';

import 'package:geocoding/geocoding.dart';

const Duration kAddressTimeLimit = Duration(seconds: 5);

/// The address at a coordinate, or '' when the phone could not say in time.
Future<String> addressAt(double? latitude, double? longitude) async {
  if (latitude == null || longitude == null) return '';
  try {
    final marks = await Geocoding()
        .placemarkFromCoordinates(latitude, longitude)
        .timeout(kAddressTimeLimit);
    if (marks.isEmpty) return '';
    final m = marks.first;
    return describeAddress([
      m.name, m.street, m.subLocality, m.locality,
      m.subAdministrativeArea, m.administrativeArea, m.postalCode,
    ]);
  } catch (_) {
    return '';
  }
}

/// The pure half: the parts in order, blanks and repeats dropped. Android
/// often hands back the same words as `name`, `street` and `locality` — a
/// plus code as the name and again as the street — and printing each would
/// read `Perumbavoor, Perumbavoor`.
String describeAddress(List<String?> parts) {
  final seen = <String>{};
  final out = <String>[];
  for (final p in parts) {
    final t = (p ?? '').trim();
    if (t.isEmpty || !seen.add(t.toLowerCase())) continue;
    out.add(t);
  }
  return out.join(', ');
}
