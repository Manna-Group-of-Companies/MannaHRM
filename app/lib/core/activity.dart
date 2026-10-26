/// The home screen's Recent Activity: what this person last asked for, and
/// what became of it. Pure — `test/activity_test.dart`.
///
/// Leave and corrections only, because those are the two things a person
/// raises and waits on. A punch is not an activity here — it is on the card
/// above, and on the month.
library;

import 'package:manna_hr_app/core/leave_rules.dart';

enum ActivityKind { leave, correction }

class Activity {
  const Activity({required this.kind, required this.title, required this.when, required this.status, required this.at});

  final ActivityKind kind;
  final String title;

  /// The day it is about — `YYYY-MM-DD`.
  final String when;

  /// The word drawn on the pill, in the person's terms.
  final String status;

  /// When it was raised, for the order.
  final String at;
}

/// Newest first, at most [limit].
List<Activity> recentActivity(
  List<Map<String, dynamic>> leave,
  List<Map<String, dynamic>> corrections, {
  int limit = 4,
}) {
  final out = <Activity>[
    for (final l in leave)
      Activity(
        kind: ActivityKind.leave,
        title: '${l['leave_type'] ?? 'Leave'}',
        when: '${l['from_date'] ?? ''}',
        status: leaveStatusWord('${l['status'] ?? ''}', int.tryParse('${l['docstatus'] ?? 0}') ?? 0),
        at: '${l['creation'] ?? l['from_date'] ?? ''}',
      ),
    for (final c in corrections)
      Activity(
        kind: ActivityKind.correction,
        title: 'Attendance correction',
        when: '${c['attendance_date'] ?? ''}',
        // The doctype's own word for an open request is "Pending Approval",
        // which is two words on a pill; the person reads it as waiting.
        status: '${c['status'] ?? ''}' == 'Pending Approval' ? 'Pending' : '${c['status'] ?? ''}',
        at: '${c['creation'] ?? c['attendance_date'] ?? ''}',
      ),
  ];
  out.sort((a, b) => b.at.compareTo(a.at));
  return out.take(limit).toList();
}
