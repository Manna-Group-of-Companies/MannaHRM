import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/leave_rules.dart';
import 'package:manna_hr_app/screens/leave_sheet.dart';

/// Leave asked for from the phone (19 October 2026). It is a request to the
/// administrator; the site decides, and approving it is what books the days.
void main() {
  group('a leave request', () {
    test('needs a kind, the first and last day, and a reason', () {
      String? p({String type = 'Casual Leave', String from = '2026-10-20', String to = '2026-10-21',
              bool half = false, String reason = 'Family function'}) =>
          leaveProblem(type: type, from: from, to: to, halfDay: half, reason: reason);
      expect(p(type: ''), 'Choose the kind of leave.');
      expect(p(from: ''), 'Choose the first and the last day.');
      expect(p(to: '2026-10-19'), 'The last day is before the first.');
      expect(p(reason: '  '), 'Say why. It is what HR reads.');
      expect(p(), isNull);
    });

    test('a half day is one day, never a span', () {
      expect(leaveProblem(type: 'Casual Leave', from: '2026-10-20', to: '2026-10-21', halfDay: true, reason: 'x'),
          contains('half day is one day'));
      expect(leaveProblem(type: 'Casual Leave', from: '2026-10-20', to: '2026-10-20', halfDay: true, reason: 'x'),
          isNull);
    });

    test('goes to the site as an Open draft for the administrator, never submitted', () {
      final doc = leaveDoc(
        employee: 'HR-EMP-1', company: 'Manna Treads', type: 'Casual Leave',
        from: '2026-10-20', to: '2026-10-20', halfDay: true, reason: ' Doctor ', today: '2026-10-19',
      );
      expect(doc['status'], kLeaveOpen);
      expect(doc['leave_approver'], kLeaveApprover);
      expect(doc['leave_approver'], 'hr@mannarubber.com');
      expect(doc.containsKey('docstatus'), isFalse);
      expect(doc['half_day'], 1);
      expect(doc['half_day_date'], '2026-10-20');
      expect(doc['description'], 'Doctor');
    });

    test('reads to the person who asked as waiting, approved, refused or cancelled', () {
      expect(leaveStatusWord('Open', 0), 'Waiting for HR');
      expect(leaveStatusWord('Approved', 1), 'Approved');
      expect(leaveStatusWord('Rejected', 1), 'Refused');
      expect(leaveStatusWord('Approved', 2), 'Cancelled');
    });

    test('counts the plain span of days, both ends included', () {
      expect(spanDays('2026-10-20', '2026-10-22'), 3);
      expect(spanDays('2026-10-20', '2026-10-20'), 1);
      expect(spanDays('2026-10-22', '2026-10-20'), 0);
    });
  });

  group('the kinds of leave', () {
    test('come from the site with what is left, then leave without pay, by name', () {
      final kinds = kindsFrom({
        'leave_allocation': {
          'Casual Leave': {'remaining_leaves': 3.5},
          'Sick Leave': {'remaining_leaves': 2},
        },
        'lwps': ['Leave Without Pay'],
      });
      expect(kinds.map((k) => k.label).toList(),
          ['Casual Leave (3.5 left)', 'Leave Without Pay', 'Sick Leave (2 left)']);
    });

    test('carry what was allocated and what was used, for the balance tab', () {
      final kinds = kindsFrom({
        'leave_allocation': {
          'Casual Leave': {'total_leaves': 12, 'leaves_taken': 4, 'remaining_leaves': 8},
        },
      });
      expect(kinds.single.total, 12);
      expect(kinds.single.taken, 4);
      expect(kinds.single.left, 8);
    });

    test('add up across kinds, leaving out leave without pay rather than counting it as nothing', () {
      final t = balanceTotals(const [
        LeaveKind('Casual Leave', 8, total: 12, taken: 4),
        LeaveKind('Sick Leave', 2.5, total: 3, taken: .5),
        LeaveKind('Leave Without Pay', null),
      ]);
      expect(t.total, 15);
      expect(t.taken, 4.5);
      expect(t.left, 10.5);
      expect(fmtDays(t.left), '10.5');
      expect(fmtDays(t.total), '15');
    });

    test('are none when the site has given the person no leave', () {
      expect(kindsFrom({}), isEmpty);
      expect(kindsFrom(null), isEmpty);
    });
  });

  testWidgets('the Apply Leave page offers the kinds and will not send until it has a reason', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => TextButton(
            onPressed: () => openApplyLeave(ctx, kinds: const [LeaveKind('Casual Leave', 2)]),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Apply Leave'), findsOneWidget);
    expect(find.text('Choose the kind of leave.'), findsOneWidget);
    final send = find.widgetWithText(FilledButton, 'Send to HR');
    expect(tester.widget<FilledButton>(send).onPressed, isNull);

    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Casual Leave (2 left)').last);
    await tester.pumpAndSettle();
    expect(find.text('Choose the first and the last day.'), findsOneWidget);
    expect(tester.widget<FilledButton>(send).onPressed, isNull);
  });
}
