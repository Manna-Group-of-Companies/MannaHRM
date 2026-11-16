/// What the app may offer, and what a day's punches add up to.
///
/// Pure functions over plain maps — the rows as Frappe hands them over. No
/// widgets, no network, no `Session`, so every one of these can be argued about
/// in `test/punch_rules_test.dart` without a site and without a phone.
///
/// **None of it decides anything.** The server checks the same rules on its own
/// clock and refuses there (CLAUDE.md §1). What this buys is that the app does
/// not put a button in front of somebody that is going to fail, and that when
/// it does fail the app already knows what to say.
library;

import 'package:manna_hr_app/core/constants.dart';

const String kLogIn = 'IN';
const String kLogOut = 'OUT';

int minuteOfDay(DateTime t) => t.hour * 60 + t.minute;

/// Whether a self-service punch at this minute is inside the working window.
///
/// Not a fraud check — an honesty check on the shape of the day. Somebody
/// punching in at 2am either mistyped or is doing something that needs a human
/// to look at it, and the regularization queue is where a human looks.
bool isWithinPunchWindow(int minute,
        {int opens = kPunchInFromMinute, int closes = kPunchOutUntilMinute}) =>
    minute >= opens && minute <= closes;

String formatMinute(int minute) =>
    '${minute ~/ 60}:${(minute % 60).toString().padLeft(2, '0')}';

/// `YYYY-MM-DD` for a day, the way the site writes a Date.
String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// `YYYY-MM-DD HH:MM:SS`, the way the site writes a Datetime. Every date on
/// this site is compared as a string, so the shape is the contract.
String stampOf(DateTime t) => '${isoDay(t)} '
    '${t.hour.toString().padLeft(2, '0')}:'
    '${t.minute.toString().padLeft(2, '0')}:'
    '${t.second.toString().padLeft(2, '0')}';

/// `YYYY-MM` for a month.
String isoMonth(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}';

/// The clock part of a stamp — `"2026-09-09 08:31:00"` → `"08:31"`.
String clockOf(Object? stamp) {
  final s = '${stamp ?? ''}';
  return s.length >= 16 ? s.substring(11, 16) : '';
}

/// Which way the next punch goes, from what today already holds.
///
/// **The last punch decides, not the count.** A gate that double-reads puts
/// four rows on a day, and "an even number means you are out" would then send
/// somebody home marked as still in. A day with no punches on it starts with an
/// IN, which is the only thing it can be.
///
/// `punches` is any order; this sorts by time itself, because the site's own
/// ordering is whatever the query asked for.
String nextLogType(List<Map<String, dynamic>> punches) {
  if (punches.isEmpty) return kLogIn;
  final sorted = [...punches]
    ..sort((a, b) => '${a['time']}'.compareTo('${b['time']}'));
  final last = '${sorted.last['log_type'] ?? ''}'.toUpperCase();
  // An empty `log_type` is a real value on this site: a ZK machine that was
  // never set up for in/out reports no direction at all, and the bridge is
  // deliberately not allowed to guess one (CLAUDE.md §5). A day that holds one
  // is a day this app cannot pair, so it offers IN — the punch that cannot
  // make an existing one worse.
  if (last == kLogIn) return kLogOut;
  return kLogIn;
}

/// The punches of one day, earliest in and latest out.
///
/// **Earliest and latest, not first and second.** A gate that double-reads puts
/// four rows on a day, and a pair taken in arrival order would report the
/// second read as the punch-out — a nine-hour day as four minutes.
///
/// **The first punch is the in and the last is the out, whatever key was
/// pressed** (16 November 2026) — the website's `dayPunches` and the HR side's
/// `pair` in `day.dart`. A gate sent one worker's 18:02 leaving as IN on four
/// days of one week, and read by the key each was "in, never out".
///
/// A last punch within ten minutes of the first is one finger read twice and
/// leaves one side: the in, unless every punch says OUT — a lone leaving is
/// the only time the key is all there is to go on. A punch HR set aside is not
/// part of the day.
({String inAt, String outAt}) dayPunches(List<Map<String, dynamic>> rows) {
  final live = rows
      .where((c) => '${c['time'] ?? ''}'.isNotEmpty)
      .where((c) => !(c['skip_auto_attendance'] == 1 ||
          c['skip_auto_attendance'] == true ||
          c['skip_auto_attendance'] == '1'))
      .toList()
    ..sort((a, b) => '${a['time']}'.compareTo('${b['time']}'));
  if (live.isEmpty) return (inAt: '', outAt: '');
  final first = '${live.first['time']}';
  final last = '${live.last['time']}';
  final a = DateTime.tryParse(first.replaceFirst(' ', 'T'));
  final b = DateTime.tryParse(last.replaceFirst(' ', 'T'));
  if (a != null && b != null && b.difference(a).inSeconds > 10 * 60) {
    return (inAt: first, outAt: last);
  }
  final allOut = live
      .every((c) => '${c['log_type'] ?? ''}'.toUpperCase() == kLogOut);
  return allOut ? (inAt: '', outAt: last) : (inAt: first, outAt: '');
}

/// Hours between two stamps, as `HH:MM`, or "" when the pair says nothing.
///
/// The column reads `09:07` for nine hours and seven minutes, which is the same
/// shape as a clock time and is not one — worth knowing before somebody
/// compares it against the punch-in.
String spanHours(String inAt, String outAt) {
  if (inAt.isEmpty || outAt.isEmpty) return '';
  final a = DateTime.tryParse(inAt.replaceFirst(' ', 'T'));
  final b = DateTime.tryParse(outAt.replaceFirst(' ', 'T'));
  if (a == null || b == null || !b.isAfter(a)) return '';
  // A part-minute counts as a whole one, as on Factor HR and the website
  // (16 November 2026): 08:26:23 to 18:00:44 is 09:35.
  final mins = (b.difference(a).inSeconds + 59) ~/ 60;
  return '${(mins ~/ 60).toString().padLeft(2, '0')}:'
      '${(mins % 60).toString().padLeft(2, '0')}';
}

/// Why the app will not offer a punch right now, or null when it will.
///
/// Returns a sentence somebody standing at a gate can act on. The server checks
/// the same window; this exists so the answer arrives before the press.
String? punchRefusal(DateTime serverNow,
    {int opens = kPunchInFromMinute, int closes = kPunchOutUntilMinute}) {
  final minute = minuteOfDay(serverNow);
  if (minute < opens) {
    return 'Punching opens at ${formatMinute(opens)}. If you started earlier, '
        'punch in when it opens and ask for a regularization for the earlier time.';
  }
  if (minute > closes) {
    return 'Punching closed at ${formatMinute(closes)}. Ask for a '
        'regularization for today instead.';
  }
  return null;
}

/// The `device_id` a punch off this phone carries.
///
/// Keyed to the employee rather than to the handset: handsets are shared and
/// reassigned, and what the site needs to know is that this punch came from a
/// phone rather than from a machine bolted to a wall. See [kDeviceIdPrefix] for
/// why the prefix matters more than the suffix.
String deviceIdFor(String employee) => '$kDeviceIdPrefix$employee';
