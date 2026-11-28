import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/punch_queue.dart';

/// Sending the punches kept while there was no signal (asked for 18 November
/// 2026), against a pretend site that is down and then comes back. This is the
/// part a unit test of the rules cannot show: order, original time, and no
/// punch made twice.
class FakeSite implements HttpClientAdapter {
  bool up = false;
  int status = 201;
  String refusal = '';

  /// Answers a punch with 200 and nothing in it — a network in between, not
  /// the site's insert.
  bool emptyAnswer = false;

  /// Checkins already on the pretend site: "time|type".
  final onSite = <String>{};
  final posted = <Map<String, dynamic>>[];

  @override
  void close({bool force = false}) {}

  ResponseBody _json(Object body, int code) => ResponseBody.fromString(
        jsonEncode(body),
        code,
        headers: {Headers.contentTypeHeader: ['application/json'], 'date': [HttpDate.format(DateTime.now().toUtc())]},
      );

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    if (!up) {
      throw DioException(requestOptions: o, type: DioExceptionType.connectionError, message: 'no signal');
    }
    if (o.method == 'GET') {
      // The duplicate check: an exact time, or a window of them (">=" and
      // "<="), compared as strings the way Frappe compares a Datetime.
      final filters = jsonDecode('${o.queryParameters['filters'] ?? '[]'}') as List;
      String? exact, from, to, type;
      for (final f in filters) {
        if (f[0] == 'time' && f[1] == '=') exact = '${f[2]}';
        if (f[0] == 'time' && f[1] == '>=') from = '${f[2]}';
        if (f[0] == 'time' && f[1] == '<=') to = '${f[2]}';
        if (f[0] == 'log_type') type = '${f[2]}';
      }
      final found = onSite.any((row) {
        final parts = row.split('|');
        if (parts[1] != type) return false;
        if (exact != null) return parts[0] == exact;
        return (from == null || parts[0].compareTo(from) >= 0) && (to == null || parts[0].compareTo(to) <= 0);
      });
      return _json({'data': found ? [{'name': 'x'}] : []}, 200);
    }
    final data = Map<String, dynamic>.from(o.data as Map);
    if (emptyAnswer) return _json({}, 200);
    if (status >= 400) return _json({'_server_messages': jsonEncode([jsonEncode({'message': refusal})])}, status);
    posted.add(data);
    onSite.add('${data['time']}|${data['log_type']}');
    // The site's insert answers with the new checkin, name and all.
    return _json({'data': {...data, 'name': 'EMP-CKIN-${posted.length}'}}, 201);
  }
}

class HttpDate {
  static String format(DateTime d) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    String t(int n) => n.toString().padLeft(2, '0');
    return '${days[d.weekday - 1]}, ${t(d.day)} ${months[d.month - 1]} ${d.year} ${t(d.hour)}:${t(d.minute)}:${t(d.second)} GMT';
  }
}

void main() {
  final site = FakeSite();
  final today = DateTime.now();
  String at(int h, int m) {
    final d = DateTime(today.year, today.month, today.day, h, m);
    String t(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${t(d.month)}-${t(d.day)} ${t(d.hour)}:${t(d.minute)}:00';
  }

  PendingPunch punch(String id, String type, String time) => PendingPunch(
      id: id, employee: 'HR-EMP-1', logType: type, time: time, latitude: 9.5, longitude: 76.6, device: 'vivo');

  setUp(() async {
    Api.site = 'https://site.invalid';
    SharedPreferences.setMockInitialValues({});
    Session.I.init(url: 'https://site.invalid');
    Session.I.dio.httpClientAdapter = site;
    Session.I.employee = {'name': 'HR-EMP-1'};
    Session.I.user = 'a@x.in';
    Session.I.csrfToken = 'token';
    Session.I.offlineStart = false;
    ServerClock.I.restore(Duration.zero);
    site
      ..up = false
      ..status = 201
      ..refusal = ''
      ..emptyAnswer = false
      ..onSite.clear()
      ..posted.clear();
    PunchQueue.I.stop();
    await PunchQueue.I.load();
  });

  test('while there is no signal nothing is sent and nothing is lost', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    expect(await PunchQueue.I.flush(), 0);
    expect(PunchQueue.I.count.value, 1);
    expect(site.posted, isEmpty);
  });

  test('when the signal returns they go oldest first, with the time they were made and the queued marker', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    await PunchQueue.I.add(punch('2', 'OUT', at(12, 31)));
    site.up = true;
    expect(await PunchQueue.I.flush(), 2);
    expect(site.posted.map((p) => '${p['log_type']} ${p['time']}'), ['IN ${at(8, 2)}', 'OUT ${at(12, 31)}']);
    expect(site.posted.every((p) => '${p['device_id']}'.endsWith('-Q')), isTrue);
    expect(PunchQueue.I.count.value, 0);
  });

  test('a punch whose answer was lost is not made twice', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    site.up = true;
    site.onSite.add('${at(8, 2)}|IN'); // it got there; only the reply was lost
    expect(await PunchQueue.I.flush(), 1);
    expect(site.posted, isEmpty);
    expect(PunchQueue.I.count.value, 0);
  });

  test('a punch that landed live, and was kept when its answer was lost, is not sent again', () async {
    // Pressed at 08:02:00; the site stamped its own clock when it arrived,
    // twenty seconds later, after the photo upload.
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    site.up = true;
    site.onSite.add('${at(8, 2).substring(0, 17)}20|IN');
    expect(await PunchQueue.I.flush(), 1);
    expect(site.posted, isEmpty);
    expect(PunchQueue.I.count.value, 0);
  });

  test('an OUT just after an IN, or an IN hours after one, is a punch of its own', () async {
    site.onSite.add('${at(8, 2).substring(0, 17)}20|IN');
    await PunchQueue.I.add(punch('1', 'OUT', at(8, 3)));
    await PunchQueue.I.add(punch('2', 'IN', at(13, 0)));
    site.up = true;
    expect(await PunchQueue.I.flush(), 2);
    expect(site.posted.map((p) => '${p['log_type']} ${p['time']}'), ['OUT ${at(8, 3)}', 'IN ${at(13, 0)}']);
  });

  test('an answer with no checkin in it is not taken as sent: the punch waits', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    site
      ..up = true
      ..emptyAnswer = true;
    expect(await PunchQueue.I.flush(), 0);
    expect(PunchQueue.I.count.value, 1);
    expect(PunchQueue.I.problems.value, isEmpty);
  });

  test('Send now pressed while a send is running gets that send\'s answer, and nothing goes twice', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    site.up = true;
    final first = PunchQueue.I.flush();
    final again = PunchQueue.I.flush();
    expect(await first, 1);
    expect(await again, 1, reason: 'not a 0 that reads as "still no signal"');
    expect(site.posted, hasLength(1));
  });

  test('a punch the site refuses is not kept for ever: it leaves with the site\'s own sentence', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    site
      ..up = true
      ..status = 417
      ..refusal = 'You are 3.2 km from Rubber Park';
    expect(await PunchQueue.I.flush(), 0);
    expect(PunchQueue.I.count.value, 0);
    expect(PunchQueue.I.problems.value.single, contains('3.2 km from Rubber Park'));
    await PunchQueue.I.dismissProblems();
    expect(PunchQueue.I.problems.value, isEmpty);
  });

  test('a punch too old for the site to believe is not sent, and says to ask for a correction', () async {
    final old = DateTime.now().subtract(const Duration(hours: 60));
    String t(int n) => n.toString().padLeft(2, '0');
    final time = '${old.year}-${t(old.month)}-${t(old.day)} ${t(old.hour)}:${t(old.minute)}:00';
    await PunchQueue.I.add(punch('1', 'IN', time));
    site.up = true;
    await PunchQueue.I.flush();
    expect(site.posted, isEmpty);
    expect(PunchQueue.I.problems.value.single, contains('Ask for a correction'));
  });

  test('somebody else\'s punch is left alone when another person is signed in', () async {
    await PunchQueue.I.add(punch('1', 'IN', at(8, 2)));
    Session.I.employee = {'name': 'HR-EMP-2'};
    site.up = true;
    expect(await PunchQueue.I.flush(), 0);
    expect(PunchQueue.I.count.value, 1);
    expect(site.posted, isEmpty);
  });

  group('opening the app with no signal', () {
    test('opens on what the phone remembers instead of the sign-in screen', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'a@x.in', password: 'pw-123456');
      await AuthStore.saveEmployee({'name': 'HR-EMP-1', 'employee_name': 'Anand'});
      Session.I.employee = null;
      site.up = false;
      final emp = await Api.restore();
      Session.I.dio.httpClientAdapter = site;
      expect(emp?['name'], 'HR-EMP-1');
      expect(Session.I.offlineStart, isTrue);
      expect(Session.I.employeeId, 'HR-EMP-1');
    });

    test('has nothing to open on if this phone never got far enough to remember anybody — and says no signal, '
        'never the sign-in form for a signed-in phone', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'a@x.in', password: 'pw-123456');
      Session.I.offlineStart = false;
      await expectLater(Api.restore(), throwsA(isA<NoSignalAtStart>()));
      expect(Session.I.offlineStart, isFalse);
      // The login is kept for when the signal comes back.
      expect((await AuthStore.load()).canReauth, isTrue);
    });

    test('never opens offline as the last person on a shared phone', () async {
      await AuthStore.saveEmployee({'name': 'HR-EMP-9', 'employee_name': 'Somebody Else'}, login: 'b@x.in');
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'a@x.in', password: 'pw-123456');
      Session.I.employee = null;
      await expectLater(Api.restore(), throwsA(isA<NoSignalAtStart>()));
      expect(Session.I.employee, isNull);
    });
  });
}
