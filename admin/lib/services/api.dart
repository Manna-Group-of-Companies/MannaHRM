import 'dart:convert';

import 'package:dio/dio.dart';

import 'package:manna_hr_admin/core/auth_store.dart';
import 'package:manna_hr_admin/core/constants.dart';
import 'package:manna_hr_admin/core/day.dart';
import 'package:manna_hr_admin/core/errors.dart';
import 'package:manna_hr_admin/core/session.dart';

/// Every read this app makes, in one file — and it makes nothing but reads.
///
/// **No write of any kind.** Not a punch, not a correction, not Attendance.
/// HR corrects a day on the website, where the approval rules are; a phone that
/// could do it too would be a second set of rules to keep in step (CLAUDE.md
/// §1). Sign-in, re-login and the session are the employee app's
/// (`app/lib/services/api.dart`), less the CSRF token only a write needs.
///
/// **A short field list stands behind every long one**, as there: Frappe
/// answers 417 for the whole read when asked for one field a site has not
/// got, so one unknown column would turn the day into "the site would not
/// answer".
class Api {
  static String _res(String doctype) => '/api/resource/${Uri.encodeComponent(doctype)}';

  // ------------------------------------------------------------- signing in --

  /// Back onto an authenticated connection without anybody typing, if it can.
  /// Returns the signed-in user, or empty for the sign-in screen.
  static Future<String> restore() async {
    final creds = await AuthStore.load();
    Session.I.init(url: creds.siteUrl.isEmpty ? kDefaultSiteUrl : creds.siteUrl);
    Session.I.email = creds.email;
    Session.I.sid = creds.sid;
    _wireReauth();
    if (creds.sid.isEmpty && !creds.canReauth) return '';
    final who = await whoami();
    if (who.isEmpty || who == 'Guest') {
      if (!creds.canReauth || !await _passwordLogin(creds.email, creds.password)) return '';
    } else {
      Session.I.user = who;
    }
    return Session.I.user;
  }

  static Future<String> login({required String siteUrl, required String email, required String password}) async {
    Session.I.init(url: siteUrl);
    _wireReauth();
    if (!await _passwordLogin(email, password)) throw const Refused('Wrong email or password.');
    await AuthStore.saveLogin(siteUrl: siteUrl, email: email, password: password);
    return Session.I.user;
  }

  static void _wireReauth() {
    Session.I.reauthenticate = () async {
      final creds = await AuthStore.load();
      if (!creds.canReauth) return false;
      return _passwordLogin(creds.email, creds.password);
    };
  }

  static Future<bool> _passwordLogin(String email, String password) async {
    Session.I.clearAuth();
    final r = await Session.I.dio.post(
      '/api/method/login',
      data: {'usr': email, 'pwd': password},
      options: Session.noRetry.copyWith(
        contentType: Headers.formUrlEncodedContentType,
        followRedirects: true,
        maxRedirects: 5,
      ),
    );
    if (r.statusCode != 200) return false;
    var sid = '';
    for (final c in r.headers.map['set-cookie'] ?? const <String>[]) {
      final m = RegExp(r'sid=([^;]+)').firstMatch(c);
      if (m != null) sid = m.group(1) ?? '';
    }
    if (sid.isEmpty || sid == 'Guest') return false;
    Session.I.sid = sid;
    Session.I.email = email;
    await AuthStore.saveSid(sid);
    final who = await whoami();
    Session.I.user = (who.isEmpty || who == 'Guest') ? email : who;
    return true;
  }

  static Future<String> whoami() async {
    try {
      final r = await Session.I.dio.get('/api/method/frappe.auth.get_logged_user', options: Session.noRetry);
      final u = (r.data is Map) ? r.data['message'] : null;
      return u is String ? u : '';
    } catch (_) {
      return '';
    }
  }

  /// Whether this login is HR: somebody the site lets create an Employee — the
  /// same test the website's menus use (`client/src/api/client.js` isAdmin).
  /// **A menu, not the security.** The site's roles decide what every read
  /// below returns whatever this says; it is here so an ordinary employee who
  /// installs this app is told plainly it is not for them, rather than shown
  /// a day with one person in it.
  static Future<bool> isAdmin() async {
    try {
      final r = await Session.I.dio.get('/api/method/frappe.client.has_permission',
          queryParameters: {'doctype': 'Employee', 'docname': '', 'perm_type': 'create'});
      final m = (r.data is Map) ? r.data['message'] : null;
      return m is Map && m['has_permission'] == true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> logout() async {
    Session.I.reauthenticate = null;
    try {
      await Session.I.dio.get('/api/method/logout');
    } catch (_) {
      // Signing out here is the part that matters.
    }
    Session.I.clearAuth();
    await AuthStore.clear();
  }

  // ------------------------------------------------------------------ reads --

  /// Every page of a list. Frappe pages at `limit_page_length`; the loop stops
  /// at the first short page.
  static Future<List<Map<String, dynamic>>> _all(String doctype, List<String> fields,
      {List<List<dynamic>>? filters, String orderBy = 'name asc'}) async {
    final out = <Map<String, dynamic>>[];
    for (var start = 0;; start += kListPageLength) {
      final qp = <String, dynamic>{
        'fields': jsonEncode(fields),
        'order_by': orderBy,
        'limit_page_length': kListPageLength,
        'limit_start': start,
      };
      if (filters != null) qp['filters'] = jsonEncode(filters);
      final r = await Session.I.dio.get(_res(doctype), queryParameters: qp);
      final data = (r.data is Map) ? r.data['data'] : null;
      if (data is! List) {
        throw DioException.badResponse(statusCode: r.statusCode ?? 0, requestOptions: r.requestOptions, response: r);
      }
      out.addAll(data.cast<Map<String, dynamic>>());
      if (data.length < kListPageLength) return out;
    }
  }

  /// The long field list, then the short one. Throws only when both fail, with
  /// the second failure — which is the one worth reading.
  static Future<List<Map<String, dynamic>>> _read(String doctype, List<String> long, List<String> short,
      {List<List<dynamic>>? filters, String orderBy = 'name asc'}) async {
    try {
      return await _all(doctype, long, filters: filters, orderBy: orderBy);
    } catch (_) {
      return _all(doctype, short, filters: filters, orderBy: orderBy);
    }
  }

  static List<Person>? _people;
  static Map<String, String>? _companyCalendar;
  static final Map<String, List<Holiday>> _calendars = {};

  /// Who is counted: Active employees. Read once a session and on refresh — a
  /// day's view is a question about today's punches, not about who works here.
  static Future<List<Person>> people({bool fresh = false}) async {
    if (!fresh && _people != null) return _people!;
    final rows = await _read('Employee',
        ['name', 'employee_name', 'employee_number', 'company', 'department', 'designation', 'holiday_list'],
        ['name', 'employee_name', 'company'],
        filters: [['status', '=', 'Active']], orderBy: 'employee_name asc');
    return _people = rows.map(Person.fromJson).toList();
  }

  /// Company → its default Holiday List, the calendar for anybody with none of
  /// their own.
  static Future<Map<String, String>> companyCalendars({bool fresh = false}) async {
    if (!fresh && _companyCalendar != null) return _companyCalendar!;
    try {
      final rows = await _all('Company', ['name', 'default_holiday_list']);
      _companyCalendar = {for (final r in rows) '${r['name']}': '${r['default_holiday_list'] ?? ''}'};
    } catch (_) {
      _companyCalendar = {};
    }
    return _companyCalendar!;
  }

  /// One Holiday List's rows. The dates are a child table, so it is one
  /// document read per list — kept for the session, because a calendar changes
  /// a few times a year. A list that cannot be read is left out: those people
  /// are judged without one, which reads a Sunday as a working day rather than
  /// hiding an absence.
  static Future<void> _calendar(String name) async {
    if (name.isEmpty || _calendars.containsKey(name)) return;
    try {
      final r = await Session.I.dio.get('${_res('Holiday List')}/${Uri.encodeComponent(name)}');
      final rows = (r.data is Map) ? (r.data['data']?['holidays'] as List?) : null;
      _calendars[name] = (rows ?? const []).cast<Map<String, dynamic>>().map(Holiday.fromJson).toList();
    } catch (_) {
      _calendars[name] = const [];
    }
  }

  /// The day's punches, placed by their shift's start — so the read runs into
  /// the next morning, for the night shift's punch-out.
  ///
  /// It starts the day before, too: whether a morning punch-out on the out
  /// machine ends yesterday's 24-hour shift depends on yesterday's arrival.
  static Future<List<Punch>> punches(String date) async {
    final next = DateTime.parse(date).add(const Duration(days: 1));
    final prev = DateTime.parse(date).subtract(const Duration(days: 1));
    final until = '${_ymd(next)} ${kNextDayHours.toString().padLeft(2, '0')}:00:00';
    final rows = await _read('Employee Checkin',
        ['name', 'employee', 'time', 'log_type', 'device_id', 'skip_auto_attendance', 'shift_start'],
        ['name', 'employee', 'time', 'log_type'],
        filters: [['time', '>=', '${_ymd(prev)} 00:00:00'], ['time', '<=', until]], orderBy: 'time asc');
    return rows.map(Punch.fromJson).toList();
  }

  /// Leave applications on the day, approved or waiting for a decision.
  static Future<List<Leave>> leaves(String date) async {
    final rows = await _read('Leave Application',
        ['name', 'employee', 'employee_name', 'leave_type', 'from_date', 'to_date', 'status', 'half_day',
          'half_day_date', 'total_leave_days'],
        ['name', 'employee', 'leave_type', 'from_date', 'to_date', 'status'],
        filters: [['from_date', '<=', date], ['to_date', '>=', date], ['status', 'in', ['Approved', 'Open']],
          ['docstatus', '<', 2]],
        orderBy: 'from_date asc');
    return rows.map(Leave.fromJson).toList();
  }

  /// Everything one day needs, read together.
  static Future<DayView> day(String date, String today, {bool fresh = false}) async {
    final results = await Future.wait([
      people(fresh: fresh),
      companyCalendars(fresh: fresh),
      punches(date),
      leaves(date),
    ]);
    final who = results[0] as List<Person>;
    final coCal = results[1] as Map<String, String>;
    if (fresh) _calendars.clear();
    final lists = {
      for (final p in who) p.holidayList.isNotEmpty ? p.holidayList : (coCal[p.company] ?? ''),
    }..remove('');
    await Future.wait(lists.map(_calendar));
    return DayView.build(
      date: date,
      today: today,
      people: who,
      punches: results[2] as List<Punch>,
      leaves: results[3] as List<Leave>,
      calendars: Map.of(_calendars),
      companyCalendar: coCal,
    );
  }

  /// Forgets what the session read, for sign-out.
  static void forget() {
    _people = null;
    _companyCalendar = null;
    _calendars.clear();
  }
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// `YYYY-MM-DD` for a date, the site's own spelling.
String ymd(DateTime d) => _ymd(d);
