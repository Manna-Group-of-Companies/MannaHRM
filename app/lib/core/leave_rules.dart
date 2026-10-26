/// Applying for leave from the phone (19 October 2026).
///
/// Pure: what is missing from a request before it is sent, the document that
/// goes to the site, and how a status reads to the person who asked. The site
/// is what decides — hrms checks the balance, overlapping leave and the
/// allocation's dates when it is saved, and its sentence is shown as it came.
library;

import 'package:manna_hr_app/core/constants.dart';

/// One kind of leave this person may ask for, and what they have left of it.
/// [left] is null for leave without pay, which has no balance to run out of.
class LeaveKind {
  const LeaveKind(this.name, this.left, {this.total, this.taken});
  final String name;
  final double? left;

  /// What was allocated and what has been used, for the Leave Balance tab.
  /// Null for leave without pay, as [left] is.
  final double? total;
  final double? taken;

  String get label {
    final l = left;
    if (l == null) return name;
    final n = l == l.roundToDouble() ? l.toStringAsFixed(0) : l.toStringAsFixed(1);
    return '$name ($n left)';
  }
}

/// The kinds out of hrms's `get_leave_details` answer: every type with an
/// allocation, then the leave-without-pay types, by name.
List<LeaveKind> kindsFrom(Map<String, dynamic>? details) {
  final out = <LeaveKind>[];
  final alloc = details?['leave_allocation'];
  if (alloc is Map) {
    double? num0(Object? v) => v == null ? null : (v is num) ? v.toDouble() : double.tryParse('$v');
    for (final e in alloc.entries) {
      final m = e.value is Map ? e.value as Map : const {};
      out.add(LeaveKind('${e.key}', num0(m['remaining_leaves']) ?? 0,
          total: num0(m['total_leaves']), taken: num0(m['leaves_taken'])));
    }
  }
  final lwps = details?['lwps'];
  if (lwps is List) {
    for (final t in lwps) {
      if (!out.any((k) => k.name == '$t')) out.add(LeaveKind('$t', null));
    }
  }
  out.sort((a, b) => a.name.compareTo(b.name));
  return out;
}

/// Why a request cannot be sent yet, or null. Dates are `YYYY-MM-DD`.
String? leaveProblem({
  required String type,
  required String from,
  required String to,
  required bool halfDay,
  required String reason,
}) {
  if (type.isEmpty) return 'Choose the kind of leave.';
  if (from.isEmpty || to.isEmpty) return 'Choose the first and the last day.';
  if (to.compareTo(from) < 0) return 'The last day is before the first.';
  if (halfDay && from != to) {
    return 'A half day is one day — make the first and last day the same.';
  }
  if (reason.trim().isEmpty) return 'Say why. It is what HR reads.';
  return null;
}

/// The Leave Application to send. A draft, [kLeaveOpen], to [kLeaveApprover]:
/// approving and submitting it are the administrator's, on the dashboard.
Map<String, dynamic> leaveDoc({
  required String employee,
  required String company,
  required String type,
  required String from,
  required String to,
  required bool halfDay,
  required String reason,
  required String today,
}) =>
    {
      'employee': employee,
      if (company.isNotEmpty) 'company': company,
      'leave_type': type,
      'from_date': from,
      'to_date': to,
      'half_day': halfDay ? 1 : 0,
      if (halfDay) 'half_day_date': from,
      'description': reason.trim(),
      'posting_date': today,
      'status': kLeaveOpen,
      'leave_approver': kLeaveApprover,
    };

/// How a Leave Application's status reads to the person who asked.
String leaveStatusWord(String status, int docstatus) {
  if (docstatus == 2 || status == 'Cancelled') return 'Cancelled';
  if (status == 'Approved') return 'Approved';
  if (status == 'Rejected') return 'Refused';
  return 'Waiting for HR';
}

/// Calendar days from [from] to [to], both counted. hrms's own count leaves
/// out holidays, and is what the approved leave uses; this is the plain span.
int spanDays(String from, String to) {
  final a = DateTime.tryParse(from);
  final b = DateTime.tryParse(to);
  if (a == null || b == null || b.isBefore(a)) return 0;
  return b.difference(a).inDays + 1;
}

/// The three numbers over the Leave Balance tab: allocated, used and left,
/// across every kind that has a balance. Leave without pay has none and is
/// left out rather than counted as zero of zero.
({double total, double taken, double left}) balanceTotals(List<LeaveKind> kinds) {
  var total = 0.0, taken = 0.0, left = 0.0;
  for (final k in kinds) {
    if (k.left == null) continue;
    left += k.left!;
    total += k.total ?? k.left!;
    taken += k.taken ?? 0;
  }
  return (total: total, taken: taken, left: left);
}

/// `3.0` → `3`, `2.5` → `2.5`.
String fmtDays(num n) => n == n.roundToDouble() ? n.toStringAsFixed(0) : n.toStringAsFixed(1);
