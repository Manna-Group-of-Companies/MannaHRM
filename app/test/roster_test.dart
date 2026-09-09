import 'package:flutter_test/flutter_test.dart';

import 'package:manna_hr_app/core/roster.dart';

/// The month, and the order every innocent explanation is checked in.
///
/// The same rules as `manna_hr/tests/test_rules.py` and the dashboard's
/// `roster.test.js`, restated here rather than assumed, because three screens
/// disagreeing about whether a punch beats an approved leave record would be
/// three answers to what somebody is paid.
void main() {
  Map<String, dynamic> punch(String time, String type) =>
      {'time': time, 'log_type': type};

  group('where somebody stood on a day', () {
    test('a punch beats an approved leave record', () {
      // Somebody who cancelled their leave and came in must not be marked
      // absent, or on leave, because the request was never withdrawn.
      expect(
        resolveDayStatus(
          hasPunchIn: true,
          hasPunchOut: true,
          leaveStatus: 'Approved',
          isHoliday: false,
          isPastDay: true,
        ),
        DayStatus.present,
      );
    });

    test('a punch in with no punch out is still in, not a full day', () {
      expect(
        resolveDayStatus(
          hasPunchIn: true,
          hasPunchOut: false,
          leaveStatus: '',
          isHoliday: false,
          isPastDay: true,
        ),
        DayStatus.onFloor,
      );
    });

    test('leave nobody has decided is not time off', () {
      expect(
        resolveDayStatus(
          hasPunchIn: false,
          hasPunchOut: false,
          leaveStatus: 'Open',
          isHoliday: false,
          isPastDay: true,
        ),
        DayStatus.leavePending,
      );
    });

    test('a refused leave request explains nothing, so the day is absent', () {
      expect(
        resolveDayStatus(
          hasPunchIn: false,
          hasPunchOut: false,
          leaveStatus: 'Rejected',
          isHoliday: false,
          isPastDay: true,
        ),
        DayStatus.absent,
      );
    });

    test('a holiday is nobody\'s absence', () {
      expect(
        resolveDayStatus(
          hasPunchIn: false,
          hasPunchOut: false,
          leaveStatus: '',
          isHoliday: true,
          isPastDay: true,
        ),
        DayStatus.holiday,
      );
    });

    test('a day that has not finished is unmarked, never absent', () {
      // Treating a missing record as an absence would mark the whole group
      // absent at nine in the morning.
      expect(
        resolveDayStatus(
          hasPunchIn: false,
          hasPunchOut: false,
          leaveStatus: '',
          isHoliday: false,
          isPastDay: false,
        ),
        DayStatus.unmarked,
      );
    });
  });

  group('which leave application covers a day', () {
    test('a granted application beats a refused one on the same day', () {
      // The site usually lists the older one first, and the older one is
      // usually the refused one. Taking it would read a granted day as absent.
      final lv = leaveOn('2026-09-09', [
        {'from_date': '2026-09-09', 'to_date': '2026-09-09', 'status': 'Rejected'},
        {'from_date': '2026-09-09', 'to_date': '2026-09-09', 'status': 'Approved'},
      ]);
      expect(lv?['status'], 'Approved');
    });

    test('a leave that started last month still covers days in this one', () {
      final lv = leaveOn('2026-09-02', [
        {'from_date': '2026-08-28', 'to_date': '2026-09-04', 'status': 'Approved'},
      ]);
      expect(lv, isNotNull);
    });
  });

  group('the month', () {
    test('every day of the month is a row, including the empty ones', () {
      expect(daysOfMonth('2026-09').length, 30);
      expect(daysOfMonth('2026-02').length, 28);
      expect(daysOfMonth('2024-02').length, 29);
    });

    test('a Sunday on the holiday list is a weekly off, not a holiday', () {
      // Two colours on the key, one answer to "was this person absent". The
      // split has to happen after the rule, not inside it.
      final rows = monthRoster(
        ym: '2026-09',
        punches: const [],
        leave: const [],
        holidays: [
          {'holiday_date': '2026-09-06', 'description': 'Sunday', 'weekly_off': 1},
          {'holiday_date': '2026-09-07', 'description': 'Onam', 'weekly_off': 0},
        ],
        corrections: const [],
        today: '2026-09-30',
      );
      expect(rows.firstWhere((r) => r.iso == '2026-09-06').status,
          DayStatus.weeklyOff);
      expect(rows.firstWhere((r) => r.iso == '2026-09-07').status,
          DayStatus.holiday);
    });

    test('a month read with no holiday list calls every Sunday absent', () {
      // Not a bug — the finding. It is why the calendar says out loud that no
      // holiday list is on the record, rather than drawing four red Sundays and
      // letting somebody conclude they were marked absent.
      final rows = monthRoster(
        ym: '2026-09',
        punches: const [],
        leave: const [],
        holidays: const [],
        corrections: const [],
        today: '2026-09-30',
      );
      expect(rows.firstWhere((r) => r.iso == '2026-09-06').status,
          DayStatus.absent);
    });

    test('the day carries its punches, its hours and its correction', () {
      final rows = monthRoster(
        ym: '2026-09',
        punches: [
          punch('2026-09-09 08:30:00', 'IN'),
          punch('2026-09-09 08:30:04', 'IN'),
          punch('2026-09-09 17:37:00', 'OUT'),
        ],
        leave: const [],
        holidays: const [],
        corrections: [
          {'attendance_date': '2026-09-10', 'status': 'Pending Approval'},
        ],
        today: '2026-09-30',
      );
      final worked = rows.firstWhere((r) => r.iso == '2026-09-09');
      expect(worked.status, DayStatus.present);
      expect(worked.hours, '09:07');
      expect(worked.punches.length, 3);
      expect(worked.correction, isNull);

      final asked = rows.firstWhere((r) => r.iso == '2026-09-10');
      expect(asked.correction?['status'], 'Pending Approval');
    });

    test('today is not absent, and the days after it are not either', () {
      final rows = monthRoster(
        ym: '2026-09',
        punches: const [],
        leave: const [],
        holidays: const [],
        corrections: const [],
        today: '2026-09-09',
      );
      expect(rows.firstWhere((r) => r.iso == '2026-09-09').status,
          DayStatus.unmarked);
      expect(rows.firstWhere((r) => r.iso == '2026-09-10').status,
          DayStatus.unmarked);
      expect(rows.firstWhere((r) => r.iso == '2026-09-08').status,
          DayStatus.absent);
    });

    test('every state on the key is counted, including the ones with none', () {
      final counts = countStates(monthRoster(
        ym: '2026-09',
        punches: const [],
        leave: const [],
        holidays: const [],
        corrections: const [],
        today: '2026-09-09',
      ));
      expect(counts.keys.length, DayStatus.values.length);
      expect(counts[DayStatus.onLeave], 0);
    });
  });
}
