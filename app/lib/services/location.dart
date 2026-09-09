/// The phone's position, for the geofence.
///
/// **This never refuses a punch, and that is the whole design.** The bias in
/// this project is that refusing somebody who did turn up is the expensive
/// mistake: it costs a person their day's pay and an argument with HR, while
/// letting a doubtful punch through costs a flag on a report a human reads
/// (CLAUDE.md §4). So a fix that could not be taken comes back as *no fix*,
/// with the reason on it, and the punch is offered anyway — the site then
/// decides, because `require_location_for_mobile` on `Manna HR Settings` is
/// HR's switch and not this app's.
library;

import 'package:geolocator/geolocator.dart';

/// What the phone could say about where it is.
class Fix {
  const Fix({this.latitude, this.longitude, this.accuracy, this.problem = ''});

  final double? latitude;
  final double? longitude;

  /// Metres of claimed accuracy, or null when the platform did not say.
  final double? accuracy;

  /// Why there is no coordinate, in words somebody can act on — "location is
  /// switched off", "permission denied". Empty when there is one.
  final String problem;

  bool get has => latitude != null && longitude != null;

  /// A coarse fix is still a fix.
  ///
  /// `LocationAccuracy.high` is a request, not a promise: indoors, against
  /// concrete, Android answers from cell towers and reports kilometres. The
  /// field-sales app refuses a fix that coarse when it is *writing down a
  /// place*, and allows it when it is only measuring against one — which is
  /// what a punch is. So this says how good the fix is and leaves the deciding
  /// to the server.
  bool get isCoarse => (accuracy ?? 0) > 100;
}

Future<Fix> currentFix() async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const Fix(
          problem: 'Location is switched off on this phone. Turn GPS on so the '
              'punch can say where it was made.');
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied) {
      return const Fix(
          problem: 'Location permission was refused, so this punch carries no '
              'place with it.');
    }
    if (perm == LocationPermission.deniedForever) {
      return const Fix(
          problem: 'Location permission is switched off for this app in Android '
              'settings. Turn it on there, or ask HR to record the punch.');
    }
    final pos = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high));
    return Fix(
      latitude: pos.latitude,
      longitude: pos.longitude,
      // A non-positive accuracy means the platform did not say. Carried as
      // null rather than as zero, which would read as a perfect fix.
      accuracy: pos.accuracy > 0 ? pos.accuracy : null,
    );
  } catch (e) {
    return Fix(problem: 'The phone could not get a fix: $e');
  }
}
