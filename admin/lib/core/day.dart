/// One day, for everybody: who punched, who is absent, who is on leave.
///
/// **Pure, and the only place a person's day is decided in this app.** No
/// Flutter, no Dio, no site — the screens draw what [DayView.build] returns,
/// and `test/day_test.dart` argues about it without a phone.
///
/// The order is the website's (`client/src/lib/rules.js`, and `app/lib/core/
/// roster.dart` on the employee's phone), because HR reads the two side by side
/// and they must not disagree about the same person:
///
///   1. **A punch beats a leave record.** Somebody who came in was at work,
///      whatever an application says.
///   2. **Approved leave** is time off.
///   3. **A holiday or weekly off** on the person's own calendar — their
///      Holiday List, else their company's default.
///   4. **A leave nobody has decided is not time off.** It is shown, so HR can
///      act on it, but the day is still an absence until somebody approves it.
///   5. Otherwise **absent** — or, for today, **not in yet**: the day is not
///      over, and calling somebody absent at nine in the morning is wrong.
///
/// This app only reads. It writes no punch and no Attendance, and the site's
/// own shift job remains what decides what anybody is paid.
library;

/// A person's state on the day, in the order they are counted.
enum DayState {
  /// Punched in and out.
  inOut,

  /// A punch-in and nothing after it: still at work today, or a missed
  /// punch-out on a past day.
  inOnly,

  /// Approved leave, and no punch.
  onLeave,

  /// A holiday on their calendar.
  holiday,

  /// A weekly off on their calendar.
  weekOff,

  /// A leave application still waiting for a decision. Not time off.
  leavePending,

  /// No punch, no leave, no holiday — and the day is over.
  absent,

  /// No punch yet, today.
  notYetIn,
}

/// What a state is called on screen.
String stateLabel(DayState s, {bool today = false}) => switch (s) {
      DayState.inOut => 'In and out',
      DayState.inOnly => today ? 'Still in' : 'No punch-out',
      DayState.onLeave => 'On leave',
      DayState.holiday => 'Holiday',
      DayState.weekOff => 'Weekly off',
      DayState.leavePending => 'Leave not approved',
      DayState.absent => 'Absent',
      DayState.notYetIn => 'Not in yet',
    };

class Person {
  const Person({
    required this.id,
    required this.name,
    this.number = '',
    this.department = '',
    this.designation = '',
    this.company = '',
    this.holidayList = '',
  });

  final String id;
  final String name;
  final String number;
  final String department;
  final String designation;
  final String company;
  final String holidayList;

  factory Person.fromJson(Map<String, dynamic> j) => Person(
        id: '${j['name'] ?? ''}',
        name: '${j['employee_name'] ?? j['name'] ?? ''}',
        number: '${j['employee_number'] ?? ''}',
        department: tidyDept('${j['department'] ?? ''}'),
        designation: '${j['designation'] ?? ''}',
        company: '${j['company'] ?? ''}',
        holidayList: '${j['holiday_list'] ?? ''}',
      );
}

/// `Production - MR` → `Production`. ERPNext suffixes every department with
/// its company's abbreviation, which is noise on a phone-width row.
String tidyDept(String d) => d.replaceFirst(RegExp(r' - [A-Z]{2,5}$'), '');

/// Machines that are one direction each: the machine, not the key pressed,
/// says whether a punch is an arrival or a leaving.
///
/// **Manna Tyre Retreads, 1 October 2026.** 692 is the punch-in machine and
/// 688 the punch-out machine, and the production shift is 24 hours, 09:00 to
/// 08:59 — in at about nine on 692, out at about nine the next morning on 688.
/// The key pressed is not to be believed, and the clock cannot tell an arrival
/// from a leaving at the same hour; only the machine can. The same rule is
/// `client/src/lib/direction.js`; a machine added to one is added to the other.
const kByMachine = {'BIO-6426150300692': 'IN', 'BIO-6426150300688': 'OUT'};

class Punch {
  const Punch({
    required this.id,
    required this.employee,
    required this.time,
    this.logType = '',
    this.device = '',
    this.setAside = false,
    this.shiftStart = '',
    this.placedDay = '',
  });

  final String id;
  final String employee;

  /// `YYYY-MM-DD HH:MM:SS`, the site's wall clock.
  final String time;

  /// `IN`, `OUT`, or empty — a machine never set up for in/out sends nothing.
  final String logType;
  final String device;

  /// `skip_auto_attendance`: set aside — replaced by a correction, or arrived
  /// after the day was already built. **Still a punch.** It proves somebody
  /// was there, so it counts for being present; it is marked on screen so a
  /// day that looks wrong on the website can be explained here.
  final bool setAside;

  /// When the shift this punch belongs to started, as hrms matched it. What
  /// places a night worker's morning punch-out on the day before.
  final String shiftStart;

  /// The work day [placeByMachine] put this punch on: a 24-hour shift's
  /// next-morning leaving, counted on its arrival's day.
  final String placedDay;

  Punch placedOn(String day) => Punch(
      id: id, employee: employee, time: time, logType: logType, device: device,
      setAside: setAside, shiftStart: shiftStart, placedDay: day);

  /// Read off the site. A punch from a [kByMachine] machine takes its direction
  /// from the machine — only here: the punch on the site keeps the key it
  /// arrived with, because a punch is evidence and is never rewritten.
  factory Punch.fromJson(Map<String, dynamic> j) => Punch(
        id: '${j['name'] ?? ''}',
        employee: '${j['employee'] ?? ''}',
        time: '${j['time'] ?? ''}',
        logType: kByMachine['${j['device_id'] ?? ''}'] ?? '${j['log_type'] ?? ''}'.toUpperCase(),
        device: '${j['device_id'] ?? ''}',
        setAside: _truthy(j['skip_auto_attendance']),
        shiftStart: '${j['shift_start'] ?? ''}',
      );

  /// The day this punch counts towards: where [placeByMachine] put it, else its
  /// shift's start, else its own date. A one-direction machine's punch ignores
  /// the shift hrms matched it to: hrms places by the clock, and at a 09:00
  /// changeover the clock puts the leaving on the wrong day.
  String get workDay {
    if (placedDay.isNotEmpty) return placedDay;
    final s = shiftStart.length >= 10 && !kByMachine.containsKey(device) ? shiftStart : time;
    return s.length >= 10 ? s.substring(0, 10) : s;
  }

  /// `HH:MM`.
  String get clock => time.length >= 16 ? time.substring(11, 16) : time;

  /// Whether this is a phone punch rather than a fingerprint machine's.
  bool get fromPhone => device.startsWith('PHONE-');

  /// Whether HR wrote this one by correcting the day.
  bool get fromCorrection => device.startsWith('REG-');
}

class Leave {
  const Leave({
    required this.id,
    required this.employee,
    required this.employeeName,
    required this.type,
    required this.from,
    required this.to,
    required this.status,
    this.halfDay = false,
    this.halfDayDate = '',
    this.days = 0,
  });

  final String id;
  final String employee;
  final String employeeName;
  final String type;
  final String from;
  final String to;

  /// `Approved`, or `Open` — still waiting for a decision.
  final String status;
  final bool halfDay;
  final String halfDayDate;
  final double days;

  bool get approved => status == 'Approved';
  bool covers(String day) => from.compareTo(day) <= 0 && day.compareTo(to) <= 0;
  bool halfOn(String day) => halfDay && (halfDayDate.isEmpty || halfDayDate.startsWith(day));

  factory Leave.fromJson(Map<String, dynamic> j) => Leave(
        id: '${j['name'] ?? ''}',
        employee: '${j['employee'] ?? ''}',
        employeeName: '${j['employee_name'] ?? ''}',
        type: '${j['leave_type'] ?? 'Leave'}',
        from: _day(j['from_date']),
        to: _day(j['to_date']),
        status: '${j['status'] ?? ''}',
        halfDay: _truthy(j['half_day']),
        halfDayDate: _day(j['half_day_date']),
        days: (j['total_leave_days'] is num) ? (j['total_leave_days'] as num).toDouble() : 0,
      );
}

class Holiday {
  const Holiday({required this.date, this.weeklyOff = false, this.description = ''});

  final String date;
  final bool weeklyOff;
  final String description;

  factory Holiday.fromJson(Map<String, dynamic> j) => Holiday(
        date: _day(j['holiday_date']),
        weeklyOff: _truthy(j['weekly_off']),
        description: '${j['description'] ?? ''}'
            .replaceAll(RegExp(r'<[^>]*>'), ' ')
            .replaceAll('&nbsp;', ' ')
            .replaceAll(RegExp(r'\s+'), ' ')
            .trim(),
      );
}

/// One person's day.
class PersonDay {
  const PersonDay({
    required this.person,
    required this.state,
    this.punches = const [],
    this.firstIn = '',
    this.lastOut = '',
    this.leave,
    this.pending,
    this.holiday,
  });

  final Person person;
  final DayState state;

  /// Every punch that counts towards the day, oldest first, set-aside included.
  final List<Punch> punches;

  /// `HH:MM`, or empty.
  final String firstIn;
  final String lastOut;

  /// Approved leave covering the day — shown even beside a punch, so a
  /// half-day leave and a half day at work read as one story.
  final Leave? leave;

  /// A leave application waiting for a decision.
  final Leave? pending;
  final Holiday? holiday;

  bool get present => state == DayState.inOut || state == DayState.inOnly;
}

/// The day, for everybody in scope.
class DayView {
  const DayView({required this.date, required this.isToday, required this.people});

  final String date;
  final bool isToday;
  final List<PersonDay> people;

  Iterable<PersonDay> where(Set<DayState> s) => people.where((p) => s.contains(p.state));

  List<PersonDay> get punched {
    final l = people.where((p) => p.present).toList();
    l.sort((a, b) => (a.firstIn.isEmpty ? '99' : a.firstIn).compareTo(b.firstIn.isEmpty ? '99' : b.firstIn));
    return l;
  }

  List<PersonDay> get absent => _byName(where({DayState.absent, DayState.notYetIn, DayState.leavePending}));
  List<PersonDay> get onLeave => _byName(where({DayState.onLeave}));
  List<PersonDay> get off => _byName(where({DayState.holiday, DayState.weekOff}));

  /// Leave applications on the day still waiting for a decision — including
  /// those of people who came in anyway, which HR will want to reject.
  List<PersonDay> get pendingLeave => _byName(people.where((p) => p.pending != null));

  static List<PersonDay> _byName(Iterable<PersonDay> it) =>
      it.toList()..sort((a, b) => a.person.name.toLowerCase().compareTo(b.person.name.toLowerCase()));

  /// Everybody's day.
  ///
  /// [calendars] is Holiday List name → its rows; [companyCalendar] is company
  /// → its default Holiday List, the fallback for somebody with none of their
  /// own. A person whose calendar has not been read yet is judged without one
  /// — their Sunday reads as a working day — so the screen reads calendars
  /// before it builds.
  static DayView build({
    required String date,
    required String today,
    required List<Person> people,
    required List<Punch> punches,
    required List<Leave> leaves,
    Map<String, List<Holiday>> calendars = const {},
    Map<String, String> companyCalendar = const {},
  }) {
    final isToday = date == today;
    punches = placeNights(placeByMachine(punches));
    final byEmp = <String, List<Punch>>{};
    for (final p in punches) {
      if (p.workDay != date) continue;
      byEmp.putIfAbsent(p.employee, () => []).add(p);
    }
    for (final l in byEmp.values) {
      l.sort((a, b) => a.time.compareTo(b.time));
    }

    final out = <PersonDay>[];
    for (final person in people) {
      final mine = byEmp[person.id] ?? const <Punch>[];
      final myLeave = leaves.where((l) => l.employee == person.id && l.covers(date));
      final approved = myLeave.where((l) => l.approved).firstOrNull;
      final pending = myLeave.where((l) => l.status == 'Open').firstOrNull;
      final list = person.holidayList.isNotEmpty ? person.holidayList : (companyCalendar[person.company] ?? '');
      final holiday = (calendars[list] ?? const <Holiday>[]).where((h) => h.date == date).firstOrNull;

      if (mine.isNotEmpty) {
        final (inAt, outAt) = pair(mine);
        out.add(PersonDay(
          person: person,
          state: outAt.isEmpty ? DayState.inOnly : DayState.inOut,
          punches: mine,
          firstIn: inAt,
          lastOut: outAt,
          leave: approved,
          pending: pending,
          holiday: holiday,
        ));
        continue;
      }
      final DayState state;
      if (approved != null) {
        state = DayState.onLeave;
      } else if (holiday != null) {
        state = holiday.weeklyOff ? DayState.weekOff : DayState.holiday;
      } else if (pending != null) {
        state = DayState.leavePending;
      } else {
        state = isToday ? DayState.notYetIn : DayState.absent;
      }
      out.add(PersonDay(person: person, state: state, leave: approved, pending: pending, holiday: holiday));
    }
    return DayView(date: date, isToday: isToday, people: out);
  }
}

/// Every punch, with each one-direction machine's next-morning leaving placed
/// on its arrival's day: an OUT before noon that follows that person's IN of an
/// earlier day, by no more than thirty hours. The same rule as the website's
/// `byMachine`.
List<Punch> placeByMachine(List<Punch> punches) {
  final out = List<Punch>.of(punches);
  final mine = <String, List<int>>{};
  for (var i = 0; i < out.length; i++) {
    if (kByMachine.containsKey(out[i].device)) mine.putIfAbsent(out[i].employee, () => []).add(i);
  }
  for (final idx in mine.values) {
    idx.sort((a, b) => out[a].time.compareTo(out[b].time));
    for (var j = 1; j < idx.length; j++) {
      final prev = out[idx[j - 1]];
      final cur = out[idx[j]];
      if (cur.logType != 'OUT' || prev.logType != 'IN' || cur.time.length < 13) continue;
      if (int.tryParse(cur.time.substring(11, 13)) == null || int.parse(cur.time.substring(11, 13)) >= 12) continue;
      final day = prev.time.substring(0, 10);
      if (day.compareTo(cur.time.substring(0, 10)) >= 0) continue;
      if (_minutesBetween(prev.time, cur.time) > 30 * 60) continue;
      out[idx[j]] = cur.placedOn(day);
    }
  }
  return out;
}

/// Day or night, from the punch-in — for every company (1 October 2026).
///
/// Nobody tells the website which week is a night week; the supervisor tells
/// the worker. So a punch keyed **IN between 17:00 and midnight**, whose
/// previous punch was not also an IN within the same shift, starts a night,
/// and that person's next punch — before noon the next morning, within sixteen
/// hours — is the night's leaving, counted on the evening's day. The same rule
/// gives the night shift on the site before the punch is sent
/// (`bridge/mannabridge/rota.py`), so the phone and the site agree; this is
/// what puts right the nights hrms already measured against the day shift.
///
/// A day worker leaving at 20:32 and a night worker arriving at 20:24 are the
/// same minute, so the key is what tells them apart — checked against the punch
/// before, and nothing is decided on two INs in a row. The one-direction
/// machines ([kByMachine]) are left to [placeByMachine].
List<Punch> placeNights(List<Punch> punches) {
  final out = List<Punch>.of(punches);
  final mine = <String, List<int>>{};
  for (var i = 0; i < out.length; i++) {
    if (!kByMachine.containsKey(out[i].device)) mine.putIfAbsent(out[i].employee, () => []).add(i);
  }
  for (final idx in mine.values) {
    idx.sort((a, b) => out[a].time.compareTo(out[b].time));
    for (var j = 0; j + 1 < idx.length; j++) {
      final cur = out[idx[j]];
      if (!nightArrival(cur, j > 0 ? out[idx[j - 1]] : null)) continue;
      final next = out[idx[j + 1]];
      final day = cur.time.substring(0, 10);
      if (next.time.length < 13 || next.time.substring(0, 10).compareTo(day) <= 0) continue;
      if ((int.tryParse(next.time.substring(11, 13)) ?? 99) >= 12) continue;
      if (_minutesBetween(cur.time, next.time) > 16 * 60) continue;
      out[idx[j]] = cur.placedOn(day);
      out[idx[j + 1]] = next.placedOn(day);
    }
  }
  return out;
}

/// Whether [p] is somebody arriving for a night shift. [before] is the same
/// person's punch before it.
bool nightArrival(Punch p, Punch? before) {
  if (p.logType != 'IN' || p.time.length < 13) return false;
  final h = int.tryParse(p.time.substring(11, 13)) ?? -1;
  if (h < 17) return false;
  if (before != null && before.logType == 'IN' && _minutesBetween(before.time, p.time) < 16 * 60) return false;
  return true;
}

/// A day's in and out, `HH:MM` each, from its punches (oldest first).
///
/// **The first punch of the work day is the in and the last is the out,
/// whatever key was pressed** (1 October 2026). Keys are pressed wrong — two
/// OUTs on the same day, a gate never set up for direction — and a day that
/// plainly has an arrival and a leaving must not read as neither. Which day a
/// punch is on is settled before this, by its shift ([placeNights],
/// [placeByMachine]); within the day only the order is needed.
///
/// A punch the site has not set aside wins over one it has: when HR corrected
/// a time, the correction is the day. A last punch within ten minutes of the
/// first is one finger read twice, and the day stays in-only, as on the
/// website (`lib/roster.js`).
(String, String) pair(List<Punch> punches) {
  final live = punches.where((p) => !p.setAside).toList();
  final use = live.isNotEmpty ? live : punches;
  final first = use.first;
  final last = use.last;
  if (use.length < 2 || _minutesBetween(first.time, last.time) <= 10) return (first.clock, '');
  return (first.clock, last.clock);
}

/// Minutes from one site timestamp to another; a large number when either
/// cannot be read, so a garbled time never merges two real punches.
int _minutesBetween(String a, String b) {
  final x = DateTime.tryParse(a.replaceFirst(' ', 'T'));
  final y = DateTime.tryParse(b.replaceFirst(' ', 'T'));
  if (x == null || y == null) return 1 << 30;
  return y.difference(x).inMinutes.abs();
}

String _day(dynamic v) {
  final s = '${v ?? ''}';
  return s.length >= 10 ? s.substring(0, 10) : s;
}

bool _truthy(dynamic v) => v == true || v == 1 || v == '1';
