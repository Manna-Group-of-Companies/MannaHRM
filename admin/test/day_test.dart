import 'package:flutter_test/flutter_test.dart';
import 'package:manna_hr_admin/core/day.dart';

const _today = '2026-09-30';
const _past = '2026-09-16';

Person _p(String id, {String company = 'Manna Rubber', String list = ''}) =>
    Person(id: id, name: 'Person $id', company: company, holidayList: list);

Punch _punch(String emp, String time, String type, {bool aside = false, String shiftStart = ''}) =>
    Punch(id: '$emp$time', employee: emp, time: time, logType: type, setAside: aside, shiftStart: shiftStart);

Leave _leave(String emp, String from, String to, {String status = 'Approved', bool half = false}) =>
    Leave(id: 'L$emp', employee: emp, employeeName: 'Person $emp', type: 'Casual Leave',
        from: from, to: to, status: status, halfDay: half);

DayView _day(String date, List<Person> people,
        {List<Punch> punches = const [], List<Leave> leaves = const [],
        Map<String, List<Holiday>> calendars = const {}, Map<String, String> companyCalendar = const {}}) =>
    DayView.build(date: date, today: _today, people: people, punches: punches, leaves: leaves,
        calendars: calendars, companyCalendar: companyCalendar);

PersonDay _only(DayView v) => v.people.single;

void main() {
  test('a punch in and a punch out is a day in and out, with both times', () {
    final d = _only(_day(_past, [_p('845')], punches: [
      _punch('845', '$_past 08:24:27', 'IN'),
      _punch('845', '$_past 17:30:50', 'OUT'),
    ]));
    expect(d.state, DayState.inOut);
    expect((d.firstIn, d.lastOut), ('08:24', '17:30'));
  });

  test('a punch beats an approved leave: somebody who came in was at work', () {
    final d = _only(_day(_past, [_p('845')],
        punches: [_punch('845', '$_past 08:24:27', 'IN')], leaves: [_leave('845', _past, _past)]));
    expect(d.state, DayState.inOnly);
    expect(d.leave, isNotNull, reason: 'the leave is still shown beside the punch');
  });

  test('approved leave with no punch is on leave', () {
    expect(_only(_day(_past, [_p('845')], leaves: [_leave('845', '2026-09-15', '2026-09-17')])).state,
        DayState.onLeave);
  });

  test('a leave nobody has decided is not time off, and is not called absent either', () {
    final d = _only(_day(_past, [_p('845')], leaves: [_leave('845', _past, _past, status: 'Open')]));
    expect(d.state, DayState.leavePending);
  });

  test('a holiday on the person own calendar is a holiday, not an absence', () {
    final cal = {'Kochi 2026': [const Holiday(date: _past, description: 'Onam')]};
    expect(_only(_day(_past, [_p('845', list: 'Kochi 2026')], calendars: cal)).state, DayState.holiday);
  });

  test('somebody with no calendar of their own is measured against their company default', () {
    final cal = {'Manna Holidays': [const Holiday(date: _past, weeklyOff: true)]};
    final v = _day(_past, [_p('845')], calendars: cal, companyCalendar: {'Manna Rubber': 'Manna Holidays'});
    expect(_only(v).state, DayState.weekOff);
  });

  test('approved leave on a holiday reads as leave: the leave is what was applied for', () {
    final cal = {'Manna Holidays': [const Holiday(date: _past)]};
    final v = _day(_past, [_p('845', list: 'Manna Holidays')], calendars: cal, leaves: [_leave('845', _past, _past)]);
    expect(_only(v).state, DayState.onLeave);
  });

  test('no punch on a past day is absent, and today it is only not in yet', () {
    expect(_only(_day(_past, [_p('845')])).state, DayState.absent);
    expect(_only(_day(_today, [_p('845')])).state, DayState.notYetIn);
  });

  test('a punch-in and nothing else is still in today, and a missed punch-out on a past day', () {
    expect(stateLabel(DayState.inOnly, today: true), 'Still in');
    expect(stateLabel(DayState.inOnly), 'No punch-out');
  });

  test('a set-aside punch still proves somebody was there', () {
    // 16 Sep 2026: the site set a punch-out aside because it arrived after the
    // day was built. The person was at work, and this app must say so.
    final d = _only(_day(_past, [_p('845')], punches: [
      _punch('845', '$_past 08:24:27', 'IN'),
      _punch('845', '$_past 17:30:50', 'OUT', aside: true),
    ]));
    expect(d.present, isTrue);
    expect(d.punches.where((p) => p.setAside), hasLength(1));
  });

  test('when HR corrected a time, the correction is the day rather than the punch it replaced', () {
    final (inAt, outAt) = pair([
      _punch('845', '$_past 08:24:00', 'IN'),
      _punch('845', '$_past 17:30:00', 'OUT'),
      _punch('845', '$_past 17:32:00', 'OUT', aside: true),
    ]);
    expect((inAt, outAt), ('08:24', '17:30'));
  });

  test('earliest in and latest out, however many times the gate read the finger', () {
    final (inAt, outAt) = pair([
      _punch('845', '$_past 08:24:27', 'IN'),
      _punch('845', '$_past 08:24:29', 'IN'),
      _punch('845', '$_past 13:00:00', 'OUT'),
      _punch('845', '$_past 17:30:50', 'OUT'),
    ]);
    expect((inAt, outAt), ('08:24', '17:30'));
  });

  test('a machine that sends no direction has its first punch read as in and its last as out', () {
    final (inAt, outAt) = pair([_punch('845', '$_past 08:24:27', ''), _punch('845', '$_past 17:30:50', '')]);
    expect((inAt, outAt), ('08:24', '17:30'));
  });

  test('a night shift punch-out after midnight belongs to the day the shift started', () {
    // CLAUDE.md §5: get this wrong and a night worker is absent two days running.
    final v = _day(_past, [_p('901')], punches: [
      _punch('901', '$_past 20:02:11', 'IN', shiftStart: '$_past 20:00:00'),
      _punch('901', '2026-09-17 08:05:00', 'OUT', shiftStart: '$_past 20:00:00'),
    ]);
    final d = _only(v);
    expect(d.state, DayState.inOut);
    expect((d.firstIn, d.lastOut), ('20:02', '08:05'));
    final next = _only(_day('2026-09-17', [_p('901')], punches: [
      _punch('901', '2026-09-17 08:05:00', 'OUT', shiftStart: '$_past 20:00:00'),
    ]));
    expect(next.state, DayState.absent, reason: 'the morning out is not a day of its own');
  });

  test('the lists: who punched by arrival, who is absent by name, leave waiting for a decision', () {
    final v = _day(_past, [_p('1'), _p('2'), _p('3'), _p('4')], punches: [
      _punch('2', '$_past 09:10:00', 'IN'),
      _punch('1', '$_past 08:10:00', 'IN'),
    ], leaves: [
      _leave('3', _past, _past),
      _leave('1', _past, _past, status: 'Open'),
    ]);
    expect(v.punched.map((p) => p.person.id), ['1', '2']);
    expect(v.onLeave.map((p) => p.person.id), ['3']);
    expect(v.absent.map((p) => p.person.id), ['4']);
    expect(v.pendingLeave.map((p) => p.person.id), ['1'],
        reason: 'somebody who applied and came in anyway is shown, so the application can be rejected');
  });

  test('ERPNext department suffixes come off', () {
    expect(tidyDept('Production - MR'), 'Production');
    expect(tidyDept('Accounts'), 'Accounts');
  });

  group('Manna Tyre Retreads: 692 is in, 688 is out, and the shift is 24 hours', () {
    const inMachine = 'BIO-6426150300692';
    const outMachine = 'BIO-6426150300688';
    Punch site(String time, String device, String key) =>
        Punch.fromJson({'name': time, 'employee': '4', 'time': time, 'device_id': device, 'log_type': key});
    // MTR-009's, off the site, keys and all: 19 Sep was keyed OUT on the in machine.
    final jayakumar = [
      site('2026-09-17 09:03:02', inMachine, 'IN'),
      site('2026-09-18 09:21:48', outMachine, 'OUT'),
      site('2026-09-19 09:18:30', inMachine, 'OUT'),
      site('2026-09-20 10:05:12', outMachine, 'OUT'),
    ];
    PersonDay on(String date) => _only(DayView.build(
        date: date, today: _today, people: [_p('4')], punches: jayakumar, leaves: const []));

    test('the machine says the direction, whatever key was pressed', () {
      expect(site('2026-09-19 09:18:30', inMachine, 'OUT').logType, 'IN');
      expect(site('2026-09-18 09:21:48', outMachine, 'IN').logType, 'OUT');
    });

    test('in at nine on the in machine and out at nine next morning on the out machine is one day', () {
      final d = on('2026-09-17');
      expect(d.state, DayState.inOut);
      expect((d.firstIn, d.lastOut), ('09:03', '09:21'));
    });

    test('the morning of the leaving is not a day of its own', () {
      expect(on('2026-09-18').state, DayState.absent);
    });

    test('a day keyed OUT on the in machine is still an arrival', () {
      expect((on('2026-09-19').firstIn, on('2026-09-19').lastOut), ('09:18', '10:05'));
    });

    test("an out more than thirty hours after the last in is not that shift's leaving", () {
      final placed = placeByMachine([site('2026-09-21 09:00:00', inMachine, 'IN'), site('2026-09-23 08:00:00', outMachine, 'OUT')]);
      expect(placed[1].placedDay, '');
    });

    test('every other machine keeps its key', () {
      final gate = Punch.fromJson({'name': 'g', 'employee': '1', 'time': '$_past 08:24:27',
          'device_id': 'BIO-MRP-GATE1', 'log_type': 'IN'});
      expect(gate.logType, 'IN');
    });
  });

  group('day or night from the punch-in, for every company', () {
    // VIKRAM ASUR (MRP-298), off the site: hrms put both on the day shift, so
    // the site read 28 Sep as in 20:24 and out 08:35 that morning.
    final vikram = [
      _punch('130', '2026-09-28 20:24:31', 'IN', shiftStart: '2026-09-28 08:30:00'),
      _punch('130', '2026-09-29 08:35:21', 'OUT', shiftStart: '2026-09-29 08:30:00'),
      _punch('130', '2026-09-29 20:24:54', 'IN', shiftStart: '2026-09-29 08:30:00'),
      _punch('130', '2026-09-30 08:35:36', 'OUT', shiftStart: '2026-09-30 08:30:00'),
    ];

    test('an evening punch-in and the next morning punch-out are one night, on the evening day', () {
      final d = _only(_day('2026-09-28', [_p('130')], punches: vikram));
      expect((d.state, d.firstIn, d.lastOut), (DayState.inOut, '20:24', '08:35'));
      final e = _only(_day('2026-09-29', [_p('130')], punches: vikram));
      expect((e.firstIn, e.lastOut), ('20:24', '08:35'));
    });

    test('a day worker leaving at half past eight in the evening is not a night', () {
      final d = _only(_day(_past, [_p('845')], punches: [
        _punch('845', '$_past 08:27:33', 'IN'),
        _punch('845', '$_past 20:32:32', 'OUT'),
        _punch('845', '2026-09-17 08:26:00', 'IN'),
      ]));
      expect((d.firstIn, d.lastOut), ('08:27', '20:32'));
    });

    test('an evening IN straight after a morning IN decides nothing', () {
      expect(nightArrival(_punch('845', '$_past 20:32:32', 'IN'), _punch('845', '$_past 08:27:33', 'IN')), isFalse);
      expect(nightArrival(_punch('845', '$_past 20:32:32', 'IN'), _punch('845', '$_past 08:35:00', 'OUT')), isTrue);
      expect(nightArrival(_punch('845', '$_past 20:32:32', ''), null), isFalse);
    });

    test('an eight-hour night out at half past four belongs to the evening too', () {
      final d = _only(_day(_past, [_p('44')], punches: [
        _punch('44', '$_past 20:25:00', 'IN'),
        _punch('44', '2026-09-17 04:33:00', 'OUT'),
      ]));
      expect((d.firstIn, d.lastOut), ('20:25', '04:33'));
    });

    test('in and out come from the order, not the key: OUT pressed twice is still a day', () {
      // PRASEETHA I K (HRI-010), 16 Sep: OUT at 07:06 and OUT at 15:00.
      final d = _only(_day(_past, [_p('48')], punches: [
        _punch('48', '$_past 07:06:17', 'OUT'),
        _punch('48', '$_past 15:00:40', 'OUT'),
      ]));
      expect((d.state, d.firstIn, d.lastOut), (DayState.inOut, '07:06', '15:00'));
    });
  });
}
