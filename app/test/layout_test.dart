import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/employee_shell.dart';
import 'package:manna_hr_app/screens/login_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/punch_queue.dart';

/// Every main screen fits every phone and tablet (25 November 2026: "it must
/// be responsive on all phones, and on tablets"). Each screen is drawn at each
/// size against a pretend site with a full month on it; a row that does not
/// fit is a Flutter overflow error, which fails the test.
///
/// `flutter test test/layout_test.dart --dart-define=SHOTS=<folder>` also
/// saves a picture of each, with the real fonts, for a person to look at.
const _shots = String.fromEnvironment('SHOTS');

/// A pretend site: today's punch, a month of days, two leave requests, a
/// correction and three kinds of leave balance.
class _Site implements HttpClientAdapter {
  _Site(this.today);

  final DateTime today;

  String _d(int day) =>
      '${today.year}-${today.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> get _punches => [
        for (var day = 1; day < today.day; day++)
          if (DateTime(today.year, today.month, day).weekday != DateTime.sunday) ...[
            {'name': 'IN-$day', 'employee': 'HR-EMP-1', 'time': '${_d(day)} 08:5${day % 10}:00', 'log_type': 'IN'},
            {'name': 'OUT-$day', 'employee': 'HR-EMP-1', 'time': '${_d(day)} 17:1${day % 10}:00', 'log_type': 'OUT'},
          ],
        {'name': 'IN-today', 'employee': 'HR-EMP-1', 'time': '${_d(today.day)} 09:12:00', 'log_type': 'IN'},
      ];

  @override
  void close({bool force = false}) {}

  ResponseBody _json(Object body) => ResponseBody.fromString(jsonEncode(body), 200,
      headers: {Headers.contentTypeHeader: ['application/json']});

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    final path = Uri.decodeComponent(o.path);
    if (path.contains('get_leave_details')) {
      return _json({
        'message': {
          'leave_allocation': {
            'Casual Leave': {'total_leaves': 12, 'leaves_taken': 7, 'remaining_leaves': 5},
            'Earned Leave': {'total_leaves': 15, 'leaves_taken': 3, 'remaining_leaves': 12},
            'Sick Leave': {'total_leaves': 6, 'leaves_taken': 2, 'remaining_leaves': 4},
          },
          'lwps': ['Leave Without Pay'],
        }
      });
    }
    if (path.contains('Employee Checkin')) {
      final filters = jsonDecode('${o.queryParameters['filters'] ?? '[]'}') as List;
      var rows = _punches;
      for (final f in filters) {
        if (f[0] == 'time' && f[1] == '>=') rows = rows.where((r) => '${r['time']}'.compareTo('${f[2]}') >= 0).toList();
        if (f[0] == 'time' && f[1] == '<=') rows = rows.where((r) => '${r['time']}'.compareTo('${f[2]}') <= 0).toList();
      }
      return _json({'data': rows});
    }
    if (path.contains('Leave Application')) {
      final last = today.day > 3 ? today.day - 3 : 1;
      return _json({
        'data': [
          {'name': 'L1', 'leave_type': 'Casual Leave', 'from_date': _d(last), 'to_date': _d(last),
           'total_leave_days': 1, 'status': 'Approved', 'docstatus': 1, 'half_day': 0,
           'description': 'Family function at home'},
          {'name': 'L2', 'leave_type': 'Earned Leave', 'from_date': _d(today.day), 'to_date': _d(today.day),
           'total_leave_days': 1, 'status': 'Open', 'docstatus': 0, 'half_day': 0},
        ]
      });
    }
    if (path.contains('Attendance Regularization')) {
      return _json({
        'data': [
          {'name': 'R1', 'attendance_date': _d(1), 'status': 'Pending Approval', 'reason': 'Gate machine missed me',
           'creation': '${_d(1)} 10:00:00'},
        ]
      });
    }
    return _json({'data': <Object>[], 'message': null});
  }
}

Future<void> _fonts() async {
  Future<void> family(String name, List<String> files, {bool disk = false}) async {
    final l = FontLoader(name);
    for (final f in files) {
      l.addFont(disk ? Future.value(ByteData.sublistView(File(f).readAsBytesSync())) : rootBundle.load(f));
    }
    await l.load();
  }

  await family('PlusJakartaSans', [
    for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) 'assets/fonts/PlusJakartaSans-$w.ttf'
  ]);
  // Only for the pictures: the phone's serif is not on a test machine, so
  // Georgia stands in for it, and the icons come from the Flutter SDK.
  const flutter = String.fromEnvironment('FLUTTER_ROOT');
  if (flutter.isNotEmpty) {
    await family('MaterialIcons', ['$flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf'], disk: true);
  }
  if (File('C:/Windows/Fonts/georgia.ttf').existsSync()) {
    await family('serif', ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/georgiab.ttf'], disk: true);
  }
}

final _frame = GlobalKey();

Future<void> _shot(WidgetTester t, String name) async {
  if (_shots.isEmpty) return;
  final box = _frame.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await t.runAsync(() async {
    final img = await box.toImage(pixelRatio: 2);
    final png = await img.toByteData(format: ui.ImageByteFormat.png);
    File('$_shots/$name.png').writeAsBytesSync(png!.buffer.asUint8List());
  });
}

void main() {
  final today = DateTime.now();
  const sizes = {
    'small-phone': Size(320, 640),
    'phone': Size(360, 780),
    'big-phone': Size(412, 915),
    'tablet': Size(800, 1280),
    'big-tablet': Size(1200, 1920),
  };

  setUpAll(() async {
    if (_shots.isNotEmpty) {
      Directory(_shots).createSync(recursive: true);
      await _fonts();
    }
  });

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    Api.site = 'https://site.invalid';
    Session.I.init(url: 'https://site.invalid');
    Session.I.dio.httpClientAdapter = _Site(today);
    Session.I.employee = {
      'name': 'HR-EMP-1',
      'employee_name': 'Anandakrishnan Raghavan Pillai',
      'designation': 'Senior Machine Operator',
      'employee_number': 'MR-1041',
    };
  });
  tearDown(() => Session.I.employee = null);

  Future<void> show(WidgetTester t, Size size, Widget home, {double text = 1}) async {
    t.view.physicalSize = size * 2;
    t.view.devicePixelRatio = 2;
    t.platformDispatcher.textScaleFactorTestValue = text;
    addTearDown(t.view.reset);
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    await t.pumpWidget(RepaintBoundary(key: _frame, child: MannaHrApp(home: home)));
    await t.pumpAndSettle();
  }

  for (final e in sizes.entries) {
    testWidgets('every employee tab fits a ${e.key} (${e.value.width.toInt()} wide)', (t) async {
      await show(t, e.value, const EmployeeShell());
      expect(find.text('This month'), findsOneWidget);
      await _shot(t, '${e.key}-1-home');
      for (final (tab, name) in [('Attendance', 'attendance'), ('My leave', 'leave'), ('More', 'more')]) {
        await t.tap(find.text(tab).last);
        await t.pumpAndSettle();
        await _shot(t, '${e.key}-${tab == 'Attendance' ? 2 : tab == 'My leave' ? 3 : 4}-$name');
      }
      PunchQueue.I.stop();
    });

    testWidgets('the sign-in screen fits a ${e.key}', (t) async {
      await show(t, e.value, const LoginScreen());
      await _shot(t, '${e.key}-0-sign-in');
    });
  }

  testWidgets('large text on a small phone still fits', (t) async {
    await show(t, const Size(360, 780), const EmployeeShell(), text: 1.3);
    await _shot(t, 'large-text-1-home');
    await t.tap(find.text('My leave').last);
    await t.pumpAndSettle();
    await _shot(t, 'large-text-3-leave');
    PunchQueue.I.stop();
  });
}
