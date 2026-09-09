import 'package:dio/dio.dart';

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
  String email = '';
  String sid = '';
  String csrfToken = '';

  /// The `Employee` this login is, resolved once at sign-in from `user_id`.
  ///
  /// Null is a real state and it is the one this app has to handle kindly:
  /// somebody whose Employee record has no `user_id` on it can sign in and has
  /// nothing to punch against. See `Api.resolveEmployee`.
  Map<String, dynamic>? employee;

  String get employeeId => '${employee?['name'] ?? ''}';
  String get employeeName => '${employee?['employee_name'] ?? email}';

  late Dio dio;

  /// Re-establishes the session silently. Wired up by `Api` at start-up; left
  /// null, the interceptor simply passes auth failures through to the caller.
  Future<bool> Function()? reauthenticate;

  // Marks a request that has already been replayed once, so a permanently
  // rejected credential cannot spin the retry loop.
  static const _kRetried = 'authRetried';

  Future<bool>? _reauthInFlight;

  /// Opts a request out of the auto-reauth machinery. Anything called from
  /// inside [reauthenticate] must use this: it is already running under
  /// `_refresh`, so triggering another refresh would await itself forever.
  static Options get noRetry => Options(extra: {_kRetried: true});

  Map<String, String> get authHeaders =>
      sid.isEmpty ? const {} : {'Cookie': 'sid=$sid'};

  void clearAuth() {
    sid = '';
    csrfToken = '';
    employee = null;
  }

  static const _authPaths = ['/api/method/login', '/api/method/logout'];
  static bool _isAuthPath(String path) => _authPaths.any(path.contains);

  void init({String? url}) {
    if (url != null && url.isNotEmpty) siteUrl = url;
    dio = Dio(BaseOptions(
      baseUrl: siteUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      // Under 500 comes back as a response rather than as an exception, so a
      // 417 carrying the site's own refusal reaches the code that reads it.
      validateStatus: (s) => s != null && s < 500,
    ));
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        // Re-stamp auth on every attempt: a replayed request must not carry the
        // stale cookie that got it rejected.
        options.headers.remove('Cookie');
        options.headers.addAll(authHeaders);
        final m = options.method.toUpperCase();
        final isWrite = m == 'POST' || m == 'PUT' || m == 'DELETE';
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
    if (!await _refresh()) return null;
    final extra = Map<String, dynamic>.from(o.extra)..[_kRetried] = true;
    try {
      return await dio.fetch(o.copyWith(extra: extra));
    } catch (_) {
      return null;
    }
  }

  /// One re-login at a time. A screen that opens four reads in parallel would
  /// otherwise kick off four of them.
  Future<bool> _refresh() =>
      _reauthInFlight ??= reauthenticate!().whenComplete(() => _reauthInFlight = null);
}
