import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_admin/app.dart';
import 'package:manna_hr_admin/core/day.dart';
import 'package:manna_hr_admin/screens/home_screen.dart';
import 'package:manna_hr_admin/screens/login_screen.dart';

/// A small day with a gap in every column: somebody in and out, somebody still
/// in with a set-aside punch, somebody on leave, somebody who applied and was
/// not approved, somebody absent, somebody on a weekly off, and two companies.
Future<DayView> fakeDay(String date, String today, {bool fresh = false}) async {
  Person p(String id, String name, {String company = 'Manna Rubber', String list = ''}) =>
      Person(id: id, name: name, number: id, department: 'Production', company: company, holidayList: list);
  return DayView.build(
    date: date,
    today: today,
    people: [
      p('1041', 'Raghav Menon'),
      p('1042', 'Fatima Sheikh'),
      p('1043', 'Joseph Ekka'),
      p('1044', 'Priya Nair', company: 'Manna Polymers'),
      p('1045', 'Sunil Rathore', company: 'Manna Polymers'),
      p('1046', 'Anita Das', list: 'Sundays'),
    ],
    punches: [
      Punch(id: 'a', employee: '1041', time: '$date 08:41:00', logType: 'IN', device: 'BIO-MRP-GATE1'),
      Punch(id: 'b', employee: '1041', time: '$date 17:12:00', logType: 'OUT', device: 'BIO-MRP-GATE1'),
      Punch(id: 'c', employee: '1042', time: '$date 08:52:00', logType: 'IN', device: 'PHONE-1042'),
      Punch(id: 'd', employee: '1042', time: '$date 09:40:00', logType: 'OUT', device: 'BIO-MRP-GATE1', setAside: true),
    ],
    leaves: [
      Leave(id: 'L1', employee: '1043', employeeName: 'Joseph Ekka', type: 'Casual Leave', from: date, to: date, status: 'Approved', days: 1),
      Leave(id: 'L2', employee: '1044', employeeName: 'Priya Nair', type: 'Sick Leave', from: date, to: date, status: 'Open', days: 1),
    ],
    calendars: {'Sundays': [Holiday(date: date, weeklyOff: true)]},
  );
}

Widget app({Future<DayView> Function(String, String, {bool fresh})? load}) =>
    MannaAdmin(home: HomeScreen(user: 'hr@mannarubber.com', load: load ?? fakeDay));

void main() {
  testWidgets('the counts say who punched, who is absent, who is on leave and who is off', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    // Today, so the absent box reads "Not in yet": the day is not over.
    expect(find.text('Punched'), findsOneWidget);
    expect(find.text('Not in yet'), findsWidgets);
    expect(find.text('Punches (2)'), findsOneWidget);
    expect(find.text('Absent (2)'), findsOneWidget, reason: 'Sunil absent, and Priya whose leave is not approved');
    expect(find.text('Leave (2)'), findsOneWidget, reason: 'Joseph approved, Priya pending');
  });

  testWidgets('the punches list shows each person in and out, and marks a set-aside punch', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    expect(find.text('Raghav Menon'), findsOneWidget);
    expect(find.text('08:41 → 17:12'), findsOneWidget);
    expect(find.textContaining('a punch set aside'), findsOneWidget);
  });

  testWidgets('tapping a person opens every punch behind their day, with where it came from', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    await t.tap(find.text('Fatima Sheikh'));
    await t.pumpAndSettle();
    expect(find.text('08:52:00'), findsOneWidget);
    expect(find.textContaining('Phone'), findsOneWidget);
    expect(find.text('Set aside'), findsOneWidget);
  });

  testWidgets('the absent tab lists the absent, the leave not approved, and who is off', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    await t.tap(find.text('Absent (2)'));
    await t.pumpAndSettle();
    expect(find.text('Sunil Rathore'), findsOneWidget);
    expect(find.textContaining('Sick Leave applied, not approved'), findsOneWidget);
    expect(find.text('Holiday or weekly off (1)'), findsOneWidget);
    expect(find.text('Anita Das'), findsOneWidget);
  });

  testWidgets('the leave tab puts approved leave before what is still waiting', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    await t.tap(find.text('Leave (2)'));
    await t.pumpAndSettle();
    expect(find.text('On leave (1)'), findsOneWidget);
    expect(find.text('Waiting for approval (1)'), findsOneWidget);
    expect(find.text('Approved'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
  });

  testWidgets('the search narrows every list at once', (t) async {
    await t.pumpWidget(app());
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'raghav');
    await t.pumpAndSettle();
    expect(find.text('Punches (1)'), findsOneWidget);
    expect(find.text('Absent (0)'), findsOneWidget);
  });

  testWidgets('a site that will not answer says so and offers to try again', (t) async {
    await t.pumpWidget(app(load: (d, today, {fresh = false}) async => throw Exception('The site is down.')));
    await t.pumpAndSettle();
    expect(find.text('The site is down.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('the sign-in screen asks for an email and a password, and says when either is missing', (t) async {
    await t.pumpWidget(const MannaAdmin(home: LoginScreen()));
    await t.tap(find.text('Sign in'));
    await t.pump();
    expect(find.text('Type your email and password.'), findsOneWidget);
  });
}
