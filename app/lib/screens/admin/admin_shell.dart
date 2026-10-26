import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/admin/admin_home.dart';
import 'package:manna_hr_app/screens/admin/day_screen.dart';
import 'package:manna_hr_app/screens/admin/employees_screen.dart';
import 'package:manna_hr_app/screens/admin/leave_requests_screen.dart';
import 'package:manna_hr_app/screens/admin/reports_screen.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/corrections_screen.dart';
import 'package:manna_hr_app/screens/leave_screen.dart';
import 'package:manna_hr_app/screens/leave_sheet.dart';
import 'package:manna_hr_app/screens/payslip_screen.dart';
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/screens/punch_screen.dart';
import 'package:manna_hr_app/screens/settings_screen.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// HR's side: Home, Employees, Leave, Reports — and More, which is the drawer.
///
/// **It only reads.** Everything here is a question about the group; a day is
/// corrected and leave is decided on the website, where the approval rules are
/// (CLAUDE.md §1). What each screen shows is whatever the signed-in login's
/// roles let it read.
class AdminShell extends StatefulWidget {
  const AdminShell({super.key, this.home});

  /// For the tests: the Home tab, in place of the one that reads the site.
  final Widget? home;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  final _scaffold = GlobalKey<ScaffoldState>();
  int _tab = 0;
  final Set<int> _built = {0};

  void _go(int i) {
    if (i == 4) {
      _scaffold.currentState?.openDrawer();
      return;
    }
    setState(() {
      _tab = i;
      _built.add(i);
    });
  }

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget>[
      widget.home ?? AdminHome(onTab: _go, onMenu: () => _scaffold.currentState?.openDrawer()),
      const EmployeesScreen(),
      const LeaveRequestsScreen(),
      const ReportsScreen(),
    ];
    return Scaffold(
      key: _scaffold,
      drawer: _AdminDrawer(onTab: _go),
      body: IndexedStack(
        index: _tab,
        children: [for (var i = 0; i < tabs.length; i++) _built.contains(i) ? tabs[i] : const SizedBox()],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        onTap: _go,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home_rounded), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.people_outline), activeIcon: Icon(Icons.people), label: 'Employees'),
          BottomNavigationBarItem(
              icon: Icon(Icons.event_note_outlined), activeIcon: Icon(Icons.event_note), label: 'Leave'),
          BottomNavigationBarItem(
              icon: Icon(Icons.insert_chart_outlined), activeIcon: Icon(Icons.insert_chart), label: 'Reports'),
          BottomNavigationBarItem(icon: Icon(Icons.more_horiz_rounded), label: 'More'),
        ],
      ),
    );
  }
}

class _AdminDrawer extends StatelessWidget {
  const _AdminDrawer({required this.onTab});

  final ValueChanged<int> onTab;

  @override
  Widget build(BuildContext context) {
    final emp = Session.I.employee;
    final name = '${emp?['employee_name'] ?? Session.I.user}';
    void tab(int i) {
      Navigator.of(context).pop();
      onTab(i);
    }

    void open(Widget page) {
      Navigator.of(context)
        ..pop()
        ..push(MaterialPageRoute(builder: (_) => page));
    }

    Widget row(IconData icon, String label, VoidCallback onTap) => ListTile(
          leading: Icon(icon, color: Colors.white),
          title: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          onTap: onTap,
        );

    return Drawer(
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [kBrand, kBrandDeep]),
        ),
        child: SafeArea(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
              child: Row(children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: Avatar(name: name, image: '${emp?['image'] ?? ''}', radius: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                    const Text('HR Admin', style: TextStyle(color: Colors.white, fontSize: 13)),
                  ]),
                ),
              ]),
            ),
            const Divider(color: Colors.white24, height: 1),
            Expanded(
              child: ListView(children: [
                row(Icons.dashboard_outlined, 'Dashboard', () => tab(0)),
                row(Icons.people_outline, 'Employees', () => tab(1)),
                row(Icons.event_note_outlined, 'Leave Requests', () => tab(2)),
                row(Icons.fingerprint, 'Attendance', () => open(const DayScreen())),
                row(Icons.payments_outlined, 'Payroll', () => open(const PayrollReport())),
                row(Icons.insert_chart_outlined, 'Reports', () => tab(3)),
                // Everything an employee has, for an HR login whose User ID is
                // on an Employee record — one menu, no switching sides.
                if (emp != null) ...[
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 14, 16, 4),
                    child: Text('MY SELF-SERVICE',
                        style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                  row(Icons.login_rounded, 'Punch In / Out', () => open(const PunchScreen())),
                  row(Icons.calendar_month_outlined, 'My Attendance', () => open(const CalendarScreen())),
                  row(Icons.beach_access_outlined, 'My Leave', () => open(const LeaveScreen())),
                  row(Icons.event_available_outlined, 'Apply Leave', () {
                    Navigator.of(context).pop();
                    openApplyLeave(context);
                  }),
                  row(Icons.receipt_long_outlined, 'My Payslip', () => open(const PayslipScreen())),
                  row(Icons.person_outline, 'My Profile', () => open(const ProfileScreen())),
                  row(Icons.edit_calendar_outlined, 'My Corrections', () => open(const CorrectionsScreen())),
                  const Divider(color: Colors.white24, height: 16),
                ],
                row(Icons.settings_outlined, 'Settings', () => open(const SettingsScreen())),
              ]),
            ),
            const Divider(color: Colors.white24, height: 1),
            row(Icons.logout_rounded, 'Sign out', () => signOut(context)),
            const SizedBox(height: 8),
          ]),
        ),
      ),
    );
  }
}
