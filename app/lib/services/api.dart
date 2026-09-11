import 'dart:convert';

import 'package:dio/dio.dart';

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';

/// Every read and write this app makes, in one file.
///
/// **Two rules run through all of it**, and both come from CLAUDE.md:
///
/// 1. **`Attendance` is never written.** It is generated from `Employee
///    Checkin` by the shift job, and a hand-written row is invisible to the
///    thing that would have created it — the two then disagree the moment
///    anything is reprocessed, and what disagrees is somebody's pay. So the
///    punch writes a *checkin*, and a correction writes a *request* for the
///    punch that is missing. Neither writes a day.
///
/// 2. **A short field list stands behind every long one.** Frappe answers 417
///    for the *whole* read when asked for one field a site has not got — it
///    does not drop the column it did not recognise — so a single unknown
///    field turns a month of punches into "the site would not answer". The long
///    list is what makes the screen good; the short list is what the screen
///    needs.
class Api {
  static String _res(String doctype) =>
      '/api/resource/${Uri.encodeComponent(doctype)}';

  // ------------------------------------------------------------- signing in --

  /// Puts the app back on an authenticated connection without anybody typing,
  /// if it can. Returns the employee record, or null when there is no session
  /// to restore — which is the sign-in screen, not a failure.
  static Future<Map<String, dynamic>?> restore() async {
    final creds = await AuthStore.load();
    Session.I.init(url: creds.siteUrl.isEmpty ? kDefaultSiteUrl : creds.siteUrl);
    Session.I.email = creds.email;
    Session.I.sid = creds.sid;
    _wireReauth();
    if (creds.sid.isEmpty && !creds.canReauth) return null;

    final who = await whoami();
    if (who.isEmpty || who == 'Guest') {
      if (!creds.canReauth) return null;
      final ok = await _passwordLogin(creds.email, creds.password);
      if (!ok) return null;
    } else {
      Session.I.user = who;
    }
    return _resolveQuietly();
  }

  /// Sign in. Everything the app reads and writes afterwards runs under this
  /// user's own roles, which is the whole of the security model.
  static Future<Map<String, dynamic>?> login({
    required String siteUrl,
    required String email,
    required String password,
  }) async {
    Session.I.init(url: siteUrl);
    _wireReauth();
    final ok = await _passwordLogin(email, password);
    if (!ok) throw const Refused('Wrong email or password.');
    await AuthStore.saveLogin(
        siteUrl: siteUrl, email: email, password: password);
    return _resolveQuietly();
  }

  /// The employee lookup, where a failure must not undo a sign-in that worked.
  ///
  /// The password was right and the session is live; if the lookup after it
  /// fails, throwing here would leave somebody on the sign-in form reading an
  /// error about a password they typed correctly. So it returns null and the
  /// punch screen — which asks again on open — is where the real reason is
  /// shown.
  static Future<Map<String, dynamic>?> _resolveQuietly() async {
    try {
      return await resolveEmployee();
    } catch (_) {
      return null;
    }
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
    await _fetchCsrf();
    // Falls back to the typed word when the site will not say, which rounds the
    // safe way: looking somebody up by what they typed can still find them,
    // and looking them up by nothing cannot.
    final who = await whoami();
    Session.I.user = (who.isEmpty || who == 'Guest') ? email : who;
    return true;
  }

  /// Frappe refuses any session write that arrives without a CSRF token, and
  /// the token belongs to the session rather than to the app — so it cannot be
  /// shipped and it changes on every sign-in. The desk page carries it in its
  /// bootinfo, which is the one place every version of Frappe has it.
  static Future<void> _fetchCsrf() async {
    try {
      final r = await Session.I.dio.get('/app',
          options: Session.noRetry.copyWith(responseType: ResponseType.plain));
      final html = '${r.data}';
      final m = RegExp(r'"csrf_token":\s*"([0-9a-zA-Z]+)"').firstMatch(html) ??
          RegExp(r'csrf_token\s*=\s*"([0-9a-zA-Z]+)"').firstMatch(html);
      Session.I.csrfToken = m?.group(1) ?? '';
    } catch (_) {
      // A site running with `ignore_csrf` writes perfectly well without one,
      // and a site that does not refuses the first write with a message saying
      // so. Nothing is lost by finding out that way.
      Session.I.csrfToken = '';
    }
  }

  static Future<String> whoami() async {
    try {
      final r = await Session.I.dio
          .get('/api/method/frappe.auth.get_logged_user', options: Session.noRetry);
      final u = (r.data is Map) ? r.data['message'] : null;
      return u is String ? u : '';
    } catch (_) {
      return '';
    }
  }

  static Future<void> logout() async {
    Session.I.reauthenticate = null;
    try {
      await Session.I.dio.get('/api/method/logout');
    } catch (_) {
      // Signing out locally is the part that matters. A site that cannot be
      // reached must not leave somebody stuck signed in on a shared handset.
    }
    Session.I.clearAuth();
    await AuthStore.clear();
  }

  // ------------------------------------------------------------------ reads --

  static Future<List<Map<String, dynamic>>> _list(
    String doctype,
    List<String> fields, {
    List<List<dynamic>>? filters,
    String orderBy = 'modified desc',
    int limit = kListPageLength,
  }) async {
    final qp = <String, dynamic>{
      'fields': jsonEncode(fields),
      'order_by': orderBy,
      'limit_page_length': limit,
    };
    if (filters != null) qp['filters'] = jsonEncode(filters);
    final r = await Session.I.dio.get(_res(doctype), queryParameters: qp);
    final data = (r.data is Map) ? r.data['data'] : null;
    if (data is List) return data.cast<Map<String, dynamic>>();
    throw DioException.badResponse(
      statusCode: r.statusCode ?? 0,
      requestOptions: r.requestOptions,
      response: r,
    );
  }

  /// The long list, then the short one, then null — see the note at the top of
  /// this class. Null is "the site would not answer", which is a different
  /// finding from an empty list and must not be drawn as one.
  static Future<List<Map<String, dynamic>>?> _read(
    String doctype,
    List<String> long,
    List<String> short, {
    List<List<dynamic>>? filters,
    String orderBy = 'modified desc',
  }) async {
    try {
      return await _list(doctype, long, filters: filters, orderBy: orderBy);
    } catch (_) {
      try {
        return await _list(doctype, short, filters: filters, orderBy: orderBy);
      } catch (_) {
        return null;
      }
    }
  }

  static const _empFields = [
    'name', 'employee_name', 'employee_number', 'company', 'department',
    'designation', 'default_shift', 'holiday_list', 'status', 'image',
  ];
  static const _empFieldsMin = ['name', 'employee_name', 'company', 'status'];

  /// The `Employee` this login is.
  ///
  /// Matched on `user_id`, which is the only link between a Frappe user and an
  /// employee record. **A login with no such record is a real state**: the
  /// person can sign in and has nothing to punch against, and the screen says
  /// so and names the fix rather than showing an empty month. HR sets `user_id`
  /// on the Employee record.
  static Future<Map<String, dynamic>?> resolveEmployee() async {
    final who = Session.I.user.isNotEmpty ? Session.I.user : Session.I.email;
    if (who.isEmpty) return null;
    final rows = await _read(
      'Employee',
      _empFields,
      _empFieldsMin,
      filters: [
        ['user_id', '=', who]
      ],
      orderBy: 'modified desc',
    );
    // Null and empty are opposite findings and must not share a screen. Empty
    // is "HR has not set your User ID", which is HR's to fix. Null is "the site
    // did not answer" — a dropped signal, a permission — and telling somebody
    // at a gate to go and see HR about a bad minute of 4G sends them to the
    // wrong person with the wrong question.
    if (rows == null) {
      throw const Refused(
          'The site would not say which employee you are. Check your signal '
          'and pull down to try again.');
    }
    if (rows.isEmpty) return null;
    // Active first: somebody who left and came back has two records, and the
    // live one is the one their punches belong to.
    rows.sort((a, b) =>
        (a['status'] == 'Active' ? 0 : 1).compareTo(b['status'] == 'Active' ? 0 : 1));
    Session.I.employee = rows.first;
    return rows.first;
  }

  static const _punchFields = [
    'name', 'employee', 'time', 'log_type', 'device_id', 'shift'
  ];
  static const _punchFieldsMin = ['name', 'employee', 'time', 'log_type'];

  /// One day's punches for this employee, earliest first.
  static Future<List<Map<String, dynamic>>> punchesOn(String iso) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return const [];
    final rows = await _read(
      kCheckinDoctype,
      _punchFields,
      _punchFieldsMin,
      filters: [
        ['employee', '=', emp],
        ['time', '>=', '$iso 00:00:00'],
        ['time', '<=', '$iso 23:59:59'],
      ],
      orderBy: 'time asc',
    );
    return rows ?? const [];
  }

  /// One month of punches, leave and corrections, in one go.
  ///
  /// Three narrow reads rather than one wide one, and narrow is the design: a
  /// month of punches for the whole group would be tens of thousands of rows
  /// nobody asked for. Each carries its own failure, because "nobody punched"
  /// and "the punches could not be read" are opposite findings on a screen
  /// about whether somebody was paid.
  static Future<MonthData> month(String ym) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return MonthData.empty();

    // `-01` and `-31` rather than the real last day: a `<=` against `-31`
    // catches every month, and no date that is not in the month can sort
    // between them. Frappe compares these as strings too.
    final from = '$ym-01';
    final to = '$ym-31';

    final results = await Future.wait([
      _read(
        kCheckinDoctype,
        _punchFields,
        _punchFieldsMin,
        filters: [
          ['employee', '=', emp],
          ['time', '>=', '$from 00:00:00'],
          ['time', '<=', '$to 23:59:59'],
        ],
        orderBy: 'time asc',
      ),
      // Overlapping, not contained. A leave that started in July and runs into
      // August covers days in this month, and asking for `from_date >= the
      // first` would miss every one of them.
      _read(
        'Leave Application',
        ['name', 'employee', 'leave_type', 'from_date', 'to_date', 'half_day',
          'half_day_date', 'status', 'description'],
        ['name', 'employee', 'leave_type', 'from_date', 'to_date', 'status'],
        filters: [
          ['employee', '=', emp],
          ['from_date', '<=', to],
          ['to_date', '>=', from],
        ],
        orderBy: 'from_date asc',
      ),
      _read(
        kRegularizationDoctype,
        ['name', 'employee', 'attendance_date', 'requested_in', 'requested_out',
          'reason', 'status', 'creation'],
        ['name', 'employee', 'attendance_date', 'status'],
        filters: [
          ['employee', '=', emp],
          ['attendance_date', '>=', from],
          ['attendance_date', '<=', to],
        ],
        orderBy: 'attendance_date asc',
      ),
    ]);

    final refused = <String>[
      if (results[0] == null) 'punches',
      if (results[1] == null) 'leave',
      if (results[2] == null) 'corrections',
    ];

    return MonthData(
      punches: results[0] ?? const [],
      leave: results[1] ?? const [],
      corrections: results[2] ?? const [],
      holidays: await _holidays(),
      error: refused.isEmpty
          ? ''
          : 'The site would not answer for ${refused.join(', ')}.',
    );
  }

  static final Map<String, List<Map<String, dynamic>>> _holidayCache = {};

  /// The holiday list this person is measured against: their own where the
  /// record names one, otherwise their company's default.
  ///
  /// **A month read without it calls every Sunday an absence.** So a site that
  /// names neither is worth saying out loud rather than drawing, which is what
  /// the empty list lets the calendar do.
  static Future<List<Map<String, dynamic>>> _holidays() async {
    var listName = '${Session.I.employee?['holiday_list'] ?? ''}';
    if (listName.isEmpty) {
      final company = '${Session.I.employee?['company'] ?? ''}';
      if (company.isEmpty) return const [];
      final rows = await _read(
        'Company',
        ['name', 'default_holiday_list'],
        ['name'],
        filters: [
          ['name', '=', company]
        ],
      );
      listName = '${(rows?.isNotEmpty ?? false) ? rows!.first['default_holiday_list'] ?? '' : ''}';
    }
    if (listName.isEmpty) return const [];
    final cached = _holidayCache[listName];
    if (cached != null) return cached;

    try {
      final r = await Session.I.dio
          .get('${_res('Holiday List')}/${Uri.encodeComponent(listName)}');
      final doc = (r.data is Map) ? r.data['data'] : null;
      final rows = (doc is Map && doc['holidays'] is List)
          ? (doc['holidays'] as List).cast<Map<String, dynamic>>()
          : <Map<String, dynamic>>[];
      _holidayCache[listName] = rows;
      return rows;
    } catch (_) {
      return const [];
    }
  }

  /// Every correction this person has raised, decided ones included.
  ///
  /// Decided ones included on purpose: the question this screen answers is
  /// "what happened to my 19th of August", and the answer is often "it was
  /// refused". A list of open requests only would leave that unanswerable.
  static Future<List<Map<String, dynamic>>> myCorrections({int limit = 50}) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return const [];
    final rows = await _read(
      kRegularizationDoctype,
      ['name', 'attendance_date', 'requested_in', 'requested_out', 'reason',
        'status', 'creation', 'decision_note'],
      ['name', 'attendance_date', 'status'],
      filters: [
        ['employee', '=', emp]
      ],
      orderBy: 'attendance_date desc',
    );
    return (rows ?? const []).take(limit).toList();
  }

  /// Where this person is meant to punch, if the site says. Best effort: the
  /// field is ours and a site that has not been migrated has not got it, which
  /// is not a reason to fail a screen.
  static Future<Map<String, dynamic>?> workLocation() async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return null;
    try {
      final rows = await _list('Employee', ['name', 'custom_work_location'],
          filters: [
            ['name', '=', emp]
          ]);
      final name = '${rows.isEmpty ? '' : rows.first['custom_work_location'] ?? ''}';
      if (name.isEmpty) return null;
      final places = await _list(
        'Work Location',
        ['name', 'location_name', 'latitude', 'longitude', 'radius_metres', 'is_active'],
        filters: [
          ['name', '=', name]
        ],
      );
      return places.isEmpty ? null : places.first;
    } catch (_) {
      return null;
    }
  }

  // ----------------------------------------------------------------- writes --

  /// Record a punch.
  ///
  /// The coordinate is sent because the server geofences a mobile punch against
  /// the person's `Work Location`, and a punch with no coordinate is the one
  /// thing that fence cannot judge. It is sent even when it is going to fail
  /// the fence: the distance is written on every punch, not only the refused
  /// ones, because a month of distances is what tells you whether the radius is
  /// right — refusals alone only ever tell you where it was too small.
  ///
  /// `time` is the *server's* clock as this app last saw it, not the phone's.
  /// The site overwrites it anyway on a self-service punch — see
  /// `manna_hr/checkin.py::_apply_server_clock` — and sending the phone's would
  /// be sending a number the person being measured controls.
  static Future<Map<String, dynamic>> punch({
    required String logType,
    double? latitude,
    double? longitude,
  }) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) {
      throw const Refused(
          'Your login is not linked to an employee record, so there is nobody '
          'to punch for. Ask HR to set your user on your Employee record.');
    }

    final doc = <String, dynamic>{
      'employee': emp,
      'log_type': logType,
      'time': stampOf(ServerClock.I.now()),
      'device_id': deviceIdFor(emp),
    };
    if (latitude != null && longitude != null) {
      doc['latitude'] = latitude;
      doc['longitude'] = longitude;
    }

    final r = await Session.I.dio.post(_res(kCheckinDoctype), data: doc);
    final ok = (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300;
    if (!ok) {
      // The site's own sentence. `checkin.py` refuses with the distance and the
      // gate's name in it, and that is the whole of what somebody can act on.
      throw Refused(frappeMessage(r.data) ??
          'The site refused the punch and said nothing about why.');
    }
    final made = (r.data is Map) ? r.data['data'] : null;
    return made is Map ? made.cast<String, dynamic>() : <String, dynamic>{};
  }

  /// Ask for the punch a day is missing.
  ///
  /// **This writes a request, not attendance.** Attendance is generated from
  /// punches by the shift job on the site; a correction asks for the punch that
  /// is missing, and approving it is what writes one — on the site, where the
  /// shift window and the approver live. So this app can raise the question and
  /// cannot answer it, which is the right way round.
  static Future<void> createCorrection({
    required String iso,
    String? inAt,
    String? outAt,
    required String reason,
  }) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) {
      throw const Refused(
          'Your login is not linked to an employee record. Ask HR to set your '
          'user on your Employee record.');
    }
    if (reason.trim().isEmpty) {
      throw const Refused(
          'Say why. The reason is what an approver reads, and it is the whole '
          'of what they have to go on.');
    }
    if ((inAt ?? '').isEmpty && (outAt ?? '').isEmpty) {
      throw const Refused(
          'A correction with neither time in it is not asking for anything.');
    }

    final doc = <String, dynamic>{
      'employee': emp,
      'attendance_date': iso,
      'reason': reason.trim(),
      'status': kOpenStatus,
      if ((inAt ?? '').isNotEmpty) 'requested_in': '$iso ${inAt!}:00',
      if ((outAt ?? '').isNotEmpty) 'requested_out': '$iso ${outAt!}:00',
    };

    final r = await Session.I.dio.post(_res(kRegularizationDoctype), data: doc);
    final ok = (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300;
    if (!ok) {
      throw Refused(frappeMessage(r.data) ??
          'The site refused the request and said nothing about why.');
    }
  }
}

/// One month, as the calendar needs it.
class MonthData {
  MonthData({
    required this.punches,
    required this.leave,
    required this.corrections,
    required this.holidays,
    required this.error,
  });

  factory MonthData.empty() => MonthData(
        punches: const [],
        leave: const [],
        corrections: const [],
        holidays: const [],
        error: '',
      );

  final List<Map<String, dynamic>> punches;
  final List<Map<String, dynamic>> leave;
  final List<Map<String, dynamic>> corrections;
  final List<Map<String, dynamic>> holidays;

  /// Which of the reads the site would not answer, in its own terms rather than
  /// as an empty table.
  final String error;

  /// True when nothing says which days are Sundays. Every Sunday then reads as
  /// a day nobody punched on, which reads as absent — worth saying on screen.
  bool get noHolidayList => holidays.isEmpty;
}
