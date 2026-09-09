import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/geo.dart';

/// The distance arithmetic, against `manna_hr/geo.py` — three copies of one
/// formula are only worth having if they agree, and the Python side has no test
/// of its own yet, so this is currently the only place the numbers are pinned.
void main() {
  group('distance', () {
    test('the same point is no distance at all', () {
      expect(metresBetween(10.0, 76.5, 10.0, 76.5), closeTo(0, 0.001));
    });

    test('a tenth of a degree of latitude is about eleven kilometres', () {
      // 11119 m, not the 11054 the box constant would suggest: `metresBetween`
      // is a great circle on a 6371 km sphere, while `METRES_PER_DEGREE` is
      // deliberately understated so a bounding box errs outwards. The two
      // numbers are meant to differ, and this is where that is written down.
      final d = metresBetween(10.0, 76.5, 10.1, 76.5);
      expect(d, closeTo(11119.5, 1));
    });

    test('it is symmetric, whichever end you measure from', () {
      final there = metresBetween(10.0, 76.5, 10.05, 76.55);
      final back = metresBetween(10.05, 76.55, 10.0, 76.5);
      expect(there, closeTo(back, 0.001));
    });

    test('antipodal points do not come back as NaN', () {
      // Rounding can push the haversine term a hair above 1, and asin of that
      // is NaN — which then propagates silently through every comparison
      // downstream instead of raising.
      final d = metresBetween(0, 0, 0, 180);
      expect(d.isNaN, isFalse);
      expect(d, closeTo(20015086, 1000));
    });
  });

  group('whether a coordinate is a place', () {
    test('null island is not a location, it is an unset field', () {
      // (0, 0) is in the Atlantic and is what an unset Float reads as. A record
      // that was never captured must not be measured against the Gulf of Guinea.
      expect(isRealCoordinate(0, 0), isFalse);
    });

    test('a missing coordinate is not a location', () {
      expect(isRealCoordinate(null, 76.5), isFalse);
      expect(isRealCoordinate(10.0, null), isFalse);
    });

    test('an impossible coordinate is not a location', () {
      expect(isRealCoordinate(91.0, 76.5), isFalse);
      expect(isRealCoordinate(10.0, 181.0), isFalse);
    });

    test('a real one is', () {
      expect(isRealCoordinate(10.0523, 76.5312), isTrue);
    });
  });

  group('how far, in words', () {
    test('metres up close and kilometres beyond', () {
      expect(formatDistance(42.4), '42 m');
      expect(formatDistance(999), '999 m');
      expect(formatDistance(1400), '1.4 km');
    });
  });

  test('a bounding box is rounded outwards, never inwards', () {
    // A box a little too big costs a few extra comparisons; a box a little too
    // small silently drops a match before anything ever measures it.
    expect(latSpanForMetres(1000) * 110540, greaterThan(1000));
  });
}
