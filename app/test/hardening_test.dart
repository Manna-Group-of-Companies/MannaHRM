import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/day.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/services/punch_queue.dart';

/// The bugs found going through the whole app before it goes live
/// (27 November 2026: "no bug must ever show, and it must work with no
/// internet"). Each test is one of them, pinned so it cannot come back.

/// A pretend site that answers whatever [handler] says, and remembers what it
/// was asked.
class _Site implements HttpClientAdapter {
  final asked = <String>[];
  late ResponseBody Function(RequestOptions o) handler;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    asked.add('${o.method} ${o.path}');
    return handler(o);
  }
}

ResponseBody _json(Object? body, int code, {Map<String, List<String>> headers = const {}}) => ResponseBody.fromString(
      jsonEncode(body),
      code,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
        ...headers,
      },
    );

Never _offline(RequestOptions o) =>
    throw DioException(requestOptions: o, type: DioExceptionType.connectionError, message: 'no signal');

const _user = 'mrp-293@phone.manna.invalid';
const _paul = {'name': 'HR-EMP-00125', 'employee_name': 'PAUL SUNNY', 'employee_number': 'MRP-293', 'status': 'Active'};

void main() {
  late _Site site;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    site = _Site();
    Session.testAdapter = site;
    Api.site = 'https://site.invalid';
    Session.I.init(url: 'https://site.invalid');
    Session.I.clearAuth();
    Session.I.email = '';
    Session.I.offlineStart = false;
    Session.I.reauthenticate = null;
    ServerClock.I.restore(Duration.zero);
    PunchQueue.I.stop();
    await PunchQueue.I.load();
  });

  tearDown(() {
    Session.testAdapter = null;
    PunchQueue.I.stop();
  });

  group('no signal is no signal, whatever it is called', () {
    final o = RequestOptions(path: '/x');
    Response<dynamic> answer(int code) => Response(requestOptions: o, statusCode: code);

    test('every way of not reaching the site keeps a punch, and only those', () {
      expect(isNetworkFailure(const SocketException('Failed host lookup')), isTrue);
      // A gate's Wi-Fi answering with its own sign-in page breaks the handshake.
      expect(isNetworkFailure(TlsException('handshake')), isTrue);
      expect(isNetworkFailure(HandshakeException('wrong host')), isTrue);
      expect(isNetworkFailure(HttpException('Connection closed before full header was received')), isTrue);
      expect(isNetworkFailure(DioException(requestOptions: o, type: DioExceptionType.badCertificate)), isTrue);
      expect(isNetworkFailure(DioException(requestOptions: o, error: HandshakeException('x'))), isTrue);
      expect(isNetworkFailure(DioException(requestOptions: o, type: DioExceptionType.connectionTimeout)), isTrue);
      // The site restarting is not the site refusing.
      expect(isNetworkFailure(DioException.badResponse(statusCode: 502, requestOptions: o, response: answer(502))),
          isTrue);
      // The site's own refusal is read, never kept and re-sent.
      expect(isNetworkFailure(DioException.badResponse(statusCode: 417, requestOptions: o, response: answer(417))),
          isFalse);
      expect(isNetworkFailure(DioException(requestOptions: o, type: DioExceptionType.cancel)), isFalse);
      expect(isNetworkFailure(const Refused('You are 1.4 km from Keezhillam.')), isFalse);
    });

    test('no screen shows an exception\'s raw words, and no signal reads the same everywhere', () {
      expect(humanError(StateError('Bad state: No element')), 'Something went wrong. Try again.');
      expect(humanError(TypeError()), 'Something went wrong. Try again.');
      expect(humanError(const FormatException('Unexpected character')), 'Something went wrong. Try again.');
      expect(humanError(DioException(requestOptions: o, type: DioExceptionType.connectionError)), kNoSignal);
      expect(humanError(const SocketException('Failed host lookup')), kNoSignal);
      expect(humanError(HandshakeException('x')), kNoSignal);
      // Not a punch's words on a leave form any more.
      expect(kNoSignal, isNot(contains('punch')));
      // The site's own sentence still wins.
      expect(humanError(const Refused('You are 1.4 km from Keezhillam.')), 'You are 1.4 km from Keezhillam.');
    });
  });

  group('the connection', () {
    test('a phone connected to nothing gives up reaching the site in ten seconds', () {
      expect(Session.I.dio.options.connectTimeout, const Duration(seconds: 10));
    });

    test('a silent re-login drops the session but keeps who it is; signing out forgets both', () {
      Session.I
        ..employee = Map.of(_paul)
        ..isAdmin = true
        ..sid = 's'
        ..csrfToken = 't'
        ..user = _user;
      Session.I.clearSession();
      expect(Session.I.employeeId, 'HR-EMP-00125');
      expect(Session.I.isAdmin, isTrue);
      expect(Session.I.sid, isEmpty);
      expect(Session.I.csrfToken, isEmpty);
      Session.I.clearAuth();
      expect(Session.I.employee, isNull);
      expect(Session.I.isAdmin, isFalse);
    });
  });

  group('signing back in', () {
    var signedIn = false;
    var logins = 0;
    var expired = false;
    var employeeAnswers = true;
    final posted = <Map<String, dynamic>>[];

    setUp(() {
      signedIn = false;
      logins = 0;
      expired = false;
      employeeAnswers = true;
      posted.clear();
      site.handler = (o) {
        final p = o.path;
        if (p.contains('/api/method/login')) {
          logins++;
          signedIn = true;
          expired = false;
          return _json({'message': 'Logged In'}, 200, headers: {
            'set-cookie': ['sid=sid$logins; path=/; HttpOnly'],
          });
        }
        if (p.contains('frappe.auth.get_logged_user')) {
          return _json({'message': signedIn && !expired ? _user : 'Guest'}, 200);
        }
        if (p == '/app') {
          return ResponseBody.fromString('<script>frappe.boot = {"csrf_token": "tok$logins"}</script>', 200,
              headers: {Headers.contentTypeHeader: ['text/html']});
        }
        if (p.contains('Employee%20Checkin')) {
          if (expired) return _json({'exc_type': 'PermissionError'}, 403);
          if (o.method == 'GET') return _json({'data': []}, 200);
          final data = Map<String, dynamic>.from(o.data as Map);
          posted.add(data);
          return _json({'data': {...data, 'name': 'EMP-CKIN-${posted.length}'}}, 201);
        }
        if (p.contains('/api/resource/Employee')) {
          if (!employeeAnswers) _offline(o);
          return _json({'data': [_paul]}, 200);
        }
        return _json({'message': null}, 404);
      };
    });

    test('a kept punch sent after the site\'s session expired is sent, for the same person', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: '24032005');
      final emp = await Api.restore();
      expect(emp?['name'], 'HR-EMP-00125');

      await PunchQueue.I.add(const PendingPunch(
          id: '1', employee: 'HR-EMP-00125', logType: 'IN', time: '2026-11-27 08:02:00', device: 'vivo'));
      // The site's session runs out while the punch waits.
      expect(logins, 1);
      expect(Session.I.csrfToken, isNotEmpty);
      // Its time must be recent enough for the site to take.
      ServerClock.I.restore(DateTime(2026, 11, 27, 9).difference(DateTime.now()));
      expired = true;

      expect(await PunchQueue.I.flush(), 1);
      expect(logins, 2, reason: 'signed in again by itself');
      expect(posted.single['employee'], 'HR-EMP-00125');
      expect(Session.I.employeeId, 'HR-EMP-00125', reason: 'the re-login kept who this is');
      expect(PunchQueue.I.count.value, 0);
      expect(PunchQueue.I.problems.value, isEmpty, reason: 'nothing dropped as "not linked"');
    });

    test('a start where the sign-in answers and the employee read does not still opens as the owner', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: '24032005');
      await AuthStore.saveEmployee(Map.of(_paul));
      employeeAnswers = false;
      final emp = await Api.restore();
      expect(emp?['name'], 'HR-EMP-00125');
      expect(Session.I.employeeId, 'HR-EMP-00125');
    });

    test('a fresh sign-in on the form never borrows the last person\'s record', () async {
      await AuthStore.saveEmployee({'name': 'HR-EMP-00999', 'employee_name': 'SOMEBODY ELSE'});
      Session.I.employee = {'name': 'HR-EMP-00999'};
      employeeAnswers = false;
      final emp = await Api.login(email: 'MRP-293', password: '24032005');
      expect(emp, isNull);
      expect(Session.I.employee, isNull);
    });

    test('a password changed on the site is done even when signing in again then fails', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: 'old-pass-1');
      Session.I.email = 'MRP-293';
      site.handler = (o) {
        if (o.path.contains('update_password')) return _json({'message': null}, 200);
        return _offline(o);
      };
      await Api.changePassword(current: 'old-pass-1', next: 'new-pass-22');
      expect((await AuthStore.load()).password, 'new-pass-22');
    });
  });

  group('reads with no signal', () {
    setUp(() {
      Session.I.employee = {'name': 'HR-EMP-00125', 'company': 'Manna Rubber Products Private Limited'};
      site.handler = _offline;
    });

    test('a month with no signal says so, is not drawn as absences, and waits once, not twice', () async {
      final d = await Api.month('2026-11');
      expect(d.punchesUnread, isTrue, reason: 'the calendar then draws no Absent days');
      expect(d.offline, isTrue);
      expect(d.noHolidayList, isFalse, reason: 'nothing to tell HR about');
      expect(d.error, contains('No signal'));
      // Three reads and the holidays, each tried once: no short-list retry and
      // no chain of holiday fallbacks on a dead network.
      expect(site.asked, hasLength(4));
    });

    test('corrections that could not be read are not "you have asked for none"', () async {
      await expectLater(Api.myCorrections(), throwsA(isA<Refused>()));
    });
  });

  group('months, logins and the phone\'s memory', () {
    test('a month without a 31st is read to its real last day, never to 31 November', () async {
      Session.I.employee = {'name': 'HR-EMP-00125'};
      final asked = <String>[];
      site.handler = (o) {
        asked.add('${o.queryParameters['filters'] ?? ''}');
        return _json({'data': [], 'message': {'holidays': []}}, 200);
      };
      await Api.month('2026-11');
      expect(asked.join(' '), isNot(contains('2026-11-31')));
      expect(asked.join(' '), contains('2026-11-30'));
      asked.clear();
      await Api.month('2026-02');
      expect(asked.join(' '), contains('2026-02-28'));
    });

    test('a login with no employee is said, not drawn as a month of absences', () async {
      Session.I.employee = null;
      final d = await Api.month('2026-11');
      expect(d.punchesUnread, isTrue);
      expect(d.error, contains('No employee record'));
    });

    test('the phone opens offline only as the login it remembered, and forgets it all on sign-out', () async {
      await AuthStore.saveEmployee(Map.of(_paul), login: 'MRP-293');
      expect((await AuthStore.loadEmployee(forLogin: 'mrp-293'))?['name'], 'HR-EMP-00125');
      expect(await AuthStore.loadEmployee(forLogin: 'MRP-500'), isNull);
      await AuthStore.saveDayPunches('2026-11-27', [
        {'time': '2026-11-27 08:02:00', 'log_type': 'IN'}
      ], employee: 'HR-EMP-00125');
      expect(await AuthStore.loadDayPunches('2026-11-27', employee: 'HR-EMP-00999'), isNull);
      await AuthStore.saveAdmin('MRP-293', true);
      await AuthStore.clear();
      expect(await AuthStore.loadEmployee(forLogin: 'MRP-293'), isNull);
      expect(await AuthStore.loadDayPunches('2026-11-27', employee: 'HR-EMP-00125'), isNull);
      expect(await AuthStore.loadAdmin('MRP-293'), isNull);
    });

    test('HR stays HR when the one question that says so cannot be asked', () async {
      Session.I.email = 'MRP-001';
      site.handler = (o) => _json({'message': {'has_permission': true}}, 200);
      expect(await Api.isAdmin(), isTrue);
      site.handler = _offline;
      expect(await Api.isAdmin(), isTrue, reason: 'remembered, not read as "no"');
      Session.I.email = 'MRP-293';
      expect(await Api.isAdmin(), isFalse, reason: 'somebody else is not HR by memory');
    });

    test('a site rationing requests (429) opens a signed-in phone offline, never on the sign-in form', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: '24032005');
      await AuthStore.saveEmployee(Map.of(_paul), login: 'MRP-293');
      site.handler = (o) => _json({'message': 'Too many requests'}, 429);
      final emp = await Api.restore();
      expect(emp?['name'], 'HR-EMP-00125');
      expect(Session.I.offlineStart, isTrue);
    });

    test('a 429 on the sign-in form says so, not "Wrong Emp Code or password"', () async {
      site.handler = (o) => _json({'message': 'Too many requests'}, 429);
      Object? caught;
      try {
        await Api.login(email: 'MRP-293', password: '24032005');
      } catch (e) {
        caught = e;
      }
      expect(humanError(caught), contains('Too many requests'));
    });

    test('a kept password the site refuses is not tried again and again: the app asks to sign in again', () async {
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: 'old-dob');
      Session.I.offlineStart = true;
      var logins = 0;
      site.handler = (o) {
        if (o.path.contains('/api/method/login')) {
          logins++;
          return _json({'message': 'Incorrect password'}, 401);
        }
        return _json({'message': null}, 200);
      };
      expect(await Api.goOnline(), isFalse);
      expect(Session.I.signInAgain.value, isTrue);
      expect(await Api.goOnline(), isFalse);
      expect(logins, 1, reason: 'ten wrong ones in a row lock the login');
      await Api.logout();
      expect(Session.I.signInAgain.value, isFalse);
    });

    test('a write refused for its token is sent once more with a fresh one', () async {
      Session.I.employee = Map.of(_paul);
      Session.I.csrfToken = 'old';
      // Wire the hooks the way a start does.
      await AuthStore.saveLogin(siteUrl: 'https://site.invalid', email: 'MRP-293', password: '24032005');
      var posts = 0;
      site.handler = (o) {
        if (o.path == '/app') {
          return ResponseBody.fromString('"csrf_token": "fresh1"', 200, headers: {Headers.contentTypeHeader: ['text/html']});
        }
        if (o.path.contains('get_logged_user')) return _json({'message': _user}, 200);
        if (o.path.contains('Employee%20Checkin') && o.method == 'POST') {
          posts++;
          if (o.headers['X-Frappe-CSRF-Token'] != 'fresh1') {
            return _json({'exc_type': 'CSRFTokenError', '_server_messages': '["{\\"message\\": \\"Invalid Request\\"}"]'},
                400);
          }
          return _json({'data': {'name': 'EMP-CKIN-9'}}, 201);
        }
        return _json({'data': [_paul]}, 200);
      };
      await Api.restore();
      Session.I.csrfToken = 'old';
      final made = await Api.punch(logType: 'IN');
      expect(made['name'], 'EMP-CKIN-9');
      expect(posts, 2);
    });

    test('a kept punch is sent for the person who made it, by name', () async {
      Session.I.employee = {'name': 'HR-EMP-00125'};
      final posted = <Map<String, dynamic>>[];
      site.handler = (o) {
        posted.add(Map<String, dynamic>.from(o.data as Map));
        return _json({'data': {'name': 'EMP-CKIN-1'}}, 201);
      };
      Session.I.csrfToken = 't';
      await Api.punch(logType: 'IN', at: '2026-11-27 08:02:00', queued: true, employee: 'HR-EMP-00125');
      expect(posted.single['employee'], 'HR-EMP-00125');
      expect('${posted.single['device_id']}', endsWith('-Q'));
    });
  });

  group('nights and clocks', () {
    Map<String, dynamic> pr(String time, String type) => {'time': time, 'log_type': type};

    test('a week of nights is a week of whole days, each with its hours, none "Still in"', () {
      final punches = [
        for (final d in ['02', '03', '04']) ...[
          pr('2026-11-$d 20:30:00', 'IN'),
          pr('2026-11-${(int.parse(d) + 1).toString().padLeft(2, '0')} 08:30:00', 'OUT'),
        ],
      ];
      final rows = monthRoster(
          ym: '2026-11', punches: punches, leave: const [], holidays: const [], corrections: const [], today: '2026-11-27');
      RosterDay day(String iso) => rows.firstWhere((r) => r.iso == iso);
      for (final d in ['2026-11-02', '2026-11-03', '2026-11-04']) {
        expect(day(d).status, DayStatus.present, reason: '$d is a whole night');
        expect(day(d).hours, '12:00', reason: '$d has its hours');
      }
      // The morning after the last night has only that night's end on it, and
      // so nothing of its own.
      expect(day('2026-11-05').punches, isEmpty);
    });

    test('a day shift is left exactly as it was', () {
      final byDay = byWorkDay([pr('2026-11-02 08:00:00', 'IN'), pr('2026-11-02 17:30:00', 'OUT')]);
      expect(byDay.keys, ['2026-11-02']);
      expect(byDay['2026-11-02'], hasLength(2));
    });

    test('a morning out long after an evening in is a day of its own', () {
      final byDay = byWorkDay([pr('2026-11-02 18:00:00', 'IN'), pr('2026-11-04 08:30:00', 'OUT')]);
      expect(byDay.keys.toSet(), {'2026-11-02', '2026-11-04'});
    });

    test('a past day with a punch-in and no punch-out reads "No punch-out", today reads "Still in"', () {
      final rows = monthRoster(
          ym: '2026-11',
          punches: [pr('2026-11-10 08:00:00', 'IN'), pr('2026-11-27 08:00:00', 'IN')],
          leave: const [],
          holidays: const [],
          corrections: const [],
          today: '2026-11-27');
      expect(rows.firstWhere((r) => r.iso == '2026-11-10').label, 'No punch-out');
      expect(rows.firstWhere((r) => r.iso == '2026-11-27').label, 'Still in');
    });

    test('the site\'s clock is India\'s, built from UTC, whatever zone the phone is set to', () {
      ServerClock.I.restore(Duration.zero);
      final want = DateTime.now().toUtc().add(ServerClock.I.skew).add(const Duration(hours: 5, minutes: 30));
      final got = ServerClock.I.now();
      expect(got.isUtc, isFalse);
      expect(DateTime.utc(got.year, got.month, got.day, got.hour, got.minute, got.second).difference(
              DateTime.utc(want.year, want.month, want.day, want.hour, want.minute, want.second)).inSeconds.abs(),
          lessThanOrEqualTo(2));
    });

    test('last night\'s punch-in, still running after midnight, is found; an ended one is not', () async {
      Session.I.employee = {'name': 'HR-EMP-00125'};
      final today = isoDay(ServerClock.I.now());
      final y = DateTime.parse(today).subtract(const Duration(days: 1));
      final yesterday = isoDay(y);
      var answer = <Map<String, dynamic>>[];
      site.handler = (o) => _json({'data': answer}, 200);
      // Two hours after a 20:30 IN: still on that shift.
      ServerClock.I.restore(Duration.zero);
      final at = DateTime(y.year, y.month, y.day, 20, 30);
      answer = [
        {'name': 'C1', 'time': '$yesterday 20:30:00', 'log_type': 'IN'}
      ];
      final shiftNow = ServerClock.I.now().difference(at);
      if (shiftNow <= const Duration(hours: 16)) {
        expect((await Api.nightArrival(today))?['name'], 'C1');
      } else {
        expect(await Api.nightArrival(today), isNull, reason: 'past the longest night');
      }
      answer = [
        {'name': 'C2', 'time': '$yesterday 21:00:00', 'log_type': 'OUT'}
      ];
      expect(await Api.nightArrival(today), isNull, reason: 'an OUT ends it');
      site.handler = _offline;
      expect(await Api.nightArrival(today), isNull, reason: 'no signal: nothing claimed');
    });
  });

  group('HR\'s side', () {
    test('a Sunday lists the people who came in, each still on Week off', () {
      // 29 November 2026 is a Sunday.
      final v = DayView.build(
        date: '2026-11-29',
        today: '2026-11-29',
        people: [
          Person.fromJson({'name': 'E1', 'employee_name': 'Anita Das', 'company': 'Manna Rubber'}),
          Person.fromJson({'name': 'E2', 'employee_name': 'Ravi', 'company': 'Manna Rubber'}),
        ],
        punches: [
          Punch.fromJson({'name': 'C1', 'employee': 'E1', 'time': '2026-11-29 08:00:00', 'log_type': 'IN'}),
        ],
        leaves: const [],
      );
      expect(v.punched.map((p) => p.person.id), ['E1'], reason: 'not "Nobody punched"');
      expect(v.punched.single.state, DayState.weekOff);
      expect(v.off.map((p) => p.person.id).toSet(), {'E1', 'E2'});
    });

    test('a read with no signal is not retried with fewer fields and passed off as the day', () async {
      var asked = 0;
      site.handler = (o) {
        asked++;
        _offline(o);
      };
      await expectLater(AdminApi.people(fresh: true), throwsA(isA<DioException>()));
      expect(asked, 1, reason: 'no second, shorter read over a dead network');
    });
  });

  group('a punch kept at the press', () {
    PendingPunch p(String id) => PendingPunch(
        id: id, employee: 'HR-EMP-00125', logType: 'IN', time: '2026-11-27 08:02:00', device: 'vivo');

    setUp(() {
      Session.I.employee = {'name': 'HR-EMP-00125'};
      Session.I.csrfToken = 't';
      ServerClock.I.restore(DateTime(2026, 11, 27, 9).difference(DateTime.now()));
    });

    test('is on the phone before anything is sent, and the queue leaves it to the live send', () async {
      final posted = <Object?>[];
      site.handler = (o) {
        if (o.method == 'GET') return _json({'data': []}, 200);
        posted.add(o.data);
        return _json({'data': {'name': 'EMP-CKIN-1'}}, 201);
      };
      await PunchQueue.I.addLive(p('1'));
      expect(PunchQueue.I.count.value, 1, reason: 'kept the moment it was pressed');
      expect(PunchQueue.I.waitingFor('HR-EMP-00125'), 0, reason: 'being sent, not waiting');
      expect(await PunchQueue.I.flush(), 0);
      expect(posted, isEmpty, reason: 'never sent twice while the screen sends it');
    });

    test('leaves the phone when the live send lands, and stays when it does not', () async {
      await PunchQueue.I.addLive(p('1'));
      await PunchQueue.I.finishLive('1', remove: true);
      expect(PunchQueue.I.count.value, 0);

      await PunchQueue.I.addLive(p('2'));
      await PunchQueue.I.finishLive('2', remove: false);
      expect(PunchQueue.I.count.value, 1);
      expect(PunchQueue.I.waitingFor('HR-EMP-00125'), 1, reason: 'now waiting, for the queue to send');
    });

    test('a refusal that came after the person left the screen is listed for them to read', () async {
      await PunchQueue.I.addLive(p('1'));
      await PunchQueue.I.finishLive('1', remove: true, problem: 'You are 3.2 km from Rubber Park');
      expect(PunchQueue.I.count.value, 0);
      expect(PunchQueue.I.problems.value.single, contains('3.2 km'));
    });

    test('a kept punch whose photo cannot get through waits, photo and all', () async {
      final dir = await Directory.systemTemp.createTemp('punch');
      addTearDown(() async {
        try {
          await dir.delete(recursive: true);
        } catch (_) {
          // Windows holds a file a failed upload opened; the temp folder is the OS's to clear.
        }
      });
      final photo = File('${dir.path}/face.jpg')..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xD9]);
      await PunchQueue.I.add(PendingPunch(
          id: '1',
          employee: 'HR-EMP-00125',
          logType: 'IN',
          time: '2026-11-27 08:02:00',
          photoPath: photo.path));
      final posted = <Object?>[];
      site.handler = (o) {
        if (o.path.contains('upload_file')) _offline(o);
        if (o.method == 'GET') return _json({'data': []}, 200);
        posted.add(o.data);
        return _json({'data': {'name': 'EMP-CKIN-1'}}, 201);
      };
      expect(await PunchQueue.I.flush(), 0);
      expect(posted, isEmpty);
      expect(PunchQueue.I.count.value, 1);
    });
  });

  group('the punch itself', () {
    test('a 2xx carrying no checkin is not a recorded punch: it is kept', () async {
      Session.I.employee = Map.of(_paul);
      site.handler = (o) => _json({}, 200);
      Object? caught;
      try {
        await Api.punch(logType: 'IN');
      } catch (e) {
        caught = e;
      }
      expect(caught, isNotNull);
      expect(isNetworkFailure(caught!), isTrue);
    });

    test('a punch kept while the list is being read back is never lost', () async {
      PendingPunch p(String id) =>
          PendingPunch(id: id, employee: 'HR-EMP-00125', logType: 'IN', time: '2026-11-27 08:0$id:00');
      await Future.wait([
        for (var i = 0; i < 8; i++) ...[PunchQueue.I.add(p('$i')), PunchQueue.I.load()],
      ]);
      await PunchQueue.I.load();
      expect(PunchQueue.I.items.map((x) => x.id).toSet(), {for (var i = 0; i < 8; i++) '$i'});
      expect(PunchQueue.I.count.value, 8);
    });
  });
}
