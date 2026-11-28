import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show ValueNotifier;

import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/server_clock.dart';

/// The one connection this app has, and it is to the ERPNext site.
///
/// **ERPNext is the server.** There is no process of ours in between: the
/// doctypes are the schema, the site's roles are the permissions, and the rules
/// that decide what somebody is paid run on the site's own clock (CLAUDE.md
/// §1). So this holds the person's own Frappe session and every read and write
/// is logged over there as *them*. Nothing in this file is a security boundary
/// and nothing in it pretends to be — a rule enforced here would be a rule
/// anybody holding the APK could skip.
///
/// Trimmed from the field-sales app's `core/session.dart`. What is kept is the
/// half that has been paid for in the field: re-stamping auth on every attempt,
/// one re-login at a time, and feeding the server clock off every response.
class Session {
  static final Session I = Session._();
  Session._();

  String siteUrl = kDefaultSiteUrl;

  /// What was typed on the sign-in form, and what a silent re-login sends back
  /// as `usr`. **Not the same thing as [user]**, and not what an Employee is
  /// looked up by — Frappe accepts a username there as readily as an email.
  String email = '';

  /// Who the site says this session is: the `User` id, straight from
  /// `frappe.auth.get_logged_user`.
  ///
  /// This is what `Employee.user_id` holds and therefore the only thing worth
  /// matching an employee on. Asked rather than assumed, because somebody who
  /// signs in as `paul` is signed in as `paul@mannarubber.com`, and looking up
  /// the typed word finds nobody — which reads on screen as "HR has not linked
  /// your record" and is a person unable to punch.
  String user = '';

  String sid = '';
  String csrfToken = '';

  /// The `Employee` this login is, resolved once at sign-in from `user_id`.
  ///
  /// Null is a real state and it is the one this app has to handle kindly:
  /// somebody whose Employee record has no `user_id` on it can sign in and has
  /// nothing to punch against. See `Api.resolveEmployee`.
  Map<String, dynamic>? employee;

  /// The app opened with no signal and is running on what it remembered about
  /// this phone's owner. Cleared by `Api.goOnline` once the site answers. While
  /// it is set there is no live session, so nothing but a punch is offered.
  bool offlineStart = false;

  /// Whether the site lets this login create an Employee — HR. Asked on every
  /// sign-in and every start (`Api.isAdmin`), so a login whose HR role was
  /// taken away stops seeing everybody's day. **A menu, not the security**:
  /// what each read returns is the site's roles, whatever this says.
  bool isAdmin = false;

  String get employeeId => '${employee?['name'] ?? ''}';
  String get employeeName => '${employee?['employee_name'] ?? email}';

  /// The login as the person knows it — their Emp Code, `MRP-293` — never the
  /// stand-in address the site names a login by when the record has no email
  /// (`mrp-293@phone.manna.invalid`, manna_hr/appaccess.py stand_in_email).
  /// Asked for 26 November 2026: the ID they signed in with is their ID.
  String get loginName {
    final code = '${employee?['employee_number'] ?? ''}'.trim();
    if (code.isNotEmpty) return code;
    for (final v in [email, user]) {
      if (v.trim().isNotEmpty && !isStandIn(v)) return v.trim();
    }
    // Only the stand-in is known: the Emp Code is what it was made from.
    final s = [email, user].firstWhere((v) => v.trim().isNotEmpty, orElse: () => '');
    return isStandIn(s) ? s.trim().split('@').first.toUpperCase() : s.trim();
  }

  late Dio dio;

  /// Re-establishes the session silently. Wired up by `Api` at start-up; left
  /// null, the interceptor simply passes auth failures through to the caller.
  Future<bool> Function()? reauthenticate;

  /// Fetches the session's CSRF token again. Wired up by `Api`. A start on a
  /// weak signal can lose the page the token comes from; every write then
  /// came back "Invalid Request" and a punch was refused instead of kept.
  Future<void> Function()? refreshCsrf;

  /// Set when the kept password no longer works — HR reset it, or it was
  /// changed on the website. The app then asks the person to sign in again
  /// rather than retrying a password the site will lock the login over.
  final ValueNotifier<bool> signInAgain = ValueNotifier(false);

  // Marks a request that has already been replayed once, so a permanently
  // rejected credential cannot spin the retry loop.
  static const _kRetried = 'authRetried';

  // The same for a write replayed with a fresh CSRF token: one each, apart, so
  // a write that needed a re-login and then a token still gets its token.
  static const _kCsrfRetried = 'csrfRetried';

  Future<bool>? _reauthInFlight;

  /// Opts a request out of the auto-reauth machinery. Anything called from
  /// inside [reauthenticate] must use this: it is already running under
  /// `_refresh`, so triggering another refresh would await itself forever.
  static Options get noRetry => Options(extra: {_kRetried: true});

  Map<String, String> get authHeaders =>
      sid.isEmpty ? const {} : {'Cookie': 'sid=$sid'};

  /// Signs out of everything: the session and who it was. Signing out, and a
  /// fresh sign-in on the form, which may be somebody else.
  void clearAuth() {
    clearSession();
    user = '';
    employee = null;
    isAdmin = false;
    signOuts++;
  }

  /// Bumped by every sign-out and fresh sign-in. A sign-in still running when
  /// the person signed out must not write its session back afterwards — the
  /// next start would open as the person who just left.
  int signOuts = 0;

  /// Drops the site session only. A silent re-login is the same person
  /// coming back, so who they are — the employee, the user the site named,
  /// HR or not — stays until a sign-in says otherwise (Api._passwordLogin).
  void clearSession() {
    sid = '';
    csrfToken = '';
  }

  static const _authPaths = ['/api/method/login', '/api/method/logout'];
  static bool _isAuthPath(String path) => _authPaths.any(path.contains);

  /// For the tests: the network every connection this app makes goes
  /// through — a pretend site, or one that is down. Never set in the app.
  static HttpClientAdapter? testAdapter;

  void init({String? url}) {
    if (url != null && url.isNotEmpty) siteUrl = url;
    dio = Dio(BaseOptions(
      baseUrl: siteUrl,
      // Ten seconds to reach the site: a phone with a bar of signal and no
      // data behind it (connected, going nowhere) otherwise held every screen
      // on a spinner for twenty, and a punch for forty.
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      // Under 500 comes back as a response rather than as an exception, so a
      // 417 carrying the site's own refusal reaches the code that reads it.
      validateStatus: (s) => s != null && s < 500,
    ));
    final fake = testAdapter;
    if (fake != null) dio.httpClientAdapter = fake;
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        // Re-stamp auth on every attempt: a replayed request must not carry the
        // stale cookie that got it rejected.
        options.headers.remove('Cookie');
        options.headers.addAll(authHeaders);
        final m = options.method.toUpperCase();
        final isWrite = m == 'POST' || m == 'PUT' || m == 'DELETE';
        // Re-stamped too: a replayed write must not carry the old session's
        // token, which the site refuses as "Invalid Request".
        options.headers.remove('X-Frappe-CSRF-Token');
        if (csrfToken.isNotEmpty && isWrite) {
          options.headers['X-Frappe-CSRF-Token'] = csrfToken;
        }
        handler.next(options);
      },
      onResponse: (response, handler) async {
        // Every response re-teaches the app what time the site thinks it is.
        ServerClock.I.syncFromHeader(response.headers.value('date'));
        if (await _needsReauth(response)) {
          final replayed = await _reauthAndReplay(response.requestOptions);
          if (replayed != null) return handler.resolve(replayed);
        }
        if (_csrfRefused(response)) {
          final replayed = await _newTokenAndReplay(response.requestOptions);
          if (replayed != null) return handler.resolve(replayed);
        }
        handler.next(response);
      },
    ));
  }

  Future<bool> _needsReauth(Response response) async {
    final o = response.requestOptions;
    if (reauthenticate == null) return false;
    if (o.extra[_kRetried] == true) return false;
    if (_isAuthPath(o.path)) return false;
    final sc = response.statusCode ?? 0;
    if (sc == 401) return true;
    // 403 is ambiguous — it covers both a dead session and a genuine permission
    // denial. Only the first is worth re-authenticating for, and the second
    // must reach the screen with the site's own words on it.
    if (sc == 403) return !await _sessionAlive();
    return false;
  }

  Future<bool> _sessionAlive() async {
    try {
      final r = await dio.get('/api/method/frappe.auth.get_logged_user',
          options: noRetry);
      final u = (r.data is Map) ? r.data['message'] : null;
      return r.statusCode == 200 && u is String && u.isNotEmpty && u != 'Guest';
    } catch (_) {
      // Network trouble, not an auth problem — do not burn a re-login on it.
      return true;
    }
  }

  Future<Response?> _reauthAndReplay(RequestOptions o) async {
    bool ok;
    try {
      ok = await _refresh();
    } catch (_) {
      ok = false;
    }
    if (!ok) return null;
    return _replay(o);
  }

  /// A write the site refused for its CSRF token — "Invalid Request". Asked
  /// once with a fresh token, never twice.
  bool _csrfRefused(Response response) {
    final o = response.requestOptions;
    if (refreshCsrf == null || o.extra[_kCsrfRetried] == true || _isAuthPath(o.path)) return false;
    final m = o.method.toUpperCase();
    if (m != 'POST' && m != 'PUT' && m != 'DELETE') return false;
    if (response.statusCode != 400 && response.statusCode != 403) return false;
    final body = response.data;
    return body is Map && '${body['exc_type'] ?? ''}' == 'CSRFTokenError';
  }

  Future<Response?> _newTokenAndReplay(RequestOptions o) async {
    try {
      await refreshCsrf!();
    } catch (_) {
      return null;
    }
    if (csrfToken.isEmpty) return null;
    return _replay(o, flag: _kCsrfRetried);
  }

  Future<Response?> _replay(RequestOptions o, {String flag = _kRetried}) async {
    final extra = Map<String, dynamic>.from(o.extra)..[flag] = true;
    // A multipart body can be sent once; the photo upload is replayed with a
    // fresh copy of it, or it went with no photo after every re-login.
    final data = o.data is FormData ? (o.data as FormData).clone() : o.data;
    try {
      return await dio.fetch(o.copyWith(extra: extra, data: data));
    } catch (_) {
      return null;
    }
  }

  /// One re-login at a time. A screen that opens four reads in parallel would
  /// otherwise kick off four of them.
  Future<bool> _refresh() =>
      _reauthInFlight ??= reauthenticate!().whenComplete(() => _reauthInFlight = null);
}

/// Whether [address] is the made-up login name the site gives somebody with no
/// email (manna_hr/appaccess.py STAND_IN_DOMAIN). Never shown as their ID.
bool isStandIn(String address) => address.trim().toLowerCase().endsWith('@phone.manna.invalid');
