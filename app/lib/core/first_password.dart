/// The first password, and the one that replaces it (asked for by HR,
/// 10 November 2026).
///
/// HR gives everybody the same first password: their date of birth as
/// DDMMYYYY — 24-03-2005 is `24032005` — with their Emp Code as the user name.
/// A birthday is something colleagues know, and this app records the punches
/// pay is made from, so while the password is still that date the app shows
/// nothing but **Choose a new password**.
///
/// Pure, so the rule can be argued about without a phone
/// (`test/first_password_test.dart`). The same DDMMYYYY rule makes the password
/// on the dashboard (`dobPassword` in client/src/lib/newemp.js); a test there
/// reads this file and holds the two together.
library;

/// The date of birth as the first password, or '' when there is none to read.
String dobPassword(String? isoDate) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(isoDate ?? '');
  if (m == null) return '';
  return '${m.group(3)}${m.group(2)}${m.group(1)}';
}

/// Whether the password just used is still the first one, so a new one must
/// be chosen before anything else. False when the record has no birth date —
/// there is then no first password to be on, and refusing somebody the app
/// over a field HR left empty is the expensive mistake.
bool mustChangePassword(String password, String? isoDate) {
  final first = dobPassword(isoDate);
  return first.isNotEmpty && password == first;
}

/// What is wrong with a new password, or null when it will do. The site may
/// still refuse one it thinks weak; its sentence is shown then.
String? newPasswordProblem(
  String password,
  String again, {
  String? isoDate,
  String empCode = '',
}) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password != again) return 'The two passwords are not the same.';
  final first = dobPassword(isoDate);
  if (first.isNotEmpty && password.contains(first)) {
    return 'Choose something other than your date of birth.';
  }
  final code = empCode.trim().toLowerCase();
  if (code.isNotEmpty && password.toLowerCase().contains(code)) {
    return 'Choose something other than your Emp Code.';
  }
  return null;
}
