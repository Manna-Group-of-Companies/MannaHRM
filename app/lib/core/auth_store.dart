import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// What the app keeps so that somebody at a gate is not asked to type.
///
/// **Why the password is kept, and what it costs.** Frappe's session cookie
/// expires — six hours by default — so a worker who punches in at eight is
/// signed out by two, and the punch-out at five would land on a login screen.
/// That is the expensive mistake this project rounds against: it costs a person
/// their day's pay and an argument with HR, while the alternative costs a
/// credential sitting in app-private storage on a phone (CLAUDE.md §4).
///
/// It is app-private, not encrypted. On a rooted handset it is readable, and
/// the honest answer to that is a whitelisted server method that mints an API
/// token for the caller's own user — Frappe's stock `generate_keys` is System
/// Manager only, so an ordinary employee cannot mint one. Until that method
/// exists this is the trade being made, deliberately and in writing.
class AuthStore {
  static const _kSiteUrl = 'siteUrl';
  static const _kEmail = 'email';
  static const _kSid = 'sid';
  static const _kPassword = 'pwd';

  static Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  static Future<Credentials> load() async {
    final p = await _prefs;
    return Credentials(
      siteUrl: p.getString(_kSiteUrl) ?? '',
      email: p.getString(_kEmail) ?? '',
      sid: p.getString(_kSid) ?? '',
      password: p.getString(_kPassword) ?? '',
    );
  }

  static Future<void> saveLogin({
    required String siteUrl,
    required String email,
    required String password,
  }) async {
    final p = await _prefs;
    await p.setString(_kSiteUrl, siteUrl);
    await p.setString(_kEmail, email);
    await p.setString(_kPassword, password);
  }

  // What the app opens on with no signal (asked for 18 November 2026): who this
  // phone belongs to, how far the phone's clock is from the site's, and the
  // day's punches as last read. None of it is a credential, and none of it is
  // trusted for anything but showing the screen — the site decides every punch.
  static const _kEmployee = 'cachedEmployee';
  static const _kSkewMs = 'skewMs';
  static const _kDayPunches = 'cachedDayPunches';
  static const _kAdmin = 'cachedAdmin';

  /// Remembers [emp] for opening with no signal, with the [login] it belongs
  /// to — so a shared phone never opens offline as the last person.
  static Future<void> saveEmployee(Map<String, dynamic> emp, {String? login}) async =>
      (await _prefs).setString(_kEmployee, jsonEncode({'login': login ?? '', 'emp': emp}));

  /// The employee remembered for [forLogin], or null. A record kept by an older
  /// version carries no login and is taken as it is.
  static Future<Map<String, dynamic>?> loadEmployee({String? forLogin}) async {
    try {
      final j = jsonDecode((await _prefs).getString(_kEmployee) ?? '');
      if (j is! Map) return null;
      if (j['emp'] is Map) {
        final kept = '${j['login'] ?? ''}'.trim().toLowerCase();
        final asked = (forLogin ?? '').trim().toLowerCase();
        if (kept.isNotEmpty && asked.isNotEmpty && kept != asked) return null;
        return (j['emp'] as Map).cast<String, dynamic>();
      }
      return j.cast<String, dynamic>();
    } catch (_) {
      return null;
    }
  }

  /// Whether this login was HR the last time the site said, for a start where
  /// the site cannot be asked — so HR does not land on the employee side for a
  /// whole session over one slow read.
  static Future<void> saveAdmin(String login, bool admin) async =>
      (await _prefs).setString(_kAdmin, jsonEncode({'login': login.trim().toLowerCase(), 'admin': admin}));

  static Future<bool?> loadAdmin(String login) async {
    try {
      final j = jsonDecode((await _prefs).getString(_kAdmin) ?? '');
      if (j is! Map || '${j['login']}' != login.trim().toLowerCase()) return null;
      return j['admin'] == true;
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveSkew(Duration d) async =>
      (await _prefs).setInt(_kSkewMs, d.inMilliseconds);

  static Future<Duration?> loadSkew() async {
    final ms = (await _prefs).getInt(_kSkewMs);
    return ms == null ? null : Duration(milliseconds: ms);
  }

  static Future<void> saveDayPunches(String iso, List<Map<String, dynamic>> rows, {String employee = ''}) async =>
      (await _prefs).setString(_kDayPunches, jsonEncode({'iso': iso, 'emp': employee, 'rows': rows}));

  /// The punches last read for [iso], or null when the cache is for another day
  /// or for somebody else.
  static Future<List<Map<String, dynamic>>?> loadDayPunches(String iso, {String employee = ''}) async {
    try {
      final j = jsonDecode((await _prefs).getString(_kDayPunches) ?? '');
      if (j is! Map || j['iso'] != iso || j['rows'] is! List) return null;
      final kept = '${j['emp'] ?? ''}';
      if (kept.isNotEmpty && employee.isNotEmpty && kept != employee) return null;
      return (j['rows'] as List).whereType<Map>().map((m) => m.cast<String, dynamic>()).toList();
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveSid(String sid) async =>
      (await _prefs).setString(_kSid, sid);

  /// Full sign-out. Keeps the site URL and the email so the form is filled in
  /// next time — a bench address typed once should not have to be typed again.
  ///
  /// What was remembered about the person goes too — their record, their day,
  /// whether they were HR: the next person on a shared phone must never open
  /// as them. Punches they kept are not dropped here; they stay theirs and are
  /// sent when they sign in again (services/punch_queue.dart).
  static Future<void> clear() async {
    final p = await _prefs;
    await p.remove(_kSid);
    await p.remove(_kPassword);
    await p.remove(_kEmployee);
    await p.remove(_kDayPunches);
    await p.remove(_kAdmin);
  }
}

class Credentials {
  const Credentials({
    required this.siteUrl,
    required this.email,
    required this.sid,
    required this.password,
  });

  final String siteUrl;
  final String email;
  final String sid;
  final String password;

  /// Whether the app can get back onto an authenticated connection without
  /// anybody typing. A stored `sid` alone is not enough — it expires.
  bool get canReauth => email.isNotEmpty && password.isNotEmpty;
}
