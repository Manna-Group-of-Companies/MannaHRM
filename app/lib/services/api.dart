import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;

import 'package:manna_hr_app/core/auth_store.dart';
import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/first_password.dart';
import 'package:manna_hr_app/core/leave_rules.dart';
import 'package:manna_hr_app/core/offline_punches.dart';
import 'package:manna_hr_app/core/punch_rules.dart';
import 'package:manna_hr_app/core/roster.dart' show kNightFromHour, kNightLongest;
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

  /// The site every sign-in goes to. Never set from a screen: only a test
  /// points it at an address that cannot be reached, so no test ever signs in
  /// to the real site.
  @visibleForTesting
  static String site = kDefaultSiteUrl;

  /// Puts the app back on an authenticated connection without anybody typing,
  /// if it can. Returns the employee record, or null when there is no session
  /// to restore — which is the sign-in screen, not a failure.
  static Future<Map<String, dynamic>?> restore() async {
    final creds = await AuthStore.load();
    // Always the Manna site, whatever an older version of the app saved: the
    // site address is never chosen on the phone (core/constants.dart).
    Session.I.init(url: site);
    Session.I.email = creds.email;
    Session.I.sid = creds.sid;
    _wireReauth();
    if (creds.sid.isEmpty && !creds.canReauth) return null;
    final kept = await AuthStore.loadSkew();
    if (kept != null) ServerClock.I.restore(kept);

    final who = await whoami();
    if (who.isEmpty || who == 'Guest') {
      if (!creds.canReauth) return null;
      bool ok;
      try {
        ok = await _passwordLogin(creds.email, creds.password);
      } catch (e) {
        // No signal, or the site answering badly (a 429, a gateway page).
        // Somebody at a gate is still somebody who has to punch: open on what
        // this phone remembers about its owner, and keep the punch until the
        // site can be reached (core/offline_punches). Only the site saying the
        // password is wrong (`!ok` below) is a reason for the sign-in form.
        if (isNetworkFailure(e) || e is DioException) {
          final emp = await _startOffline(creds.email);
          if (emp == null) throw const NoSignalAtStart();
          return emp;
        }
        rethrow;
      }
      if (!ok) return null;
    } else {
      Session.I.user = who;
      // The token belongs to the session, not the sign-in, and a restored
      // session has none until it is asked for: every write — every punch —
      // would come back "Invalid Request".
      await _fetchCsrf();
    }
    return _resolveQuietly(remembered: true);
  }

  /// Sign in. Everything the app reads and writes afterwards runs under this
  /// user's own roles, which is the whole of the security model.
  static Future<Map<String, dynamic>?> login({
    required String email,
    required String password,
  }) async {
    Session.I.init(url: site);
    // Somebody new may be signing in on this phone: nothing of the last person
    // (their employee record, HR or not) may carry over to them.
    Session.I.clearAuth();
    _wireReauth();
    // Exactly what was typed (HR, 28 November 2026): the email and password HR
    // created with the employee. No Emp Code, no date-of-birth spellings tried.
    final usr = email.trim();
    if (await _passwordLogin(usr, password)) {
      await AuthStore.saveLogin(siteUrl: site, email: usr, password: password);
      Session.I.signInAgain.value = false;
      return _resolveQuietly();
    }
    throw const Refused('Wrong email or password.');
  }

  /// Opens on the remembered employee, with no session. Null when this phone
  /// has never been signed in far enough to remember one: then the sign-in
  /// screen is the right answer.
  static Future<Map<String, dynamic>?> _startOffline(String email) async {
    final emp = await AuthStore.loadEmployee(forLogin: email);
    if (emp == null) return null;
    Session.I.employee = emp;
    Session.I.email = email;
    Session.I.offlineStart = true;
    return emp;
  }

  /// Whether the kept login was HR the last time the site said.
  static Future<bool> rememberedAdmin() async {
    final creds = await AuthStore.load();
    return creds.email.isNotEmpty && (await AuthStore.loadAdmin(creds.email) ?? false);
  }

  /// Opens on the remembered employee now, while a slow start goes on behind
  /// it (`_Gate`). False when this phone remembers nobody for the kept login.
  static Future<bool> startOfflineNow() async {
    final creds = await AuthStore.load();
    if (!creds.canReauth) return false;
    return await _startOffline(creds.email) != null;
  }

  /// Gets a live session back after an offline start (or any time the token is
  /// missing): signs in with the kept login. False while the site cannot be
  /// reached, which is not an error: the punches simply keep waiting.
  static Future<bool> goOnline() async {
    if (Session.I.signInAgain.value) return false;
    try {
      final run = Session.I.signOuts;
      final creds = await AuthStore.load();
      if (!creds.canReauth) return false;
      final ok = await _passwordLogin(creds.email, creds.password);
      if (ok) {
        Session.I.offlineStart = false;
        await _resolveQuietly(remembered: true);
      } else if (run == Session.I.signOuts) {
        _keptPasswordRefused();
      }
      return ok;
    } catch (_) {
      return false;
    }
  }

  /// The site said no to the password this phone keeps. Silent sign-ins stop
  /// here — ten wrong ones in a row lock the login — and the app asks the
  /// person to sign in again (app.dart).
  static void _keptPasswordRefused() {
    Session.I.signInAgain.value = true;
  }

  /// This person's date of birth, as the site holds it (`YYYY-MM-DD`), or null.
  ///
  /// Read on its own rather than added to the employee lookup's field list: a
  /// site that refused the one field would send that whole lookup to its short
  /// list, and the person's shift and holiday list with it. Null means "could
  /// not tell", which `mustChangePassword` reads as no first password to be on.
  static Future<String?> birthDate() async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return null;
    try {
      final rows = await _list('Employee', const ['name', 'date_of_birth'], filters: [
        ['name', '=', emp]
      ]);
      final v = rows.isEmpty ? null : rows.first['date_of_birth'];
      return v == null ? null : '$v';
    } catch (_) {
      return null;
    }
  }

  /// Whether the saved password is still the first one HR gave — this
  /// person's date of birth as DDMMYYYY — so a new one must be chosen first.
  static Future<bool> onFirstPassword() async {
    final creds = await AuthStore.load();
    if (creds.password.isEmpty) return false;
    return mustChangePassword(creds.password, await birthDate());
  }

  /// The employee lookup, where a failure must not undo a sign-in that worked.
  ///
  /// The password was right and the session is live; if the lookup after it
  /// fails, throwing here would leave somebody on the sign-in form reading an
  /// error about a password they typed correctly. So it returns null and the
  /// punch screen — which asks again on open — is where the real reason is
  /// shown.
  ///
  /// [remembered]: the kept login is signing back in (the app opening, or the
  /// signal coming back), so when the lookup cannot be made the employee this
  /// phone remembers for that same login stands in. Without it a flaky start
  /// (the sign-in answered, the lookup timed out) read "No employee record
  /// carries this login" and switched punching off. Never for a fresh sign-in
  /// on the form, which may be somebody else.
  static Future<Map<String, dynamic>?> _resolveQuietly({bool remembered = false}) async {
    try {
      return await resolveEmployee();
    } catch (_) {
      if (!remembered) return null;
      final kept = Session.I.employee ?? await AuthStore.loadEmployee(forLogin: Session.I.email);
      if (kept != null) Session.I.employee = kept;
      return kept;
    }
  }

  static void _wireReauth() {
    Session.I.reauthenticate = () async {
      if (Session.I.signInAgain.value) return false;
      final run = Session.I.signOuts;
      final creds = await AuthStore.load();
      if (!creds.canReauth) return false;
      final ok = await _passwordLogin(creds.email, creds.password);
      if (!ok && run == Session.I.signOuts) _keptPasswordRefused();
      return ok;
    };
    Session.I.refreshCsrf = _fetchCsrf;
    // Every run keeps what it learns about the site's clock, a first sign-in
    // included: the next start with no signal stamps kept punches with it.
    ServerClock.I.onSkew = (d) => AuthStore.saveSkew(d);
  }

  /// Signs in with [email] and [password], silently or from the form.
  ///
  /// **Clears the session, not the person.** A silent re-login (the site's
  /// session expired while a kept punch was being sent) is the same login
  /// coming back. Forgetting the employee here made the very next write say
  /// "not linked to an employee record", and a kept punch was dropped as
  /// refused. [login] forgets the person itself, before the form's sign-in.
  static Future<bool> _passwordLogin(String email, String password) async {
    final run = Session.I.signOuts;
    Session.I.clearSession();
    final r = await Session.I.dio.post(
      '/api/method/login',
      data: {'usr': email, 'pwd': password},
      options: Session.noRetry.copyWith(
        contentType: Headers.formUrlEncodedContentType,
        followRedirects: true,
        maxRedirects: 5,
      ),
    );
    final code = r.statusCode ?? 0;
    // 401 is the site saying the password is wrong (403: the login may not
    // sign in). Anything else — 429 when the site is rationing requests, a
    // proxy's 404 — is the site answering badly, not a wrong password: it must
    // not send somebody signed in to the sign-in form, nor read "Wrong Emp
    // Code or password" there.
    if (code == 401 || code == 403) return false;
    if (code != 200) {
      throw DioException.badResponse(statusCode: code, requestOptions: r.requestOptions, response: r);
    }

    var sid = '';
    for (final c in r.headers.map['set-cookie'] ?? const <String>[]) {
      final m = RegExp(r'sid=([^;]+)').firstMatch(c);
      if (m != null) sid = m.group(1) ?? '';
    }
    if (sid.isEmpty || sid == 'Guest') return false;
    // Signed out (or somebody else signed in) while this was on its way: the
    // session it won is not theirs to keep. Ended on the site, not saved.
    if (run != Session.I.signOuts) {
      unawaited(Session.I.dio
          .get('/api/method/logout', options: Options(headers: {'Cookie': 'sid=$sid'}, extra: {'authRetried': true}))
          .then((_) {}, onError: (_) {}));
      return false;
    }

    Session.I.sid = sid;
    Session.I.email = email;
    await AuthStore.saveSid(sid);
    await _fetchCsrf();
    // When the site will not say who this is (a dropped answer), the user it
    // named before stands — the same person signing back in. The typed Emp
    // Code is never put in its place: it is never what `Employee.user_id`
    // holds, and looking somebody up by it says "not linked" to a person who
    // is. An email login is its own user id, so it may stand in.
    final who = await whoami();
    if (who.isNotEmpty && who != 'Guest') {
      Session.I.user = who;
    } else if (Session.I.user.isEmpty && email.contains('@')) {
      Session.I.user = email;
    }
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
      // Only a 200 says who this is. A 429 or a 403 can carry a "message" too,
      // and "Too many requests" is nobody's user id.
      if (r.statusCode != 200) return '';
      final u = (r.data is Map) ? r.data['message'] : null;
      return u is String ? u : '';
    } catch (_) {
      return '';
    }
  }

  /// Whether this login is HR: somebody the site lets create an Employee — the
  /// same test the website's menus use (`client/src/api/client.js` isAdmin).
  /// **A menu, not the security** (see `core/landing.dart`). A site that will
  /// not answer is "no": the employee's side is the one that cannot show
  /// anybody else's day.
  static Future<bool> isAdmin() async {
    final login = Session.I.email;
    try {
      final r = await Session.I.dio.get('/api/method/frappe.client.has_permission',
          queryParameters: {'doctype': 'Employee', 'docname': '', 'perm_type': 'create'});
      final m = (r.data is Map) ? r.data['message'] : null;
      if (m is Map) {
        Session.I.isAdmin = m['has_permission'] == true;
        if (login.isNotEmpty) await AuthStore.saveAdmin(login, Session.I.isAdmin);
        return Session.I.isAdmin;
      }
    } catch (_) {
      // Fall through to what this login was last time.
    }
    // The site could not be asked: what it said last time for this login, so
    // HR does not land on the employee side over one slow read.
    Session.I.isAdmin = login.isNotEmpty && (await AuthStore.loadAdmin(login) ?? false);
    return Session.I.isAdmin;
  }

  /// The signed-in user's own name, for a login with no Employee record — an
  /// HR account. Falls back to what was typed.
  static Future<String> fullName() async {
    try {
      final r = await Session.I.dio.get('/api/method/frappe.client.get_value', queryParameters: {
        'doctype': 'User',
        'fieldname': 'full_name',
        'filters': jsonEncode({'name': Session.I.user}),
      });
      final m = (r.data is Map) ? r.data['message'] : null;
      final n = m is Map ? '${m['full_name'] ?? ''}' : '';
      if (n.isNotEmpty) return n;
    } catch (_) {
      // The address is still a name worth showing.
    }
    return Session.I.user.isNotEmpty ? Session.I.user : Session.I.email;
  }

  /// Frappe's own "forgot password": the site emails a reset link to the
  /// login's address. A guest call, so it works from the sign-in screen.
  static Future<void> resetPassword({required String user}) async {
    if (user.trim().isEmpty) throw const Refused('Type your email first.');
    Session.I.init(url: site);
    final r = await Session.I.dio.post(
      '/api/method/frappe.core.doctype.user.user.reset_password',
      data: {'user': user.trim()},
      options: Session.noRetry.copyWith(contentType: Headers.formUrlEncodedContentType),
    );
    final msg = (r.data is Map) ? '${r.data['message'] ?? ''}' : '';
    if ((r.statusCode ?? 0) >= 300 || msg == 'not found') {
      throw Refused(frappeMessage(r.data) ?? 'The site does not know that login.');
    }
  }

  /// Change this login's password on the site, then sign in again with it —
  /// Frappe starts a fresh session on a change, and the stored password is
  /// what every silent re-login sends (`core/auth_store.dart`).
  static Future<void> changePassword({required String current, required String next}) async {
    if (current.isEmpty || next.isEmpty) throw const Refused('Type both passwords.');
    final email = Session.I.email;
    final Response<dynamic> r;
    try {
      r = await Session.I.dio.post(
        '/api/method/frappe.core.doctype.user.user.update_password',
        data: {'old_password': current, 'new_password': next, 'logout_all_sessions': 0},
        options: Options(contentType: Headers.formUrlEncodedContentType),
      );
    } catch (e) {
      // The answer was lost — but the change may have been made. Signing in
      // with the new password tells which: if it works, the change is done and
      // kept; otherwise the old password still stands and nothing is changed.
      if (!isNetworkFailure(e)) rethrow;
      try {
        if (await _passwordLogin(email, next)) {
          await AuthStore.saveLogin(siteUrl: Session.I.siteUrl, email: email, password: next);
          return;
        }
      } catch (_) {}
      rethrow;
    }
    if ((r.statusCode ?? 0) >= 300) {
      throw Refused(frappeMessage(r.data) ?? 'The site refused the new password.');
    }
    await AuthStore.saveLogin(siteUrl: Session.I.siteUrl, email: email, password: next);
    // The password has changed on the site and is kept here: that is done.
    // Signing in again with it is only the session, and a lost signal now must
    // not read as "the change failed"; the next request signs in by itself.
    try {
      await _passwordLogin(email, next);
    } catch (_) {}
  }

  static Future<void> logout() async {
    Session.I.reauthenticate = null;
    try {
      // A few seconds, not a time-out's worth: signing out is local first.
      await Session.I.dio.get('/api/method/logout').timeout(const Duration(seconds: 5));
    } catch (_) {
      // Signing out locally is the part that matters. A site that cannot be
      // reached must not leave somebody stuck signed in on a shared handset.
    }
    Session.I.clearAuth();
    Session.I.offlineStart = false;
    Session.I.signInAgain.value = false;
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
  ///
  /// The short list is tried only when the site *answered* (a field it has
  /// not got). With no signal it would only wait out the same time-out a second
  /// time, which doubled every spinner on a dead network. [onNoSignal] says
  /// which kind of null this is.
  static Future<List<Map<String, dynamic>>?> _read(
    String doctype,
    List<String> long,
    List<String> short, {
    List<List<dynamic>>? filters,
    String orderBy = 'modified desc',
    void Function()? onNoSignal,
  }) async {
    try {
      return await _list(doctype, long, filters: filters, orderBy: orderBy);
    } catch (e) {
      if (isNetworkFailure(e)) {
        onNoSignal?.call();
        return null;
      }
      try {
        return await _list(doctype, short, filters: filters, orderBy: orderBy);
      } catch (e) {
        if (isNetworkFailure(e)) onNoSignal?.call();
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
    final run = Session.I.signOuts;
    var who = Session.I.user;
    if (who.isEmpty || !who.contains('@')) {
      // Not known yet (an offline start keeps only the typed Emp Code): ask.
      final asked = await whoami();
      if (asked.isNotEmpty && asked != 'Guest') {
        Session.I.user = asked;
        who = asked;
      } else if (who.isEmpty && Session.I.email.contains('@')) {
        who = Session.I.email;
      }
    }
    if (who.isEmpty || !who.contains('@')) {
      throw const Refused('The site would not say which employee you are. Check your signal '
          'and pull down to try again.');
    }
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
    // Signed out while this was read: not theirs any more.
    if (run != Session.I.signOuts) return null;
    // Active first: somebody who left and came back has two records, and the
    // live one is the one their punches belong to.
    rows.sort((a, b) =>
        (a['status'] == 'Active' ? 0 : 1).compareTo(b['status'] == 'Active' ? 0 : 1));
    Session.I.employee = rows.first;
    // Remembered, for opening with no signal. Not read back for anything else.
    await AuthStore.saveEmployee(rows.first, login: Session.I.email);
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
    if (rows == null) {
      // The site did not answer. Show the day as last read rather than an empty
      // one: an empty day offers IN to somebody already in.
      punchesFromCache = true;
      return await AuthStore.loadDayPunches(iso, employee: emp) ?? const [];
    }
    punchesFromCache = false;
    await AuthStore.saveDayPunches(iso, rows, employee: emp);
    return rows;
  }

  /// Whether the last [punchesOn] was answered from what the phone remembered.
  static bool punchesFromCache = false;

  /// Whether a punch with this time and direction is already on the site, asked
  /// before a kept punch is sent again, so a send whose answer was lost on the
  /// way back is not made twice.
  ///
  /// **Within a few minutes, not to the second.** A punch tried live and kept
  /// when its answer was lost was stamped by the *site's* clock on arrival,
  /// after the photo upload and the send, while the kept copy carries the
  /// moment of the press. Matched to the second they missed each other, and the
  /// queue sent a second IN. Two real punches the same way inside this window
  /// are one punch pressed twice.
  static Future<bool> punchExists(String employee, String time, String logType) async {
    final at = DateTime.tryParse(time.replaceFirst(' ', 'T'));
    final rows = await _list(kCheckinDoctype, const ['name'], filters: [
      ['employee', '=', employee],
      if (at == null)
        ['time', '=', time]
      else ...[
        ['time', '>=', stampOf(at.subtract(kSamePunchWindow))],
        ['time', '<=', stampOf(at.add(kSamePunchWindow))],
      ],
      ['log_type', '=', logType],
    ], limit: 1);
    return rows.isNotEmpty;
  }

  /// One month of punches, leave and corrections, in one go.
  ///
  /// Three narrow reads rather than one wide one, and narrow is the design: a
  /// month of punches for the whole group would be tens of thousands of rows
  /// nobody asked for. Each carries its own failure, because "nobody punched"
  /// and "the punches could not be read" are opposite findings on a screen
  /// about whether somebody was paid.
  ///
  /// [who] is an Employee record, for HR reading somebody else's month; left
  /// out, it is this login's own.
  static Future<MonthData> month(String ym, {Map<String, dynamic>? who}) async {
    final person = who ?? Session.I.employee;
    final emp = '${person?['name'] ?? ''}';
    if (emp.isEmpty) {
      // Not a month nobody came in: there is nobody to read it for.
      return MonthData(
        punches: const [],
        leave: const [],
        corrections: const [],
        holidays: const [],
        punchesUnread: true,
        error: 'No employee record is linked to this login, so there is no month to show. '
            'Ask HR to set your user on your Employee record.',
      );
    }

    // The month's real last day. `-31` read well as a string, but the site
    // turns a Date filter into a date first, and 31 November is not one: in
    // every month without a 31st it refused the leave and correction reads,
    // and approved leave was drawn as Absent.
    final from = '$ym-01';
    final to = '$ym-${_lastDay(ym)}';

    var noSignal = false;
    var holidaysOff = false;
    void off() => noSignal = true;
    void holidaysGone() {
      noSignal = true;
      holidaysOff = true;
    }

    // The holidays beside the three reads rather than after them: one wait on a
    // slow network, not two.
    final holidays = who == null
        ? _myHolidays(from, to, person, onNoSignal: holidaysGone)
        : _holidays(person, onNoSignal: holidaysGone);
    final results = await Future.wait([
      _read(
        kCheckinDoctype,
        _punchFields,
        _punchFieldsMin,
        // From the evening before the 1st to the morning after the last day:
        // a night shift at either edge of the month is one day, read whole
        // (core/roster.dart byWorkDay).
        filters: [
          ['employee', '=', emp],
          ['time', '>=', '${_dayBefore(from)} ${kNightFromHour.toString().padLeft(2, '0')}:00:00'],
          ['time', '<=', '${_dayAfter(to)} ${(kNextDayHours - 1).toString().padLeft(2, '0')}:59:59'],
        ],
        orderBy: 'time asc',
        onNoSignal: off,
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
        onNoSignal: off,
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
        onNoSignal: off,
      ),
    ]);

    final hols = await holidays;
    final refused = <String>[
      if (results[0] == null) 'punches',
      if (results[1] == null) 'leave',
      if (results[2] == null) 'corrections',
      if (holidaysOff) 'holidays',
    ];

    return MonthData(
      punches: results[0] ?? const [],
      leave: results[1] ?? const [],
      corrections: results[2] ?? const [],
      holidays: hols,
      punchesUnread: results[0] == null,
      leaveUnread: results[1] == null,
      holidaysUnread: holidaysOff,
      offline: noSignal,
      error: refused.isEmpty
          ? ''
          : noSignal
              ? 'No signal, so this month could not be read. Pull down to try again.'
              : 'The site would not answer for ${refused.join(', ')}. Pull down to try again.',
    );
  }

  static final Map<String, List<Map<String, dynamic>>> _holidayCache = {};

  /// The signed-in person's own holidays, from the site (26 November 2026).
  ///
  /// An Employee login may not read Company, so reading the company's
  /// `default_holiday_list` here found nothing and every Sunday came out
  /// absent. `manna_hr.api.my_holidays` reads it for the session's own record
  /// and marks every Sunday a week off. A site without that call yet answers
  /// with an error, and the old reads are tried instead; the calendar treats
  /// Sundays as week offs either way (core/roster.dart).
  static Future<List<Map<String, dynamic>>> _myHolidays(
      String from, String to, Map<String, dynamic>? person, {void Function()? onNoSignal}) async {
    try {
      final r = await Session.I.dio.get('/api/method/manna_hr.api.my_holidays',
          queryParameters: {'from_date': from, 'to_date': to});
      final m = (r.data is Map) ? r.data['message'] : null;
      if (r.statusCode == 200 && m is Map && m['holidays'] is List) {
        return (m['holidays'] as List).whereType<Map>().map((h) => h.cast<String, dynamic>()).toList();
      }
    } catch (e) {
      // No signal: the old reads would only wait out the same time-out again.
      if (isNetworkFailure(e)) {
        onNoSignal?.call();
        return const [];
      }
      // Otherwise fall through to the old reads.
    }
    return _holidays(person, onNoSignal: onNoSignal);
  }

  static String _dayBefore(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : isoDay(DateTime(d.year, d.month, d.day - 1));
  }

  static String _dayAfter(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : isoDay(DateTime(d.year, d.month, d.day + 1));
  }

  /// Last night's punch-in, when its shift is still running: somebody in at
  /// 20:30 yesterday is in at 02:00 today, and a card reading only today said
  /// "You haven't punched in" and offered a second IN. Null when there is no
  /// such punch, or it could not be read.
  static Future<Map<String, dynamic>?> nightArrival(String iso) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) return null;
    try {
      final rows = await _list(kCheckinDoctype, const ['name', 'time', 'log_type'], filters: [
        ['employee', '=', emp],
        ['time', '>=', '${_dayBefore(iso)} ${kNightFromHour.toString().padLeft(2, '0')}:00:00'],
        ['time', '<', '$iso 00:00:00'],
      ], orderBy: 'time desc', limit: 1);
      if (rows.isEmpty) return null;
      final last = rows.first;
      if ('${last['log_type'] ?? ''}'.toUpperCase() == kLogOut) return null;
      final at = DateTime.tryParse('${last['time'] ?? ''}'.replaceFirst(' ', 'T'));
      if (at == null || ServerClock.I.now().difference(at) > kNightLongest) return null;
      return last;
    } catch (e) {
      // No signal is not "no night": the card keeps what it knew.
      if (isNetworkFailure(e)) rethrow;
      return null;
    }
  }

  static String _lastDay(String ym) {
    final y = int.parse(ym.substring(0, 4));
    final m = int.parse(ym.substring(5, 7));
    return DateTime(y, m + 1, 0).day.toString().padLeft(2, '0');
  }

  /// The holiday list this person is measured against: their own where the
  /// record names one, otherwise their company's default.
  ///
  /// **A month read without it calls every Sunday an absence.** So a site that
  /// names neither is worth saying out loud rather than drawing, which is what
  /// the empty list lets the calendar do.
  static Future<List<Map<String, dynamic>>> _holidays(Map<String, dynamic>? person,
      {void Function()? onNoSignal}) async {
    var listName = '${person?['holiday_list'] ?? ''}';
    if (listName.isEmpty) {
      final company = '${person?['company'] ?? ''}';
      if (company.isEmpty) return const [];
      final rows = await _read(
        'Company',
        ['name', 'default_holiday_list'],
        ['name'],
        filters: [
          ['name', '=', company]
        ],
        onNoSignal: onNoSignal,
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
      if (doc is! Map || doc['holidays'] is! List) return const [];
      final rows = (doc['holidays'] as List).whereType<Map>().map((h) => h.cast<String, dynamic>()).toList();
      // Only a list the site actually sent is kept: a refusal or an empty
      // answer must not stick for as long as the app is open.
      _holidayCache[listName] = rows;
      return rows;
    } catch (e) {
      if (isNetworkFailure(e)) onNoSignal?.call();
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
    // "Could not read" is not "you have asked for none", and the screens draw
    // an empty list as the second.
    if (rows == null) {
      throw const Refused('Your corrections could not be read. Check your signal and pull down to try again.');
    }
    return rows.take(limit).toList();
  }

  /// One whole Employee record — the profile. The list read behind
  /// [resolveEmployee] is narrow on purpose; this is the one place every
  /// field is wanted. An employee may read their own; HR may read anybody's.
  static Future<Map<String, dynamic>> employeeRecord(String id) async {
    final r = await Session.I.dio.get('${_res('Employee')}/${Uri.encodeComponent(id)}');
    final doc = (r.data is Map) ? r.data['data'] : null;
    if (doc is Map) return doc.cast<String, dynamic>();
    throw Refused(frappeMessage(r.data) ?? 'The site would not show that record.');
  }

  /// Submitted salary slips, newest first. A draft is HR's working copy and
  /// not yet anybody's pay, so it is not shown to the person it is for.
  static Future<List<Map<String, dynamic>>> salarySlips({String? employee, int limit = 24}) async {
    final emp = employee ?? Session.I.employeeId;
    if (emp.isEmpty) return const [];
    final rows = await _read(
      'Salary Slip',
      ['name', 'start_date', 'end_date', 'posting_date', 'gross_pay', 'total_deduction', 'net_pay',
        'rounded_total', 'payment_days', 'status'],
      ['name', 'start_date', 'end_date', 'net_pay'],
      filters: [
        ['employee', '=', emp],
        ['docstatus', '=', 1],
      ],
      orderBy: 'start_date desc',
    );
    if (rows == null) {
      throw const Refused('The site would not show the payslips. Pull down to try again.');
    }
    return rows.take(limit).toList();
  }

  /// One salary slip, with its earnings and deductions.
  static Future<Map<String, dynamic>> salarySlip(String name) async {
    final r = await Session.I.dio.get('${_res('Salary Slip')}/${Uri.encodeComponent(name)}');
    final doc = (r.data is Map) ? r.data['data'] : null;
    if (doc is Map) return doc.cast<String, dynamic>();
    throw Refused(frappeMessage(r.data) ?? 'The site would not show that payslip.');
  }

  // ----------------------------------------------------------------- writes --

  /// Record a punch.
  ///
  /// The coordinate is sent although the geofence is off by default: it is
  /// the evidence of where a punch was made, which HR reads on the dashboard,
  /// and what the fence would judge if `Manna HR Settings` ever turns it on.
  ///
  /// `time` is the *server's* clock as this app last saw it, not the phone's.
  /// The site overwrites it anyway on a self-service punch — see
  /// `manna_hr/checkin.py::_apply_server_clock` — and sending the phone's would
  /// be sending a number the person being measured controls.
  ///
  /// [photoUrl] is what [uploadPunchPhoto] returned. It rides on the same
  /// insert rather than a second write, because an employee may create a
  /// checkin and may not edit one — and Frappe's own `attach_files_to_document`
  /// hook, which runs on every insert, is what ties the uploaded file to this
  /// row, so HR's read on the checkin is what lets them see the photo.
  ///
  /// [accuracy], [address] and [device] ride on the same insert for the dashboard's Punch
  /// Info column. A site that has not got their fields yet drops them on the
  /// insert rather than refusing it, so they cannot cost a punch.
  static Future<Map<String, dynamic>> punch({
    required String logType,
    double? latitude,
    double? longitude,
    double? accuracy,
    String? address,
    String? photoUrl,
    String? device,
    String? at,
    bool queued = false,
    String? employee,
  }) async {
    // A kept punch is sent for the person who made it, whoever is signed in.
    // The queue only sends it while that person is (punch_queue.dart).
    final emp = employee ?? Session.I.employeeId;
    if (emp.isEmpty) {
      throw const Refused(
          'Your login is not linked to an employee record, so there is nobody '
          'to punch for. Ask HR to set your user on your Employee record.');
    }

    final doc = <String, dynamic>{
      'employee': emp,
      'log_type': logType,
      // [at] is the moment a kept punch was made. The site lets a punch marked
      // [queued] keep it (manna_hr/rules.py queued_punch_time), within limits;
      // anything else it stamps with its own clock.
      'time': at ?? stampOf(ServerClock.I.now()),
      'device_id': queued ? queuedDeviceId(emp) : deviceIdFor(emp),
    };
    if (latitude != null && longitude != null) {
      doc['latitude'] = latitude;
      doc['longitude'] = longitude;
      if (accuracy != null) doc[kAccuracyField] = accuracy;
      if ((address ?? '').isNotEmpty) doc[kAddressField] = address;
    }
    if ((device ?? '').isNotEmpty) doc[kDeviceInfoField] = device;
    if ((photoUrl ?? '').isNotEmpty) doc[kPhotoField] = photoUrl;

    // No token, no write: a start on a weak signal can lose the page it comes
    // from. Asked for now, rather than learning it from an "Invalid Request".
    if (Session.I.csrfToken.isEmpty) await _fetchCsrf();
    final r = await Session.I.dio.post(_res(kCheckinDoctype), data: doc);
    final ok = (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300;
    if (!ok && !_judged(r)) {
      // Not the site judging the punch: a session that ran out (401/403), a
      // token the site no longer takes, the site rationing requests (429), a
      // time-out on the way (408). Kept and sent again — never "not recorded".
      throw DioException(
        requestOptions: r.requestOptions,
        response: r,
        type: DioExceptionType.unknown,
        message: 'The site could not take the punch just now (${r.statusCode}).',
      );
    }
    if ((r.statusCode ?? 0) >= 500) {
      // The site is up and failing (a restart, a gateway). For a punch that is
      // "could not reach it", not a refusal: kept and tried again, never
      // dropped, because nothing judged it.
      throw DioException.badResponse(
          statusCode: r.statusCode ?? 500, requestOptions: r.requestOptions, response: r);
    }
    if (!ok) {
      // The site's own sentence. `checkin.py` refuses with the distance and the
      // gate's name in it, and that is the whole of what somebody can act on.
      throw Refused(frappeMessage(r.data) ??
          'The site refused the punch and said nothing about why.');
    }
    final made = (r.data is Map) ? r.data['data'] : null;
    if (made is! Map || '${made['name'] ?? ''}'.isEmpty) {
      // A 2xx with no checkin in it did not come from the site's insert: a
      // network in between answered for it. Not recorded, so kept and tried
      // again (the queue looks before it sends, so a punch that did land is
      // not made twice).
      throw DioException(
        requestOptions: r.requestOptions,
        response: r,
        type: DioExceptionType.unknown,
        message: 'The answer to the punch had no checkin in it.',
      );
    }
    return made.cast<String, dynamic>();
  }

  /// Whether a refused punch was refused by the site *judging it* — its rules
  /// (too far, outside the window, a duplicate) — rather than by the session
  /// or the network around it.
  static bool _judged(Response r) {
    final code = r.statusCode ?? 0;
    if (code == 401 || code == 403 || code == 408 || code == 429) return false;
    final body = r.data;
    if (body is Map && '${body['exc_type'] ?? ''}' == 'CSRFTokenError') return false;
    return true;
  }

  /// Put the punch photo on the site, and say where it went.
  ///
  /// **Private**, because it is somebody's face: a private file is served only
  /// to a session that may read the document it is attached to, and a public
  /// one to anybody who guesses the URL. Uploaded unattached, before the punch
  /// exists — [punch] carries the URL and the insert attaches it.
  ///
  /// Returns null rather than throwing on failure. A photo that did not upload
  /// must not cost the punch it was meant to go with; the dashboard draws that
  /// punch as having no photo, which is the flag a human reads.
  ///
  /// [onNoSignal] is called when the failure was "could not reach the site":
  /// the punch screen then keeps the punch on the phone at once, photo and all,
  /// instead of making somebody at a gate wait out a second time-out.
  static Future<String?> uploadPunchPhoto(String path, {void Function()? onNoSignal}) async {
    try {
      final stamp = stampOf(ServerClock.I.now()).replaceAll(RegExp(r'[^0-9]'), '');
      final form = FormData.fromMap({
        // `.jpg` in the name matters: the site decides what a non-desk user may
        // upload from the extension, and an image is on that list.
        'file': await MultipartFile.fromFile(path,
            filename: 'punch-${Session.I.employeeId}-$stamp.jpg'),
        'is_private': '1',
      });
      final r = await Session.I.dio.post(
        '/api/method/upload_file',
        data: form,
        options: Options(sendTimeout: const Duration(seconds: 30)),
      );
      final msg = (r.data is Map) ? r.data['message'] : null;
      final url = msg is Map ? '${msg['file_url'] ?? ''}' : '';
      return url.isEmpty ? null : url;
    } catch (e) {
      if (isNetworkFailure(e)) onNoSignal?.call();
      return null;
    }
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

  // ------------------------------------------------------------------ leave --

  /// The kinds of leave this person may ask for, with what is left of each —
  /// hrms's own `get_leave_details`, the call the desk's Leave Application
  /// form makes, so the number is the one the site will measure against.
  static Future<List<LeaveKind>> leaveKinds({String? employee}) async {
    final emp = employee ?? Session.I.employeeId;
    if (emp.isEmpty) return const [];
    final r = await Session.I.dio.get(
      '/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details',
      queryParameters: {
        'employee': emp,
        'date': stampOf(ServerClock.I.now()).substring(0, 10),
      },
    );
    final msg = (r.data is Map) ? r.data['message'] : null;
    if (msg is! Map) {
      throw Refused(frappeMessage(r.data) ??
          'The site would not say which leave you have. Pull down to try again.');
    }
    return kindsFrom(msg.cast<String, dynamic>());
  }

  /// Every leave application this person has made, newest first, decided
  /// ones included — "what happened to the one I sent" is the question.
  static Future<List<Map<String, dynamic>>> myLeave({int limit = 50, String? employee}) async {
    final emp = employee ?? Session.I.employeeId;
    if (emp.isEmpty) return const [];
    final rows = await _read(
      kLeaveDoctype,
      ['name', 'leave_type', 'from_date', 'to_date', 'half_day', 'total_leave_days',
        'description', 'status', 'docstatus', 'creation'],
      ['name', 'leave_type', 'from_date', 'to_date', 'status', 'docstatus'],
      filters: [
        ['employee', '=', emp]
      ],
      orderBy: 'from_date desc',
    );
    if (rows == null) {
      throw const Refused('The site would not show your leave. Pull down to try again.');
    }
    return rows.take(limit).toList();
  }

  /// Ask for leave. **A request, never leave**: a draft Leave Application,
  /// Open, to the administrator. Approving it on the dashboard submits it, and
  /// hrms then books the balance and marks the days On Leave by itself — which
  /// is the "automatic" half, and none of it happens on this phone.
  static Future<void> applyLeave({
    required String type,
    required String from,
    required String to,
    required bool halfDay,
    required String reason,
  }) async {
    final emp = Session.I.employeeId;
    if (emp.isEmpty) {
      throw const Refused(
          'Your login is not linked to an employee record. Ask HR to set your '
          'user on your Employee record.');
    }
    final problem = leaveProblem(type: type, from: from, to: to, halfDay: halfDay, reason: reason);
    if (problem != null) throw Refused(problem);

    final doc = leaveDoc(
      employee: emp,
      company: '${Session.I.employee?['company'] ?? ''}',
      type: type,
      from: from,
      to: to,
      halfDay: halfDay,
      reason: reason,
      today: stampOf(ServerClock.I.now()).substring(0, 10),
    );
    final r = await Session.I.dio.post(_res(kLeaveDoctype), data: doc);
    final ok = (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 300;
    if (!ok) {
      // hrms's own sentence: the balance, an overlap, a date outside the
      // allocation — each is something the person can act on.
      throw Refused(frappeMessage(r.data) ??
          'The site refused the leave and said nothing about why.');
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
    this.punchesUnread = false,
    this.leaveUnread = false,
    this.holidaysUnread = false,
    this.offline = false,
  });

  /// The leave, or the holidays, could not be read for want of signal. The
  /// month is then not drawn either: an approved leave day or Christmas would
  /// read Absent.
  final bool leaveUnread;
  final bool holidaysUnread;

  /// Whether the month can be drawn day by day without calling a day absent
  /// that is not.
  bool get drawable => !punchesUnread && !leaveUnread && !holidaysUnread;

  factory MonthData.empty() => MonthData(
        punches: const [],
        leave: const [],
        corrections: const [],
        holidays: const [],
        error: '',
      );

  /// The punches could not be read. The month is then not drawn: every
  /// workday with no punch in an empty list reads as Absent, which is a false
  /// thing to show somebody about their pay.
  final bool punchesUnread;

  /// A read failed for want of signal, not because the site refused it.
  final bool offline;

  final List<Map<String, dynamic>> punches;
  final List<Map<String, dynamic>> leave;
  final List<Map<String, dynamic>> corrections;
  final List<Map<String, dynamic>> holidays;

  /// Which of the reads the site would not answer, in its own terms rather than
  /// as an empty table.
  final String error;

  /// True when nothing says which days are Sundays. Every Sunday then reads as
  /// a day nobody punched on, which reads as absent — worth saying on screen.
  /// Only when the site was reached: with no signal there is nothing to tell
  /// HR about.
  bool get noHolidayList => holidays.isEmpty && !offline;
}
