import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/day.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/admin/admin_home.dart';
import 'package:manna_hr_app/screens/admin/day_screen.dart';
import 'package:manna_hr_app/screens/admin/employees_screen.dart';
import 'package:manna_hr_app/screens/admin/leave_requests_screen.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/screens/today_card.dart';

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
    MannaHrApp(home: DayScreen(load: load ?? fakeDay));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

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

  testWidgets('the Leave Report opens the same day on its leave tab', (t) async {
    await t.pumpWidget(MannaHrApp(home: DayScreen(load: fakeDay, initialTab: 2, title: 'Leave Report')));
    await t.pumpAndSettle();
    expect(find.text('Leave Report'), findsOneWidget);
    expect(find.text('On leave (1)'), findsOneWidget);
  });

  testWidgets('the sign-in screen asks for an email and a password, and says when either is missing', (t) async {
    await t.pumpWidget(const MannaHrApp(home: LoginScreen()));
    await t.pumpAndSettle();
    await t.tap(find.text('Sign in'));
    await t.pump();
    expect(find.text('Type your email and password.'), findsOneWidget);
  });

  testWidgets("HR's home counts the group, the leave waiting, and who is in today", (t) async {
    var tabbed = -1;
    await t.pumpWidget(MannaHrApp(
      home: Scaffold(
        body: AdminHome(
          onTab: (i) => tabbed = i,
          load: () async => const AdminSummary(
              name: 'Priya Sharma', employees: 28, pendingLeave: 6, inToday: 24, notInToday: 3),
        ),
      ),
    ));
    await t.pumpAndSettle();
    expect(find.text('Priya Sharma'), findsOneWidget);
    expect(find.text('28'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(find.text('24'), findsOneWidget);
    await t.tap(find.text('Leave Requests'));
    expect(tabbed, 2);
  });

  testWidgets('a pending count the site would not give is a dash, never a zero', (t) async {
    await t.pumpWidget(MannaHrApp(
      home: Scaffold(
        body: AdminHome(
          onTab: (_) {},
          load: () async =>
              const AdminSummary(name: 'HR', employees: 5, pendingLeave: null, inToday: 0, notInToday: 5),
        ),
      ),
    ));
    await t.pumpAndSettle();
    expect(find.text('—'), findsOneWidget);
  });

  testWidgets('the employee list shows the active by default and searches by name or code', (t) async {
    await t.pumpWidget(MannaHrApp(
      home: EmployeesScreen(
        load: () async => [
          {'name': 'E1', 'employee_name': 'Rahul Singh', 'employee_number': '1041', 'designation': 'Fitter', 'status': 'Active'},
          {'name': 'E2', 'employee_name': 'Sneha Kapoor', 'employee_number': '1042', 'designation': 'Clerk', 'status': 'Active'},
          {'name': 'E3', 'employee_name': 'Old Hand', 'employee_number': '0007', 'status': 'Left'},
        ],
      ),
    ));
    await t.pumpAndSettle();
    expect(find.text('Rahul Singh'), findsOneWidget);
    expect(find.text('Sneha Kapoor'), findsOneWidget);
    expect(find.text('Old Hand'), findsNothing, reason: 'somebody who left is behind the filter');
    await t.enterText(find.byType(TextField), '1042');
    await t.pumpAndSettle();
    expect(find.text('Rahul Singh'), findsNothing);
    expect(find.text('Sneha Kapoor'), findsOneWidget);
  });

  testWidgets('leave requests are split by status, pending first', (t) async {
    await t.pumpWidget(MannaHrApp(
      home: LeaveRequestsScreen(
        load: (status) async => status == 'Open'
            ? [
                {'name': 'L1', 'employee': 'E1', 'employee_name': 'Amit Verma', 'leave_type': 'Casual Leave',
                  'from_date': '2026-10-21', 'to_date': '2026-10-21', 'total_leave_days': 1, 'status': 'Open'},
              ]
            : <Map<String, dynamic>>[],
      ),
    ));
    await t.pumpAndSettle();
    expect(find.text('Amit Verma'), findsOneWidget);
    expect(find.text('Casual Leave · 1 day'), findsOneWidget);
    expect(find.text('Pending'), findsWidgets);
    await t.tap(find.text('Approved'));
    await t.pumpAndSettle();
    expect(find.text('None yet'), findsOneWidget);
  });

  Future<void> hrHome(WidgetTester t) async {
    await t.pumpWidget(MannaHrApp(
      home: Scaffold(
        body: AdminHome(
          onTab: (_) {},
          load: () async =>
              const AdminSummary(name: 'Pradeep A.K', employees: 175, pendingLeave: 0, inToday: 58, notInToday: 117),
        ),
      ),
    ));
    await t.pumpAndSettle();
  }

  testWidgets("an HR login that is an employee too gets its own punch and self-service on HR's home", (t) async {
    Session.I.employee = {'name': 'HR-EMP-0004', 'employee_name': 'Pradeep A.K'};
    Session.I.isAdmin = true;
    addTearDown(() {
      Session.I.employee = null;
      Session.I.isAdmin = false;
    });
    await hrHome(t);
    expect(find.byType(TodayCard), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Punch In'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Punch Out'), findsOneWidget);
    await t.scrollUntilVisible(find.text('My Corrections'), 300);
    for (final label in ['My Self-Service', 'My Attendance', 'Apply Leave', 'My Leave', 'My Payslip', 'My Profile']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
  });

  testWidgets('an HR login no Employee record carries gets no punch and no self-service — nobody to do it for',
      (t) async {
    Session.I.isAdmin = true;
    addTearDown(() => Session.I.isAdmin = false);
    await hrHome(t);
    expect(find.byType(TodayCard), findsNothing);
    expect(find.text('My Self-Service'), findsNothing);
  });
}
