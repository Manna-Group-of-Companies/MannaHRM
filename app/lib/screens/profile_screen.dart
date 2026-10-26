import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/day.dart' show tidyDept;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/screens/leave_screen.dart';
import 'package:manna_hr_app/screens/payslip_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// One Employee record.
///
/// Two ways in, one screen: a person's own profile (Personal, Work), and HR's
/// Employee Details for anybody (Profile, Attendance, Leave, Payroll). Both are
/// reads; a record is changed on the website, where the rules about what may
/// change are (Settings → Security's locked fields among them).
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.id, this.seed});

  /// An Employee id, for HR. Left out, it is this login's own record.
  final String? id;

  /// What the list already knew, drawn while the whole record is read.
  final Map<String, dynamic>? seed;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _doc;
  bool _loading = true;
  String _error = '';

  bool get _own => widget.id == null;
  String get _id => widget.id ?? Session.I.employeeId;

  @override
  void initState() {
    super.initState();
    _doc = widget.seed ?? (_own ? Session.I.employee : null);
    _load();
  }

  Future<void> _load() async {
    if (_own && Session.I.employee == null) {
      try {
        await Api.resolveEmployee();
      } catch (_) {
        // Said below, as no record.
      }
      _doc = Session.I.employee;
    }
    if (_id.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final doc = await Api.employeeRecord(_id);
      if (mounted) setState(() => _doc = doc);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _v(String key) => '${_doc?[key] ?? ''}';

  @override
  Widget build(BuildContext context) {
    final d = _doc;
    if (d == null) {
      return Scaffold(
        appBar: brandBar(_own ? 'My Profile' : 'Employee Details'),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : Note(
                  _error.isNotEmpty
                      ? _error
                      : 'No employee record is linked to this login. Ask HR to put your user on your Employee '
                          'record — the field is User ID.',
                  kind: _error.isNotEmpty ? NoteKind.error : NoteKind.warn),
        ),
      );
    }
    final tabs = _own
        ? const ['Personal', 'Work']
        : const ['Profile', 'Attendance', 'Leave', 'Payroll'];
    return DefaultTabController(
      length: tabs.length,
      child: Scaffold(
        appBar: brandBar(_own ? 'My Profile' : 'Employee Details'),
        body: NestedScrollView(
          headerSliverBuilder: (_, _) => [
            SliverToBoxAdapter(child: _head()),
            SliverToBoxAdapter(
              child: Container(
                color: kCard,
                child: TabBar(
                  isScrollable: tabs.length > 3,
                  tabAlignment: tabs.length > 3 ? TabAlignment.start : null,
                  tabs: [for (final t in tabs) Tab(text: t)],
                ),
              ),
            ),
          ],
          body: TabBarView(
            children: _own
                ? [_list(_personal()), _list(_work())]
                : [
                    _list([..._personal(), const Divider(color: kLine), ..._work()]),
                    CalendarScreen(who: d, bare: true),
                    LeaveScreen(employee: _id, bare: true),
                    PayslipScreen(employee: _id, bare: true),
                  ],
          ),
        ),
      ),
    );
  }

  Widget _head() {
    final status = _v('status');
    return Container(
      width: double.infinity,
      color: kCard,
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 14),
      child: Column(children: [
        Avatar(name: _v('employee_name'), image: _v('image'), radius: 44),
        const SizedBox(height: 12),
        Text(_v('employee_name'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: kInk)),
        const SizedBox(height: 2),
        Text(
          [_own ? '' : _v('employee_number'), _v('designation')].where((s) => s.isNotEmpty).join(' · '),
          style: const TextStyle(color: kInk2),
        ),
        if (!_own && status.isNotEmpty) ...[
          const SizedBox(height: 8),
          Pill(status, color: wordColour(status)),
        ],
        if (_error.isNotEmpty) ...[const SizedBox(height: 10), Note(_error)],
      ]),
    );
  }

  Widget _list(List<Widget> rows) => RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [Panel(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Column(children: rows))],
        ),
      );

  String _email() {
    for (final k in ['prefered_email', 'company_email', 'personal_email', 'user_id']) {
      if (_v(k).isNotEmpty) return _v(k);
    }
    return '';
  }

  List<Widget> _personal() => [
        InfoRow(icon: Icons.badge_outlined, label: 'Employee ID', value: _v('employee_number').isNotEmpty ? _v('employee_number') : _v('name')),
        InfoRow(icon: Icons.mail_outline, label: 'Email', value: _email()),
        InfoRow(icon: Icons.phone_outlined, label: 'Phone', value: _v('cell_number')),
        InfoRow(icon: Icons.cake_outlined, label: 'Date of Birth', value: dmy(_v('date_of_birth'))),
        InfoRow(icon: Icons.person_outline, label: 'Gender', value: _v('gender')),
      ];

  List<Widget> _work() => [
        InfoRow(icon: Icons.business_outlined, label: 'Company', value: _v('company')),
        InfoRow(icon: Icons.apartment_outlined, label: 'Department', value: tidyDept(_v('department'))),
        InfoRow(icon: Icons.work_outline, label: 'Designation', value: _v('designation')),
        InfoRow(icon: Icons.event_outlined, label: 'Joining Date', value: dmy(_v('date_of_joining'))),
        InfoRow(icon: Icons.schedule_outlined, label: 'Shift', value: _v('default_shift')),
        InfoRow(icon: Icons.supervisor_account_outlined, label: 'Reports To', value: _v('reports_to')),
        // The number the fingerprint machines know this person by. Without it
        // every punch they make is dropped (docs/NEW_EMPLOYEE.md), so HR is
        // shown a blank here rather than nothing.
        if (!_own) InfoRow(icon: Icons.fingerprint, label: 'Machine ID', value: _v('attendance_device_id')),
        InfoRow(icon: Icons.event_busy_outlined, label: 'Holiday List', value: _v('holiday_list')),
      ];
}
