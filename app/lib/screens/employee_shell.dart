import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/activity.dart';
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/correction_sheet.dart' show dmy;
import 'package:manna_hr_app/screens/corrections_screen.dart';
import 'package:manna_hr_app/screens/leave_screen.dart';
import 'package:manna_hr_app/screens/leave_sheet.dart';
import 'package:manna_hr_app/screens/payslip_screen.dart';
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/screens/today_card.dart';
import 'package:manna_hr_app/screens/settings_screen.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// The employee's side: Home, Attendance, Leave, More.
///
/// A tab is built the first time it is opened and kept after, so opening the
/// app is one round of reads rather than four, and coming back to the month
/// does not throw away the month somebody was looking at.
class EmployeeShell extends StatefulWidget {
  const EmployeeShell({super.key});

  @override
  State<EmployeeShell> createState() => _EmployeeShellState();
}

class _EmployeeShellState extends State<EmployeeShell> {
  int _tab = 0;
  final Set<int> _built = {0};

  void _go(int i) => setState(() {
        _tab = i;
        _built.add(i);
      });

  @override
  Widget build(BuildContext context) {
    final tabs = <Widget>[
      _HomeTab(onTab: _go),
      const CalendarScreen(),
      const LeaveScreen(),
      const _MoreTab(),
    ];
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [for (var i = 0; i < tabs.length; i++) _built.contains(i) ? tabs[i] : const SizedBox()],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tab,
        onTap: _go,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home_rounded), label: 'Home'),
          BottomNavigationBarItem(
              icon: Icon(Icons.calendar_month_outlined), activeIcon: Icon(Icons.calendar_month), label: 'Attendance'),
          BottomNavigationBarItem(
              icon: Icon(Icons.beach_access_outlined), activeIcon: Icon(Icons.beach_access), label: 'Leave'),
          BottomNavigationBarItem(icon: Icon(Icons.menu_rounded), label: 'More'),
        ],
      ),
    );
  }
}

/// Today, the four doors, and what this person last asked for.
class _HomeTab extends StatefulWidget {
  const _HomeTab({required this.onTab});

  final ValueChanged<int> onTab;

  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  List<Activity> _recent = const [];

  /// Bumped on every read, so the card above reads its punches again too.
  int _round = 0;
  bool _loading = true;
  String _error = '';

  /// True only when the site *answered* that no Employee carries this user.
  /// A read that failed is not that answer, and must not draw the card that
  /// sends somebody to HR.
  bool _linkMissing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = '';
      _round++;
    });
    try {
      if (Session.I.employee == null) {
        final found = await Api.resolveEmployee();
        _linkMissing = found == null;
      }
      final got = await Future.wait([
        // Recent activity is a courtesy; a site that will not show it must not
        // cost the card above it.
        Api.myLeave(limit: 6).catchError((_) => <Map<String, dynamic>>[]),
        Api.myCorrections(limit: 6).catchError((_) => <Map<String, dynamic>>[]),
      ]);
      if (!mounted) return;
      setState(() => _recent = recentActivity(got[0], got[1]));
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(Widget page) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final emp = Session.I.employee;
    final name = '${emp?['employee_name'] ?? Session.I.email}';
    final role = '${emp?['designation'] ?? ''}';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          KitHeader(
            name: name,
            image: '${emp?['image'] ?? ''}',
            subtitle: [greeting(ServerClock.I.now().hour), if (role.isNotEmpty) role].join(' · '),
            onMenu: () => widget.onTab(3),
            onAvatar: () => _open(const ProfileScreen()),
          ),
          Container(
            decoration: const BoxDecoration(gradient: kBandEdge),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
            child: TodayCard(key: ValueKey(_round)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_linkMissing)
                const Note(
                  'No employee record is linked to this login, so there is nobody to punch for. '
                  'Ask HR to put your user on your Employee record — the field is User ID.',
                  kind: NoteKind.warn,
                ),
              if (_error.isNotEmpty) Note(_error),
              const SizedBox(height: 16),
              TileGrid([
                Tile(
                  icon: Icons.event_available_rounded,
                  label: 'Apply Leave',
                  color: kTileGreen,
                  onTap: () async {
                    final sent = await openApplyLeave(context);
                    if (sent && mounted) _load();
                  },
                ),
                Tile(
                  icon: Icons.calendar_month_rounded,
                  label: 'My Attendance',
                  color: kTileBlue,
                  onTap: () => widget.onTab(1),
                ),
                Tile(
                  icon: Icons.person_rounded,
                  label: 'My Profile',
                  color: kTilePurple,
                  onTap: () => _open(const ProfileScreen()),
                ),
                Tile(
                  icon: Icons.receipt_long_rounded,
                  label: 'View Payslip',
                  color: kTileOrange,
                  onTap: () => _open(const PayslipScreen()),
                ),
              ]),
              SectionTitle('Recent Activity',
                  trailing: TextButton(onPressed: () => widget.onTab(2), child: const Text('View all'))),
              if (_recent.isEmpty && !_loading)
                const Panel(child: Text('Nothing asked for yet.', style: TextStyle(color: kInk2)))
              else
                Panel(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(children: [
                    for (final a in _recent)
                      ListTile(
                        leading: IconBadge(
                          a.kind == ActivityKind.leave ? Icons.beach_access_rounded : Icons.edit_calendar_rounded,
                          color: a.kind == ActivityKind.leave ? kTileGreen : kTileBlue,
                          size: 36,
                        ),
                        title: Text(a.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text(dmy(a.when), style: const TextStyle(fontSize: 12)),
                        trailing: Pill(a.status, color: wordColour(a.status)),
                      ),
                  ]),
                ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _MoreTab extends StatelessWidget {
  const _MoreTab();

  @override
  Widget build(BuildContext context) {
    final emp = Session.I.employee;
    void open(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    return Scaffold(
      appBar: brandBar('More'),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Panel(
            onTap: () => open(const ProfileScreen()),
            child: Row(children: [
              Avatar(name: '${emp?['employee_name'] ?? Session.I.email}', image: '${emp?['image'] ?? ''}', radius: 26),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${emp?['employee_name'] ?? Session.I.email}',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: kInk)),
                  Text(
                    ['${emp?['employee_number'] ?? ''}', '${emp?['designation'] ?? ''}']
                        .where((s) => s.isNotEmpty)
                        .join(' · '),
                    style: const TextStyle(color: kInk2, fontSize: 13),
                  ),
                ]),
              ),
              const Icon(Icons.chevron_right, color: kInk2),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(children: [
              MenuRow(icon: Icons.person_outline, label: 'My Profile', onTap: () => open(const ProfileScreen())),
              MenuRow(icon: Icons.receipt_long_outlined, label: 'View Payslip', onTap: () => open(const PayslipScreen())),
              MenuRow(
                  icon: Icons.edit_calendar_outlined,
                  label: 'My Corrections',
                  onTap: () => open(const CorrectionsScreen())),
              MenuRow(icon: Icons.settings_outlined, label: 'Settings', onTap: () => open(const SettingsScreen())),
            ]),
          ),
          const SizedBox(height: 14),
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: MenuRow(
              icon: Icons.logout_rounded,
              label: 'Sign out',
              color: kBad,
              onTap: () => signOut(context),
            ),
          ),
        ],
      ),
    );
  }
}
