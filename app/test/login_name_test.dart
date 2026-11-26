import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/session.dart';

/// The ID the app shows is the one they signed in with (26 November 2026): the
/// Emp Code, never the stand-in address a login with no email is named by.
void main() {
  tearDown(() {
    Session.I.employee = null;
    Session.I.email = '';
    Session.I.user = '';
  });

  test('a phone login with no email shows the Emp Code, not mrp-293@phone.manna.invalid', () {
    Session.I.user = 'mrp-293@phone.manna.invalid';
    Session.I.email = 'MRP-293';
    Session.I.employee = {'name': 'HR-EMP-00125', 'employee_number': 'MRP-293'};
    expect(Session.I.loginName, 'MRP-293');
  });

  test('with no record yet it is still what they typed, never the stand-in', () {
    Session.I.user = 'mrp-293@phone.manna.invalid';
    Session.I.email = 'mrp-293@phone.manna.invalid';
    expect(Session.I.loginName, isNot(contains('invalid')));
    Session.I.email = 'MRP-293';
    expect(Session.I.loginName, 'MRP-293');
  });

  test('somebody with a real email and no Emp Code keeps their email', () {
    Session.I.user = 'anand@manna.in';
    Session.I.email = 'anand@manna.in';
    expect(Session.I.loginName, 'anand@manna.in');
  });

  test('the stand-in is recognised whatever its case', () {
    expect(isStandIn('MRP-293@Phone.Manna.Invalid'), isTrue);
    expect(isStandIn('anand@manna.in'), isFalse);
  });
}
