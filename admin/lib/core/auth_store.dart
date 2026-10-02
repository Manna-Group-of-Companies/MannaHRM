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

  static Future<void> saveSid(String sid) async =>
      (await _prefs).setString(_kSid, sid);

  /// Full sign-out. Keeps the site URL and the email so the form is filled in
  /// next time — a bench address typed once should not have to be typed again.
  static Future<void> clear() async {
    final p = await _prefs;
    await p.remove(_kSid);
    await p.remove(_kPassword);
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
