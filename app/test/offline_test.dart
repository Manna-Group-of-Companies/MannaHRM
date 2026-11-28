import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/employee_shell.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/photo.dart';
import 'package:manna_hr_app/services/punch_queue.dart';

/// No signal at all (27 November 2026, asked for by HR: "the app must work
/// normally without internet, and never show a bug"). A phone that signed in
/// before opens the app at a gate with no network: it must open on its owner's
/// home, every screen must say so calmly — no raw exception, no endless
/// spinner, no sign-in form — and a punch must be kept on the phone.
class _NoSignal implements HttpClientAdapter {
  int asked = 0;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    asked++;
    throw DioException(requestOptions: o, type: DioExceptionType.connectionError, message: 'no signal');
  }
}

/// A network that takes [delay] to fail every request — connected, going
/// nowhere.
class _Slow implements HttpClientAdapter {
  _Slow(this.delay);
  final Duration delay;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    await Future<void>.delayed(delay);
    throw DioException(requestOptions: o, type: DioExceptionType.connectionTimeout, message: 'timed out');
  }
}

/// Words that must never reach a person's screen.
final _raw = RegExp(r'DioException|SocketException|Exception:|Instance of|Null check|type .* is not a subtype|NoSuchMethod|RangeError');

/// What a screen with no signal used to say, and is false: an empty list read
/// as "none" when it was "could not be read".
const _lies = [
  'You have not asked for any.',
  'Nothing asked for yet.',
  'You have no leave to ask for yet',
  'Tell HR.',
  'No employee record carries this login',
  'Not linked',
];

void _expectCalm(WidgetTester t, String where) {
  final shown = find.byType(Text).evaluate().map((e) => (e.widget as Text).data ?? '').where((s) => s.isNotEmpty);
  for (final s in shown) {
    expect(_raw.hasMatch(s), isFalse, reason: '$where shows "$s"');
  }
  expect(t.takeException(), isNull, reason: '$where threw');
}

void main() {
  final net = _NoSignal();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    Session.testAdapter = net;
    Api.site = 'https://site.invalid';
    Session.I.employee = null;
    Session.I.offlineStart = false;
    Session.I.user = '';
    Session.I.email = '';
    Session.I.sid = '';
    // Inside the punch window whatever the time the test runs at.
    final now = DateTime.now();
    ServerClock.I.restore(DateTime(now.year, now.month, now.day, 10).difference(now));
    // This phone signed in yesterday: the login and the employee are kept.
    await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: '24032005');
    await AuthStore.saveEmployee({
      'name': 'HR-EMP-00125',
      'employee_name': 'PAUL SUNNY',
      'employee_number': 'MRP-293',
      'designation': 'Stack Developer',
      'company': 'Manna Rubber Products Private Limited',
    });
  });

  tearDown(() {
    PunchQueue.I.stop();
    Session.testAdapter = null;
    ServerClock.I.restore(Duration.zero);
  });

  testWidgets('opens on its owner\'s home with no signal, not on the sign-in form', (t) async {
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(net.asked, greaterThan(0), reason: 'the app tried the site');
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.byType(EmployeeShell), findsOneWidget);
    expect(find.textContaining('PAUL'), findsWidgets);
    _expectCalm(t, 'home');
    PunchQueue.I.stop();
  });

  testWidgets('every tab and page says so calmly with no signal, and nothing spins for ever', (t) async {
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(EmployeeShell), findsOneWidget);
    _expectCalm(t, 'home');

    for (final tab in ['Attendance', 'My leave', 'More', 'Home']) {
      await t.tap(find.text(tab).last);
      await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
      _expectCalm(t, tab);
      expect(find.byType(CircularProgressIndicator), findsNothing, reason: '$tab still spinning');
      // Nothing false either: "could not read" is never drawn as "none".
      for (final lie in _lies) {
        expect(find.textContaining(lie), findsNothing, reason: '$tab says "$lie" with no signal');
      }
      if (tab == 'Attendance') {
        expect(find.descendant(of: find.byType(CalendarScreen), matching: find.text('Absent')), findsNothing,
            reason: 'a month that could not be read is not a month of absences');
        expect(find.textContaining('No signal'), findsWidgets);
      }
    }

    // The pages under More.
    for (final page in ['My Profile', 'View Payslip', 'My Corrections', 'Settings']) {
      await t.tap(find.text('More').last);
      await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
      await t.tap(find.text(page).first);
      await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
      _expectCalm(t, page);
      expect(find.byType(CircularProgressIndicator), findsNothing, reason: '$page still spinning');
      for (final lie in _lies) {
        expect(find.textContaining(lie), findsNothing, reason: '$page says "$lie" with no signal');
      }
      await t.pageBack();
      await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    }
    PunchQueue.I.stop();
  });

  testWidgets('a punch with no signal is kept on the phone and says so', (t) async {
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(EmployeeShell), findsOneWidget);
    final before = PunchQueue.I.count.value;

    await t.tap(find.widgetWithText(FilledButton, 'Punch In'));
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(PunchScreen), findsOneWidget);
    _expectCalm(t, 'punch screen');

    await t.tap(find.byIcon(Icons.fingerprint));
    // The camera, the GPS and the phone's details answer in real time, not in
    // the test's clock: let real time run in short steps until the punch is done.
    for (var i = 0; i < 60 && find.byType(PunchDoneScreen).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await t.pump(const Duration(milliseconds: 100));
    }
    await t.pump(const Duration(milliseconds: 500));
    expect(find.byType(PunchDoneScreen), findsOneWidget, reason: 'the punch finished');
    _expectCalm(t, 'after the punch');
    expect(PunchQueue.I.count.value, before + 1, reason: 'the punch is kept on the phone');
    expect(find.textContaining('saved on this phone'), findsOneWidget);
    // Not "successfully": it is not on the site yet.
    expect(find.text('Punch In kept on this phone'), findsOneWidget);
    expect(find.textContaining('successfully'), findsNothing);
    PunchQueue.I.stop();
  });

  testWidgets('a signed-in phone with no signal and nothing remembered says so and offers to try again, '
      'never the sign-in form', (t) async {
    // Signed in once, but the employee was never read on this phone.
    SharedPreferences.setMockInitialValues({});
    await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-001', password: '01011990');
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.text(kNoSignal), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Try again'), findsOneWidget);
    _expectCalm(t, 'start with no signal');
    await t.tap(find.widgetWithText(FilledButton, 'Try again'));
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.text(kNoSignal), findsOneWidget);
  });

  testWidgets('on a network that answers nothing, the phone opens on its owner\'s home within seconds', (t) async {
    // Connected to nothing: every request hangs for fifteen seconds and fails.
    Session.testAdapter = _Slow(const Duration(seconds: 15));
    await t.pumpWidget(const MannaHrApp());
    await t.pump(const Duration(seconds: 1));
    expect(find.byType(EmployeeShell), findsNothing, reason: 'still trying the site');
    await t.pump(kSlowStart);
    await t.pump(const Duration(milliseconds: 500));
    await t.pump(const Duration(milliseconds: 500));
    expect(find.byType(EmployeeShell), findsOneWidget, reason: 'not left on the splash for the time-outs');
    expect(find.byType(LoginScreen), findsNothing);
    // Let the slow requests run out, so the test ends with nothing pending.
    for (var i = 0; i < 40; i++) {
      await t.pump(const Duration(seconds: 1));
    }
    expect(find.byType(LoginScreen), findsNothing);
    _expectCalm(t, 'home after a slow start');
    PunchQueue.I.stop();
  });

  testWidgets('a punch kept with no signal counts on the home card: in, and Punch Out is the bright button',
      (t) async {
    final now = ServerClock.I.now();
    await PunchQueue.I.add(PendingPunch(
      id: '1',
      employee: 'HR-EMP-00125',
      logType: kLogIn,
      time: '${isoDay(now)} 08:02:00',
    ));
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(EmployeeShell), findsOneWidget);
    expect(find.text("You're punched in"), findsOneWidget, reason: 'not "You haven\'t punched in"');
    expect(find.text('08:02'), findsWidgets);
    _expectCalm(t, 'home with a kept punch');
    PunchQueue.I.stop();
  });

  testWidgets('the latest punch decides: in again after this morning\'s punch-out reads "punched in"', (t) async {
    final today = isoDay(ServerClock.I.now());
    // This morning's 08:35 OUT as last read, and tonight's IN kept with no signal.
    await AuthStore.saveDayPunches(today, [
      {'employee': 'HR-EMP-00125', 'time': '$today 08:35:00', 'log_type': 'OUT'}
    ], employee: 'HR-EMP-00125');
    await PunchQueue.I.add(PendingPunch(id: '1', employee: 'HR-EMP-00125', logType: kLogIn, time: '$today 09:50:00'));
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.text("You're punched in"), findsOneWidget, reason: 'not "punched out, 08:35"');
    expect(find.text('09:50'), findsWidgets);
    PunchQueue.I.stop();
  });

  testWidgets('a night worker the next morning with no signal is on last night\'s shift, not "haven\'t punched in"',
      (t) async {
    // The test clock reads 10:00: thirteen and a half hours after a 20:30 IN.
    final today = isoDay(ServerClock.I.now());
    final d = DateTime.parse(today);
    final yesterday = isoDay(DateTime(d.year, d.month, d.day - 1));
    // Last night's 20:30 IN, kept on the phone with no signal.
    await PunchQueue.I.add(
        PendingPunch(id: '1', employee: 'HR-EMP-00125', logType: kLogIn, time: '$yesterday 20:30:00'));
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.text("You haven't punched in"), findsNothing);
    expect(find.textContaining("last night's shift"), findsOneWidget);
    PunchQueue.I.stop();
  });

  testWidgets('the Punch screen: the time, the face in a circle, the map, the street and one wide button, '
      'calm on a phone whose camera and GPS cannot be used', (t) async {
    // The smallest phone the app is drawn for.
    t.view.physicalSize = const Size(320, 568);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(const MannaHrApp());
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    await t.tap(find.widgetWithText(FilledButton, 'Punch In'));
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 30));
    expect(find.byType(PunchScreen), findsOneWidget);
    expect(find.byKey(const Key('punch-clock')), findsOneWidget);
    expect(find.byKey(const Key('selfie')), findsOneWidget);
    expect(find.byKey(const Key('punch-map')), findsOneWidget);
    expect(find.text('Punch History'), findsOneWidget);
    expect(find.byKey(const Key('punch-button')), findsOneWidget);
    // Still while the camera opens: no spinner turning for ever.
    expect(find.byType(CircularProgressIndicator), findsNothing);
    // Let the camera and the GPS answer (here: there are none).
    for (var i = 0; i < 30 && find.text(kCameraFailed).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(find.text(kCameraFailed), findsOneWidget, reason: 'says why there is no picture, and that the punch still goes');
    expect(find.text('Try again'), findsWidgets);
    _expectCalm(t, 'punch screen');
    // The button stays on screen, above everything, on the smallest phone.
    final button = t.getRect(find.byKey(const Key('punch-button')));
    expect(button.bottom, lessThanOrEqualTo(568));
    expect(button.width, greaterThan(250));
    PunchQueue.I.stop();
  });
}
