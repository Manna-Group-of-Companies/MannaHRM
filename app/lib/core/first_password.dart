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

/// The most sign-ins one tap of Sign in may try. The site locks a login for a
/// minute after ten wrong ones in a row, so three taps of this still cannot.
const kMaxSignInTries = 4;

/// The Emp Code the way the site holds it, `MRP-293`, from however it was
/// typed: `mrp293`, `MRP 293`, `mrp-293`. An email, or anything else, as typed.
String empCodeForm(String typed) {
  final t = typed.trim();
  final m = RegExp(r'^([A-Za-z]+)[\s_.-]*(\d+)$').firstMatch(t);
  return m == null ? t : '${m.group(1)!.toUpperCase()}-${m.group(2)}';
}

/// The DDMMYYYY first passwords a typed date could be (25 November 2026: a
/// phone signed in with `2432005` for 24 March 2005 and was told the password
/// was wrong). `2432005`, `24-3-2005`, `24/03/05` and `240305` are all
/// `24032005`. A date that reads two ways — `1112005` is 1 November or 11
/// January — gives both. Nothing for a password that is not a date.
List<String> dobForms(String typed, {DateTime? today}) {
  final t = typed.trim();
  if (!RegExp(r'^[\d\s./-]+$').hasMatch(t)) return const [];
  final now = today ?? DateTime.now();
  final out = <String>[];
  void add(String d, String m, String y) {
    if (d.isEmpty || d.length > 2 || m.isEmpty || m.length > 2 || (y.length != 2 && y.length != 4)) return;
    final day = int.parse(d), month = int.parse(m);
    var year = int.parse(y);
    if (y.length == 2) year += 2000 + year <= now.year ? 2000 : 1900;
    if (year < now.year - 100 || year > now.year || month < 1 || month > 12 || day < 1) return;
    if (day > DateTime(year, month + 1, 0).day) return;
    final s = '${day.toString().padLeft(2, '0')}${month.toString().padLeft(2, '0')}$year';
    if (!out.contains(s)) out.add(s);
  }

  final parts = t.split(RegExp(r'[\s./-]+')).where((p) => p.isNotEmpty).toList();
  if (parts.length == 3) {
    add(parts[0], parts[1], parts[2]);
  } else if (parts.length == 1) {
    // The year is the last four digits, or the last two; before it, the day
    // and then the month, each one digit or two.
    final s = parts.first;
    for (final yLen in const [4, 2]) {
      if (s.length <= yLen) continue;
      final dm = s.substring(0, s.length - yLen);
      final y = s.substring(s.length - yLen);
      for (var dLen = 1; dLen <= 2 && dLen < dm.length; dLen++) {
        add(dm.substring(0, dLen), dm.substring(dLen), y);
      }
    }
  }
  return out;
}

/// The (user, password) pairs to try for one tap of Sign in, as typed first —
/// somebody who chose their own password typed exactly that — then the Emp
/// Code and the date of birth in the form the site holds them. At most
/// [kMaxSignInTries].
List<(String, String)> signInTries(String user, String password, {DateTime? today}) {
  final users = [user.trim()];
  final code = empCodeForm(user);
  if (code != users.first) users.add(code);
  final passwords = [password];
  for (final f in dobForms(password, today: today)) {
    if (!passwords.contains(f)) passwords.add(f);
  }
  // As typed; then the Emp Code with each date form, which is how a first
  // sign-in is meant to go; then the rest.
  final tries = <(String, String)>[(users.first, password)];
  void add((String, String) t) {
    if (!tries.contains(t)) tries.add(t);
  }

  for (final p in passwords.skip(1)) {
    add((users.last, p));
  }
  for (final u in users) {
    for (final p in passwords) {
      add((u, p));
    }
  }
  return tries.take(kMaxSignInTries).toList();
}
