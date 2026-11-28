import 'package:flutter/material.dart';

import 'package:manna_hr_app/app.dart';
import 'package:manna_hr_app/core/activity.dart';
import 'package:manna_hr_app/core/punch_rules.dart' show isoDay;
import 'package:manna_hr_app/core/roster.dart';
import 'package:manna_hr_app/services/punch_queue.dart';
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
    final tabs = <Widget>[_HomeTab(onTab: _go), const CalendarScreen(), const LeaveScreen(), const _MoreTab()];
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [for (var i = 0; i < tabs.length; i++) _built.contains(i) ? tabs[i] : const SizedBox()],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: kLine)),
        ),
        child: BottomNavigationBar(
          currentIndex: _tab,
          onTap: _go,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home_rounded),
              label: 'Home',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.calendar_month_outlined),
              activeIcon: Icon(Icons.calendar_month),
              label: 'Attendance',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.beach_access_outlined),
              activeIcon: Icon(Icons.beach_access),
              label: 'My leave',
            ),
            BottomNavigationBarItem(icon: Icon(Icons.menu_rounded), label: 'More'),
          ],
        ),
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

  /// The leave or the corrections behind [_recent] could not be read, so an
  /// empty list is not "nothing asked for".
  bool _recentUnread = false;

  /// This month so far, by state — the three figures under Today. Null until
  /// read, and left null when the site will not say: the card is a courtesy.
  Map<DayStatus, int>? _month;

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
    // Sends the punches kept while there was no signal, as soon as there is one.
    PunchQueue.I.start();
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
        // The card above was made before anybody was known and read nothing:
        // make it again now, so it reads this person's day.
        if (found != null && mounted) setState(() => _round++);
      }
      var unread = false;
      List<Map<String, dynamic>> none(Object _) {
        unread = true;
        return <Map<String, dynamic>>[];
      }

      final got = await Future.wait([
        // Recent activity is a courtesy; a site that will not show it must not
        // cost the card above it.
        Api.myLeave(limit: 6).catchError(none),
        Api.myCorrections(limit: 6).catchError(none),
      ]);
      if (!mounted) return;
      setState(() {
        _recent = recentActivity(got[0], got[1]);
        _recentUnread = unread;
      });
      _readMonth();
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _readMonth() async {
    try {
      final today = isoDay(ServerClock.I.now());
      final ym = today.substring(0, 7);
      final d = await Api.month(ym);
      if (!mounted || d.error.isNotEmpty || !d.drawable) return;
      final rows = monthRoster(
        ym: ym,
        punches: d.punches,
        leave: d.leave,
        holidays: d.holidays,
        corrections: d.corrections,
        today: today,
      );
      setState(() => _month = countStates(rows));
    } catch (_) {
      // The figures are a courtesy; the Attendance tab says what went wrong.
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
    final now = ServerClock.I.now();
    final m = _month;
    String n(DayStatus s) => m == null ? '–' : '${m[s] ?? 0}';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          HomeHeader(
            greeting: greeting(now.hour),
            subtitle: longDate(now),
            name: name,
            role: role,
            image: '${emp?['image'] ?? ''}',
            onAvatar: () => _open(const ProfileScreen()),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
            child: TodayCard(key: ValueKey(_round), notLinked: _linkMissing),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_linkMissing) ...[
                  const SizedBox(height: 10),
                  const Note(
                    'No employee record is linked to this login, so there is nobody to punch for. '
                    'Ask HR to put your user on your Employee record — the field is User ID.',
                    kind: NoteKind.warn,
                  ),
                ],
                if (_error.isNotEmpty) ...[const SizedBox(height: 10), Note(_error)],
                if (!_linkMissing) ...[
                  SectionTitle(
                    'This month',
                    trailing: TextButton(onPressed: () => widget.onTab(1), child: const Text('View calendar →')),
                  ),
                  Panel(
                    padding: const EdgeInsets.all(10),
                    child: Row(
                      children: [
                        Expanded(
                          child: StatBox(value: n(DayStatus.present), label: 'Present'),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: StatBox(value: n(DayStatus.onLeave), label: 'On leave'),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: StatBox(
                            value: n(DayStatus.absent),
                            label: 'Absent',
                            color: (m?[DayStatus.absent] ?? 0) > 0 ? kBad : kInk,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SectionTitle('Quick actions'),
                Panel(
                  padding: const EdgeInsets.all(10),
                  child: TileGrid(gap: 8, [
                    Tile(
                      icon: Icons.add_rounded,
                      label: 'Apply Leave',
                      onTap: () async {
                        final sent = await openApplyLeave(context);
                        if (sent && mounted) _load();
                      },
                    ),
                    Tile(icon: Icons.calendar_month_rounded, label: 'Attendance', onTap: () => widget.onTab(1)),
                    Tile(
                      icon: Icons.person_outline_rounded,
                      label: 'My Profile',
                      onTap: () => _open(const ProfileScreen()),
                    ),
                    Tile(
                      icon: Icons.payments_outlined,
                      label: 'View Payslip',
                      onTap: () => _open(const PayslipScreen()),
                    ),
                  ]),
                ),
                SectionTitle(
                  'Recent activity',
                  trailing: TextButton(onPressed: () => widget.onTab(2), child: const Text('See all')),
                ),
                if (_recent.isEmpty && !_loading)
                  Panel(
                    child: Text(
                        _recentUnread
                            ? 'Your requests could not be read just now. Pull down to try again.'
                            : 'Nothing asked for yet.',
                        style: const TextStyle(color: kInk2)),
                  )
                else if (_recent.isNotEmpty)
                  Panel(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    child: Column(
                      children: [
                        for (var i = 0; i < _recent.length; i++) ...[
                          if (i > 0) const Divider(height: 1),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: ActivityRow(
                              icon: _recent[i].kind == ActivityKind.leave
                                  ? Icons.beach_access_outlined
                                  : Icons.edit_calendar_outlined,
                              title: _recent[i].title,
                              subtitle: dmy(_recent[i].when),
                              status: _recent[i].status,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
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
            child: Row(
              children: [
                Avatar(
                  name: '${emp?['employee_name'] ?? Session.I.email}',
                  image: '${emp?['image'] ?? ''}',
                  radius: 26,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${emp?['employee_name'] ?? Session.I.email}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: kInk),
                      ),
                      Text(
                        [
                          '${emp?['employee_number'] ?? ''}',
                          '${emp?['designation'] ?? ''}',
                        ].where((s) => s.isNotEmpty).join(' · '),
                        style: const TextStyle(color: kInk2, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: kInk2),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                MenuRow(icon: Icons.person_outline, label: 'My Profile', onTap: () => open(const ProfileScreen())),
                MenuRow(
                  icon: Icons.receipt_long_outlined,
                  label: 'View Payslip',
                  onTap: () => open(const PayslipScreen()),
                ),
                MenuRow(
                  icon: Icons.edit_calendar_outlined,
                  label: 'My Corrections',
                  onTap: () => open(const CorrectionsScreen()),
                ),
                MenuRow(icon: Icons.settings_outlined, label: 'Settings', onTap: () => open(const SettingsScreen())),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Panel(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: MenuRow(icon: Icons.logout_rounded, label: 'Sign out', color: kBad, onTap: () => signOut(context)),
          ),
        ],
      ),
    );
  }
}
