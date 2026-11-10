import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/first_password.dart';

/// The first password HR gives everybody — their date of birth, DDMMYYYY —
/// and the one they must choose to replace it (asked for 10 November 2026).
void main() {
  group('the first password', () {
    test('is the date of birth as day, month, year — 24-03-2005 is 24032005', () {
      expect(dobPassword('2005-03-24'), '24032005');
      expect(dobPassword('1998-11-02'), '02111998');
    });

    test('is nothing when the record has no birth date', () {
      expect(dobPassword(null), '');
      expect(dobPassword(''), '');
      expect(dobPassword('24-03-2005'), '');
    });
  });

  group('a new password is asked for', () {
    test('while the password used is still the date of birth', () {
      expect(mustChangePassword('24032005', '2005-03-24'), isTrue);
    });

    test('not once somebody has chosen their own', () {
      expect(mustChangePassword('river-stone-42', '2005-03-24'), isFalse);
    });

    test('not when the record has no birth date — there is no first password to be on', () {
      expect(mustChangePassword('24032005', null), isFalse);
    });
  });

  group('what a new password may not be', () {
    test('shorter than eight characters', () {
      expect(newPasswordProblem('abc123', 'abc123'), 'Use at least 8 characters.');
    });

    test('two different words typed', () {
      expect(newPasswordProblem('river-stone-42', 'river-stone-43'), 'The two passwords are not the same.');
    });

    test('the date of birth again, even with something round it', () {
      expect(newPasswordProblem('x24032005', 'x24032005', isoDate: '2005-03-24'),
          'Choose something other than your date of birth.');
    });

    test('the Emp Code, whatever the case', () {
      expect(newPasswordProblem('mrp861-gate', 'mrp861-gate', empCode: 'MRP861'),
          'Choose something other than your Emp Code.');
    });

    test('anything else will do', () {
      expect(newPasswordProblem('river-stone-42', 'river-stone-42', isoDate: '2005-03-24', empCode: 'MRP861'),
          isNull);
    });
  });
}
