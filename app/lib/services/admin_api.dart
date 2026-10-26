import 'dart:convert';

import 'package:dio/dio.dart';

import 'package:manna_hr_app/core/constants.dart';
import 'package:manna_hr_app/core/day.dart';
import 'package:manna_hr_app/core/session.dart';

/// HR's reads — and HR's side makes nothing but reads.
///
/// **No write of any kind.** Not a punch, not a correction, not Attendance,
/// not a leave decision. HR corrects a day and decides leave on the website,
/// where the approval rules are; a phone that could do it too would be a second
/// set of rules to keep in step (CLAUDE.md §1). Sign-in and the session are
/// `Api`'s, shared with the employee's side.
///
/// **A short field list stands behind every long one**, as in `Api`: Frappe
/// answers 417 for the whole read when asked for one field a site has not got.
/// Unlike `Api._read`, these throw when both fail — every one of them backs a
/// whole screen, and the screen says the site would not answer.
class AdminApi {
  static String _res(String doctype) => '/api/resource/${Uri.encodeComponent(doctype)}';

  /// Every page of a list. Frappe pages at `limit_page_length`; the loop stops
  /// at the first short page.
  static Future<List<Map<String, dynamic>>> _all(String doctype, List<String> fields,
      {List<List<dynamic>>? filters, String orderBy = 'name asc', int? max}) async {
    final out = <Map<String, dynamic>>[];
    for (var start = 0;; start += kListPageLength) {
      final qp = <String, dynamic>{
        'fields': jsonEncode(fields),
        'order_by': orderBy,
        'limit_page_length': kListPageLength,
        'limit_start': start,
      };
      if (filters != null) qp['filters'] = jsonEncode(filters);
      final r = await Session.I.dio.get(_res(doctype), queryParameters: qp);
      final data = (r.data is Map) ? r.data['data'] : null;
      if (data is! List) {
        throw DioException.badResponse(statusCode: r.statusCode ?? 0, requestOptions: r.requestOptions, response: r);
      }
      out.addAll(data.cast<Map<String, dynamic>>());
      if (data.length < kListPageLength || (max != null && out.length >= max)) return out;
    }
  }

  static Future<List<Map<String, dynamic>>> _read(String doctype, List<String> long, List<String> short,
      {List<List<dynamic>>? filters, String orderBy = 'name asc', int? max}) async {
    try {
      return await _all(doctype, long, filters: filters, orderBy: orderBy, max: max);
    } catch (_) {
      return _all(doctype, short, filters: filters, orderBy: orderBy, max: max);
    }
  }

  static Future<int> _count(String doctype, List<List<dynamic>> filters) async {
    final r = await Session.I.dio.get('/api/method/frappe.client.get_count',
        queryParameters: {'doctype': doctype, 'filters': jsonEncode(filters)});
    final m = (r.data is Map) ? r.data['message'] : null;
    if (m is num) return m.toInt();
    throw DioException.badResponse(statusCode: r.statusCode ?? 0, requestOptions: r.requestOptions, response: r);
  }

  // --------------------------------------------------------------- the day --

  static List<Person>? _people;
  static Map<String, String>? _companyCalendar;
  static final Map<String, List<Holiday>> _calendars = {};

  /// Who is counted: Active employees. Read once a session and on refresh — a
  /// day's view is a question about today's punches, not about who works here.
  static Future<List<Person>> people({bool fresh = false}) async {
    if (!fresh && _people != null) return _people!;
    final rows = await _read('Employee',
        ['name', 'employee_name', 'employee_number', 'company', 'department', 'designation', 'holiday_list'],
        ['name', 'employee_name', 'company'],
        filters: [['status', '=', 'Active']], orderBy: 'employee_name asc');
    return _people = rows.map(Person.fromJson).toList();
  }

  /// Company → its default Holiday List, the calendar for anybody with none of
  /// their own.
  static Future<Map<String, String>> companyCalendars({bool fresh = false}) async {
    if (!fresh && _companyCalendar != null) return _companyCalendar!;
    try {
      final rows = await _all('Company', ['name', 'default_holiday_list']);
      _companyCalendar = {for (final r in rows) '${r['name']}': '${r['default_holiday_list'] ?? ''}'};
    } catch (_) {
      _companyCalendar = {};
    }
    return _companyCalendar!;
  }

  /// One Holiday List's rows, kept for the session — a calendar changes a few
  /// times a year. A list that cannot be read is left out: those people are
  /// judged without one, which reads a Sunday as a working day rather than
  /// hiding an absence.
  static Future<void> _calendar(String name) async {
    if (name.isEmpty || _calendars.containsKey(name)) return;
    try {
      final r = await Session.I.dio.get('${_res('Holiday List')}/${Uri.encodeComponent(name)}');
      final rows = (r.data is Map) ? (r.data['data']?['holidays'] as List?) : null;
      _calendars[name] = (rows ?? const []).cast<Map<String, dynamic>>().map(Holiday.fromJson).toList();
    } catch (_) {
      _calendars[name] = const [];
    }
  }

  /// The day's punches, placed by their shift's start — so the read runs into
  /// the next morning, for the night shift's punch-out.
  ///
  /// It starts the day before, too: whether a morning punch-out on the out
  /// machine ends yesterday's 24-hour shift depends on yesterday's arrival.
  static Future<List<Punch>> punches(String date) async {
    final next = DateTime.parse(date).add(const Duration(days: 1));
    final prev = DateTime.parse(date).subtract(const Duration(days: 1));
    final until = '${ymd(next)} ${kNextDayHours.toString().padLeft(2, '0')}:00:00';
    final rows = await _read('Employee Checkin',
        ['name', 'employee', 'time', 'log_type', 'device_id', 'skip_auto_attendance', 'shift_start'],
        ['name', 'employee', 'time', 'log_type'],
        filters: [['time', '>=', '${ymd(prev)} 00:00:00'], ['time', '<=', until]], orderBy: 'time asc');
    return rows.map(Punch.fromJson).toList();
  }

  /// Leave applications on the day, approved or waiting for a decision.
  static Future<List<Leave>> leaves(String date) async {
    final rows = await _read('Leave Application',
        ['name', 'employee', 'employee_name', 'leave_type', 'from_date', 'to_date', 'status', 'half_day',
          'half_day_date', 'total_leave_days'],
        ['name', 'employee', 'leave_type', 'from_date', 'to_date', 'status'],
        filters: [['from_date', '<=', date], ['to_date', '>=', date], ['status', 'in', ['Approved', 'Open']],
          ['docstatus', '<', 2]],
        orderBy: 'from_date asc');
    return rows.map(Leave.fromJson).toList();
  }

  /// Everything one day needs, read together.
  static Future<DayView> day(String date, String today, {bool fresh = false}) async {
    final results = await Future.wait([
      people(fresh: fresh),
      companyCalendars(fresh: fresh),
      punches(date),
      leaves(date),
    ]);
    final who = results[0] as List<Person>;
    final coCal = results[1] as Map<String, String>;
    if (fresh) _calendars.clear();
    final lists = {
      for (final p in who) p.holidayList.isNotEmpty ? p.holidayList : (coCal[p.company] ?? ''),
    }..remove('');
    await Future.wait(lists.map(_calendar));
    return DayView.build(
      date: date,
      today: today,
      people: who,
      punches: results[2] as List<Punch>,
      leaves: results[3] as List<Leave>,
      calendars: Map.of(_calendars),
      companyCalendar: coCal,
    );
  }

  // ---------------------------------------------------- the rest of HR's side --

  /// Every employee at every status — the Employees list, which filters by
  /// status on the phone rather than asking again.
  static Future<List<Map<String, dynamic>>> employees() => _read(
        'Employee',
        ['name', 'employee_name', 'employee_number', 'company', 'department', 'designation', 'status', 'image',
          'cell_number', 'user_id'],
        ['name', 'employee_name', 'company', 'status'],
        orderBy: 'employee_name asc',
      );

  /// Leave applications at one status, newest first. [status] is the site's
  /// word: `Open`, `Approved` or `Rejected`. Cancelled ones are left out —
  /// a cancelled application asks nothing of anybody.
  static Future<List<Map<String, dynamic>>> leaveRequests(String status, {int max = 200}) => _read(
        'Leave Application',
        ['name', 'employee', 'employee_name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'half_day',
          'description', 'status', 'posting_date', 'company'],
        ['name', 'employee', 'leave_type', 'from_date', 'to_date', 'status'],
        filters: [['status', '=', status], ['docstatus', '<', 2]],
        orderBy: 'from_date desc',
        max: max,
      );

  /// How many leave applications nobody has decided yet.
  static Future<int> pendingLeave() => _count('Leave Application', [['status', '=', 'Open'], ['docstatus', '=', 0]]);

  /// A month's salary slips for everybody, drafts included — HR's question is
  /// what has been made, not only what has been paid.
  static Future<List<Map<String, dynamic>>> slips(String ym) => _read(
        'Salary Slip',
        ['name', 'employee', 'employee_name', 'company', 'department', 'start_date', 'gross_pay', 'total_deduction',
          'net_pay', 'docstatus', 'status'],
        ['name', 'employee', 'net_pay', 'docstatus'],
        filters: [['start_date', '>=', '$ym-01'], ['start_date', '<=', '$ym-31'], ['docstatus', '<', 2]],
        orderBy: 'employee_name asc',
      );

  /// Forgets what the session read, for sign-out.
  static void forget() {
    _people = null;
    _companyCalendar = null;
    _calendars.clear();
  }
}

/// `YYYY-MM-DD` for a date, the site's own spelling.
String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
