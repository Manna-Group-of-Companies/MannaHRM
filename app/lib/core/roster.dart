/// One person's month, a row per day — the arithmetic behind the calendar.
///
/// A port of `client/src/lib/roster.js` and `manna_hr/rules.py`, and it is a
/// port rather than a rewrite for the reason those two are already the same
/// order: the priority every innocent explanation is checked in *is* the rule
/// this project is about, and three screens disagreeing about whether a punch
/// beats an approved leave record would be three answers to what somebody is
/// paid.
///
/// Pure. No widgets, no network — see `test/roster_test.dart`.
library;

import 'package:manna_hr_app/core/day.dart' show Punch, placeByMachine, placeNights;
import 'package:manna_hr_app/core/punch_rules.dart';

/// Where somebody stood on one day. The names are `rules.py`'s, so a value read
/// off one screen means the same thing on the other two.
enum DayStatus {
  present,
  onFloor,
  onLeave,
  leavePending,
  holiday,
  weeklyOff,
  unmarked,
  absent,
}

/// What the day is called on screen. Factor HR's vocabulary where they have a
/// word for it, because HR reads their key.
const Map<DayStatus, String> kDayLabels = {
  DayStatus.present: 'Full day',
  DayStatus.onFloor: 'Still in',
  DayStatus.onLeave: 'On leave',
  DayStatus.leavePending: 'Leave not granted',
  DayStatus.holiday: 'Holiday',
  DayStatus.weeklyOff: 'Week off',
  DayStatus.unmarked: 'Not marked',
  DayStatus.absent: 'Absent',
};

/// Frappe's Leave Application statuses that mean "nobody has decided yet".
const List<String> kUndecidedLeave = ['Open', 'Applied'];

/// Where one person stood on one day.
///
/// `absent` is deliberately the last resort. Calling somebody absent is a
/// payroll consequence and, on a bad day, an accusation. So every innocent
/// explanation is checked first, in this order:
///
///   1. **A punch beats everything.** Somebody who turned up worked, whatever
///      leave record exists.
///   2. **Both punches, or they are still in.** A day counts as worked only
///      with a punch in *and* out.
///   3. **Granted leave, then requested leave.** A request nobody has decided
///      is not time off, and treating it as such would let unapproved absence
///      disappear into the leave column.
///   4. **A holiday is nobody's absence.**
///   5. **A day still running, or one the shift job has not reached, is
///      unmarked — not absent.** Treating a missing record as an absence would
///      mark the whole group absent at nine in the morning.
DayStatus resolveDayStatus({
  required bool hasPunchIn,
  required bool hasPunchOut,
  required String leaveStatus,
  required bool isHoliday,
  required bool isPastDay,
}) {
  if (hasPunchIn) return hasPunchOut ? DayStatus.present : DayStatus.onFloor;
  if (leaveStatus == 'Approved') return DayStatus.onLeave;
  // A rejected request is decided, and the answer was no — so it explains
  // nothing and must not sit in the pending column.
  if (kUndecidedLeave.contains(leaveStatus)) return DayStatus.leavePending;
  if (isHoliday) return DayStatus.holiday;
  if (!isPastDay) return DayStatus.unmarked;
  return DayStatus.absent;
}

/// One day of the month, as the calendar draws it.
class RosterDay {
  RosterDay({
    required this.iso,
    required this.status,
    required this.inAt,
    required this.outAt,
    required this.hours,
    required this.punches,
    required this.holiday,
    required this.leave,
    required this.correction,
    this.past = false,
  });

  /// A day before today. A day like that with a punch-in and no punch-out is
  /// over: it reads "No punch-out", as HR's day view says, never "Still in".
  final bool past;

  final String iso;
  final DayStatus status;
  final String inAt;
  final String outAt;
  final String hours;

  /// Every punch of the day, so a day that looks wrong can be opened rather
  /// than argued about. A gate that double-reads shows as four stamps.
  final List<Map<String, dynamic>> punches;

  /// The holiday's own description, or "". The name is what tells somebody why
  /// a Tuesday was off.
  final String holiday;
  final Map<String, dynamic>? leave;

  /// The correction sitting against this day, at any status. A refused one is
  /// as much of an answer to "what happened to my 19th" as a granted one.
  final Map<String, dynamic>? correction;

  String get label => status == DayStatus.onFloor && past ? 'No punch-out' : (kDayLabels[status] ?? '');
  bool get isAbsent => status == DayStatus.absent;
}

/// Every day of `YYYY-MM`, as `YYYY-MM-DD` strings.
///
/// Built by counting rather than by stepping a `DateTime` through the month:
/// adding a day across a daylight-saving boundary can land on the same date
/// twice, and this site runs where that does not happen — which is exactly the
/// kind of assumption that survives until somebody deploys it somewhere it
/// does not hold.
List<String> daysOfMonth(String ym) {
  final parts = ym.split('-');
  if (parts.length < 2) return const [];
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (y == null || m == null) return const [];
  final last = DateTime(y, m + 1, 0).day;
  return [
    for (var d = 1; d <= last; d++) '$ym-${d.toString().padLeft(2, '0')}',
  ];
}

/// Which leave application covers a day, if any.
///
/// **The most explanatory one, not the first one.** A day can carry more than
/// one application — somebody applies, is refused, applies again and is granted
/// — and taking whichever the site listed first is usually taking the older,
/// refused one. A granted day would then read as absent on a screen somebody is
/// paid from.
Map<String, dynamic>? leaveOn(String iso, List<Map<String, dynamic>> leave) {
  final on = leave.where((r) {
    final from = '${r['from_date'] ?? ''}';
    final to = '${r['to_date'] ?? ''}';
    return from.compareTo(iso) <= 0 && iso.compareTo(to) <= 0;
  }).toList();
  if (on.isEmpty) return null;
  for (final r in on) {
    if ('${r['status'] ?? ''}' == 'Approved') return r;
  }
  for (final r in on) {
    if (kUndecidedLeave.contains('${r['status'] ?? ''}')) return r;
  }
  return on.first;
}

/// One person's month.
///
/// `holidays` is the Holiday List child table as the site hands it over —
/// `holiday_date`, `description`, `weekly_off` — which is where the weekly-off
/// half of the key comes from. Nothing else on either side records that a
/// Sunday is a Sunday, and a month read without it calls four Sundays absent.
///
/// `today` is passed rather than read, so a test does not have to freeze the
/// clock and so the caller can pass the *server's* today rather than the
/// phone's.
List<RosterDay> monthRoster({
  required String ym,
  required List<Map<String, dynamic>> punches,
  required List<Map<String, dynamic>> leave,
  required List<Map<String, dynamic>> holidays,
  required List<Map<String, dynamic>> corrections,
  required String today,
  DateTime? now,
}) {
  final byDay = byWorkDay(punches);

  final hol = <String, Map<String, dynamic>>{};
  for (final h in holidays) {
    final d = '${h['holiday_date'] ?? ''}';
    if (d.length >= 10) hol[d.substring(0, 10)] = h;
  }

  final ar = <String, Map<String, dynamic>>{};
  for (final r in corrections) {
    final d = '${r['attendance_date'] ?? ''}';
    if (d.length >= 10) ar[d.substring(0, 10)] = r;
  }

  return daysOfMonth(ym).map((iso) {
    final mine = byDay[iso] ?? const <Map<String, dynamic>>[];
    final pair = dayPunches(mine);
    final h = hol[iso];
    final lv = leaveOn(iso, leave);
    // Sunday is a week off, whatever the list says or whether there is one
    // (asked for by HR, 26 November 2026): never a holiday, never an absence.
    final sunday = isSunday(iso);

    var status = resolveDayStatus(
      hasPunchIn: pair.inAt.isNotEmpty,
      hasPunchOut: pair.outAt.isNotEmpty,
      leaveStatus: '${lv?['status'] ?? ''}',
      isHoliday: h != null || sunday,
      isPastDay: iso.compareTo(today) < 0,
    );

    // A weekly off is a holiday to the rule and a different colour on the key,
    // so the split happens here rather than in `resolveDayStatus` — that
    // function decides whether somebody is absent, and a Sunday and Diwali are
    // the same answer to that question.
    if (status == DayStatus.holiday && (sunday || '${h?['weekly_off'] ?? 0}' == '1')) {
      status = DayStatus.weeklyOff;
    }
    // A Sunday is the week off even for somebody who punched on it — two or
    // three companies work Sundays (HR, 26 Nov 2026). The day reads Week off,
    // and its punches, times and hours stay on it to be seen.
    if (sunday) status = DayStatus.weeklyOff;

    return RosterDay(
      iso: iso,
      status: status,
      inAt: pair.inAt,
      outAt: pair.outAt,
      hours: spanHours(pair.inAt, pair.outAt),
      punches: mine,
      holiday: sunday ? 'Sunday' : '${h?['description'] ?? ''}',
      leave: lv,
      correction: ar[iso],
      // Last night's shift, still running after midnight, is not over.
      past: iso.compareTo(today) < 0 && !stillOnNight(mine, now),
    );
  }).toList();
}

/// An evening punch-in this late or later starts a night shift (the site's
/// own rota rule), and its punch-out the next morning ends that same shift.
const int kNightFromHour = 17;

/// How long a night shift can run: a punch-out further from its evening
/// punch-in than this is a day of its own.
const Duration kNightLongest = Duration(hours: 16);

/// The punches of a month, by the day each one's shift began — placed the way
/// HR's day view places them (core/day.dart), so the two screens agree.
///
/// **A night is one day, not two halves.** In at 20:30 on Monday and out at
/// 08:30 on Tuesday is Monday's shift. Grouped by the calendar, Monday read
/// "Still in" and was never counted as present, and Tuesday paired that
/// morning's out with that evening's in — two different nights.
///
/// **The one-direction machines say which way a punch goes**, not the key
/// pressed ([kByMachine]): Manna Tyre Retreads' 24-hour shift is in on 692 at
/// nine and out on 688 at nine the next morning, and 692 sometimes stores an
/// arrival keyed OUT. Read by the key, worked days showed "No punch-out" or
/// Absent. Each row comes back with the direction the machine gives it.
Map<String, List<Map<String, dynamic>>> byWorkDay(List<Map<String, dynamic>> punches) {
  final rows = [
    for (final p in punches)
      if ('${p['time'] ?? ''}'.length >= 16) p,
  ];
  final placed = placeNights(placeByMachine([for (final r in rows) Punch.fromJson(r)]));
  final out = <String, List<Map<String, dynamic>>>{};
  for (var i = 0; i < rows.length; i++) {
    final p = placed[i];
    final keyed = '${rows[i]['log_type'] ?? ''}'.toUpperCase();
    final row = p.logType.isNotEmpty && p.logType != keyed ? {...rows[i], 'log_type': p.logType} : rows[i];
    out.putIfAbsent(p.workDay, () => []).add(row);
  }
  for (final l in out.values) {
    l.sort((a, b) => '${a['time']}'.compareTo('${b['time']}'));
  }
  return out;
}

/// Whether [day] (its punches, oldest first) is a night shift still running
/// at [now]: its last punch an evening IN no more than [kNightLongest] ago.
/// Such a day is not over, and reads "Still in", not "No punch-out".
bool stillOnNight(List<Map<String, dynamic>> day, DateTime? now) {
  if (now == null || day.isEmpty) return false;
  final last = day.last;
  if ('${last['log_type'] ?? ''}'.toUpperCase() == kLogOut) return false;
  final at = DateTime.tryParse('${last['time'] ?? ''}'.replaceFirst(' ', 'T'));
  if (at == null || at.hour < kNightFromHour) return false;
  return !now.isBefore(at) && now.difference(at) <= kNightLongest;
}

/// How many days fell into each state — the strip above the calendar, and the
/// reason the key spells every state out rather than leaving eight colours to
/// carry it on their own.
Map<DayStatus, int> countStates(List<RosterDay> rows) {
  final out = {for (final s in DayStatus.values) s: 0};
  for (final r in rows) {
    out[r.status] = (out[r.status] ?? 0) + 1;
  }
  return out;
}

/// Whether `YYYY-MM-DD` is a Sunday — the group's week off.
bool isSunday(String iso) {
  final d = DateTime.tryParse(iso.length >= 10 ? iso.substring(0, 10) : iso);
  return d != null && d.weekday == DateTime.sunday;
}
