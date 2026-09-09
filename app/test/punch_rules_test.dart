import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/punch_rules.dart';

/// The rules the punch button follows, without a phone or a site.
///
/// **Tests state the rule in their name.** When one of these fails at midnight,
/// the name is what tells the reader what was supposed to be true.
void main() {
  Map<String, dynamic> punch(String time, String type) =>
      {'time': time, 'log_type': type};

  group('which way the next punch goes', () {
    test('a day with no punches on it starts with an in', () {
      expect(nextLogType(const []), kLogIn);
    });

    test('an in is followed by an out', () {
      expect(nextLogType([punch('2026-09-09 08:30:00', 'IN')]), kLogOut);
    });

    test('an out is followed by an in, because a second shift is a real day', () {
      expect(
        nextLogType([
          punch('2026-09-09 08:30:00', 'IN'),
          punch('2026-09-09 13:00:00', 'OUT'),
        ]),
        kLogIn,
      );
    });

    test('the last punch decides, not how many there are', () {
      // A gate that double-reads puts four rows on a day. "An even number means
      // you are out" would send somebody home marked as still in.
      expect(
        nextLogType([
          punch('2026-09-09 08:30:00', 'IN'),
          punch('2026-09-09 08:30:04', 'IN'),
        ]),
        kLogOut,
      );
    });

    test('rows out of order are sorted before the last one is read', () {
      expect(
        nextLogType([
          punch('2026-09-09 17:30:00', 'OUT'),
          punch('2026-09-09 08:30:00', 'IN'),
        ]),
        kLogIn,
      );
    });

    test('a punch with no direction on it is followed by an in', () {
      // A ZK machine never set up for in/out reports no direction at all, and
      // the bridge is deliberately not allowed to guess one. An IN is the punch
      // that cannot make an existing one worse.
      expect(nextLogType([punch('2026-09-09 08:30:00', '')]), kLogIn);
    });
  });

  group('the punches of one day', () {
    test('the earliest in and the latest out, not the first two rows', () {
      // A pair taken in arrival order would report a gate's second read as the
      // punch-out — a nine-hour day as four seconds.
      final pair = dayPunches([
        punch('2026-09-09 08:30:00', 'IN'),
        punch('2026-09-09 08:30:04', 'IN'),
        punch('2026-09-09 17:30:00', 'OUT'),
        punch('2026-09-09 17:30:06', 'OUT'),
      ]);
      expect(pair.inAt, '2026-09-09 08:30:00');
      expect(pair.outAt, '2026-09-09 17:30:06');
    });

    test('a day with only an out has no in, and says so', () {
      final pair = dayPunches([punch('2026-09-09 17:30:00', 'OUT')]);
      expect(pair.inAt, '');
      expect(pair.outAt, '2026-09-09 17:30:00');
    });

    test('a punch with no direction is read as an arrival', () {
      final pair = dayPunches([punch('2026-09-09 08:30:00', '')]);
      expect(pair.inAt, '2026-09-09 08:30:00');
    });
  });

  group('hours on a day', () {
    test('nine hours and seven minutes reads as 09:07', () {
      expect(spanHours('2026-09-09 08:30:00', '2026-09-09 17:37:00'), '09:07');
    });

    test('an out before the in is not negative hours, it is no answer', () {
      expect(spanHours('2026-09-09 17:30:00', '2026-09-09 08:30:00'), '');
    });

    test('one punch on its own is no answer', () {
      expect(spanHours('2026-09-09 08:30:00', ''), '');
    });
  });

  group('the working window', () {
    test('a punch inside the window is offered', () {
      expect(punchRefusal(DateTime(2026, 9, 9, 8, 30)), isNull);
    });

    test('a punch before it opens says to ask for a regularization', () {
      final why = punchRefusal(DateTime(2026, 9, 9, 4, 30));
      expect(why, isNotNull);
      expect(why, contains('regularization'));
    });

    test('a punch after it closes says to ask for a regularization', () {
      final why = punchRefusal(DateTime(2026, 9, 9, 22, 0));
      expect(why, isNotNull);
      expect(why, contains('regularization'));
    });

    test('the closing minute itself is still inside', () {
      // The window closes at the *end* of 21:30. Rounding the other way refuses
      // somebody who is standing at the gate, which is the expensive mistake.
      expect(punchRefusal(DateTime(2026, 9, 9, 21, 30)), isNull);
    });
  });

  group('what a punch off this phone is labelled', () {
    test('the device id does not start with the trusted machine prefix', () {
      // A device id starting with the trusted prefix is classified as a
      // fingerprint machine, and a machine is exempt from the geofence and from
      // the server clock. That exemption is the whole thing a phone must not
      // be able to claim.
      expect(deviceIdFor('HR-EMP-00001').startsWith('BIO-'), isFalse);
      expect(deviceIdFor('HR-EMP-00001').startsWith('REG-'), isFalse);
      expect(deviceIdFor('HR-EMP-00001'), contains('HR-EMP-00001'));
    });
  });

  group('how times are written for the site', () {
    test('a day is YYYY-MM-DD, which is what a string comparison needs', () {
      expect(isoDay(DateTime(2026, 9, 9)), '2026-09-09');
    });

    test('a stamp is YYYY-MM-DD HH:MM:SS, the shape the site stores', () {
      expect(stampOf(DateTime(2026, 9, 9, 8, 5, 3)), '2026-09-09 08:05:03');
    });

    test('the clock part of a stamp is the two the screen shows', () {
      expect(clockOf('2026-09-09 08:05:03'), '08:05');
      expect(clockOf(null), '');
    });
  });
}
