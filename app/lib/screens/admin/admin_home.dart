import 'package:flutter/material.dart';

import 'package:manna_hr_app/core/day.dart' show DayView;
import 'package:manna_hr_app/core/errors.dart';
import 'package:manna_hr_app/core/server_clock.dart';
import 'package:manna_hr_app/core/session.dart';
import 'package:manna_hr_app/screens/admin/day_screen.dart';
import 'package:manna_hr_app/screens/calendar_screen.dart';
import 'package:manna_hr_app/screens/corrections_screen.dart';
import 'package:manna_hr_app/screens/leave_screen.dart';
import 'package:manna_hr_app/screens/leave_sheet.dart';
import 'package:manna_hr_app/screens/payslip_screen.dart';
import 'package:manna_hr_app/screens/profile_screen.dart';
import 'package:manna_hr_app/screens/settings_screen.dart';
import 'package:manna_hr_app/screens/today_card.dart';
import 'package:manna_hr_app/services/admin_api.dart';
import 'package:manna_hr_app/services/api.dart';
import 'package:manna_hr_app/ui/brand.dart';

/// The numbers on HR's home. Counted from the same reads the screens behind
/// them make, so a tile and the list it opens cannot disagree.
class AdminSummary {
  const AdminSummary({
    required this.name,
    required this.employees,
    required this.pendingLeave,
    required this.inToday,
    required this.notInToday,
  });

  final String name;
  final int employees;

  /// Null when the site would not count them — said as `—`, never as `0`,
  /// which would read as nothing to decide.
  final int? pendingLeave;
  final int inToday;
  final int notInToday;
}

Future<AdminSummary> readSummary() async {
  final n = ServerClock.I.now();
  final today = ymd(DateTime(n.year, n.month, n.day));
  // Started together, awaited in turn: the three run side by side.
  final pending = AdminApi.pendingLeave().then<int?>((v) => v).catchError((_) => null);
  final name = Session.I.employee != null
      ? Future.value('${Session.I.employee!['employee_name'] ?? ''}')
      : Api.fullName();
  final DayView day = await AdminApi.day(today, today);
  return AdminSummary(
    name: await name,
    employees: day.people.length,
    pendingLeave: await pending,
    inToday: day.punched.length,
    notInToday: day.absent.length,
  );
}

class AdminHome extends StatefulWidget {
  const AdminHome({super.key, required this.onTab, this.onMenu, this.load});

  final ValueChanged<int> onTab;
  final VoidCallback? onMenu;

  /// For the tests: the numbers, in place of the site.
  final Future<AdminSummary> Function()? load;

  @override
  State<AdminHome> createState() => _AdminHomeState();
}

class _AdminHomeState extends State<AdminHome> {
  AdminSummary? _s;
  bool _loading = true;

  /// Bumped on every read, so the punch card reads today's punches again too.
  int _round = 0;
  String _error = '';

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
      final s = await (widget.load ?? readSummary)();
      if (mounted) setState(() => _s = s);
    } catch (e) {
      if (mounted) setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _open(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  @override
  Widget build(BuildContext context) {
    final s = _s;
    String n(int? v) => _loading && s == null ? '…' : (v == null ? '—' : '$v');
    final name = s?.name ?? '${Session.I.employee?['employee_name'] ?? Session.I.user}';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          KitHeader(
            name: name,
            image: '${Session.I.employee?['image'] ?? ''}',
            subtitle: '${greeting(ServerClock.I.now().hour)} · HR Admin',
            onMenu: widget.onMenu,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_error.isNotEmpty) Note(_error),
              // HR's own punch, when an Employee record carries this login:
              // every function in one menu (asked for 21 October 2026).
              if (Session.I.employee != null) ...[
                TodayCard(key: ValueKey(_round), onPunched: _load),
                const SizedBox(height: 16),
              ],
              TileGrid([
                Tile(
                  icon: Icons.people_alt_rounded,
                  label: 'Employees',
                  count: n(s?.employees),
                  color: kTileBlue,
                  onTap: () => widget.onTab(1),
                ),
                Tile(
                  icon: Icons.event_note_rounded,
                  label: 'Leave Requests',
                  count: n(s?.pendingLeave),
                  color: kTilePurple,
                  onTap: () => widget.onTab(2),
                ),
                Tile(
                  icon: Icons.how_to_reg_rounded,
                  label: 'Punched Today',
                  count: n(s?.inToday),
                  color: kTileGreen,
                  onTap: () => _open(const DayScreen()),
                ),
                Tile(
                  icon: Icons.person_off_rounded,
                  label: 'Not In Yet',
                  count: n(s?.notInToday),
                  color: kBad,
                  onTap: () => _open(const DayScreen(initialTab: 1)),
                ),
              ]),
              const SectionTitle('Quick Actions'),
              TileGrid([
                Tile(
                  icon: Icons.fingerprint,
                  label: "Today's Attendance",
                  color: kTileOrange,
                  onTap: () => _open(const DayScreen()),
                ),
                Tile(
                  icon: Icons.fact_check_outlined,
                  label: 'Manage Leave',
                  color: kTilePurple,
                  onTap: () => widget.onTab(2),
                ),
                Tile(
                  icon: Icons.insert_chart_outlined,
                  label: 'View Reports',
                  color: kTileBlue,
                  onTap: () => widget.onTab(3),
                ),
                Tile(
                  icon: Icons.settings_outlined,
                  label: 'Settings',
                  color: kInk2,
                  onTap: () => _open(const SettingsScreen()),
                ),
              ]),
              if (Session.I.employee != null) ...[
                const SectionTitle('My Self-Service'),
                TileGrid([
                  Tile(
                    icon: Icons.calendar_month_rounded,
                    label: 'My Attendance',
                    color: kTileBlue,
                    onTap: () => _open(const CalendarScreen()),
                  ),
                  Tile(
                    icon: Icons.event_available_rounded,
                    label: 'Apply Leave',
                    color: kTileGreen,
                    onTap: () => openApplyLeave(context),
                  ),
                  Tile(
                    icon: Icons.beach_access_rounded,
                    label: 'My Leave',
                    color: kTilePurple,
                    onTap: () => _open(const LeaveScreen()),
                  ),
                  Tile(
                    icon: Icons.receipt_long_rounded,
                    label: 'My Payslip',
                    color: kTileOrange,
                    onTap: () => _open(const PayslipScreen()),
                  ),
                  Tile(
                    icon: Icons.person_rounded,
                    label: 'My Profile',
                    color: kTilePurple,
                    onTap: () => _open(const ProfileScreen()),
                  ),
                  Tile(
                    icon: Icons.edit_calendar_rounded,
                    label: 'My Corrections',
                    color: kTileBlue,
                    onTap: () => _open(const CorrectionsScreen()),
                  ),
                ]),
              ],
            ]),
          ),
        ],
      ),
    );
  }
}
