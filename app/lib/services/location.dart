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

import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// How long a punch waits for a fix before going without one.
///
/// **There was no limit, and indoors that is not the same as a long one.**
/// Against concrete a phone can search for minutes, and the punch button spins
/// the whole time with nothing on it to say why — which reads as the app
/// hanging, and gets closed. Twelve seconds is long enough for a cold GPS
/// outdoors and short enough to stand at a gate for. Past it the punch goes
/// without a coordinate, carrying the reason, and the site decides.
const Duration kFixTimeLimit = Duration(seconds: 12);

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
    final Position pos;
    try {
      pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high, timeLimit: kFixTimeLimit));
    } on TimeoutException {
      // The last position the phone knew is better than none, and it is still
      // only a reading: the site measures it and decides. Carried with the
      // reason so the screen can say the fix is old rather than implying it is
      // where somebody is standing now.
      final last = await Geolocator.getLastKnownPosition();
      if (last != null) {
        return Fix(
          latitude: last.latitude,
          longitude: last.longitude,
          accuracy: last.accuracy > 0 ? last.accuracy : null,
          problem: 'No fresh fix in ${kFixTimeLimit.inSeconds} s, so the '
              'punch carries the last place this phone knew.',
        );
      }
      return Fix(
          problem: 'No GPS fix in ${kFixTimeLimit.inSeconds} s — indoors, '
              'probably. The punch was sent without a place.');
    }
    return Fix(
      latitude: pos.latitude,
      longitude: pos.longitude,
      // A non-positive accuracy means the platform did not say. Carried as
      // null rather than as zero, which would read as a perfect fix.
      accuracy: pos.accuracy > 0 ? pos.accuracy : null,
    );
  } catch (e) {
    // Never the raw exception: `PlatformException(ERROR_...)` is not a
    // sentence anybody at a gate can act on.
    return const Fix(
        problem: 'The phone could not say where it is. The punch was sent '
            'without a place.');
  }
}
