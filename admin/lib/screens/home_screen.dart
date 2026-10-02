import 'package:flutter/material.dart';

import 'package:manna_hr_admin/core/day.dart';
import 'package:manna_hr_admin/core/errors.dart';
import 'package:manna_hr_admin/core/server_clock.dart';
import 'package:manna_hr_admin/screens/login_screen.dart';
import 'package:manna_hr_admin/screens/punch_sheet.dart';
import 'package:manna_hr_admin/screens/widgets.dart';
import 'package:manna_hr_admin/services/api.dart';

/// One day, for everybody: the counts at the top, and three lists — who
/// punched, who is absent, who is on leave.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.user, this.load});

  final String user;

  /// For the tests: the day's read, in place of the site.
  final Future<DayView> Function(String date, String today, {bool fresh})? load;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  late DateTime _date = _today();
  DayView? _view;
  String _error = '';
  bool _loading = false;
  String _company = '';
  String _query = '';

  static DateTime _today() {
    final n = ServerClock.I.now();
    return DateTime(n.year, n.month, n.day);
  }

  Future<DayView> Function(String, String, {bool fresh}) get _load => widget.load ?? Api.day;

  @override
  void initState() {
    super.initState();
    _read();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _read({bool fresh = false}) async {
    final date = ymd(_date);
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final v = await _load(date, ymd(_today()), fresh: fresh);
      // A slow read for a day somebody has already walked away from is dropped.
      if (!mounted || ymd(_date) != date) return;
      setState(() => _view = v);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = humanError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _go(DateTime d) {
    final today = _today();
    if (d.isAfter(today)) return;
    setState(() {
      _date = d;
      _view = null;
    });
    _read();
  }

  Future<void> _pick() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2023),
      lastDate: _today(),
    );
    if (d != null) _go(d);
  }

  Future<void> _signOut() async {
    await Api.logout();
    Api.forget();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  }

  /// The day, narrowed by the company picker and the search box.
  List<PersonDay> _filter(List<PersonDay> rows) {
    final q = _query.trim().toLowerCase();
    return rows.where((d) {
      if (_company.isNotEmpty && d.person.company != _company) return false;
      if (q.isEmpty) return true;
      final p = d.person;
      return p.name.toLowerCase().contains(q) ||
          p.number.toLowerCase().contains(q) ||
          p.department.toLowerCase().contains(q) ||
          p.designation.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    final isToday = ymd(_date) == ymd(_today());
    final companies = v == null
        ? const <String>[]
        : (({for (final d in v.people) d.person.company}..remove('')).toList()..sort());

    final punched = v == null ? const <PersonDay>[] : _filter(v.punched);
    final absent = v == null ? const <PersonDay>[] : _filter(v.absent);
    final onLeave = v == null ? const <PersonDay>[] : _filter(v.onLeave);
    final pending = v == null ? const <PersonDay>[] : _filter(v.pendingLeave);
    final off = v == null ? const <PersonDay>[] : _filter(v.off);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manna HR Admin'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh),
            onPressed: _loading ? null : () => _read(fresh: true),
          ),
          PopupMenuButton<String>(
            onSelected: (k) => k == 'out' ? _signOut() : null,
            itemBuilder: (_) => [
              PopupMenuItem(enabled: false, child: Text(widget.user)),
              const PopupMenuItem(value: 'out', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          _DateBar(
            date: _date,
            isToday: isToday,
            onPrev: () => _go(_date.subtract(const Duration(days: 1))),
            onNext: isToday ? null : () => _go(_date.add(const Duration(days: 1))),
            onPick: _pick,
            onToday: isToday ? null : () => _go(_today()),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.search), hintText: 'Search name, code, department'),
                    onChanged: (s) => setState(() => _query = s),
                  ),
                ),
                if (companies.length > 1) ...[
                  const SizedBox(width: 8),
                  _CompanyPicker(
                    companies: companies,
                    value: _company,
                    onChanged: (c) => setState(() => _company = c),
                  ),
                ],
              ],
            ),
          ),
          if (v != null)
            _Counts(
              isToday: isToday,
              punched: punched.length,
              absent: absent.length,
              onLeave: onLeave.length,
              off: off.length,
              onTap: (i) => _tabs.animateTo(i),
            ),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          if (_error.isNotEmpty)
            MaterialBanner(
              content: Text(_error),
              leading: const Icon(Icons.cloud_off),
              actions: [TextButton(onPressed: () => _read(fresh: true), child: const Text('Try again'))],
            ),
          TabBar(
            controller: _tabs,
            tabs: [
              Tab(text: 'Punches (${punched.length})'),
              Tab(text: 'Absent (${absent.length})'),
              Tab(text: 'Leave (${onLeave.length + pending.length})'),
            ],
          ),
          Expanded(
            child: v == null
                ? const SizedBox.shrink()
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _refresh(_PunchList(rows: punched, isToday: isToday, date: v.date)),
                      _refresh(_AbsentList(rows: absent, off: off, isToday: isToday)),
                      _refresh(_LeaveList(onLeave: onLeave, pending: pending, date: v.date)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _refresh(Widget child) => RefreshIndicator(onRefresh: () => _read(fresh: true), child: child);
}

class _DateBar extends StatelessWidget {
  const _DateBar({required this.date, required this.isToday, this.onPrev, this.onNext, this.onPick, this.onToday});

  final DateTime date;
  final bool isToday;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;
  final VoidCallback? onPick;
  final VoidCallback? onToday;

  static const _days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  static const _mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  @override
  Widget build(BuildContext context) {
    final label = '${_days[date.weekday - 1]}, ${date.day} ${_mon[date.month - 1]} ${date.year}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
      child: Row(
        children: [
          IconButton(tooltip: 'Previous day', icon: const Icon(Icons.chevron_left), onPressed: onPrev),
          Expanded(
            child: TextButton.icon(
              onPressed: onPick,
              icon: const Icon(Icons.calendar_today, size: 18),
              label: Text(isToday ? 'Today · $label' : label, overflow: TextOverflow.ellipsis),
            ),
          ),
          IconButton(tooltip: 'Next day', icon: const Icon(Icons.chevron_right), onPressed: onNext),
          if (onToday != null) TextButton(onPressed: onToday, child: const Text('Today')),
        ],
      ),
    );
  }
}

class _CompanyPicker extends StatelessWidget {
  const _CompanyPicker({required this.companies, required this.value, required this.onChanged});

  final List<String> companies;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
        tooltip: 'Company',
        initialValue: value,
        onSelected: onChanged,
        itemBuilder: (_) => [
          const PopupMenuItem(value: '', child: Text('All companies')),
          for (final c in companies) PopupMenuItem(value: c, child: Text(c)),
        ],
        child: Chip(
          avatar: const Icon(Icons.business, size: 18),
          label: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 110),
            child: Text(value.isEmpty ? 'All' : value, overflow: TextOverflow.ellipsis),
          ),
        ),
      );
}

class _Counts extends StatelessWidget {
  const _Counts({
    required this.isToday,
    required this.punched,
    required this.absent,
    required this.onLeave,
    required this.off,
    required this.onTap,
  });

  final bool isToday;
  final int punched, absent, onLeave, off;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    Widget box(String label, int n, DayState tone, int tab) => Expanded(
          child: Card(
            color: stateColor(context, tone).withValues(alpha: .08),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: tab < 0 ? null : () => onTap(tab),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                child: Column(
                  children: [
                    Text('$n',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700, color: stateColor(context, tone))),
                    Text(label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelMedium),
                  ],
                ),
              ),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      child: Row(
        children: [
          box('Punched', punched, DayState.inOut, 0),
          const SizedBox(width: 8),
          box(isToday ? 'Not in yet' : 'Absent', absent, isToday ? DayState.notYetIn : DayState.absent, 1),
          const SizedBox(width: 8),
          box('On leave', onLeave, DayState.onLeave, 2),
          const SizedBox(width: 8),
          box('Off', off, DayState.weekOff, 1),
        ],
      ),
    );
  }
}

class _PunchList extends StatelessWidget {
  const _PunchList({required this.rows, required this.isToday, required this.date});

  final List<PersonDay> rows;
  final bool isToday;
  final String date;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return EmptyNote('No punches', isToday ? 'Nobody has punched yet today.' : 'Nobody punched on this day.',
          icon: Icons.fingerprint);
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: rows.length,
      separatorBuilder: (_, _) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, i) {
        final d = rows[i];
        final aside = d.punches.any((p) => p.setAside);
        return ListTile(
          leading: Initials(d.person.name, color: stateColor(context, d.state)),
          title: Text(d.person.name, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            [subline(d.person), if (aside) 'a punch set aside', if (d.leave != null) 'leave ${d.leave!.type}']
                .where((s) => s.isNotEmpty)
                .join(' · '),
            overflow: TextOverflow.ellipsis,
          ),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${d.firstIn} → ${d.lastOut.isEmpty ? '—' : d.lastOut}',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
              const SizedBox(height: 4),
              StateChip(d.state, today: isToday),
            ],
          ),
          onTap: () => showPunchSheet(context, d, date),
        );
      },
    );
  }
}

class _AbsentList extends StatelessWidget {
  const _AbsentList({required this.rows, required this.off, required this.isToday});

  final List<PersonDay> rows;
  final List<PersonDay> off;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty && off.isEmpty) {
      return EmptyNote('Nobody absent', isToday ? 'Everybody has punched in or is on leave.' : 'Everybody came in or was on leave.',
          icon: Icons.check_circle_outline);
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        for (final d in rows)
          ListTile(
            leading: Initials(d.person.name, color: stateColor(context, d.state)),
            title: Text(d.person.name, overflow: TextOverflow.ellipsis),
            subtitle: Text(
                [subline(d.person), if (d.pending != null) '${d.pending!.type} applied, not approved']
                    .where((s) => s.isNotEmpty)
                    .join(' · '),
                overflow: TextOverflow.ellipsis),
            trailing: StateChip(d.state, today: isToday),
          ),
        if (off.isNotEmpty) ...[
          _Header('Holiday or weekly off (${off.length})'),
          for (final d in off)
            ListTile(
              dense: true,
              leading: Initials(d.person.name, color: stateColor(context, d.state)),
              title: Text(d.person.name, overflow: TextOverflow.ellipsis),
              subtitle: Text([subline(d.person), d.holiday?.description ?? ''].where((s) => s.isNotEmpty).join(' · '),
                  overflow: TextOverflow.ellipsis),
              trailing: StateChip(d.state),
            ),
        ],
      ],
    );
  }
}

class _LeaveList extends StatelessWidget {
  const _LeaveList({required this.onLeave, required this.pending, required this.date});

  final List<PersonDay> onLeave;
  final List<PersonDay> pending;
  final String date;

  String _span(Leave l) {
    final days = l.days > 0 ? ' · ${l.days % 1 == 0 ? l.days.toInt() : l.days} day${l.days == 1 ? '' : 's'}' : '';
    final when = l.from == l.to ? shortDate(l.from) : '${shortDate(l.from)} – ${shortDate(l.to)}';
    return '$when$days${l.halfOn(date) ? ' · half day today' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    if (onLeave.isEmpty && pending.isEmpty) {
      return const EmptyNote('Nobody on leave', 'No approved leave and no application waiting on this day.',
          icon: Icons.beach_access_outlined);
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (onLeave.isNotEmpty) _Header('On leave (${onLeave.length})'),
        for (final d in onLeave)
          ListTile(
            leading: Initials(d.person.name, color: stateColor(context, DayState.onLeave)),
            title: Text(d.person.name, overflow: TextOverflow.ellipsis),
            subtitle: Text('${d.leave!.type} · ${_span(d.leave!)}', overflow: TextOverflow.ellipsis),
            trailing: const StateChip(DayState.onLeave, text: 'Approved'),
          ),
        if (pending.isNotEmpty) _Header('Waiting for approval (${pending.length})'),
        for (final d in pending)
          ListTile(
            leading: Initials(d.person.name, color: stateColor(context, DayState.leavePending)),
            title: Text(d.person.name, overflow: TextOverflow.ellipsis),
            subtitle: Text(
                '${d.pending!.type} · ${_span(d.pending!)}${d.present ? ' · came in anyway' : ''}',
                overflow: TextOverflow.ellipsis),
            trailing: const StateChip(DayState.leavePending, text: 'Pending'),
          ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Text(text, style: Theme.of(context).textTheme.titleSmall),
      );
}
