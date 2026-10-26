import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/activity.dart';
import 'package:manna_hr_app/core/landing.dart';
import 'package:manna_hr_app/core/money.dart';
import 'package:manna_hr_app/ui/brand.dart' show greeting;

/// One app for everybody: who lands where, and the small pure helpers the two
/// home screens draw with.
void main() {
  group('where somebody lands', () {
    test('nobody signed in lands on the sign-in screen', () {
      expect(landingFor(signedIn: false, isAdmin: true), Landing.signIn);
      expect(landingFor(signedIn: false, isAdmin: false), Landing.signIn);
    });

    test('an employee who is not HR is never offered the HR side', () {
      expect(landingFor(signedIn: true, isAdmin: false), Landing.employee);
    });

    test("HR lands on HR's side and is never asked to choose — their own punch and month are in its menu", () {
      expect(landingFor(signedIn: true, isAdmin: true), Landing.admin);
    });
  });

  group('rupees', () {
    test('are grouped the Indian way — three, then twos', () {
      expect(rupees(56820), '₹ 56,820');
      expect(rupees(123456), '₹ 1,23,456');
      expect(rupees(12345678), '₹ 1,23,45,678');
      expect(rupees(999), '₹ 999');
      expect(rupees(0), '₹ 0');
    });

    test('keep paise when there are any, and read the site\'s strings and nulls', () {
      expect(rupees(15180.5), '₹ 15,180.50');
      expect(rupees('72000.0'), '₹ 72,000');
      expect(rupees(null), '₹ 0');
      expect(rupees(-1200), '-₹ 1,200');
    });

    test('a month is named the way a payslip names it', () {
      expect(monthTitle('2026-09-01'), 'September 2026');
      expect(monthTitle('2026-13-01'), '2026-13-01');
      expect(monthTitle(''), '');
    });
  });

  test('the greeting follows the hour', () {
    expect(greeting(6), 'Good morning');
    expect(greeting(13), 'Good afternoon');
    expect(greeting(19), 'Good evening');
  });

  group('recent activity', () {
    test('mixes leave and corrections, newest raised first, and stops at the limit', () {
      final a = recentActivity(
        [
          {'leave_type': 'Casual Leave', 'from_date': '2026-10-10', 'status': 'Approved', 'docstatus': 1,
            'creation': '2026-10-08 10:00:00'},
          {'leave_type': 'Sick Leave', 'from_date': '2026-10-20', 'status': 'Open', 'docstatus': 0,
            'creation': '2026-10-19 09:00:00'},
        ],
        [
          {'attendance_date': '2026-10-15', 'status': 'Pending Approval', 'creation': '2026-10-16 18:00:00'},
        ],
        limit: 2,
      );
      expect(a.map((x) => x.title), ['Sick Leave', 'Attendance correction']);
      expect(a.first.status, 'Waiting for HR');
      expect(a.last.status, 'Pending');
      expect(a.last.kind, ActivityKind.correction);
    });

    test('is empty when nothing was asked for', () {
      expect(recentActivity(const [], const []), isEmpty);
    });
  });
}
